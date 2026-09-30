"""The hidden-market arbitrage model builds off a small fixture, scores, and
keeps its own rules: every fact-bearing seed row names a source that exists,
placeholders are never summed, and a rule's reach is computed, never typed.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import duckdb
import pytest

from arbitrage import vocabulary as V
from arbitrage.load import build, norm_name, norm_token, sector_for
from arbitrage.score import report, score_all

FIXTURE = Path(__file__).parent / "fixtures" / "arbitrage"


@pytest.fixture(scope="module")
def model(tmp_path_factory):
    db = tmp_path_factory.mktemp("arb") / "arbitrage.duckdb"
    counts = build(db, FIXTURE)
    con = duckdb.connect(str(db))
    score_all(con, today=date(2026, 9, 28))
    yield con, counts
    con.close()


def test_every_seed_row_points_at_a_registered_source():
    ids = {s[0] for s in V.SOURCES}
    for name, rows, idx in [("TEMPLATES", V.TEMPLATES, 14), ("OBLIGATIONS", V.OBLIGATIONS, 17), ("PRICES", V.PRICES, 10),
                            ("DEMAND", V.DEMAND, 10), ("OPPORTUNITIES", V.OPPORTUNITIES, 17), ("COUNTERPARTIES", V.COUNTERPARTIES, 11)]:
        for r in rows:
            assert r[idx] in ids, f"{name} row {r[0]} names unknown source {r[idx]!r}"


def test_every_template_and_price_carries_a_known_basis():
    bases = {b[0] for b in V.BASIS_KINDS}
    assert all(t[15] in bases for t in V.TEMPLATES)
    assert all(p[11] in bases for p in V.PRICES)
    # a template with a made-up per-business quantity must say so
    assert V.BASIS_KINDS[[b[0] for b in V.BASIS_KINDS].index("illustrative")][1] is False


def test_fixture_loads_every_register(model):
    con, counts = model
    assert counts["business.overture"] == 6   # 4 + the florist and nursery added 2026-09-30 for the block pairs
    assert counts["business.hazwaste"] == 2          # the closed generator is dropped
    assert counts["business.licences"] == 1
    assert counts["business.sba"] == 1
    assert counts["site.hazwaste"] == 2
    # the licence on P4 and the Overture row on P4 collapse to one business
    n = con.execute("SELECT COUNT(DISTINCT dedupe_key) FROM business WHERE site_id = 'hennepin|P4'").fetchone()[0]
    assert n == 1


def test_hazwaste_lands_on_the_parcel_and_the_business(model):
    con, _ = model
    row = con.execute("SELECT hazwaste_licensed, hazwaste_size, hazwaste_sic, hazwaste_last_insp FROM site WHERE id = 'hennepin|P1'").fetchone()
    assert row == (True, "VSQG", 7216, date(2012, 5, 1))
    assert con.execute("SELECT sic, status FROM business WHERE id = 'hw:OP1'").fetchone() == (7216, "licensed:VSQG")


def test_warn_matches_on_the_whole_name_not_the_first_word(model):
    con, _ = model
    hit = con.execute("SELECT b.name FROM event e JOIN business b ON b.id = e.business_id WHERE e.kind = 'warn_notice'").fetchall()
    assert hit and "Corner Grill" in hit[0][0]
    assert norm_name("Rich Products Corporation") != norm_name("Rich's Auto Body Shop")
    assert norm_token("The Lake Street Cleaners") == "LAKE"


def test_sector_falls_back_to_category():
    assert sector_for("dry_cleaning", None) == "retail"
    assert sector_for("coffee_shop", None) == "cafe"
    assert sector_for("dentist", "health") == "health"
    assert sector_for("something_else", None) is None


def test_flows_follow_templates_and_periods(model):
    con, _ = model
    # cafe grounds: 7.5 lb/day x 365, benchmark basis
    qty, basis = con.execute("SELECT qty_per_year, basis FROM flow WHERE template_id = 't_cafe_grounds'").fetchone()
    assert qty == pytest.approx(7.5 * 365)
    assert basis == "benchmark"
    # every business gets the metro recycling obligation
    assert con.execute("SELECT COUNT(*) FROM flow WHERE template_id = 't_all_recycling'").fetchone()[0] == \
        con.execute("SELECT COUNT(*) FROM business").fetchone()[0]


def test_illustrative_flows_are_never_summed(model):
    con, _ = model
    # UCO is illustrative in the seed, so the restaurant opportunity carries no value
    val = con.execute("SELECT annual_value_usd FROM opportunity WHERE id = 'op_uco'").fetchone()[0]
    assert val is None
    # the dry cleaner is found through its SIC on the hazwaste register as well as its Overture category
    n = con.execute("SELECT n_side_a FROM opportunity WHERE id = 'op_pce'").fetchone()[0]
    assert n == 1


def test_scores_gate_on_accessibility_and_side_a(model):
    con, _ = model
    rows = con.execute("SELECT id, score, gated_out, n_side_a, accessibility FROM opportunity").fetchall()
    for oid, score, gated, n, access in rows:
        if access == 0 or (n or 0) == 0:
            assert gated and score == 0, oid
        else:
            assert not gated and score > 0, oid


def test_teardown_opportunity_counts_parcels_and_carries_the_clock(model):
    con, _ = model
    n = con.execute("SELECT n_side_a FROM opportunity WHERE id = 'op_teardown_recovery'").fetchone()[0]
    assert n == 1
    clock = con.execute("SELECT MIN(clock) FROM opportunity_member WHERE opportunity_id = 'op_teardown_recovery'").fetchone()[0]
    assert clock == date(2026, 9, 1)


def test_report_renders_and_names_the_gaps(model):
    con, _ = model
    md = report(con, today=date(2026, 9, 28))
    assert "## Opportunities without a dollar value yet" in md
    assert "What the model needs to uncover more" in md
    for src in V.SOURCES:
        if not src[8]:
            assert src[1] in md, f"unheld source {src[0]} missing from the gap list"


def test_urgency_and_competition_are_derived_not_typed(model):
    con, _ = model
    rows = con.execute("SELECT id, urgency, urgency_derived, urgency_basis, competition_derived, competition_basis FROM opportunity WHERE n_side_a > 0").fetchall()
    assert rows
    for oid, typed, urg, ub, comp, cb in rows:
        assert urg is not None and ub, oid
        assert comp is not None and cb, oid
    # the 2027-12-20 perc ban is ~15 months out on 2026-09-28: urgency 4, from the rule date
    urg, ub = con.execute("SELECT urgency_derived, urgency_basis FROM opportunity WHERE id = 'gen_o_pce_3rd'").fetchone()
    assert urg == 4 and "2027-12-20" in ub


def test_urgency_has_clocks_the_law_does_not_set(model):
    # 2026-09-30: with rule dates and events as the only clocks, coffee grounds
    # (spoils in 3 days) and spent grain (2 days) sat at urgency 1 forever
    con, _ = model
    from arbitrage.score import derive_terms
    for mat, days in (("coffee_grounds", 3), ("spent_grain", 2)):
        urg, ub, *_ = derive_terms(con, None, mat, None, n_members=10, n_clocked=0, today=date(2026, 9, 30))
        assert urg == 4 and f"spoils in {days} days" in ub, (mat, urg, ub)
    # a stream with no shelf life, no rule and no fee stays where it was
    urg, ub, *_ = derive_terms(con, None, "pallets", None, n_members=10, n_clocked=0, today=date(2026, 9, 30))
    assert urg == 1, (urg, ub)
    # a stream side A pays to be rid of (scrap tires carry a per-tire fee) is a bill every day
    urg, ub, *_ = derive_terms(con, None, "scrap_tires", None, n_members=10, n_clocked=0, today=date(2026, 9, 30))
    assert urg == 3 and "pays to be rid of it" in ub, (urg, ub)


def test_the_engine_generates_candidates_from_rules_and_flows(model):
    con, _ = model
    gen = {r[0] for r in con.execute("SELECT id FROM opportunity WHERE origin = 'generated'").fetchall()}
    assert "gen_o_pce_3rd" in gen and "gen_ws_coffee_grounds" in gen
    # an all-business rule is not a target
    assert "gen_o_115a151" not in gen


def test_near_identical_side_a_lists_merge_into_one_row(model):
    con, _ = model
    # the leak-repair and reclaimed-only rules reach the same restaurants: one population
    merged = con.execute("SELECT COUNT(*) FROM opportunity WHERE merged_into IS NOT NULL").fetchone()[0]
    assert merged >= 1
    live = con.execute("""SELECT COUNT(*) FROM opportunity WHERE merged_into IS NULL AND NOT gated_out
                          AND material_id IN ('leak_inspection','reclaimed_hfc','hfc_refrigerant')""").fetchone()[0]
    assert live <= 2


def test_the_work_route_is_recorded_but_does_not_gate(model):
    con, _ = model
    # 2026-09-30: the route says how the work gets done; it no longer decides whether
    # the opportunity is shown. Surfacing it to the owner is the product.
    sc, e2e, route = con.execute("SELECT score, end_to_end, route_id FROM opportunity WHERE id = 'op_coffee_grounds'").fetchone()
    assert sc > 0 and e2e is False and route
    # the route facts themselves still hold
    assert con.execute("SELECT end_to_end FROM work_route WHERE id = 'r_hw_metro'").fetchone()[0] is False
    assert con.execute("SELECT COUNT(*) FROM work_route WHERE channel = 'in_person' AND end_to_end").fetchone()[0] == 0


def test_a_dissolved_entity_that_is_still_trading_is_found(model):
    con, _ = model
    n, gated = con.execute("SELECT n_side_a, gated_out FROM opportunity WHERE id = 'op_sos_dissolved'").fetchone()
    assert n == 1 and not gated
    who = con.execute("SELECT b.name FROM opportunity_member m JOIN business b ON b.id = m.business_id WHERE m.opportunity_id = 'op_sos_dissolved'").fetchall()
    assert who == [("Corner Grill",)]
    # the active LLC that renewed in 2025 owes its 2026 renewal
    assert con.execute("SELECT n_side_a FROM opportunity WHERE id = 'op_sos_renewal_due'").fetchone()[0] == 1


def test_customer_signals_score_off_the_fixture():
    from arbitrage.signals import SIGNALS, report, score
    rows = score(FIXTURE, today=date(2026, 9, 28))
    assert {r["id"] for r in rows} == set(SIGNALS)
    # a signal with no events scores zero, never a typed figure
    assert all(r["score"] == 0 for r in rows if r["events_12m"] == 0)
    assert "Customer signals" in report(rows, date(2026, 9, 28))


def test_a_substitute_price_prices_a_stream_nobody_resells(model):
    # 2026-09-30: coffee grounds resell for $0, so the metro value was $0 at any volume.
    # The taker's own bill for compost is real, and now it counts.
    con, _ = model
    val, priced, vb = con.execute("SELECT annual_value_usd, priced, value_basis FROM opportunity WHERE id = 'gen_ws_coffee_grounds'").fetchone()
    assert priced and val > 0, (val, vb)
    assert con.execute("SELECT basis FROM market_price WHERE id = 'p_grounds_compost_sub'").fetchone()[0] == "declared"


def test_a_pair_is_a_discarder_and_a_taker_within_walking_distance(model):
    con, _ = model
    rows = con.execute("""SELECT a.name, b.name, p.distance_m, p.proximity, p.avoided_usd, p.urgency
                          FROM pair p JOIN business a ON a.id = p.a_business_id JOIN business b ON b.id = p.b_business_id
                          WHERE p.material_id = 'coffee_grounds' ORDER BY p.distance_m""").fetchall()
    # Bean There (44.9, -93.1) and Petal Pushers (44.9005, -93.1) are ~55 m apart
    assert rows and rows[0][:2] == ("Bean There", "Petal Pushers"), rows
    assert 40 < rows[0][2] < 70 and rows[0][3] == 1.0
    # 7.5 lb/day x 365 x $0.03 = ~$82/yr, priced because both bases count
    assert 70 < rows[0][4] < 100, rows[0]
    assert rows[0][5] == 4   # spoils in 3 days
    # Far Fields Nursery is ~2.2 km away: not on the block
    assert all(r[1] != "Far Fields Nursery" for r in rows)


def test_the_block_report_lists_pairs(model):
    from arbitrage.block import block_md
    con, _ = model
    md = block_md(con)
    assert "On the block" in md and "Bean There" in md and "Petal Pushers" in md
    assert "Far Fields" not in md
