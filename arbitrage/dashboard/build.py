"""Rebuild the On the Block dashboard: export from data/arbitrage.duckdb, inline into block_page.html.
    python dashboard/build.py   ->  dashboard/on-the-block.html (publish that file as an artifact)
Published 2026-09-30 at https://claude.ai/artifact/VdYfaDhzPQgj57NG3ownYs
"""
import json, os, datetime, decimal, duckdb
from pathlib import Path
HERE = Path(__file__).resolve().parent
con = duckdb.connect(str(HERE.parent / "data" / "arbitrage.duckdb"), read_only=True)
def rows(sql):
    con.execute(sql); c=[d[0] for d in con.description]; return [dict(zip(c, r)) for r in con.fetchall()]
pairs = rows("""SELECT p.id, p.material_id AS material, t.label AS taker_kind, t.id AS taker_id,
    a.name AS a_name, a.category AS a_cat, a.city AS a_city, a.address AS a_addr, a.lat AS a_lat, a.lon AS a_lon, a.independent AS a_indep,
    b.name AS b_name, b.category AS b_cat, b.city AS b_city, b.address AS b_addr, b.lat AS b_lat, b.lon AS b_lon, b.independent AS b_indep,
    ROUND(p.distance_m) AS m, p.proximity, ROUND(p.qty_per_year) AS lb, p.qty_basis, p.price_usd, p.price_basis, ROUND(p.avoided_usd,2) AS usd, p.urgency, ROUND(p.score,2) AS score, p.corridor
    FROM pair p JOIN taker t ON t.id=p.taker_id JOIN business a ON a.id=p.a_business_id JOIN business b ON b.id=p.b_business_id ORDER BY p.distance_m""")
ops = rows("""SELECT o.id, o.label, m.label AS material, k.label AS asymmetry, o.origin, o.n_side_a, o.annual_value_usd, o.priced, o.obscurity, o.urgency_derived AS urgency, o.urgency_basis, o.access_derived AS access, o.access_basis, o.competition_derived AS competition, o.competition_basis, o.score, o.gated_out, o.also
    FROM opportunity o JOIN material m ON m.id=o.material_id JOIN asymmetry_kind k ON k.id=o.asymmetry_id WHERE o.merged_into IS NULL AND NOT o.gated_out ORDER BY o.score DESC""")
meta = dict(run=str(datetime.date.today()), radius_m=400, n_pairs=len(pairs),
            side_a_coffee=con.execute("SELECT n_side_a FROM opportunity WHERE id='gen_ws_coffee_grounds'").fetchone()[0])
def default(o):
    if isinstance(o, datetime.date): return o.isoformat()
    if isinstance(o, decimal.Decimal): return float(o)
    raise TypeError(type(o))
data = json.dumps(dict(meta=meta, pairs=pairs, opportunities=ops, takers=rows("SELECT * FROM taker"),
                       prices=rows("SELECT * FROM market_price WHERE material_id IN ('coffee_grounds','spent_grain')"),
                       materials=rows("SELECT * FROM material WHERE id IN ('coffee_grounds','spent_grain')")), default=default).replace("</script", "<\\/script")
(HERE / "block.json").write_text(data)
(HERE / "on-the-block.html").write_text((HERE / "block_page.html").read_text().replace("__DATA__", data))
print("wrote", HERE / "on-the-block.html")
