"""Score every opportunity in the model with the post's equation and write
the analysis.

    Opportunity = value asymmetry x obscurity x buyer urgency x access advantage
                  / competition

The four ordinal terms come off the opportunity row. Value is computed, never
typed: for a waste stream it is the gap between what side A nets today (the
flow's unit cost, sign-corrected) and the best price a buyer class pays, summed
over side A's annual quantity; for an obligation it is the compliance price
times the businesses the rule reaches. Only flows and prices whose basis
`counts` are summed. An opportunity whose value cannot be summed keeps a
neutral value term of 1.0 and is labelled unpriced in the report.

Accessibility gates: the post's "obscurity without accessibility is trivia".
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from pathlib import Path

import duckdb

from arbitrage.vocabulary import COUNT_BY_SITE


def value_term(usd: float | None) -> float:
    if not usd or usd <= 0:
        return 1.0
    return max(0.5, min(5.0, math.log10(usd) - 3.0))   # $10k -> 1, $1M -> 3, $100M -> 5


BROAD_SECTORS = {"retail", "health"}   # a category given on the rule narrows only these


def obligation_filter(sectors: str | None, category: str | None) -> str | None:
    """Side-A SQL for a rule: each named sector, with the rule's category
    narrowing only the broad sectors (retail -> grocery, health -> dentist).
    None when the rule names no sector: an all-business rule is not a target."""
    secs = [x.strip() for x in (sectors or "").split(",") if x.strip()]
    if not secs:
        return f"b.category LIKE '%{category}%'" if category else None
    parts = []
    for sec in secs:
        if category and sec in BROAD_SECTORS:
            parts.append(f"(b.sector = '{sec}' AND b.category LIKE '%{category}%')")
        else:
            parts.append(f"b.sector = '{sec}'")
    return "(" + " OR ".join(parts) + ")"


def generate(con: duckdb.DuckDBPyConnection) -> int:
    """Candidates the engine writes itself, so the list is not only the ones a
    person thought of: one per sector-scoped rule, one per discarded material."""
    con.execute("DELETE FROM opportunity WHERE origin = 'generated'")
    con.execute("UPDATE opportunity SET origin = 'hypothesis' WHERE origin IS NULL")
    n = 0
    for oid, label, sectors, cat, mat, obsc, src in con.execute(
            "SELECT id, label, applies_sector, applies_category, material_id, obscurity, source_id FROM obligation WHERE material_id IS NOT NULL").fetchall():
        filt = obligation_filter(sectors, cat)
        if not filt:
            continue
        con.execute("""INSERT INTO opportunity (id,label,material_id,asymmetry_id,side_a_filter,side_a_role,obligation_id,value_basis,obscurity,accessibility,note,source_id,origin)
                       VALUES (?,?,?,'regulatory',?,'must_comply',?,'compliance price x businesses reached',?,3,'generated from the rule',?,'generated')""",
                    [f"gen_{oid}", label, mat, filt, oid, obsc, src])
        n += 1
    for mat, label in con.execute("""SELECT DISTINCT m.id, m.label FROM material m JOIN sector_flow_template t ON t.material_id = m.id
                                     WHERE t.direction = 'out'""").fetchall():
        filt = f"b.id IN (SELECT business_id FROM flow WHERE material_id = '{mat}' AND direction = 'out')"
        con.execute("""INSERT INTO opportunity (id,label,material_id,asymmetry_id,side_a_filter,side_a_role,value_basis,obscurity,accessibility,note,source_id,origin)
                       VALUES (?,?,?,'waste_stream',?,'disposes','best buyer or substitute price x volume',2,3,'generated from the flow templates',
                               (SELECT MIN(source_id) FROM sector_flow_template WHERE material_id = ?),'generated')""",
                    [f"gen_ws_{mat}", f"{label}: who discards it, who pays for it", mat, filt, mat])
        n += 1
    return n


def _tier(n: int) -> int:
    return 1 if n <= 0 else 2 if n <= 3 else 3 if n <= 30 else 4 if n <= 300 else 5


def derive_terms(con, oid, mat, obligation_id, n_members, n_clocked, today):
    """Urgency from the nearest clock (a rule date, dated events on side A, the
    material spoiling, or a disposal fee), competition from who already trades
    the material, access from what we hold on it. Each comes back with its basis
    in words."""
    # urgency
    urg, ub = 1, "no dated rule and no dated events on side A"
    if obligation_id:
        eff, nxt, freq = con.execute("SELECT effective, next_step, frequency FROM obligation WHERE id = ?", [obligation_id]).fetchone()
        fut = [d for d in (nxt, eff) if d and d >= today]
        if fut and freq == "annual" and eff and eff.year < today.year + 1 and (eff.month, eff.day) == (min(fut).month, min(fut).day):
            # a renewal that recurs every year is a routine, not a clock
            urg, ub = 2, f"recurring annual deadline ({min(fut)})"
        elif fut:
            days = (min(fut) - today).days
            urg = 5 if days <= 365 else 4 if days <= 730 else 3 if days <= 1095 else 2 if days <= 1825 else 1
            ub = f"rule date {min(fut)} is {days} days out"
        else:
            urg, ub = 1, "rule in force, no future date"
    if n_members:
        share = n_clocked / n_members
        ev = 4 if share >= 0.30 else 3 if share >= 0.10 else 2 if share >= 0.03 else 1
        if ev > urg:
            urg, ub = ev, f"{share:.0%} of side A has a dated event within a year"
    # clocks that no law sets (added 2026-09-30: with only rule dates and events,
    # anything the law will never force ranked last forever)
    shelf, = con.execute("SELECT shelf_life_days FROM material WHERE id = ?", [mat]).fetchone() or (None,)
    if shelf is not None:
        per = 4 if shelf <= 3 else 3 if shelf <= 14 else 2 if shelf <= 90 else 1
        if per > urg:
            urg, ub = per, f"spoils in {shelf} days: side A must move it every {'day' if shelf <= 3 else 'week' if shelf <= 14 else 'quarter'}"
    fee, = con.execute("""SELECT BOOL_OR(unit_cost_usd > 0) FROM sector_flow_template
                          WHERE material_id = ? AND direction = 'out'""", [mat]).fetchone()
    if fee and urg < 3:
        urg, ub = 3, "side A pays to be rid of it: every day of delay is a bill"
    # competition
    named = con.execute("SELECT COUNT(*), MIN(founded), BOOL_OR(scale = 'national') FROM counterparty WHERE material_id = ?", [mat]).fetchone()
    classes = con.execute("""SELECT COALESCE(SUM(bc.in_market), 0), BOOL_OR(bc.in_market IS NULL),
                                    STRING_AGG(bc.label || ' (' || COALESCE(CAST(bc.in_market AS TEXT), 'count unknown') || ')', '; ')
                             FROM demand d JOIN buyer_class bc ON bc.id = d.buyer_class_id WHERE d.material_id = ?""", [mat]).fetchone()
    inc = (named[0] or 0) + int(classes[0] or 0)
    unknown = bool(classes[1]) or (inc == 0)
    comp = _tier(inc)
    cb = f"{inc:,} counted incumbents"
    if classes[2]:
        cb += f" [{classes[2]}]"
    if unknown and comp < 3:
        # no evidence of incumbents is not evidence of none: hold the term neutral
        comp = 3
        cb += "; incumbents not enumerated, held neutral at 3"
    if named[1] and today.year - named[1] >= 50:
        comp += 1
        cb += f"; oldest founded {named[1]}"
    if named[2]:
        comp += 1
        cb += "; a national player"
    comp = max(1, min(5, comp))
    # access
    a = con.execute("SELECT MAX(strength), STRING_AGG(label, '; ') FROM access_asset WHERE material_id = ?", [mat]).fetchone()
    if a[0] is not None:
        acc, ab = a[0], f"held: {a[1][:90]}"
    else:
        # 2026-09-30: this used to be a typed 3, so a material with its own register
        # (all of them regulatory) out-scored one we reach through the business
        # listing we hold for every side A. Use the strongest general asset instead.
        g = con.execute("SELECT MAX(strength), STRING_AGG(label, '; ') FROM access_asset WHERE material_id IS NULL").fetchone()
        acc, ab = (g[0], f"no material-specific asset; held: {g[1][:90]}") if g[0] is not None else (3, "no asset recorded; held neutral at 3")
    return urg, ub, comp, cb, acc, ab


def score_all(con: duckdb.DuckDBPyConnection, today: date | None = None) -> None:
    today = today or date.today()
    generate(con)
    con.execute("DELETE FROM opportunity_member")
    ops = con.execute("SELECT id, material_id, side_a_filter, side_a_role, obligation_id, obscurity, accessibility FROM opportunity").fetchall()
    for (oid, mat, filt, role, oblig, obsc, access) in ops:
        best = con.execute("""
            SELECT MAX(p.price_usd) FROM market_price p JOIN basis_kind k ON k.id = p.basis
            WHERE p.material_id = ? AND p.side IN ('purchase','collection','substitute') AND k.counts
        """, [mat]).fetchone()[0]
        # 'substitute' (added 2026-09-30) is what a taker pays today for the input this
        # replaces. Without it a stream nobody resells was $0 at any volume, though the
        # taker's own bill for the substitute is real.
        unit = con.execute("SELECT unit FROM material WHERE id = ?", [mat]).fetchone()
        unit = unit[0] if unit else None
        con.execute(f"""
            INSERT INTO opportunity_member
            SELECT ?, b.id,
                   CASE WHEN f.unit = ? THEN f.qty_per_year END,
                   CASE WHEN f.qty_per_year IS NULL OR ? IS NULL OR f.unit <> ? THEN NULL
                        ELSE f.qty_per_year * (? + COALESCE(f.unit_cost_usd, 0)) END,
                   (SELECT MIN(COALESCE(e.effective, e.happened)) FROM event e
                     WHERE (e.business_id = b.id OR e.site_id = b.site_id) AND COALESCE(e.effective, e.happened) >= ?),
                   COALESCE(f.basis, 'inferred')
            FROM business_site b
            JOIN business_site s ON s.id = b.id
            LEFT JOIN (
                SELECT fl.business_id, SUM(fl.qty_per_year) qty_per_year, MAX(fl.unit_cost_usd) unit_cost_usd, MIN(fl.basis) basis, MIN(fl.unit) unit
                FROM flow fl JOIN basis_kind k ON k.id = fl.basis
                WHERE fl.material_id = ? AND k.counts GROUP BY fl.business_id
            ) f ON f.business_id = b.id
            WHERE ({filt})
        """, [oid, unit, best, unit, best, (today - timedelta(days=365)).isoformat(), mat])
        key = "b.site_id" if oid in COUNT_BY_SITE else "b.dedupe_key"
        n, qty, val, clocked = con.execute(f"""
            SELECT COUNT(DISTINCT {key}), SUM(m.qty_per_year), SUM(m.value_usd),
                   COUNT(DISTINCT {key}) FILTER (WHERE m.clock IS NOT NULL AND m.clock <= ?)
            FROM opportunity_member m JOIN business b ON b.id = m.business_id WHERE m.opportunity_id = ?
        """, [(today + timedelta(days=365)).isoformat(), oid]).fetchone()
        if val is None and role == "must_comply":
            price = con.execute("""
                SELECT MAX(p.price_usd) FROM market_price p JOIN basis_kind k ON k.id = p.basis
                WHERE p.material_id = ? AND p.side = 'purchase' AND k.counts
            """, [mat]).fetchone()[0]
            if price and n:
                val = price * n
        urg, ub, comp, cb, acc, ab = derive_terms(con, oid, mat, oblig, n or 0, clocked or 0, today)
        priced = bool(val and val > 0)
        route = con.execute("""SELECT id, end_to_end FROM work_route WHERE material_id = ? ORDER BY end_to_end DESC LIMIT 1""", [mat]).fetchone()
        route_id, e2e = (route[0], bool(route[1])) if route else (None, False)
        # The route is recorded, not enforced. 2026-09-28 it gated: only work we could
        # finish for the owner survived. Dropped 2026-09-30 (Aidan): the intent is to
        # surface the opportunity to the owner, manager or employee, not to do the work.
        gated = (access or 0) == 0 or (n or 0) == 0
        score = 0.0 if gated else value_term(val) * (obsc or 0) * urg * acc / comp
        con.execute("""UPDATE opportunity SET n_side_a = ?, annual_qty = ?, qty_unit = ?, annual_value_usd = ?, score = ?, gated_out = ?,
                              urgency_derived = ?, urgency_basis = ?, competition_derived = ?, competition_basis = ?, access_derived = ?, access_basis = ?,
                              priced = ?, route_id = ?, end_to_end = ?, merged_into = NULL, also = NULL WHERE id = ?""",
                    [n, qty, unit, val, round(score, 2), gated, urg, ub, comp, cb, acc, ab, priced, route_id, e2e, oid])
    merge_duplicates(con)
    from .block import pair_all
    pair_all(con)


def merge_duplicates(con, threshold: float = 0.9) -> None:
    """Two opportunities whose side-A lists overlap >= 90% both ways are one
    population, however many rules or materials point at it. Keep the higher
    score; record the other's label under `also`."""
    pairs = con.execute("""
        WITH sz AS (SELECT opportunity_id o, COUNT(*) n FROM opportunity_member GROUP BY 1),
             ov AS (SELECT a.opportunity_id x, b.opportunity_id y, COUNT(*) k
                    FROM opportunity_member a JOIN opportunity_member b ON a.business_id = b.business_id AND a.opportunity_id < b.opportunity_id
                    GROUP BY 1, 2)
        SELECT ov.x, ov.y FROM ov JOIN sz sx ON sx.o = ov.x JOIN sz sy ON sy.o = ov.y
        WHERE ov.k >= ? * sx.n AND ov.k >= ? * sy.n
    """, [threshold, threshold]).fetchall()
    score = dict(con.execute("""SELECT id, score + CASE WHEN priced THEN 1000 ELSE 0 END + CASE WHEN origin = 'hypothesis' THEN 0.001 ELSE 0 END
                                FROM opportunity""").fetchall())
    parent = {}
    def root(x):
        while parent.get(x, x) != x:
            x = parent[x]
        return x
    for x, y in pairs:
        rx, ry = root(x), root(y)
        if rx == ry:
            continue
        keep, drop = (rx, ry) if score.get(rx, 0) >= score.get(ry, 0) else (ry, rx)
        parent[drop] = keep
    groups: dict[str, list[str]] = {}
    for d in list(parent):
        groups.setdefault(root(d), []).append(d)
    for keep, drops in groups.items():
        labels = [r[0] for r in con.execute(f"SELECT label FROM opportunity WHERE id IN ({','.join('?' * len(drops))})", drops).fetchall()]
        con.execute("UPDATE opportunity SET also = ? WHERE id = ?", ["; ".join(labels), keep])
        con.execute(f"UPDATE opportunity SET merged_into = ? WHERE id IN ({','.join('?' * len(drops))})", [keep] + drops)


# ---------------------------------------------------------------- report

def _fmt_usd(x):
    if x is None:
        return "unpriced"
    if x >= 1e6:
        return f"${x/1e6:,.1f}M"
    return f"${x:,.0f}"


def _table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        out.append("| " + " | ".join("" if v is None else str(v) for v in r) + " |")
    return "\n".join(out)


def report(con: duckdb.DuckDBPyConnection, counts: dict | None = None, today: date | None = None) -> str:
    today = today or date.today()
    q = lambda sql, *a: con.execute(sql, list(a)).fetchall()
    L = []
    L.append(f"# Hidden-market arbitrage over Minneapolis–Saint Paul businesses\n")
    L.append(f"Run {today.isoformat()}. Model: `src/bricks/arbitrage/schema.sql`; loader `load.py`; scorer `score.py`. "
             "Equation and terms are Aidan's post of 2026-09-07. Every figure below is read off the model; "
             "rows with basis `illustrative` are never summed and show up as *unpriced*.\n")

    # coverage
    L.append("## What the model holds\n")
    rows = q("""SELECT 'business' t, source_id, basis, COUNT(*) FROM business GROUP BY 2,3
                UNION ALL SELECT 'site', source_id, basis, COUNT(*) FROM site GROUP BY 2,3
                UNION ALL SELECT 'flow', source_id, basis, COUNT(*) FROM flow GROUP BY 2,3
                UNION ALL SELECT 'event', source_id, basis, COUNT(*) FROM event GROUP BY 2,3
                UNION ALL SELECT 'counterparty', source_id, basis, COUNT(*) FROM counterparty GROUP BY 2,3
                ORDER BY 1, 4 DESC""")
    L.append(_table(["table", "source", "basis", "rows"], [(a, b, c, f"{d:,}") for a, b, c, d in rows]))
    n_biz, n_dedupe = q("SELECT COUNT(*), COUNT(DISTINCT dedupe_key) FROM business")[0]
    L.append(f"\n{n_biz:,} business rows collapse to **{n_dedupe:,} distinct businesses** on the site-and-name key.\n")

    # sectors
    L.append("## Side A by sector\n")
    rows = q("""SELECT COALESCE(sector,'(unmapped)') sector, COUNT(DISTINCT dedupe_key) n,
                       COUNT(DISTINCT CASE WHEN hazwaste_licensed THEN dedupe_key END) hw,
                       COUNT(DISTINCT CASE WHEN contaminated THEN dedupe_key END) contaminated,
                       COUNT(DISTINCT CASE WHEN teardown_permit OR vacant_registered THEN dedupe_key END) clocked
                FROM business_site GROUP BY 1 ORDER BY 2 DESC""")
    L.append(_table(["sector", "businesses", "on a hazwaste-licensed parcel", "on an MPCA parcel", "teardown or vacancy on parcel"],
                    [(a, f"{b:,}", f"{c:,}", f"{d:,}", f"{e:,}") for a, b, c, d, e in rows]))

    # hazwaste classes
    L.append("\n## Hennepin's licensed generators, by what the licence says they are\n")
    rows = q("""SELECT hazwaste_sic, hazwaste_name IS NOT NULL, COUNT(*) FROM site WHERE hazwaste_licensed GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15""")
    sic_label = {7538: "general auto repair", 8021: "dentists", 8011: "physicians", 7532: "auto body", 5541: "gas stations", 3599: "machine shops",
                 2752: "commercial printing (litho)", 5411: "grocery", 7216: "dry cleaning", 8041: "chiropractors", 2759: "commercial printing (other)",
                 5912: "pharmacies", 8211: "schools", 7549: "auto services", 1721: "painting contractors", 7699: "repair services", 7384: "photofinishing",
                 742: "veterinary", 1711: "plumbing/HVAC contractors", 6512: "building operators", 5093: "scrap and waste", 3089: "plastics", 5531: "auto parts", 9199: "government", 0: "(no SIC)"}
    L.append(_table(["SIC", "what", "licensed parcels"], [(a, sic_label.get(a, ""), f"{c:,}") for a, _, c in rows]))
    sizes = q("SELECT COALESCE(hazwaste_size,'(blank)'), COUNT(*) FROM site WHERE hazwaste_licensed GROUP BY 1 ORDER BY 2 DESC")
    L.append("\nGenerator size on the licence: " + ", ".join(f"{a} {b:,}" for a, b in sizes) + ".\n")
    never, stale, total = q("SELECT COUNT(*) FILTER (WHERE hazwaste_last_insp IS NULL), COUNT(*) FILTER (WHERE hazwaste_last_insp < DATE '2016-01-01'), COUNT(*) FROM site WHERE hazwaste_licensed")[0]
    dc_contam = q("SELECT COUNT(*) FROM site WHERE hazwaste_sic = 7216 AND contaminated")[0][0]
    L.append(f"Of {total:,} licensed parcels, {never:,} carry no inspection date and {stale:,} were last inspected before 2016. "
             f"{dc_contam} dry-cleaner parcels also carry an MPCA record.\n")

    # obligations and their clocks
    L.append("## The clocks: rules and who they reach\n")
    rows = q("SELECT id, label, jurisdiction, effective, next_step, applies_sector, applies_category, obscurity, verified FROM obligation ORDER BY COALESCE(next_step, effective)")
    out = []
    for oid, label, jur, eff, nxt, sec, cat, obsc, ver in rows:
        where = []
        args = []
        if sec:
            pass
        filt = obligation_filter(sec, cat)
        n = q("SELECT COUNT(DISTINCT b.dedupe_key) FROM business b WHERE " + (filt or "TRUE"))[0][0]
        out.append((label, jur, eff, nxt, f"{n:,}", obsc, "yes" if ver else "no"))
    L.append(_table(["rule", "where", "in force", "next date", "businesses reached (sector match, before the threshold test)", "obscurity 0-5", "read off the rule text"], out))
    L.append("\nThe reach column is the sector, not the threshold: Ordinance 13 reaches every Hennepin restaurant by sector and binds only those over a ton of trash a week, which no held record measures.\n")

    # the ranked opportunities
    cols = """o.id, o.label, a.label, o.origin, o.n_side_a, o.annual_value_usd, o.obscurity, o.urgency_derived, o.urgency_basis,
              o.access_derived, o.competition_derived, o.competition_basis, o.accessibility, o.score, o.gated_out, o.also, o.note, o.value_basis"""
    def rank(where):
        return q(f"SELECT {cols} FROM opportunity o JOIN asymmetry_kind a ON a.id = o.asymmetry_id WHERE o.merged_into IS NULL AND NOT o.gated_out AND {where} ORDER BY o.score DESC, o.n_side_a DESC")
    def row(r):
        (oid, label, kind, origin, n, val, ob, ur, ub, ac, co, cb, acc, sc, gated, also, note, vb) = r
        side = (f"{n:,}" if n is not None else "") + (" parcels" if oid in COUNT_BY_SITE else "")
        return (f"{sc:.1f}", label + (f" *(also: {also})*" if also else ""), kind, origin, side, _fmt_usd(val), f"{ob} / {ur} / {ac} / {co}")
    hdr = ["score", "opportunity", "asymmetry", "origin", "side A", "annual value", "obscurity / urgency / access / competition"]
    L.append("## Opportunities with a counted dollar value\n")
    L.append("Urgency, access and competition are derived (bases below); obscurity is the one judgment left, from the rule or the seed.\n")
    priced = rank("o.priced")
    L.append(_table(hdr, [row(r) for r in priced]) if priced else "_None._")
    L.append("\n## Opportunities without a dollar value yet\n")
    L.append("Same equation with the value term held at 1.0. These rank what to price next, not what to do.\n")
    unpriced = rank("NOT o.priced")
    L.append(_table(hdr, [row(r) for r in unpriced]))
    L.append("\nScore = value term x obscurity x urgency x access / competition. Value term: $10k = 1, $1M = 3, $100M = 5; 1.0 when unpriced.\n")
    L.append("### How each derived term was set\n")
    for r in priced + unpriced:
        L.append(f"- **{r[1]}.** urgency {r[7]}: {r[8]}. competition {r[10]}: {r[11]}. value: {r[17]}.")
    merged = q("SELECT o.label, k.label FROM opportunity o JOIN opportunity k ON k.id = o.merged_into ORDER BY 2")
    if merged:
        L.append("\n### Merged as one population (>= 90% the same businesses)\n")
        L.append(_table(["merged", "into"], merged))
    gated = q("""SELECT o.label, o.n_side_a, COALESCE(r.label, 'no route recorded'), COALESCE(r.owner_action, '—')
                 FROM opportunity o LEFT JOIN work_route r ON r.id = o.route_id
                 WHERE o.gated_out AND o.merged_into IS NULL ORDER BY o.end_to_end, o.score DESC""")
    if gated:
        L.append("\n### Gated out: nobody on side A, or no way to reach them\n")
        L.append("The gate (Aidan, 2026-09-28): only work a preparer can file entirely, where the owner's one act is to authorize. "
                 "An owner who must log in, forward a link, receive mail, hand over documents or be there in person is a job we cannot finish.\n")
        L.append(_table(["opportunity", "side A", "how it gets done", "what the owner must do"], gated))
    L.append("\n### Filing routes\n")
    L.append(_table(["route", "channel", "who may file", "owner must", "end to end", "source"],
                    q("SELECT label, channel, filer, owner_action, CASE WHEN end_to_end THEN 'yes' ELSE 'no' END, source_id FROM work_route ORDER BY end_to_end DESC, label")))

    # how each side-A list is composed
    from .block import block_md
    L.append("\n" + block_md(con) + "\n")
    L.append("\n## Who is on each list, by register\n")
    L.append("The same shop can appear in Overture, on a county hazwaste licence, in the SBA file and in NPPES; the dedupe key only merges them on a shared parcel, so a list drawn from several registers is an upper bound.\n")
    rows = q("""SELECT o.label, b.source_id, COUNT(DISTINCT b.dedupe_key) FROM opportunity_member m JOIN opportunity o ON o.id = m.opportunity_id
                JOIN business b ON b.id = m.business_id WHERE NOT o.gated_out AND o.merged_into IS NULL GROUP BY 1,2 ORDER BY o.label, 3 DESC""")
    L.append(_table(["opportunity", "register", "distinct"], [(a, b, f"{c:,}") for a, b, c in rows]))

    # where side A concentrates
    L.append("\n## Where side A sits\n")
    for oid, label in q("SELECT id, label FROM opportunity WHERE NOT gated_out AND merged_into IS NULL ORDER BY priced DESC, score DESC LIMIT 6"):
        rows2 = q("""SELECT COALESCE(b.city,'?'), COUNT(DISTINCT b.dedupe_key) FROM opportunity_member m JOIN business b ON b.id = m.business_id
                     WHERE m.opportunity_id = ? GROUP BY 1 ORDER BY 2 DESC LIMIT 6""", oid)
        L.append(f"- **{label}:** " + ", ".join(f"{c} {n:,}" for c, n in rows2))
    clocked = q("""SELECT o.label, COUNT(*) FROM opportunity_member m JOIN opportunity o ON o.id = m.opportunity_id
                   WHERE m.clock IS NOT NULL AND m.clock <= ? AND o.merged_into IS NULL GROUP BY 1 ORDER BY 2 DESC""", (today + timedelta(days=365)).isoformat())
    if clocked:
        L.append("\nMembers with a dated event in the last twelve months or the next (a WARN effective date, a wrecking permit, a vacancy filing, an SBA approval, a recorded sale, a hazwaste inspection):\n")
        L.append(_table(["opportunity", "members with a clock"], [(a, f"{b:,}") for a, b in clocked]))

    # the five questions, answered as far as the model can
    L.append("\n## The five questions, answered from the model\n")
    rows = q("""SELECT bq.label, COUNT(DISTINCT f.business_id) FILTER (WHERE k.counts) counted, COUNT(DISTINCT f.business_id) FILTER (WHERE NOT k.counts) placeholder
                FROM buyer_question bq
                LEFT JOIN sector_flow_template t ON t.question_id = bq.id
                LEFT JOIN flow f ON f.template_id = t.id
                LEFT JOIN basis_kind k ON k.id = f.basis
                GROUP BY 1 ORDER BY 1""")
    L.append(_table(["question", "businesses with a counted answer", "businesses with only a placeholder"], [(a, f"{b:,}", f"{c:,}") for a, b, c in rows]))

    # the gap list
    L.append("\n## What the model needs to uncover more\n")
    L.append("Ordered by how much of the scored value it would move from *unpriced* or *benchmark* to *measured*.\n")
    rows = q("SELECT name, publisher, coverage, how_to_get FROM source WHERE NOT held ORDER BY name")
    L.append(_table(["source not held", "publisher", "coverage", "route"], rows))
    L.append("\nTemplates still on a placeholder (the per-business number a quote or an invoice would replace):\n")
    rows = q("""SELECT t.id, t.sector, COALESCE(t.category_like,''), m.label, t.direction, t.qty_per_unit, t.unit, t.period, t.note
                FROM sector_flow_template t JOIN material m ON m.id = t.material_id WHERE t.basis = 'illustrative' ORDER BY t.sector, t.id""")
    L.append(_table(["template", "sector", "category", "material", "dir", "qty", "unit", "per", "what would replace it"], rows))
    empty = q("""SELECT 'business.employees' c, COUNT(*) FILTER (WHERE employees IS NULL) FROM business
                 UNION ALL SELECT 'business.revenue_usd', COUNT(*) FILTER (WHERE revenue_usd IS NULL) FROM business
                 UNION ALL SELECT 'business.floor_sqft', COUNT(*) FILTER (WHERE floor_sqft IS NULL) FROM business
                 UNION ALL SELECT 'business.status = trading', COUNT(*) FILTER (WHERE status <> 'trading') FROM business
                 UNION ALL SELECT 'flow.counterparty_id', COUNT(*) FILTER (WHERE counterparty_id IS NULL) FROM flow
                 UNION ALL SELECT 'site.building_sqft', COUNT(*) FILTER (WHERE building_sqft IS NULL) FROM site
                 UNION ALL SELECT 'owner_operator.email', COUNT(*) FILTER (WHERE email IS NULL) FROM owner_operator""")
    L.append("\nColumns the ideal model has and the warehouse leaves empty:\n")
    L.append(_table(["column", "rows empty"], [(a, f"{b:,}") for a, b in empty]))
    return "\n".join(L) + "\n"


def run(db_path: str | Path, out_md: str | Path | None = None, today: date | None = None) -> str:
    con = duckdb.connect(str(db_path))
    try:
        score_all(con, today)
        md = report(con, today=today)
    finally:
        con.close()
    if out_md:
        Path(out_md).write_text(md)
    return md
