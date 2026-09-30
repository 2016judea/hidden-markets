"""Fill the arbitrage model from everything the warehouse holds on Twin Cities
businesses.

Reads the SHIPPED slices under website/api/_data (they are what the platform
publishes, so a number here is a number a visitor could download), the
commercial permit file, the reviewed places in bricks.duckdb, and the Hennepin
hazardous-waste generator layer cached under data/cache/gis/hennepin_hazwaste.

Every source is optional: a missing file loads nothing and says so, which is
what lets the test suite build the model off a small fixture. Every row
written carries `source_id` and `basis`. Enrichment is done as bulk joins off
temp tables: DuckDB is a column store, and 100,000 single-row UPDATEs cost two
minutes where one UPDATE ... FROM costs a second.

    from arbitrage.load import build
    build(db_path, source_root)
"""

from __future__ import annotations

import glob
import json
import os
import re
from pathlib import Path

import duckdb

from arbitrage import vocabulary as V

HERE = Path(__file__).resolve()
DEFAULT_ROOT = Path(os.environ.get("BRICKS_ROOT", "~/Desktop/bricks")).expanduser()   # the slices and caches live in the bricks repo
SCHEMA = HERE.with_name("schema.sql")

COUNTY_SLUG = {
    "Hennepin County, Minnesota": "hennepin",
    "Ramsey County, Minnesota": "ramsey",
    "Anoka County, Minnesota": "anoka",
    "Dakota County, Minnesota": "dakota",
    "Washington County, Minnesota": "washington",
    "Scott County, Minnesota": "scott",
    "Carver County, Minnesota": "carver",
}

# Overture category -> our sector, for the rows the platform left blank.
CATEGORY_SECTOR = [
    ("coffee", "cafe"), ("cafe", "cafe"), ("tea_room", "cafe"),
    ("brewery", "bar"), ("taproom", "bar"), ("bar", "bar"), ("pub", "bar"),
    ("restaurant", "restaurant"), ("pizza", "restaurant"), ("fast_food", "restaurant"), ("food_truck", "restaurant"),
    ("bakery", "retail"), ("grocery", "retail"), ("supermarket", "retail"), ("convenience", "retail"),
    ("dry_clean", "retail"), ("laundr", "retail"), ("printing", "retail"), ("print", "retail"),
    ("dent", "health"), ("orthodont", "health"), ("veterinar", "health"), ("clinic", "health"), ("chiropract", "health"),
    ("hotel", "lodging"), ("motel", "lodging"),
    ("auto", "auto"), ("car_wash", "auto"), ("tire", "auto"), ("oil_change", "auto"),
    ("salon", "salon"), ("barber", "salon"), ("nail", "salon"),
    ("spa", "spa"), ("gym", "gym"), ("fitness", "gym"),
]

NAICS_SECTOR = [
    ("722515", "cafe"), ("722410", "bar"), ("312120", "bar"), ("7225", "restaurant"), ("7223", "restaurant"),
    ("8111", "auto"), ("811192", "auto"), ("8121", "salon"), ("812199", "spa"), ("812320", "retail"),
    ("6212", "health"), ("621", "health"), ("7211", "lodging"), ("4451", "retail"), ("4453", "retail"),
    ("3231", "retail"), ("7139", "gym"), ("445", "retail"), ("44", "retail"), ("45", "retail"),
]

SIC_SECTOR = {
    7538: "auto", 7532: "auto", 7549: "auto", 5541: "auto", 7539: "auto", 5531: "auto", 7515: "auto", 5511: "auto",
    8021: "health", 8011: "health", 8041: "health", 8042: "health", 8049: "health", 8062: "health", 8071: "health", 742: "health", 5912: "health",
    2752: "retail", 2759: "retail", 2791: "retail", 7216: "retail", 7215: "retail", 7384: "retail", 5411: "retail",
    5812: "restaurant", 5813: "bar", 7011: "lodging", 7231: "salon", 7991: "gym",
}
SIC_CATEGORY = {
    7538: "automotive_repair", 7532: "auto_body_shop", 7549: "automotive_services", 5541: "gas_station",
    8021: "dentist", 8011: "physician", 8041: "chiropractor", 742: "veterinarian", 5912: "pharmacy",
    2752: "printing_services", 2759: "printing_services", 7216: "dry_cleaning", 7215: "laundromat", 5411: "grocery_store",
    5812: "restaurant", 5813: "bar", 7011: "hotel", 7231: "hair_salon", 7991: "gym",
}

TOKEN_RE = re.compile(r"[^A-Z0-9]+")
STOP = {"THE", "A", "AN", "OF", "AND", "&", "INC", "LLC", "CO", "CORP", "COMPANY", "LTD"}


def norm_name(name: str | None) -> str:
    """Whole name, upper, punctuation and corporate suffixes stripped."""
    toks = [t for t in TOKEN_RE.split((name or "").upper()) if t and t not in STOP]
    return " ".join(toks)


def norm_token(name: str | None) -> str:
    if not name:
        return ""
    for tok in TOKEN_RE.split(name.upper()):
        if len(tok) >= 3 and tok not in STOP:
            return tok
    return TOKEN_RE.sub("", name.upper())[:8]


def sector_for(category: str | None, sector: str | None) -> str | None:
    if sector:
        return sector
    c = (category or "").lower()
    for needle, sec in CATEGORY_SECTOR:
        if needle in c:
            return sec
    return None


def sector_for_naics(naics: str | None) -> str | None:
    n = naics or ""
    for prefix, sec in NAICS_SECTOR:
        if n.startswith(prefix):
            return sec
    return None


def _rows(path: Path) -> list[dict]:
    if not path.exists():
        print(f"  skip  {path.name}: not found")
        return []
    d = json.loads(path.read_text())
    rows = d.get("rows") if isinstance(d, dict) else d
    if rows is None and isinstance(d, dict):
        rows = d.get("permits") or d.get("features") or []
    print(f"  read  {path.name}: {len(rows):,} rows")
    return rows


def _date(s) -> str | None:
    if not s:
        return None
    s = str(s)[:10]
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    if re.match(r"^\d{4}-\d{2}$", s):
        return s + "-01"
    return None


CITY_FIX = {"ST PAUL": "Saint Paul", "ST. PAUL": "Saint Paul", "SAINT PAUL": "Saint Paul", "MPLS": "Minneapolis", "MINNEAPOLIS": "Minneapolis",
            "ST LOUIS PARK": "St. Louis Park", "ST. LOUIS PARK": "St. Louis Park", "ST ANTHONY": "St. Anthony", "ST. ANTHONY": "St. Anthony"}


def city(s: str | None) -> str | None:
    if not s:
        return None
    u = re.sub(r"\s+", " ", s.strip().upper())
    return CITY_FIX.get(u, s.strip().title())


def _bulk(con, rows: list[dict], cols: list[str], types: dict[str, str] | None = None) -> str:
    """Stage dicts as newline-delimited JSON and expose them as a DuckDB relation.
    No pandas or arrow in the venv; read_json is the one bulk path that needs
    nothing but the standard library. Returns the SQL to select from it."""
    import tempfile
    fd, path = tempfile.mkstemp(suffix=".ndjson")
    with os.fdopen(fd, "w") as fh:
        for r in rows:
            fh.write(json.dumps({c: r.get(c) for c in cols}, default=str) + "\n")
    _bulk.paths.append(path)
    if types:
        colspec = ", ".join(f"'{c}': '{types[c]}'" for c in cols)
    else:
        colspec = ", ".join(f"'{c}': 'JSON'" for c in cols)
    return f"read_json('{path}', format='newline_delimited', columns={{{colspec}}})"


_bulk.paths = []  # type: ignore[attr-defined]


def _coltypes(con, table: str) -> dict[str, str]:
    return {name: typ for name, typ, *_ in con.execute(f"DESCRIBE {table}").fetchall()}


def _insert(con, table: str, rows: list[dict], replace: bool = False) -> int:
    """Named-column insert through one bulk read, not one statement per row."""
    if not rows:
        return 0
    cols = list(rows[0].keys())
    types = _coltypes(con, table)
    rel = _bulk(con, rows, cols, {c: types[c] for c in cols})
    verb = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
    con.execute(f"{verb} INTO {table} ({','.join(cols)}) SELECT {','.join(cols)} FROM {rel}")
    return len(rows)


def _temp(con, name: str, rows: list[dict], types: dict[str, str]) -> None:
    """A temp table from dicts, for bulk UPDATE ... FROM."""
    con.execute(f"DROP TABLE IF EXISTS {name}")
    con.execute(f"CREATE TEMP TABLE {name} ({', '.join(f'{k} {v}' for k, v in types.items())})")
    if rows:
        cols = list(types)
        con.execute(f"INSERT INTO {name} SELECT {','.join(cols)} FROM {_bulk(con, rows, cols, types)}")


class Loader:
    def __init__(self, db_path: Path, root: Path):
        self.root = Path(root)
        self.exports = self.root / "website" / "api" / "_data" / "exports"
        self.data = self.root / "website" / "api" / "_data"
        self.con = duckdb.connect(str(db_path))
        self.counts: dict[str, int] = {}

    # ---------------------------------------------------------------- schema + seeds

    def schema(self):
        text = "\n".join(re.sub(r"--.*$", "", l) for l in SCHEMA.read_text().splitlines())
        for stmt in text.split(";"):
            if stmt.strip():
                self.con.execute(stmt)

    def seeds(self):
        c = self.con
        c.executemany("INSERT OR REPLACE INTO asymmetry_kind VALUES (?,?,?)", V.ASYMMETRY_KINDS)
        c.executemany("INSERT OR REPLACE INTO buyer_question VALUES (?,?,?,?)", V.BUYER_QUESTIONS)
        c.executemany("INSERT OR REPLACE INTO basis_kind VALUES (?,?,?)", V.BASIS_KINDS)
        c.executemany("INSERT OR REPLACE INTO source VALUES (?,?,?,?,?,?,?,?,?,?)", V.SOURCES)
        c.executemany("INSERT OR REPLACE INTO material VALUES (?,?,?,?,?,?,?,?,?)", V.MATERIALS)
        c.executemany("INSERT OR REPLACE INTO buyer_class VALUES (?,?,?,?,?,?,?,?)", V.BUYER_CLASSES)
        c.executemany("INSERT OR REPLACE INTO sector_flow_template VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", V.TEMPLATES)
        c.executemany("INSERT OR REPLACE INTO obligation VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", V.OBLIGATIONS)
        c.executemany("INSERT OR REPLACE INTO market_price VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", V.PRICES)
        c.executemany("INSERT OR REPLACE INTO demand VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", V.DEMAND)
        c.executemany("INSERT OR REPLACE INTO taker VALUES (?,?,?,?,?,?,?,?,?,?,?)", V.TAKERS)
        c.executemany("INSERT OR REPLACE INTO access_asset VALUES (?,?,?,?,?,?,?,?)", V.ACCESS_ASSETS)
        c.executemany(
            "INSERT OR REPLACE INTO counterparty (id,name,role,material_id,trade,founded,scale,geography,pays_or_charges,price_usd,price_unit,source_id,basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            V.COUNTERPARTIES,
        )
        for r in V.ROUTES:
            (rid, label, mat, oblig, jur, channel, filer, action, fee, deadline, src, quote, note) = r
            e2e = filer in ("anyone", "preparer_with_authorization") and action in ("none", "authorize")
            c.execute("INSERT OR REPLACE INTO work_route VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      [rid, label, mat, oblig, jur, channel, filer, action, e2e, fee, deadline, src, quote, note])
        for o in V.OPPORTUNITIES:
            c.execute(
                "INSERT OR REPLACE INTO opportunity (id,label,material_id,asymmetry_id,side_a_filter,side_a_role,side_b_class_id,side_b_role,obligation_id,value_basis,obscurity,urgency,urgency_clock,access_advantage,competition,accessibility,note,source_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                list(o),
            )

    # ---------------------------------------------------------------- sites

    def sites(self):
        c = self.con
        out = []
        for r in _rows(self.exports / "corridors.json"):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            out.append(dict(id=f"{slug}|{r['parcel_id']}", parcel_id=r["parcel_id"], county=slug, address=r.get("address"), use=r.get("use"),
                            zoning=r.get("zoning"), corridor=r.get("corridor"), assessed_usd=r.get("assessed"), lot_sqft=r.get("lot_sqft"),
                            footprint_sqft=r.get("footprint_sqft"), stories=r.get("stories"), year_built=r.get("year_built"), owner=r.get("owner"),
                            flood_zone=r.get("flood_zone"), contaminated=False, hazwaste_licensed=False, calls_311=r.get("calls_311"),
                            open_permits=r.get("open_permits"), last_permit=_date(r.get("last_permit")), vacant_registered=False,
                            teardown_permit=False, source_id="bm_corridors", basis="measured"))
        self.counts["site.corridors"] = _insert(c, "site", out)

        biz = _rows(self.exports / "businesses.json")
        self._biz_rows = biz
        seen = {r["id"] for r in out}
        extra = []
        for r in biz:
            pid = r.get("site_parcel_id")
            slug = COUNTY_SLUG.get(r.get("county"), "")
            if not pid:
                continue
            sid = f"{slug}|{pid}"
            if sid in seen:
                continue
            seen.add(sid)
            extra.append(dict(id=sid, parcel_id=pid, county=slug, address=r.get("address"), city=city(r.get("city")), lat=r.get("lat"), lon=r.get("lon"),
                              use=r.get("district"), contaminated=False, hazwaste_licensed=False, vacant_registered=False, teardown_permit=False,
                              source_id="bm_businesses", basis="inferred"))
        self.counts["site.from_businesses"] = _insert(c, "site", extra)

        rows = [dict(id=f"hennepin|{r['parcel_id']}", assessed=r.get("assessed"), use=r.get("use"), lat=r.get("lat"), lon=r.get("lon"))
                for r in _rows(self.exports / "assessor.json")]
        _temp(c, "t_assessor", rows, dict(id="TEXT", assessed="DOUBLE", use="TEXT", lat="DOUBLE", lon="DOUBLE"))
        c.execute("UPDATE site SET assessed_usd = COALESCE(site.assessed_usd, t.assessed), use = COALESCE(site.use, t.use), lat = COALESCE(site.lat, t.lat), lon = COALESCE(site.lon, t.lon) FROM t_assessor t WHERE site.id = t.id")

        rows, ev = [], []
        for r in _rows(self.exports / "contamination.json"):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            sid = f"{slug}|{r['parcel_id']}"
            rows.append(dict(id=sid, contamination=r.get("all_activities") or r.get("activity")))
            ev.append(dict(id=f"ev:mpca:{sid}", site_id=sid, kind="contamination", detail=f"{r.get('activity')} — {r.get('status')}", source_id="bm_contamination", basis="measured"))
        _temp(c, "t_contam", rows, dict(id="TEXT", contamination="TEXT"))
        c.execute("UPDATE site SET contaminated = TRUE, contamination = t.contamination FROM t_contam t WHERE site.id = t.id")
        _insert(c, "event", ev)

        rows = [dict(id=f"{COUNTY_SLUG.get(r.get('county'), 'hennepin')}|{r['parcel_id']}", cls=r.get("classification"))
                for r in _rows(self.exports / "lead-service-lines.json")
                if r.get("parcel_id") and "RESIDENTIAL" not in str(r.get("use") or "").upper()]
        _temp(c, "t_lead", rows, dict(id="TEXT", cls="TEXT"))
        c.execute("UPDATE site SET lead_service_line = t.cls FROM t_lead t WHERE site.id = t.id")

        sites, ev = [], []
        for r in _rows(self.exports / "vacancies.json"):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            sid = f"{slug}|{r['parcel_id']}"
            sites.append(dict(id=sid, parcel_id=r["parcel_id"], county=slug, address=r.get("address"), use=r.get("use"), assessed_usd=r.get("assessed"),
                              year_built=r.get("year_built"), owner=r.get("owner"), vacant_registered=True, teardown_permit=False, contaminated=False,
                              hazwaste_licensed=False, source_id="bm_vacancies", basis="measured"))
            ev.append(dict(id=f"ev:vacant:{sid}", site_id=sid, kind="vacant_registration", detail=r.get("filed_by"), source_id="bm_vacancies", basis="measured"))
        _insert(c, "site", sites)
        _temp(c, "t_vac", [dict(id=s["id"]) for s in sites], dict(id="TEXT"))
        c.execute("UPDATE site SET vacant_registered = TRUE FROM t_vac t WHERE site.id = t.id")
        _insert(c, "event", ev)

        sites, ev = [], []
        for r in _rows(self.exports / "teardowns.json"):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            sid = f"{slug}|{r['parcel_id']}"
            sites.append(dict(id=sid, parcel_id=r["parcel_id"], county=slug, use=r.get("use"), year_built=r.get("year_built"), vacant_registered=False,
                              teardown_permit=True, contaminated=False, hazwaste_licensed=False, source_id="bm_teardowns", basis="measured"))
            ev.append(dict(id=f"ev:teardown:{r.get('permit_no')}", site_id=sid, kind="teardown_permit", happened=_date(r.get("issued")),
                           effective=_date(r.get("issued")), detail=f"{r.get('kind')} by {r.get('firm')}", amount_usd=r.get("fees_usd"),
                           source_id="bm_teardowns", basis="measured"))
        _insert(c, "site", sites)
        _temp(c, "t_td", [dict(id=s["id"]) for s in sites], dict(id="TEXT"))
        c.execute("UPDATE site SET teardown_permit = TRUE FROM t_td t WHERE site.id = t.id")
        _insert(c, "event", ev)

        rows = []
        for r in _rows(self.exports / "sales.json"):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            d = _date(f"{r.get('sale_year')}-{str(r.get('sale_month') or 1).zfill(2)}")
            rows.append(dict(id=f"{slug}|{r['parcel_id']}", d=d, price=r.get("price"), bsqft=r.get("building_sqft"), okind=r.get("owner_type")))
        _temp(c, "t_sales", rows, dict(id="TEXT", d="DATE", price="DOUBLE", bsqft="DOUBLE", okind="TEXT"))
        c.execute("""UPDATE site SET last_sale = t.d, last_sale_usd = t.price, building_sqft = COALESCE(site.building_sqft, t.bsqft), owner_kind = COALESCE(site.owner_kind, t.okind)
                     FROM (SELECT * FROM t_sales QUALIFY row_number() OVER (PARTITION BY id ORDER BY d DESC NULLS LAST) = 1) t WHERE site.id = t.id""")
        c.execute("""INSERT OR IGNORE INTO event (id, site_id, kind, happened, effective, detail, amount_usd, source_id, basis)
                     SELECT 'ev:sale:' || id || ':' || CAST(d AS TEXT), id, 'sale', d, d, 'recorded sale', price, 'bm_sales', 'measured' FROM t_sales WHERE d IS NOT NULL""")

    def hazwaste(self):
        c = self.con
        files = sorted(glob.glob(str(self.root / "data" / "cache" / "gis" / "hennepin_hazwaste" / "*.json")))
        rows = []
        for f in files:
            j = json.loads(Path(f).read_text())
            rows += [x.get("attributes", x) for x in (j.get("features") or [])]
        print(f"  read  hennepin_hazwaste: {len(rows):,} rows from {len(files)} pages")
        if not rows:
            return
        size_rank = {"LQG": 4, "SQG": 3, "VSQG": 2, "MIG": 1}
        best: dict[str, dict] = {}
        biz = []
        for r in rows:
            if r.get("Status_Code") != "O":
                continue
            pid = (r.get("PID") or "").strip()
            if not pid:
                continue
            sid = f"hennepin|{pid}"
            if sid not in best or size_rank.get(r.get("Size_Code"), 0) > size_rank.get(best[sid].get("Size_Code"), 0):
                best[sid] = r
            sic = r.get("SIC_CODE") or 0
            name = (r.get("Operation_Name") or "").strip()
            biz.append(dict(id=f"hw:{r.get('Operation_ID')}", name=name, sector=SIC_SECTOR.get(sic), category=SIC_CATEGORY.get(sic), sic=sic or None,
                            epa_id=(r.get("EPA_ID") or "").strip() or None,
                            address=(r.get("Site_Address") or "").strip(), city=city(r.get("Site_City")), county="hennepin",
                            postcode=r.get("Site_Zip"), site_id=sid, status="licensed:" + (r.get("Size_Code") or "unsized"), dedupe_key=f"{sid}|{norm_token(name)}",
                            source_id="hennepin_hazwaste", basis="measured"))
        sites, tmp, ev = [], [], []
        for sid, r in best.items():
            sites.append(dict(id=sid, parcel_id=sid.split("|")[1], county="hennepin", address=(r.get("Site_Address") or "").strip(),
                              city=city(r.get("Site_City")), vacant_registered=False, teardown_permit=False, contaminated=False,
                              hazwaste_licensed=True, source_id="hennepin_hazwaste", basis="measured"))
            tmp.append(dict(id=sid, size=r.get("Size_Code") or None, sic=r.get("SIC_CODE"), name=r.get("Operation_Name"), insp=_date(r.get("Last_Insp"))))
            if _date(r.get("Last_Insp")):
                ev.append(dict(id=f"ev:hwinsp:{sid}", site_id=sid, kind="inspection", happened=_date(r.get("Last_Insp")),
                               detail=f"hazwaste {r.get('Last_Insp_Type')}", source_id="hennepin_hazwaste", basis="measured"))
        _insert(c, "site", sites)
        _temp(c, "t_hw", tmp, dict(id="TEXT", size="TEXT", sic="INTEGER", name="TEXT", insp="DATE"))
        c.execute("UPDATE site SET hazwaste_licensed = TRUE, hazwaste_size = t.size, hazwaste_sic = t.sic, hazwaste_name = t.name, hazwaste_last_insp = t.insp FROM t_hw t WHERE site.id = t.id")
        _insert(c, "event", ev)
        self.counts["business.hazwaste"] = _insert(c, "business", biz)
        self.counts["site.hazwaste"] = len(best)

    def echo(self):
        """EPA ECHO RCRA handlers for all seven counties. A handler the Hennepin
        licence already holds (same EPA id) is not added again; it gains the
        violations and enforcement history. Transporters and TSDFs are the
        incumbents who sell hazardous-waste service."""
        c = self.con
        d = self.root / "data" / "cache" / "echo_rcra"
        files = sorted(glob.glob(str(d / "rcra_*.csv")))
        if not files:
            print("  skip  echo_rcra: not found")
            return
        rows = c.execute(f"""SELECT SourceID, RCRAName, RCRAStreet, RCRACity, RCRAZip, RCRACounty, FacLat, FacLong, RCRAUniverse, RCRAStatus,
                                    FacSICCodes, RCRANAICS, RCRANAICSDescs, Tsdf
                             FROM read_csv({files!r}, all_varchar=true, union_by_name=true)""").fetchall()
        print(f"  read  echo_rcra: {len(rows):,} handlers")
        known = {r[0]: r[1] for r in c.execute("SELECT epa_id, id FROM business WHERE epa_id IS NOT NULL").fetchall()}
        biz, cps = [], []
        for (eid, name, street, cty, zp, county, lat, lon, univ, status, sics, naics, ndesc, tsdf) in rows:
            if not (status or "").startswith("Active"):
                continue
            univ = univ or ""
            if "Transporter" in univ or tsdf:
                cps.append(dict(id=f"cp:echo:{eid}", name=name, role="hauler", material_id="hazwaste_licence", scale="local", geography=city(cty),
                                mailing=street, pays_or_charges="charges", source_id="echo_rcra", basis="measured"))
            if eid in known:
                continue
            sic = None
            for tok in (sics or "").split():
                if tok.isdigit():
                    sic = int(tok)
                    break
            n1 = (naics or "").split()[0] if naics else None
            cat = SIC_CATEGORY.get(sic) if sic else None
            if not cat and n1:
                cat = {"812320": "dry_cleaning", "621210": "dentist", "811111": "automotive_repair", "811121": "auto_body_shop",
                       "323111": "printing_services", "445110": "grocery_store", "722511": "restaurant", "722513": "restaurant"}.get(n1)
            if not cat and ndesc:
                cat = ndesc.split(";")[0].strip().lower().replace(" ", "_")[:60]
            sector = SIC_SECTOR.get(sic) if sic else None
            sector = sector or sector_for_naics(n1) or sector_for(cat, None)
            size = univ.split(",")[0].strip() or "unsized"
            biz.append(dict(id=f"echo:{eid}", name=name or "", sector=sector, category=cat, naics=n1, sic=sic, epa_id=eid,
                            address=street, city=city(cty), county=(county or "").lower(), postcode=zp,
                            lat=float(lat) if lat else None, lon=float(lon) if lon else None, status=f"licensed:{size}",
                            dedupe_key=f"{(city(cty) or '').upper()}|{norm_token(name)}", source_id="echo_rcra", basis="measured"))
        self.counts["business.echo"] = _insert(c, "business", biz)
        self.counts["counterparty.hazwaste_haulers"] = _insert(c, "counterparty", cps)
        c.execute("UPDATE buyer_class SET in_market = ? WHERE id = 'used_oil_collectors'", [len(cps)])

        # violations and enforcement onto whichever business row holds the EPA id
        ids = f"(SELECT epa_id, MIN(id) bid FROM business WHERE epa_id IS NOT NULL GROUP BY 1)"
        v = d / "bulk_violations_metro.csv"
        if v.exists():
            c.execute(f"""INSERT OR IGNORE INTO event (id, business_id, kind, happened, effective, detail, source_id, basis)
                          SELECT 'ev:vio:' || x.ID_NUMBER || ':' || row_number() OVER (), m.bid, 'violation',
                                 strptime(x.DATE_VIOLATION_DETERMINED, '%m/%d/%Y')::DATE,
                                 COALESCE(strptime(x.ACTUAL_RTC_DATE, '%m/%d/%Y')::DATE, strptime(x.SCHEDULED_COMPLIANCE_DATE, '%m/%d/%Y')::DATE),
                                 x.VIOLATION_TYPE || ' ' || x.VIOLATION_TYPE_DESC || CASE WHEN x.ACTUAL_RTC_DATE IS NULL THEN ' (not returned to compliance)' ELSE '' END,
                                 'echo_rcra', 'measured'
                          FROM read_csv('{v}', all_varchar=true) x JOIN {ids} m ON m.epa_id = x.ID_NUMBER
                          WHERE x.DATE_VIOLATION_DETERMINED IS NOT NULL""")
        e = d / "bulk_enforcements_metro.csv"
        if e.exists():
            c.execute(f"""INSERT OR IGNORE INTO event (id, business_id, kind, happened, detail, amount_usd, source_id, basis)
                          SELECT 'ev:enf:' || x.ID_NUMBER || ':' || x.ENFORCEMENT_IDENTIFIER || ':' || row_number() OVER (), m.bid, 'enforcement',
                                 strptime(x.ENFORCEMENT_ACTION_DATE, '%m/%d/%Y')::DATE, x.ENFORCEMENT_DESC,
                                 TRY_CAST(COALESCE(NULLIF(x.FMP_AMOUNT, ''), NULLIF(x.PMP_AMOUNT, '')) AS DOUBLE), 'echo_rcra', 'measured'
                          FROM read_csv('{e}', all_varchar=true) x JOIN {ids} m ON m.epa_id = x.ID_NUMBER
                          WHERE x.ENFORCEMENT_ACTION_DATE IS NOT NULL""")
        self.counts["event.violations"] = c.execute("SELECT COUNT(*) FROM event WHERE kind = 'violation'").fetchone()[0]
        self.counts["event.enforcement"] = c.execute("SELECT COUNT(*) FROM event WHERE kind = 'enforcement'").fetchone()[0]

    def wimn(self):
        """MPCA regulated sites that carry a business classification and no EPA
        id we already hold: the dry cleaners, dentists and shops ECHO and the
        county licence both miss."""
        c = self.con
        files = sorted(glob.glob(str(self.root / "data" / "cache" / "mpca_wimn_7county" / "page_*.json")))
        if not files:
            print("  skip  mpca_wimn: not found")
            return
        rows = []
        for f in files:
            j = json.loads(Path(f).read_text())
            rows += [x.get("attributes", x) for x in (j.get("features") or [])]
        print(f"  read  mpca_wimn: {len(rows):,} sites")
        known = {r[0] for r in c.execute("SELECT epa_id FROM business WHERE epa_id IS NOT NULL").fetchall()}
        biz = []
        for r in rows:
            ic = (r.get("industrial_classification") or "").strip()
            if not ic or r.get("active_flag") != "Y":
                continue
            eids = re.findall(r"MN[A-Z0-9]{10}", r.get("mpca_id_list") or "")
            if any(e in known for e in eids):
                continue
            low = ic.lower()
            if "drycleaning" in low:
                cat = "dry_cleaning"
            elif "dentist" in low:
                cat = "dentist"
            elif "automotive" in low:
                cat = "automotive_repair"
            else:
                cat = low.replace(" ", "_")[:60]
            name = r.get("name") or ""
            size = next((z for z in ("Large", "Small", "Very small", "Minimal") if f"{z} quantity generator" in (r.get("activity_list") or "")), None)
            biz.append(dict(id=f"wimn:{r.get('site_id')}", name=name, sector=sector_for(cat, None), category=cat, epa_id=eids[0] if eids else None,
                            address=r.get("address_street"), city=city(r.get("address_city") or r.get("city")), county=(r.get("county") or "").lower(),
                            postcode=r.get("address_zip"), lat=r.get("latitude"), lon=r.get("longitude"),
                            status={"Very small": "licensed:VSQG", "Small": "licensed:SQG", "Large": "licensed:LQG", "Minimal": "licensed:MIG"}.get(size, "regulated"),
                            dedupe_key=f"{(city(r.get('address_city') or r.get('city')) or '').upper()}|{norm_token(name)}", source_id="mpca_wimn", basis="measured"))
            for e_ in eids:
                known.add(e_)
        self.counts["business.wimn"] = _insert(c, "business", biz)

    def sos(self):
        """Secretary of State status from the MBLS sample (scripts/sos_status.py).
        One row per exact-name filing matched to an operating business."""
        c = self.con
        p = self.root / "data" / "cache" / "sos_status" / "_sample.json"
        if not p.exists():
            print("  skip  sos_status: not found")
            return
        res = json.loads(p.read_text())

        def d(x):
            if not x:
                return None
            m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", x)
            return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else None
        rows, ev = [], []
        for r in res:
            for m in r.get("matches") or []:
                st = (m.get("Status") or m.get("status") or "").lower()
                ty = m.get("Business Type") or m.get("type") or ""
                rows.append(dict(business_id=r["id"], filing_name=m.get("name"), filing_type=ty, status="active" if st.startswith("active") else "inactive",
                                 dissolved_on=d(m.get("dissolved_on")), last_renewal=d(m.get("last_renewal")), filed_on=d(m.get("Filing Date")),
                                 office=m.get("Principal Executive Office Address") or m.get("Registered Office Address"), source_id="mn_sos"))
                if d(m.get("dissolved_on")):
                    ev.append(dict(id=f"ev:sosdiss:{r['id']}:{m.get('guid')}", business_id=r["id"], kind="sos_dissolved", happened=d(m.get("dissolved_on")),
                                   detail=f"{ty} {m.get('name')} administratively dissolved", source_id="mn_sos", basis="measured"))
        print(f"  read  sos_status: {len(res):,} businesses looked up, {len(rows):,} exact-name filings")
        self.counts["sos_status"] = _insert(c, "sos_status", rows)
        _insert(c, "event", ev)
        # the renewal deadline, as an event on every matched active entity
        c.execute("""INSERT OR IGNORE INTO event (id, business_id, kind, effective, detail, source_id, basis)
                     SELECT 'ev:sosdue:' || business_id, business_id, 'sos_renewal_due', DATE '2026-12-31', 'annual renewal due', 'mn_sos', 'measured'
                     FROM sos_status WHERE status = 'active' AND filing_type NOT LIKE 'Assumed%' GROUP BY business_id""")
        self.counts["sos_looked_up"] = len(res)

    # ---------------------------------------------------------------- businesses

    def businesses(self):
        c = self.con
        rows = getattr(self, "_biz_rows", None) or _rows(self.exports / "businesses.json")
        out = []
        for r in rows:
            slug = COUNTY_SLUG.get(r.get("county"), "")
            sid = f"{slug}|{r['site_parcel_id']}" if r.get("site_parcel_id") else None
            name = r.get("name") or ""
            out.append(dict(id=f"ov:{r['overture_id']}", name=name, sector=sector_for(r.get("category"), r.get("sector")), category=r.get("category"),
                            independent=r.get("independent"), address=r.get("address"), city=city(r.get("city")), county=slug, postcode=r.get("postcode"),
                            lat=r.get("lat"), lon=r.get("lon"), site_id=sid, status="unverified", website=r.get("website"), phone=r.get("phone"),
                            dedupe_key=f"{sid or r.get('city')}|{norm_token(name)}", source_id="bm_businesses", basis="measured"))
        self.counts["business.overture"] = _insert(c, "business", out)

        lic, sites = [], []
        for i, r in enumerate(_rows(self.exports / "licences.json")):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            sid = f"{slug}|{r['site_parcel_id']}" if r.get("site_parcel_id") else None
            t = (r.get("type") or "").lower()
            if "off sale" in t or "offsale" in t:
                sec, cat = "retail", "liquor_store"
            elif "on sale" in t or "onsale" in t or "malt" in t:
                sec, cat = "bar", "bar"
            elif "grocery" in t or "market" in t or "corner" in t:
                sec, cat = "retail", "grocery_store"
            elif "restaurant" in t or "food" in t or "caterer" in t:
                sec, cat = "restaurant", "restaurant"
            elif r.get("food_or_drink"):
                sec, cat = "restaurant", t.replace(" ", "_")
            else:
                sec, cat = None, t.replace(" ", "_")
            name = r.get("business") or ""
            lic.append(dict(id=f"lic:{i}", name=name, sector=sec, category=cat, address=r.get("address"), county=slug, site_id=sid, status="licensed",
                            dedupe_key=f"{sid or r.get('address')}|{norm_token(name)}", source_id="bm_licences", basis="measured"))
            if sid:
                sites.append(dict(id=sid, parcel_id=r["site_parcel_id"], county=slug, address=r.get("address"), vacant_registered=False,
                                  teardown_permit=False, contaminated=False, hazwaste_licensed=False, source_id="bm_licences", basis="inferred"))
        _insert(c, "site", sites)
        self.counts["business.licences"] = _insert(c, "business", lic)

        sba, ev, oo = [], [], []
        for i, r in enumerate(_rows(self.exports / "sba-loans.json")):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            name = r.get("business") or ""
            bid = f"sba:{i}"
            sba.append(dict(id=bid, name=name, sector=sector_for_naics(r.get("naics")), category=(r.get("trade") or "").lower().replace(" ", "_"),
                            naics=r.get("naics"), address=r.get("address"), city=city(r.get("city")), county=slug, postcode=r.get("zip"),
                            status=r.get("status_label") or "borrower", licensed_since=_date(r.get("approval_date")),
                            employees=r.get("jobs_supported"), employees_basis="measured" if r.get("jobs_supported") else None,
                            dedupe_key=f"{(r.get('city') or '').upper()}|{norm_token(name)}", source_id="bm_sba", basis="measured"))
            ev.append(dict(id=f"ev:sba:{bid}", business_id=bid, kind="sba_approval", happened=_date(r.get("approval_date")), effective=_date(r.get("approval_date")),
                           detail=f"{r.get('program')} via {r.get('lender')}, {r.get('term_months')} mo at {r.get('interest_rate')}%", amount_usd=r.get("approved"),
                           source_id="bm_sba", basis="measured"))
            oo.append(dict(id=f"oo:{bid}", business_id=bid, name=name, role="borrower", kind="entity" if r.get("business_type") != "Individual" else "person",
                           source_id="bm_sba", basis="measured"))
        self.counts["business.sba"] = _insert(c, "business", sba)
        _insert(c, "event", ev)
        _insert(c, "owner_operator", oo)

        npi, sites, oo, tmp = [], [], [], []
        for r in _rows(self.exports / "practice-owners.json"):
            slug = COUNTY_SLUG.get(r.get("county"), "")
            sid = f"{slug}|{r['parcel_id']}"
            name = r.get("organisation") or ""
            bid = f"npi:{r['npi']}"
            npi.append(dict(id=bid, name=name, sector="health", category=(r.get("provider_type") or "").lower().replace(" ", "_"), address=r.get("address"),
                            city=city(r.get("city")), county=slug, site_id=sid, status="registered", dedupe_key=f"{sid}|{norm_token(name)}",
                            source_id="bm_practice_owners", basis="measured"))
            sites.append(dict(id=sid, parcel_id=r["parcel_id"], county=slug, address=r.get("address"), city=city(r.get("city")), footprint_sqft=r.get("footprint_sqft"),
                              lot_sqft=r.get("lot_sqft"), year_built=r.get("year_built"), owner=r.get("taxpayer_of_record"), owner_occupied=r.get("owner_occupied"),
                              vacant_registered=False, teardown_permit=False, contaminated=False, hazwaste_licensed=False, source_id="bm_practice_owners", basis="measured"))
            tmp.append(dict(id=sid, oo=r.get("owner_occupied"), fp=r.get("footprint_sqft")))
            if r.get("official"):
                oo.append(dict(id=f"oo:{bid}", business_id=bid, name=r["official"], role="official", title=r.get("official_title"), kind="person",
                               source_id="bm_practice_owners", basis="measured"))
        _insert(c, "site", sites)
        _temp(c, "t_po", tmp, dict(id="TEXT", oo="BOOLEAN", fp="DOUBLE"))
        c.execute("UPDATE site SET owner_occupied = COALESCE(site.owner_occupied, t.oo), footprint_sqft = COALESCE(site.footprint_sqft, t.fp) FROM t_po t WHERE site.id = t.id")
        self.counts["business.practice_owners"] = _insert(c, "business", npi)
        _insert(c, "owner_operator", oo)

        # WARN notices: an employer-level clock; matched to a business by name token
        ev = []
        for i, r in enumerate(_rows(self.exports / "layoff-notices.json")):
            full = norm_name(re.sub(r"\s*[-(].*$", "", r.get("employer") or ""))
            hit = None
            if full:
                hit = c.execute("SELECT id FROM business WHERE regexp_replace(UPPER(name), '[^A-Z0-9]+', ' ', 'g') LIKE ? LIMIT 1", [f"%{full}%"]).fetchone()
            ev.append(dict(id=f"ev:warn:{i}", business_id=hit[0] if hit else None, kind="warn_notice", happened=_date(r.get("notice_date")),
                           effective=_date(r.get("effective_date")), detail=f"{r.get('employer')}: {r.get('kind')}", source_id="bm_warn",
                           basis="measured" if hit else "inferred"))
        _insert(c, "event", ev)
        self.counts["event.warn_matched"] = sum(1 for e in ev if e["business_id"])

    def reviews(self):
        c = self.con
        path = self.root / "bricks.duckdb"
        if not path.exists():
            print("  skip  bricks.duckdb: not found")
            return
        c.execute(f"ATTACH '{path}' AS rv (READ_ONLY)")
        rows = c.execute("SELECT name, city, total_review_count, rating FROM rv.businesses").fetchall()
        c.execute("DETACH rv")
        n = 0
        for name, city, cnt, rating in rows:
            tok = norm_token(name)
            if not tok or not city:
                continue
            c.execute("UPDATE business SET review_count = ?, rating = ? WHERE dedupe_key LIKE ? AND UPPER(city) = UPPER(?) AND source_id = 'bm_businesses'",
                      [cnt, rating, f"%|{tok}", city])
            n += 1
        self.counts["business.reviewed_matched"] = n

    # ---------------------------------------------------------------- trades, counterparties

    def trades(self):
        c = self.con
        out = [dict(naics=r["naics"], label=r["trade"], sector=sector_for_naics(r["naics"]), establishments=r.get("y2023"), establishments_year=2023,
                    employees=r.get("employees_now"), avg_weekly_wage_usd=r.get("avg_weekly_wage_usd"), workers_per_business=r.get("workers_per_business"),
                    headcount_change_pct=r.get("headcount_change_pct"), source_id="bm_trades")
               for r in _rows(self.exports / "trades.json")]
        self.counts["trade"] = _insert(c, "trade", out, replace=True)

    def counterparties(self):
        c = self.con
        out = [dict(id=f"cp:{r['firm']}|{r.get('city')}", name=r["firm"], role="contractor", trade=r.get("main_trade"), scale="local",
                    geography=r.get("city"), sites_served=r.get("sites"), permits=r.get("permits"), first_seen=_date(r.get("first_permit")),
                    last_seen=_date(r.get("last_permit")), mailing=r.get("mailing_address"), pays_or_charges="charges",
                    source_id="bm_contractors", basis="measured")
               for r in _rows(self.exports / "contractors.json")]
        self.counts["counterparty.contractors"] = _insert(c, "counterparty", out)
        for bc in V.BUYER_CLASSES:
            bid, sector = bc[0], bc[2]
            if bid == "mechanical_contractors":
                n = c.execute("SELECT COUNT(*) FROM counterparty WHERE trade = 'systems'").fetchone()[0]
            elif sector:
                n = c.execute("SELECT COUNT(DISTINCT dedupe_key) FROM business WHERE sector = ?", [sector]).fetchone()[0]
            else:
                continue
            c.execute("UPDATE buyer_class SET in_market = ? WHERE id = ?", [n, bid])

    # ---------------------------------------------------------------- flows

    def flows(self):
        """sector_flow_template x business -> flow, one INSERT ... SELECT per template."""
        c = self.con
        c.execute("DELETE FROM flow")
        period = {"day": 365, "week": 52, "month": 12, "year": 1}
        for t in c.execute("SELECT id, sector, category_like, material_id, direction, qty_per_unit, per, period, unit, unit_cost_usd, lead_time_days, sourcing_pain, confidence, source_id, basis FROM sector_flow_template").fetchall():
            (tid, sector, cat, mat, direction, qty, per, per_period, unit, cost, lead, pain, conf, src, basis) = t
            where, args = [], []
            if sector:
                where.append("b.sector = ?")
                args.append(sector)
            if cat:
                where.append("b.category LIKE ?")
                args.append(f"%{cat}%")
            wsql = " AND ".join(where) or "TRUE"
            factor = period.get(per_period, 1)
            if per == "employee":
                units = "COALESCE(b.employees, tr.workers_per_business, 5)"
            elif per == "sqft":
                units = "COALESCE(b.floor_sqft, s.footprint_sqft, 2000)"
            else:
                units = "1"
            c.execute(f"""
                INSERT INTO flow (id, business_id, material_id, direction, qty_per_year, unit, unit_cost_usd, annual_cost_usd, lead_time_days, sourcing_pain, template_id, confidence, source_id, basis)
                SELECT 'fl:' || ? || ':' || b.id, b.id, ?, ?, {qty} * {units} * {factor}, ?, ?,
                       {qty} * {units} * {factor} * COALESCE(?, 0), ?, ?, ?, ?, ?, ?
                FROM business b
                LEFT JOIN site s ON s.id = b.site_id
                LEFT JOIN (SELECT sector, AVG(workers_per_business) workers_per_business FROM trade WHERE sector IS NOT NULL GROUP BY 1) tr ON tr.sector = b.sector
                WHERE {wsql}
            """, [tid, mat, direction, unit, cost, cost, lead, pain, tid, conf, src, basis] + args)
        self.counts["flow"] = c.execute("SELECT COUNT(*) FROM flow").fetchone()[0]

    # ---------------------------------------------------------------- run

    def run(self):
        print("schema + seeds")
        self.schema()
        self.seeds()
        print("sites")
        self.sites()
        print("hazardous waste generators")
        self.hazwaste()
        print("businesses")
        self.businesses()
        print("reviews")
        self.reviews()
        print("EPA ECHO and MPCA")
        self.echo()
        self.wimn()
        print("Secretary of State")
        self.sos()
        print("trades, counterparties")
        self.trades()
        self.counterparties()
        print("flows")
        self.flows()
        c = self.con
        c.execute("""CREATE OR REPLACE VIEW business_site AS
                     SELECT b.*, s.hazwaste_licensed, s.hazwaste_size, s.hazwaste_sic, s.footprint_sqft, s.building_sqft, s.teardown_permit,
                            s.vacant_registered, s.contaminated, s.assessed_usd, s.owner, s.owner_occupied, s.year_built, s.last_sale,
                            s.lead_service_line, s.corridor, s.zoning
                     FROM business b LEFT JOIN site s ON s.id = b.site_id""")
        for t in ["source", "business", "site", "owner_operator", "buyer_class", "counterparty", "trade", "material", "sector_flow_template",
                  "flow", "obligation", "market_price", "demand", "event", "access_asset", "opportunity", "work_route", "sos_status", "taker"]:
            self.counts[f"table.{t}"] = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        return self.counts


def build(db_path: str | os.PathLike, root: str | os.PathLike | None = None) -> dict[str, int]:
    root = Path(root or os.environ.get("ARBITRAGE_SOURCE_ROOT") or DEFAULT_ROOT)
    db_path = Path(db_path)
    if db_path.exists():
        db_path.unlink()
    ld = Loader(db_path, root)
    try:
        counts = ld.run()
    finally:
        ld.con.close()
        for pth in _bulk.paths:  # type: ignore[attr-defined]
            try:
                os.unlink(pth)
            except OSError:
                pass
        _bulk.paths.clear()  # type: ignore[attr-defined]
    return counts
