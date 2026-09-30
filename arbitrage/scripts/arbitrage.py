#!/usr/bin/env python3
"""Build and score the hidden-market arbitrage model.

    .venv/bin/python scripts/arbitrage.py build            # data/arbitrage.duckdb from the shipped slices
    .venv/bin/python scripts/arbitrage.py report           # score + docs/ARBITRAGE-msp-<today>.md
    .venv/bin/python scripts/arbitrage.py all
    .venv/bin/python scripts/arbitrage.py block --corridor "Grand Avenue"   # every pair on one corridor

Reads the slices and caches from the bricks repo (~/Desktop/bricks, or $BRICKS_ROOT);
pass --root to point elsewhere. The model itself is written here under data/.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "src"))

from arbitrage.load import build  # noqa: E402
from arbitrage.score import run as score_run  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build", "report", "all", "block"])
    ap.add_argument("--corridor", default=None, help="block: one corridor (site.corridor) instead of the metro summary")
    ap.add_argument("--root", default=None, help="source root (default: this repo)")
    ap.add_argument("--db", default=None, help="model path (default: <root>/data/arbitrage.duckdb)")
    ap.add_argument("--out", default=None, help="report path (default: docs/ARBITRAGE-msp-<today>.md)")
    a = ap.parse_args()
    root = Path(a.root) if a.root else Path(os.environ.get("BRICKS_ROOT", "~/Desktop/bricks")).expanduser()
    db = Path(a.db) if a.db else HERE / "data" / "arbitrage.duckdb"
    if a.cmd in ("build", "all"):
        counts = build(db, root)
        for k, v in sorted(counts.items()):
            print(f"  {k:36s} {v:>10,}")
    if a.cmd in ("report", "all"):
        out = Path(a.out) if a.out else HERE / "docs" / f"ARBITRAGE-msp-{date.today().isoformat()}.md"
        score_run(db, out)
        print(f"wrote {out}")
    if a.cmd == "block":
        import duckdb
        from arbitrage.block import block_md
        con = duckdb.connect(str(db), read_only=True)
        try:
            print(block_md(con, corridor=a.corridor, limit=40))
        finally:
            con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
