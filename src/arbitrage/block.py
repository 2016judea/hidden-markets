"""On the block: pairs of a business that discards a material and a neighbour
that can use it, within walking distance.

The metro model (score.py) prices a stream at what a broker resells it for, so a
$0/lb stream is worth $0 at any volume. Here the value is what the taker stops
buying (market_price side = substitute), and distance is the margin: hauling is
what kills a free stream, and there is no hauling across the street.

Added 2026-09-30 off Aidan's example: a flower shop walking across the street
for the cafe's coffee grounds.
"""

from __future__ import annotations

import duckdb

RADIUS_M = 400            # about a five-minute walk; "on the block", not "in the metro"
BOX_LAT = 0.004           # bounding-box prefilter, ~445 m
BOX_LON = 0.006           # ~470 m at 45 N

HAVERSINE = """2 * 6371000 * asin(sqrt(power(sin(radians(b.lat - a.lat) / 2), 2)
                + cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians(b.lon - a.lon) / 2), 2)))"""


def proximity(distance_m: float) -> float:
    return 1.0 if distance_m <= 100 else 0.8 if distance_m <= 250 else 0.6


def material_urgency(con, mat: str) -> int:
    """The material's own clock, the same tiers score.derive_terms uses."""
    shelf = con.execute("SELECT shelf_life_days FROM material WHERE id = ?", [mat]).fetchone()
    shelf = shelf[0] if shelf else None
    urg = 1
    if shelf is not None:
        urg = 4 if shelf <= 3 else 3 if shelf <= 14 else 2 if shelf <= 90 else 1
    fee = con.execute("SELECT BOOL_OR(unit_cost_usd > 0) FROM sector_flow_template WHERE material_id = ? AND direction = 'out'", [mat]).fetchone()[0]
    return max(urg, 3) if fee else urg


def pair_all(con: duckdb.DuckDBPyConnection, radius_m: float = RADIUS_M) -> int:
    """Fill `pair` from every taker rule. Both sides come from the places listing
    (source bm_businesses) so a business counted twice from two registers does
    not make two pairs."""
    con.execute("DELETE FROM pair")
    n = 0
    for tid, mat, bfilt, price_id, absorb in con.execute(
            "SELECT id, material_id, side_b_filter, price_id, absorb_per_year FROM taker").fetchall():
        price, pbasis = (None, None)
        if price_id:
            r = con.execute("SELECT price_usd, basis FROM market_price WHERE id = ?", [price_id]).fetchone()
            if r:
                price, pbasis = r
        counts = con.execute("SELECT COALESCE(BOOL_AND(k.counts), FALSE) FROM basis_kind k WHERE k.id = ?", [pbasis]).fetchone()[0] if pbasis else False
        urg = material_urgency(con, mat)
        con.execute(f"""
            INSERT INTO pair
            SELECT ? || ':' || a.id || ':' || b.id, ?, ?, a.id, b.id, d.distance_m,
                   CASE WHEN d.distance_m <= 100 THEN 1.0 WHEN d.distance_m <= 250 THEN 0.8 ELSE 0.6 END,
                   LEAST(f.qty_per_year, COALESCE(?, f.qty_per_year)), f.unit, f.basis,
                   ?, ?,
                   CASE WHEN ? AND k.counts THEN LEAST(f.qty_per_year, COALESCE(?, f.qty_per_year)) * ? END,
                   ?,
                   COALESCE(CASE WHEN ? AND k.counts THEN LEAST(f.qty_per_year, COALESCE(?, f.qty_per_year)) * ? END, 0)
                     * CASE WHEN d.distance_m <= 100 THEN 1.0 WHEN d.distance_m <= 250 THEN 0.8 ELSE 0.6 END,
                   a.corridor, NULL
            FROM business_site a
            JOIN (SELECT business_id, SUM(qty_per_year) qty_per_year, MIN(unit) unit, MIN(basis) basis
                  FROM flow WHERE material_id = ? AND direction = 'out' GROUP BY business_id) f ON f.business_id = a.id
            JOIN basis_kind k ON k.id = f.basis
            JOIN business_site b ON b.id <> a.id AND b.dedupe_key <> a.dedupe_key AND ({bfilt})
                 AND b.lat BETWEEN a.lat - {BOX_LAT} AND a.lat + {BOX_LAT}
                 AND b.lon BETWEEN a.lon - {BOX_LON} AND a.lon + {BOX_LON}
            CROSS JOIN LATERAL (SELECT {HAVERSINE} AS distance_m) d
            WHERE a.source_id = 'bm_businesses' AND b.source_id = 'bm_businesses'
              AND a.lat IS NOT NULL AND b.lat IS NOT NULL AND d.distance_m <= ?
        """, [tid, tid, mat, absorb, price, pbasis, counts, absorb, price, urg, counts, absorb, price, mat, radius_m])
        n += con.execute("SELECT COUNT(*) FROM pair WHERE taker_id = ?", [tid]).fetchone()[0]
    return n


def _fmt_usd(x):
    return "unpriced" if x is None else f"${x:,.0f}"


def block_md(con, corridor: str | None = None, limit: int = 15) -> str:
    """The on-the-block section: every material's pairs, the corridors with the
    most of them, and the closest priced pairs. With a corridor, that corridor only."""
    q = lambda sql, *a: con.execute(sql, list(a)).fetchall()
    where, args = ("WHERE p.corridor = ?", [corridor]) if corridor else ("", [])
    L = []
    L.append(f"## On the block{': ' + corridor if corridor else ''}: who could walk it across the street\n")
    L.append(f"A pair is one business that discards a material and one neighbour that can use it, within {RADIUS_M} m. "
             "Value is what the taker stops buying (the substitute price), not what a broker resells it for; "
             "a pair is unpriced when the discarder's volume or the substitute price is a placeholder.\n")
    rows = q(f"""SELECT m.label, t.label, COUNT(*), COUNT(p.avoided_usd), SUM(p.avoided_usd), MIN(p.distance_m)
                 FROM pair p JOIN taker t ON t.id = p.taker_id JOIN material m ON m.id = p.material_id {where}
                 GROUP BY 1, 2 ORDER BY 3 DESC""", *args)
    L.append("| material | taker | pairs | priced | avoided $/yr, summed | closest |")
    L.append("|---|---|---|---|---|---|")
    for m, t, n, npr, usd, dmin in rows:
        L.append(f"| {m} | {t} | {n:,} | {npr:,} | {_fmt_usd(usd) if npr else 'unpriced'} | {dmin:,.0f} m |")
    if not corridor:
        L.append("\n### Corridors with the most pairs\n")
        L.append("| corridor | pairs | priced | avoided $/yr |")
        L.append("|---|---|---|---|")
        for c, n, npr, usd in q("""SELECT corridor, COUNT(*), COUNT(avoided_usd), SUM(avoided_usd) FROM pair
                                   WHERE corridor IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 12"""):
            L.append(f"| {c} | {n:,} | {npr:,} | {_fmt_usd(usd) if npr else 'unpriced'} |")
    L.append(f"\n### {'Every pair' if corridor else 'Closest priced pairs'}\n")
    L.append("| discards | takes | material | metres | lb/yr | avoided $/yr | urgency |")
    L.append("|---|---|---|---|---|---|---|")
    order = "ORDER BY p.distance_m" if corridor else "ORDER BY p.score DESC, p.distance_m"
    lim = "" if corridor else f"LIMIT {limit}"
    for a, ac, b, bc, m, d, qty, usd, urg in q(f"""
            SELECT a.name, a.city, b.name, b.city, m.label, p.distance_m, p.qty_per_year, p.avoided_usd, p.urgency
            FROM pair p JOIN business a ON a.id = p.a_business_id JOIN business b ON b.id = p.b_business_id
            JOIN material m ON m.id = p.material_id {where} {order} {lim}""", *args):
        L.append(f"| {a} ({ac}) | {b} ({bc}) | {m} | {d:,.0f} | {qty:,.0f} | {_fmt_usd(usd)} | {urg} |")
    return "\n".join(L)
