# Hidden-market arbitrage: the data model

Grounded 2026-09-28 in Aidan's post *Hidden-Market Arbitrage* (aidanjude.substack.com,
2026-09-07). The post's equation is the schema's spine:

    Opportunity = value asymmetry x obscurity x buyer urgency x access advantage / competition

Its six asymmetries, its five buyer questions, its inverted search ("brainstorm weird
buyers") and its gate ("obscurity without accessibility is trivia") each have a table or a
column. This is the **ideal** model: every column a perfect-world analysis wants, filled as
far as the warehouse allows and left visibly empty where it does not. The empty columns
are the gap list, not an omission.

Code: `src/bricks/arbitrage/schema.sql` (DDL), `vocabulary.py` (seeds with sources),
`load.py` (fills it from the shipped slices), `score.py` (equation + report),
`scripts/arbitrage.py` (CLI). Tests: `tests/test_arbitrage_model.py` off a fixture in
`tests/fixtures/arbitrage/`. The latest run: `docs/ARBITRAGE-msp-<date>.md`.

## The model in one picture

```
 layer 0  vocabulary      asymmetry_kind  buyer_question  basis_kind  source
                                 |               |
 layer 1  actors          business ---- site      buyer_class   counterparty   trade
                             |  \        |            |              |
                        owner_operator   |            |              |
                                         |            |              |
 layer 2  boundary        flow  <---- sector_flow_template          |
                          (in | out | obligation)      market_price  demand
                          obligation   event (the clock)   access_asset   evidence
                                         |
 layer 3  output          opportunity  ---- opportunity_member (the named side-A list)
```

## How the post maps onto the tables

| the post says | the model has |
|---|---|
| six kinds of asymmetry | `asymmetry_kind` (6 rows); `opportunity.asymmetry_id` |
| "What do they buy constantly?" | `flow` where `direction = 'in'` |
| "What is surprisingly expensive for them?" | `flow.annual_cost_usd` against the sector benchmark (`sector_flow_template`) |
| "What do they have trouble sourcing?" | `flow.lead_time_days`, `flow.sourcing_pain`, `demand.sourcing_pain` |
| "What do they throw away?" | `flow` where `direction = 'out'`; `material.kind = 'byproduct'` |
| "What annoying thing are they legally required to do?" | `obligation` + `flow` where `direction = 'obligation'` |
| Business A pays to be rid of it, Business B pays to get it | `market_price.side` in (`disposal`, `collection`, `purchase`) for one `material_id` |
| brainstorm weird buyers | `buyer_class`, `demand` |
| value asymmetry | computed: side A's annual quantity x (best buyer price + what A pays today) |
| obscurity, urgency, access advantage, competition | ordinal 0..5 on `opportunity`; competition also grounded in `counterparty.founded` and `.scale` |
| urgency is a clock | `event` (WARN, wrecking permit, vacancy filing, SBA approval, sale, inspection); `obligation.effective` / `.next_step` |
| access advantage | `access_asset`: what we hold that reaches a side first |
| obscurity without accessibility is trivia | `opportunity.accessibility`; `gated_out` when 0 |
| would I ever know this? | `obligation.obscurity`; `opportunity.obscurity` |

## Provenance rules

Every fact-bearing row has `source_id` (a row in `source`) and `basis`:

| basis | meaning | summed by the scorer? |
|---|---|---|
| measured | a record about this business (a licence, a permit, a loan) | yes |
| declared | the business or a counterparty said so (a price list, a quote) | yes |
| benchmark | a cited per-unit factor x the business's size | yes |
| inferred | a join or a rule | yes |
| illustrative | a placeholder with no citation | **no** |

An opportunity whose side A carries only illustrative flows reports *unpriced*. That is
the honest state of most waste-stream opportunities today, and the gap list says what
would replace each placeholder. `source.held = FALSE` rows are sources we know exist and
do not hold, with `how_to_get`.

## What filled it on 2026-09-28

| register | rows | what it gives the model |
|---|---|---|
| Overture businesses on commercial parcels | 88,433 | side A by sector and category, on a parcel |
| Hennepin hazardous-waste generators (new pull, `data/cache/gis/hennepin_hazwaste`) | 21,989 licences, 13,049 open | the county's own answer to "what do they throw away" and "what must they do", with SIC, size class, parcel id and last inspection |
| practice owners (NPPES x parcel) | 13,878 | health businesses on parcels they own, with the official's name |
| SBA 7(a) and 504 | 8,822 | borrowers with NAICS, lender, amount, jobs (the only measured headcount) |
| food and liquor licences | 6,553 | Minneapolis and Saint Paul licensees on parcels |
| commercial parcels on corridors | 44,151 | footprint, zoning, owner, 311 calls, permits |
| contamination, lead lines, vacancies, teardowns, sales, WARN | 7,149 / 99,833 / 246 / 562 / 34,302 / 133 | site facts and the clock |
| contractors | 6,635 | the counterparties who sell compliance (trade `systems` = refrigeration and mechanical) |
| trades | 318 | sector size, wages, workers per business |

130,625 business rows, 116,266 distinct on the parcel-plus-name key, 260,792 flows.

The Hennepin generator layer was the discovery of the session. It is public
(gis.hennepin.us, ENVIRONMENT/MapServer/0), carries a parcel id on every row, and no
other held register says which dentist, auto shop, printer or dry cleaner the county
licenses for hazardous waste. Ramsey publishes no equivalent.

## What the model needs to uncover more

In order of how much scored value it would move from *unpriced* to *measured*:

1. **The invoice side (questions 1 to 3).** Nothing public says what a business buys, at
   what price, how often, or what it cannot get. Three months of supplier invoices from a
   handful of businesses per sector would turn every `in` template from placeholder to
   benchmark. Route: ask; a distributor's branch would also know.
2. **Hauler contracts.** Container size, pickup frequency, monthly fee, and whether an
   organics cart exists. Route: the owner, or Minneapolis's licensed-hauler route lists.
3. **Collector prices, local and current.** What Sanimax (South Saint Paul), Darling and
   the used-oil collectors pay a Twin Cities shop this month. Route: three phone calls;
   quoted per pickup, never published.
4. **EPA e-Manifest by EPA ID.** The Hennepin layer carries every generator's EPA ID; the
   national manifest system says what each shipped, to whom, how much. Route: RCRAInfo
   public extract.
5. **Ramsey County generator licences.** The Saint Paul half of the hazwaste picture.
   Route: MGDPA request to Ramsey Environmental Health.
6. **Ordinance 13 compliance status.** Which large food-waste generators have organics
   service. Route: MGDPA request to Hennepin Environment and Energy.
7. **MCES industrial discharge and FOG records.** Grease interceptor pumping per site.
   Route: MGDPA request to MCES Industrial Waste.
8. **State benchmarking filings.** Gross floor area for every building over 50,000 sq ft,
   which six of seven counties do not publish. Route: MN Commerce disclosures.
9. **HFC leak repair reports.** From 2026 the rule requires reports on chronically leaking
   appliances. Route: FOIA after the first reporting year.
10. **Volume proxies.** Cups, covers, barrels, cars per day. Route: ask; or infer from review
    velocity and popular times, which the review corpus already holds for 193 places.

## Reading the first run

See `docs/ARBITRAGE-msp-2026-09-28.md`. The headline: on held data the equation ranks the
**regulatory** asymmetries first and the classic **waste-stream** ones last, because the
waste streams are old, brokered industries (Darling 1882, Sanimax 1939, Garfield 1892) while
the refrigerant, perc and hazardous-waste rules have dates inside three years, an
enumerated side A, and an enumerated side B in the permit register.

## Second run, same day: bias removed, four sources added

The first ranking was bias. Every unpriced row had a value term of 1.0, so the order was the
product of four ordinals typed into the seed file, and three rows about one material
(refrigerant) sat on top. Now:

- **urgency** is the nearest of four clocks: the rule's next date (a routine annual renewal
  caps at 2), the share of side A with a dated event within a year (30%+ reaches 4), the
  material spoiling (`material.shelf_life_days`: 3 days or less is 4, two weeks 3, a quarter 2),
  or a disposal fee side A pays (3). The last two were added 2026-09-30, after Aidan asked why
  coffee grounds ranked as trivia: with rule dates as the only real clock, anything the law
  will never force sat at 1 forever;
- **access** is the strongest asset recorded for the material, else the strongest general asset
  (the business listing, strength 4). Until 2026-09-30 the fallback was a typed 3, which handed
  every stream with its own register, all of them regulatory, a second bonus on top of its clock;
- **the work route no longer gates.** From the 9/28 third turn to 2026-09-30 a row survived
  only if `work_route.end_to_end` was true (we file, the owner authorizes), which zeroed 20 of 24
  rows, every waste stream among them. Aidan dropped it 2026-09-30: the intent is to surface the
  opportunity to the owner, manager or employee, not to do the work for them. The route is still
  recorded on the row and printed in the report;
- **competition** is derived from incumbents recorded for the material (named firms, the
  1,898 mechanical contractors in the permit register, the 161 hazardous-waste transporters
  and TSDFs in ECHO), held neutral at 3 when nobody has been enumerated, because absent
  evidence of incumbents is not evidence of none;
- **access** is the strongest held asset on the material, else neutral 3;
- **obscurity** is the one judgment left, and the report says so;
- the engine **generates** candidates from every sector-scoped rule and every discarded
  material, and **merges** any two whose side-A lists overlap 90% both ways;
- priced and unpriced opportunities are ranked apart.

New sources: EPA ECHO RCRA handlers for all seven counties (28,212; violations and
enforcement since 1980), MPCA What's In My Neighborhood (64,648 sites; fills dry cleaners and
dentists outside Hennepin), USDA AMS Minnesota yellow grease (54 c/lb, week of 2026-09-21)
and wet distillers grains ($55/ton). Blocked: benchmarking disclosures (bot walls), the AMS
price series (needs a free API key), suburban county licence layers (none public).

## On the block (2026-09-30)

Aidan's reframe: show owners, managers and employees the opportunities on their own block; his
example is a flower shop walking across the street for the cafe's coffee grounds. The metro model
above scores that stream at nothing, correctly for its question: it prices a material at what a
broker resells it for, and a stream nobody resells is $0 at any volume. Two terms were missing.

- **A substitute price.** `market_price.side = 'substitute'` is what a taker pays today for the
  input the material replaces, per unit of the material. Coffee grounds carry compost at $30 a
  cubic yard from Dakota Prairie Composting in Shakopee (about 3 cents a pound bulk; bagged is
  $9.50, about 24 cents). The metro value term now takes the best of purchase, collection and
  substitute, so the 946 coffee-serving businesses price at roughly $79k a year of compost their
  neighbours would otherwise buy.
- **Distance.** `taker` rows say which neighbours can use a material (`side_b_filter` on
  `business_site` alias `b`); `block.pair_all` joins every discarder with an `out` flow to every
  taker within 400 m (a five-minute walk), haversine on the places listing only so a business
  seen in two registers does not pair twice. `pair.avoided_usd` is the discarder's volume times
  the substitute price when both bases count, else NULL; `score` is that times a proximity term
  (1.0 within 100 m, 0.8 within 250 m, 0.6 to the radius). `scripts/arbitrage.py block
  --corridor "Hennepin Avenue"` prints one corridor; the run doc carries the metro summary.

Two rules were tightened on the first run. Sector `cafe` also holds ice-cream shops, smoothie
bars, bakeries and NAICS 722515 sports concessions, so the grounds template is now scoped to the
coffee and cafe categories (1,830 discarders became 946). Overture files mall gift shops
(Spencer's, BoxLunch) under `flowers_and_gifts_shop`, so that category counts as a florist only
with a floral name. Known remaining noise: `landscaping` includes design offices (HKGi,
coenpartners) that do not spread compost. Spent-grain pairs stay unpriced because the taproom
output template is a placeholder.

First run, 2026-09-30: 531 pairs, 360 discarders, 239 takers; Hennepin Avenue leads with 26
(Indulge & Bloom sits in the same building as True North Collaborative and within 40 m of
four more cafes). The per-pair number is small, about $82 a year of compost per cafe, which is
the honest size of the coffee-grounds example; the pair is worth more as an introduction than as
a material, and the model now at least knows the two are across the street.
