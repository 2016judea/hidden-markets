"""Customer signals: which public event tells which trade about its next customer.

Aidan, 2026-09-28, after the filings lens came up short: "that is not the only
definition of work." Work is any outcome a business pays for, delivered whole.
The work our data can deliver whole is a CUSTOMER: every permit, order, sale,
loan or notice in the warehouse is somebody's next purchase, and a weekly feed
of those events is a thing we can hand over complete, with no login and no
intake. The trades that already spend to find customers pay for it.

Every term is read off the data except two, and those two are labelled:
  events_12m      counted: events in the trailing twelve months
  buyer_firms     counted: CBP establishments in the trades the event feeds
  forced          from the source: a correction order compels a purchase by a
                  date; a permit records one already made; a sale triggers one
  contact_share   counted: share of events whose owner has an email or phone
                  in a held register (the landlord licence file)
  known_vendors   TYPED, and flagged unverified: firms already selling the signal
  trades          TYPED: which NAICS trades the event feeds, and why

    score = log10(events) x log10(buyer firms) x urgency x (1 + 4 x contact share) / (1 + known vendors)
"""

from __future__ import annotations

import os

import glob
import gzip
import json
import math
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

# id: (label, trades [(naics prefix, why)], forced, known_vendors [(name, note)], vendors_verified)
SIGNALS = {
    "code_rental": ("Minneapolis rental and housing code cases (correction orders on rental and owner-occupied housing)",
                    [("238320", "painting orders"), ("238160", "roof and gutter orders"), ("238220", "plumbing, heating, water heater orders"),
                     ("238210", "electrical orders"), ("236118", "repair-and-remodel orders"), ("238990", "handyman, windows, doors, stairs"),
                     ("561710", "pest orders")], "deadline", [], False),
    "code_nuisance": ("Minneapolis nuisance cases (tall grass, junk, snow, graffiti, debris)",
                      [("561730", "tall grass and snow orders"), ("562111", "junk and debris removal"), ("238990", "graffiti and repair")], "deadline", [], False),
    "code_vacant": ("Minneapolis vacant and condemned building cases",
                    [("236118", "rehab of a vacant house"), ("238910", "board-up and site work"), ("531210", "agents and investors buying distressed property"),
                     ("561612", "security for a vacant building")], "deadline", [], False),
    "code_fire_commercial": ("Minneapolis fire inspections of commercial buildings and high-occupancy dwellings",
                             [("238220", "sprinkler, alarm and hood systems"), ("238210", "electrical and exit lighting"), ("238990", "fire doors and extinguishers")], "deadline", [], False),
    "permit_res_building": ("Residential building permits: remodels, additions, new homes",
                            [("238330", "flooring after the remodel"), ("238350", "finish carpentry and cabinets"), ("562111", "dumpsters"),
                             ("561730", "landscaping a new home"), ("238990", "fencing, decks, windows")], "trigger",
                            [("Construction Monitor", "permit lead lists"), ("BuildZoom", "permit data"), ("Shovels", "permit API")], False),
    "permit_res_systems": ("Residential plumbing, mechanical and electrical permits",
                           [("238220", "an HVAC swap signals the next service contract"), ("238210", "panel upgrades before EV chargers and solar")], "already_bought",
                           [("Construction Monitor", "permit lead lists"), ("Shovels", "permit API")], False),
    "permit_com_build": ("Commercial new construction and tenant build-outs",
                         [("339950", "signs for the new tenant"), ("561621", "security and access systems"), ("561720", "commercial cleaning contracts"),
                          ("524210", "insurance for the new location"), ("423210", "office and restaurant furniture")], "trigger",
                         [("Construction Monitor", "permit lead lists"), ("Dodge Construction Network", "project leads")], False),
    "teardown": ("Wrecking and demolition permits",
                 [("562910", "asbestos survey and abatement before demolition"), ("562111", "roll-off containers"), ("423930", "salvage and scrap")], "deadline",
                 [("Construction Monitor", "permit lead lists")], False),
    "sba_loan": ("SBA 7(a) and 504 approvals",
                 [("541211", "bookkeeping and tax for a newly funded business"), ("524210", "insurance the lender requires"), ("423440", "equipment for the build")], "trigger",
                 [], False),
    "warn": ("WARN layoff and closure notices",
             [("561320", "temporary staffing and outplacement"), ("531210", "commercial space coming free")], "trigger", [("WARNTracker", "WARN notice aggregator")], False),
    "commercial_sale": ("Recorded commercial property sales",
                        [("531311", "property management for a new owner"), ("524210", "insurance at change of ownership"), ("236220", "renovation by the new owner")], "trigger",
                        [("CoStar", "sales comps"), ("Reonomy", "ownership changes")], False),
    "food_refrigeration": ("Minneapolis food businesses cited for cold holding above 41F or failing refrigeration",
                           [("238220", "refrigeration and walk-in repair"), ("811310", "commercial kitchen equipment repair")], "deadline", [], False),
    "food_equipment": ("Minneapolis food businesses cited for equipment in disrepair or uncertified equipment",
                       [("811310", "commercial kitchen equipment repair"), ("423440", "replacement equipment")], "deadline", [], False),
    "food_pests": ("Minneapolis food businesses cited for pests, rodents or insects",
                   [("561710", "pest control contract")], "deadline", [], False),
    "food_plumbing": ("Minneapolis food businesses cited for plumbing, drains, grease or backflow",
                      [("238220", "plumbing repair"), ("562998", "grease trap pumping")], "deadline", [], False),
    "food_facility": ("Minneapolis food businesses cited for walls, floors, ceilings in disrepair or dirty",
                      [("561720", "commercial kitchen cleaning"), ("238990", "floor, wall and ceiling repair")], "deadline", [], False),
    "food_ventilation": ("Minneapolis food businesses cited for dirty exhaust ducts, hoods and filters",
                         [("561790", "hood and duct cleaning")], "deadline", [], False),
    "food_manager_cert": ("Minneapolis food businesses cited for no certified food protection manager",
                          [("611699", "food manager certification courses")], "deadline", [], False),
    "food_supplies": ("Minneapolis food businesses cited for missing test kits, thermometers, signs, logs or soap",
                      [("423850", "food safety supplies and chemical service"), ("561720", "chemical and sanitation service")], "deadline", [], False),
    "stp_exterior": ("Saint Paul DSI exterior and interior property complaints (feed ends 2025-06-30)",
                     [("238320", "painting and siding orders"), ("238160", "roof and gutter orders"), ("236118", "repair-and-remodel orders"),
                      ("238990", "handyman, windows, doors, stairs")], "deadline", [], False),
    "stp_certificate_occupancy": ("Saint Paul fire certificate of occupancy complaints on rental property (feed ends 2025-06-30)",
                                  [("238220", "plumbing, heating and smoke alarms"), ("238210", "electrical"), ("238990", "egress windows, doors, handrails")], "deadline", [], False),
    "stp_nuisance": ("Saint Paul DSI garbage, tall grass, snow, graffiti and dumping complaints (feed ends 2025-06-30)",
                     [("561730", "tall grass and snow"), ("562111", "garbage, rubbish and dumping"), ("238990", "graffiti removal")], "deadline", [], False),
    "311_pests_waste": ("Minneapolis 311 requests about animals, rodents and waste",
                        [("561710", "pest control"), ("562111", "junk and bulky waste")], "trigger", [], False),
}
URGENCY = {"deadline": 5, "trigger": 3, "already_bought": 1}

# Evidence that someone already PAYS for this signal somewhere, checked by hand.
# A vendor outside this market is proof of demand, not competition.
PROOF = {
    sid: ("CodeViolations (getcodeviolations.com): $49/mo to contractors for code-violation addresses by trade, 56+ cities; "
          "addresses only, owner contact 'coming later'; zero Minnesota cities (read 2026-09-28)")
    for sid in ("code_rental", "code_nuisance", "code_vacant", "code_fire_commercial")
}


def _shards(exports: Path, name: str) -> list[dict]:
    rows = []
    for f in sorted(glob.glob(str(exports / name / "*.json*"))):
        if f.endswith("_index.json"):
            continue
        op = gzip.open if f.endswith(".gz") else open
        with op(f, "rt") as fh:
            d = json.load(fh)
        rows += (d.get("rows") if isinstance(d, dict) else d) or []
    return rows


def _rows(exports: Path, name: str) -> list[dict]:
    p = exports / f"{name}.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text())
    return (d.get("rows") if isinstance(d, dict) else d) or d.get("permits", []) if isinstance(d, dict) else d


def count_events(root: Path, today: date) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    """Each signal's events in the trailing twelve months, with the parcel each sits on."""
    ex = root / "website" / "api" / "_data" / "exports"
    since = (today - timedelta(days=365)).isoformat()
    ev: dict[str, list[dict]] = defaultdict(list)

    # code enforcement: one event per case, dated by its first inspection in the window
    first: dict[str, dict] = {}
    for r in _shards(ex, "code-inspections"):
        d = str(r.get("completed") or r.get("scheduled") or "")[:10]
        if d < since:
            continue
        k = r.get("case_number")
        if k and (k not in first or d < first[k]["date"]):
            first[k] = {"date": d, "parcel": r.get("parcel_id"), "type": r.get("case_type"), "group": r.get("case_group")}
    for k, v in first.items():
        sig = {"HIS": "code_rental", "Nuisance": "code_nuisance", "VBR": "code_vacant"}.get(v["type"])
        if v["type"] == "FIS":
            sig = "code_rental" if v["group"] == "FISRENTAL" else "code_fire_commercial"
        if sig:
            ev[sig].append({"id": k, "date": v["date"], "parcel": v["parcel"]})

    for r in _shards(ex, "permits-residential"):
        d = str(r.get("issued") or "")[:10]
        if d < since:
            continue
        sig = "permit_res_building" if (r.get("trade") == "structural") else "permit_res_systems"
        if (r.get("kind") or "").startswith(("Wrecking", "Demolition")):
            sig = "teardown"
        ev[sig].append({"id": r.get("permit_no"), "date": d, "parcel": r.get("parcel_id")})

    pp = root / "website" / "api" / "_data" / "twincities_permits.json"
    permits = json.loads(pp.read_text()).get("permits", []) if pp.exists() else []
    for r in permits:
        d = str(r.get("issued") or "")[:10]
        if d < since:
            continue
        w = (r.get("work") or "") + " " + (r.get("kind") or "")
        if "Wrecking" in w or "Demolition" in w:
            ev["teardown"].append({"id": r.get("permit_no"), "date": d, "parcel": r.get("site")})
        elif "New" in w or "ComNoFd" in w or "Commercial" == (r.get("kind") or ""):
            ev["permit_com_build"].append({"id": r.get("permit_no"), "date": d, "parcel": r.get("site")})

    for r in _rows(ex, "sba-loans"):
        if str(r.get("approval_date") or "") >= since:
            ev["sba_loan"].append({"id": r.get("business"), "date": r["approval_date"], "parcel": None})
    for r in _rows(ex, "layoff-notices"):
        if str(r.get("notice_date") or "") >= since:
            ev["warn"].append({"id": r.get("employer"), "date": r["notice_date"], "parcel": None})
    for r in _rows(ex, "sales"):
        d = f"{r.get('sale_year')}-{str(r.get('sale_month') or 1).zfill(2)}-01"
        if d >= since[:8] + "01":
            ev["commercial_sale"].append({"id": f"{r.get('parcel_id')}:{d}", "date": d, "parcel": r.get("parcel_id")})
    for r in _shards(ex, "service-requests"):
        d = str(r.get("opened") or "")[:10]
        if d >= since and (r.get("subject") in ("Animal Related", "Solid Waste & Recycling")):
            ev["311_pests_waste"].append({"id": r.get("case_id"), "date": d, "parcel": None})

    # restaurant and food violations: one event per facility per trade bucket
    FOOD = [("food_manager_cert", r"food protection manager"), ("food_pests", r"\bpest|rodent|insect|droppings|roach|mice|mouse"),
            ("food_refrigeration", r"41 degrees|mechanical refrigeration|refrigerat|cold holding"), ("food_ventilation", r"exhaust|hood|duct|ventilat"),
            ("food_plumbing", r"plumbing|floor drain|backflow|grease|sewage|air gap"),
            ("food_equipment", r"equipment .*good repair|certified for sanitation|equipment must be in good repair|dish ?machine|160 degrees"),
            ("food_facility", r"physical facilit"),
            ("food_supplies", r"test kit|thermometer|post a sign|illness symptoms|hand soap|paper towel|sanitizer solution")]
    import re as _re
    fpages = sorted(glob.glob(str(root / "data" / "cache" / "licences" / "mpls_food_violations" / "page_*.json")))
    seen = set()
    for f in fpages:
        for x in json.loads(Path(f).read_text()).get("features", []):
            a = x.get("attributes", x)
            ms = a.get("DateOfInspection")
            if not ms:
                continue
            d = date.fromtimestamp(ms / 1000).isoformat()
            if d < since:
                continue
            text = (a.get("FoodCodeText") or "") + " " + (a.get("InspectorComments") or "")
            for sid, rx in FOOD:
                if _re.search(rx, text, _re.I):
                    k = (sid, a.get("HealthFacilityIDNumber"))
                    if k not in seen:
                        seen.add(k)
                        ev[sid].append({"id": a.get("HealthFacilityIDNumber"), "date": d, "parcel": a.get("APN"), "name": a.get("BusinessName"),
                                        "address": a.get("FullAddress"), "category": a.get("FacilityCategory")})
                    break

    # Saint Paul DSI complaints. The public layer stops at 2025-06-30, so the window
    # is the latest twelve months the feed holds, not the calendar - labelled stale.
    STP = {"Exterior": "stp_exterior", "Interior": "stp_exterior", "Certificate of Occupancy": "stp_certificate_occupancy",
           "Garbage Rubbish": "stp_nuisance", "Tall Grass": "stp_nuisance", "Snow Walk": "stp_nuisance", "Graffiti": "stp_nuisance", "Dumping": "stp_nuisance"}
    spages = sorted(glob.glob(str(root / "data" / "cache" / "stp_dsi" / "service_requests" / "*.json")))
    srows = []
    for f in spages:
        srows += [x.get("attributes", x) for x in json.loads(Path(f).read_text()).get("features", [])]
    if srows:
        latest = max(r["REQUEST_DATE"] for r in srows if r.get("REQUEST_DATE"))
        cut = latest - 365 * 86400 * 1000
        for r in srows:
            sid = STP.get(r.get("REQUEST_DESCRIPTION"))
            if sid and r.get("REQUEST_DATE") and r["REQUEST_DATE"] > cut and r.get("REQUEST_TYPE") == "Complaint":
                ev[sid].append({"id": r.get("SERVICE_NUMBER"), "date": date.fromtimestamp(r["REQUEST_DATE"] / 1000).isoformat(), "parcel": None,
                                "address": r.get("REGEX")})

    # owner contact: the landlord licence file carries the owner's email and phone by parcel
    contact = {}
    for r in _rows(ex, "landlords"):
        if r.get("parcel_id") and (r.get("owner_email") or r.get("owner_phone") or r.get("applicant_email")):
            contact[r["parcel_id"]] = {"email": r.get("owner_email") or r.get("applicant_email"), "phone": r.get("owner_phone") or r.get("applicant_phone"),
                                       "owner": r.get("owner"), "absentee": r.get("absentee")}
    # businesses: a phone or website Overture observes on the same parcel
    for r in _rows(ex, "businesses"):
        pid = r.get("site_parcel_id")
        if pid and (r.get("phone") or r.get("website")) and pid not in contact:
            contact[pid] = {"phone": r.get("phone"), "website": r.get("website"), "owner": r.get("name")}
    return ev, contact


def trade_firms(root: Path) -> dict[str, tuple[str, int]]:
    rows = _rows(root / "website" / "api" / "_data" / "exports", "trades")
    return {r["naics"]: (r["trade"], int(r.get("y2023") or 0)) for r in rows}


def score(root: Path, today: date | None = None) -> list[dict]:
    today = today or date.today()
    ev, contact = count_events(root, today)
    firms = trade_firms(root)
    out = []
    for sid, (label, trades, forced, vendors, verified) in SIGNALS.items():
        events = ev.get(sid, [])
        n = len(events)
        with_contact = sum(1 for e in events if e.get("parcel") and e["parcel"] in contact)
        share = with_contact / n if n else 0.0
        buyers = []
        for prefix, why in trades:
            match = [(k, v) for k, v in firms.items() if k.startswith(prefix)]
            best = max(match, key=lambda kv: (len(kv[0]) == 6, kv[1][1]), default=None)
            if best:
                buyers.append({"naics": best[0], "trade": best[1][0], "firms": best[1][1], "why": why})
        buyer_firms = sum(b["firms"] for b in buyers)
        urg = URGENCY[forced]
        s = (math.log10(1 + n) * math.log10(1 + buyer_firms) * urg * (1 + 4 * share) / (1 + len(vendors))) if n and buyer_firms else 0.0
        out.append({"id": sid, "label": label, "events_12m": n, "with_owner_contact": with_contact, "contact_share": round(share, 3),
                    "forced": forced, "urgency": urg, "buyer_firms": buyer_firms, "buyers": buyers,
                    "per_firm_per_year": round(n / buyer_firms, 1) if buyer_firms else None,
                    "known_vendors": [v[0] for v in vendors], "vendors_verified": verified, "paid_elsewhere": PROOF.get(sid), "score": round(s, 1)})
    out.sort(key=lambda r: -r["score"])
    return out


def report(rows: list[dict], today: date) -> str:
    L = [f"# Customer signals: which public event tells which trade about its next customer\n",
         f"Run {today.isoformat()}. Trailing twelve months. Every column is counted except known vendors and the trade mapping, which are typed and flagged.\n",
         "Score = log10(events) x log10(buyer firms) x urgency x (1 + 4 x contact share) / (1 + known vendors). Urgency: correction order with a deadline 5, trigger 3, already bought 1.\n",
         "| score | signal | events, 12 mo | with a phone, email or website | buyer firms (CBP) | events per buyer firm | urgency | known vendors |",
         "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['score']} | {r['label']} | {r['events_12m']:,} | {r['with_owner_contact']:,} ({r['contact_share']:.0%}) | {r['buyer_firms']:,} | {r['per_firm_per_year']} | {r['urgency']} | {(', '.join(r['known_vendors']) or ('none in this market' if r.get('paid_elsewhere') else 'none known (unverified)'))} |")
    L.append("\n## Proof someone already pays for it\n")
    for r in rows:
        if r.get("paid_elsewhere"):
            L.append(f"- **{r['label']}:** {r['paid_elsewhere']}")
    L.append("\n## Who buys each signal\n")
    for r in rows:
        L.append(f"- **{r['label']}:** " + "; ".join(f"{b['trade']} ({b['firms']:,} firms): {b['why']}" for b in r["buyers"]))
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    import sys
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get("BRICKS_ROOT", "~/Desktop/bricks")).expanduser()
    today = date.today()
    rows = score(root, today)
    md = report(rows, today)
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if out:
        out.write_text(md)
    print(md)
