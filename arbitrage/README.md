# Hidden-market arbitrage

**Status: SHELVED 2026-09-30.** Aidan: "this wasn't as useful as I had hoped." Kept whole so it
can be picked up again; nothing here is deployed or scheduled.

The data model behind the Hidden-Market Arbitrage post (2026-09-07), loaded over everything
Brick & Mortar holds on Minneapolis–Saint Paul businesses, plus the block-level pairing that came
out of the last session (a florist walking across the street for the café's coffee grounds).

Moved out of `bricks` on 2026-09-30. Its history there: commits ff0b387c, 8f01fefe, 73203d17,
ce61ff5d (2026-09-28) and 19cf5285, 5d015ab3 (2026-09-30). `docs/ARBITRAGE-DATA-MODEL.md` is the
model's own account of itself and every bias found and fixed along the way.

## Layout

- `src/arbitrage/` — schema, seeded vocabulary (materials, prices, takers, obligations,
  opportunities), loader, scorer, `block.py` (walking-distance pairs), `signals.py`
  (the customer-signal feed: code cases and inspection violations).
- `scripts/arbitrage.py build | report | all | block --corridor "Hennepin Avenue"`.
- `tests/` — 21 tests on a small fixture. `pytest` from the repo root.
- `docs/` — the model doc and the three dated runs.
- `dashboard/` — the On the Block dashboard. `python dashboard/build.py` regenerates it from
  `data/arbitrage.duckdb`; the published copy is https://claude.ai/artifact/VdYfaDhzPQgj57NG3ownYs.
- `hazwaste/` — the never-merged `/hazwaste/` county licence-renewal tool from the bricks
  branch of the same name, as a patch, so it is not lost when that branch goes.

## Running it

The loader reads the shipped slices and caches from the bricks repo. Set `BRICKS_ROOT` if it is
not at `~/Desktop/bricks`.

```
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest -q
.venv/bin/python scripts/arbitrage.py all        # ~10 s; writes data/arbitrage.duckdb and docs/ARBITRAGE-msp-<today>.md
```

## What it found, in one paragraph

Regulatory clocks (the 2027 perc ban, HFC leak rules) rank first for a broker clearing the
metro; the century-old renderers and refiners already own every waste stream worth money; and
the block-level pairs are real but small, about $82 a year of compost per café. The pair is worth
more as an introduction between neighbours than as a material. The closed-system test
(2026-09-25) and the commercial tax-appeal screen (2026-09-24) are recorded in the bricks memory,
not here.
