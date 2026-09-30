# Hidden-market arbitrage over Minneapolis–Saint Paul businesses

Run 2026-09-30. Model: `src/bricks/arbitrage/schema.sql`; loader `load.py`; scorer `score.py`. Equation and terms are Aidan's post of 2026-09-07. Every figure below is read off the model; rows with basis `illustrative` are never summed and show up as *unpriced*.

## What the model holds

| table | source | basis | rows |
|---|---|---|---|
| business | bm_businesses | measured | 88,323 |
| business | echo_rcra | measured | 13,924 |
| business | bm_practice_owners | measured | 13,878 |
| business | hennepin_hazwaste | measured | 13,049 |
| business | bm_sba | measured | 8,822 |
| business | bm_licences | measured | 6,553 |
| business | mpca_wimn | measured | 2,908 |
| counterparty | bm_contractors | measured | 6,635 |
| counterparty | echo_rcra | measured | 159 |
| counterparty | web | declared | 9 |
| counterparty | dental_scrap | declared | 1 |
| event | bm_sba | measured | 8,822 |
| event | hennepin_hazwaste | measured | 5,866 |
| event | bm_contamination | measured | 5,587 |
| event | echo_rcra | measured | 5,395 |
| event | bm_teardowns | measured | 561 |
| event | bm_vacancies | measured | 220 |
| event | mn_sos | measured | 160 |
| event | bm_warn | inferred | 72 |
| event | bm_warn | measured | 61 |
| flow | mn_115a151 | benchmark | 147,457 |
| flow | web | illustrative | 51,397 |
| flow | epa_hfc_err | benchmark | 26,957 |
| flow | hennepin_hw_licence | benchmark | 13,349 |
| flow | hennepin_ord13 | illustrative | 11,673 |
| flow | uco_collect | illustrative | 9,543 |
| flow | mn_325e112 | illustrative | 8,735 |
| flow | mn_pfas | benchmark | 3,909 |
| flow | dental_scrap | benchmark | 3,143 |
| flow | epa_dental | benchmark | 3,143 |
| flow | coffee_grounds | benchmark | 957 |
| flow | epa_pce | benchmark | 418 |
| flow | spent_grain | illustrative | 144 |
| site | bm_corridors | measured | 33,009 |
| site | bm_businesses | inferred | 8,346 |
| site | bm_practice_owners | measured | 3,526 |
| site | hennepin_hazwaste | measured | 2,290 |
| site | bm_licences | inferred | 614 |
| site | bm_vacancies | measured | 121 |
| site | bm_teardowns | measured | 12 |

147,457 business rows collapse to **128,088 distinct businesses** on the site-and-name key.

## Side A by sector

| sector | businesses | on a hazwaste-licensed parcel | on an MPCA parcel | teardown or vacancy on parcel |
|---|---|---|---|---|
| (unmapped) | 62,394 | 16,188 | 10,759 | 1,135 |
| health | 24,195 | 5,716 | 3,500 | 369 |
| retail | 16,272 | 4,644 | 3,707 | 292 |
| restaurant | 8,947 | 1,689 | 1,879 | 214 |
| auto | 8,241 | 2,891 | 1,844 | 80 |
| salon | 3,786 | 782 | 504 | 41 |
| bar | 3,717 | 743 | 956 | 120 |
| gym | 2,032 | 448 | 355 | 30 |
| cafe | 1,821 | 379 | 438 | 39 |
| spa | 1,672 | 400 | 281 | 13 |
| lodging | 567 | 70 | 82 | 5 |

## Hennepin's licensed generators, by what the licence says they are

| SIC | what | licensed parcels |
|---|---|---|
| 0 | (no SIC) | 819 |
| 7538 | general auto repair | 426 |
| 8021 | dentists | 287 |
| 8011 | physicians | 211 |
| 5541 | gas stations | 174 |
| 2752 | commercial printing (litho) | 147 |
| 7532 | auto body | 140 |
| 7216 | dry cleaning | 138 |
| 3599 | machine shops | 136 |
| 1721 | painting contractors | 115 |
| 7699 | repair services | 113 |
| 7549 | auto services | 106 |
| 8041 | chiropractors | 99 |
| 5411 | grocery | 94 |
| 2759 | commercial printing (other) | 93 |

Generator size on the licence: VSQG 3,453, MIG 1,261, (blank) 1,228, SQG 546, LQG 135.

Of 6,623 licensed parcels, 757 carry no inspection date and 4,605 were last inspected before 2016. 41 dry-cleaner parcels also carry an MPCA record.

## The clocks: rules and who they reach

| rule | where | in force | next date | businesses reached (sector match, before the threshold test) | obscurity 0-5 | read off the rule text |
|---|---|---|---|---|---|---|
| Metro commercial recycling of three materials | metro | 2016-01-01 |  | 128,088 | 2 | yes |
| Hennepin Ordinance 13 food-waste recycling | Hennepin | 2020-01-01 |  | 10,682 | 2 | yes |
| Amalgam separator and one-time compliance report | federal | 2020-07-14 |  | 2,878 | 3 | no |
| PFAS in products reporting | Minnesota | 2026-09-15 | 2026-09-15 | 128,088 | 4 | yes |
| Annual renewal with the Secretary of State | Minnesota | 2026-01-01 | 2026-12-31 | 128,088 | 4 | yes |
| HFC leak repair and records at >= 15 lb charge | federal | 2026-01-01 | 2027-01-01 | 15,507 | 4 | yes |
| Hennepin hazardous waste generator licence | Hennepin | 2026-05-01 | 2027-05-01 | 51,900 | 2 | yes |
| Building energy benchmarking >= 50,000 sq ft | Minnesota | 2026-06-01 | 2027-06-01 | 128,088 | 3 | yes |
| No PCE in newly acquired dry-cleaning machines | federal | 2025-06-16 | 2027-12-20 | 373 | 4 | yes |
| PCE prohibited in third-generation machines | federal | 2027-12-20 | 2027-12-20 | 373 | 4 | yes |
| Reclaimed-only HFC for servicing ice makers and supermarket systems | federal | 2029-01-01 | 2029-01-01 | 15,507 | 5 | yes |
| Packaging producer responsibility | Minnesota | 2025-07-01 | 2029-01-01 | 128,088 | 4 | yes |
| PFAS banned in 11 product categories | Minnesota | 2025-01-01 | 2032-01-01 | 30,404 | 3 | yes |
| PCE prohibited in all dry cleaning | federal | 2034-12-19 | 2034-12-19 | 373 | 4 | yes |
| Used motor oil acceptance without fee | Minnesota |  |  | 8,241 | 3 | yes |

The reach column is the sector, not the threshold: Ordinance 13 reaches every Hennepin restaurant by sector and binds only those over a ton of trash a week, which no held record measures.

## Opportunities with a counted dollar value

Urgency, access and competition are derived (bases below); obscurity is the one judgment left, from the rule or the seed.

| score | opportunity | asymmetry | origin | side A | annual value | obscurity / urgency / access / competition |
|---|---|---|---|---|---|---|
| 20.2 | Spent coffee grounds: who discards it, who pays for it *(also: Cafes bagging grounds for whoever asks)* | Waste-stream | generated | 946 | $78,594 | 2 / 4 / 4 / 3 |
| 6.4 | Dental offices leaving refining returns on the bench *(also: Amalgam separator and one-time compliance report; Dental scrap metal (crowns, bridges, PFM): who discards it, who pays for it)* | Knowledge | hypothesis | 3,156 | $9.4M | 2 / 1 / 4 / 5 |

## Opportunities without a dollar value yet

Same equation with the value term held at 1.0. These rank what to price next, not what to do.

| score | opportunity | asymmetry | origin | side A | annual value | obscurity / urgency / access / competition |
|---|---|---|---|---|---|---|
| 21.3 | PCE prohibited in third-generation machines *(also: Perc dry cleaners facing the 2027 and 2034 bans; No PCE in newly acquired dry-cleaning machines; PCE prohibited in all dry cleaning)* | Regulatory | generated | 373 | unpriced | 4 / 4 / 4 / 3 |
| 20.0 | Active entities with no renewal filed yet this year | Regulatory | hypothesis | 88 | unpriced | 3 / 5 / 4 / 3 |
| 16.0 | Walk-in and rack owners who must now inspect and log leaks *(also: Ice-maker and supermarket-rack owners facing reclaimed-only servicing; HFC leak repair and records at >= 15 lb charge; Reclaimed-only HFC for servicing ice makers and supermarket systems)* | Regulatory | hypothesis | 15,535 | unpriced | 4 / 5 / 4 / 5 |
| 16.0 | Pre- and post-consumer food waste: who discards it, who pays for it *(also: Hennepin Ordinance 13 food-waste recycling)* | Waste-stream | generated | 10,682 | unpriced | 2 / 4 / 4 / 2 |
| 16.0 | Restaurants whose takeout packaging may make them producers | Regulatory | hypothesis | 10,649 | unpriced | 4 / 3 / 4 / 3 |
| 12.0 | Commercial teardowns and closures as refrigerant and equipment recovery events | Regulatory | hypothesis | 159 parcels | unpriced | 5 / 3 / 4 / 5 |
| 10.7 | Buildings over 50,000 sq ft whose gross area is now a public filing | Knowledge | hypothesis | 4,037 parcels | unpriced | 4 / 2 / 4 / 3 |
| 10.7 | Taprooms with no farmer for their grain *(also: Brewer's spent grain (wet): who discards it, who pays for it)* | Waste-stream | hypothesis | 142 | unpriced | 2 / 4 / 4 / 3 |
| 8.0 | Grease-trap (brown) grease: who discards it, who pays for it *(also: Restaurants giving away or paying to lose fryer oil that renderers buy at Gulf benchmark; Old corrugated cardboard, loose: who discards it, who pays for it; Used cooking oil (yellow grease): who discards it, who pays for it)* | Waste-stream | generated | 8,947 | unpriced | 2 / 3 / 4 / 3 |
| 8.0 | Scrap tires: who discards it, who pays for it *(also: Auto shops with four sellable waste streams and one hazwaste licence; Used motor oil acceptance without fee; Used motor oil: who discards it, who pays for it; Lead-acid battery cores: who discards it, who pays for it; Scrap catalytic converters: who discards it, who pays for it)* | Waste-stream | generated | 8,241 | unpriced | 2 / 3 / 4 / 3 |
| 7.5 | Very small generators paying full-service haulers for county-collectable waste | Scale | hypothesis | 15,870 | unpriced | 3 / 2 / 5 / 4 |
| 7.5 | Hazardous-waste handlers with a violation since 2021 | Regulatory | hypothesis | 136 | unpriced | 3 / 2 / 5 / 4 |
| 5.0 | Hennepin hazardous waste generator licence | Regulatory | generated | 51,900 | unpriced | 2 / 2 / 5 / 4 |
| 4.0 | PFAS banned in 11 product categories | Regulatory | generated | 30,404 | unpriced | 3 / 1 / 4 / 3 |
| 4.0 | Salons and spas that must have switched cosmetics and cleaning products | Regulatory | hypothesis | 5,449 | unpriced | 3 / 1 / 4 / 3 |
| 2.7 | Large food-waste generators without organics service | Regulatory | hypothesis | 6,306 | unpriced | 2 / 1 / 4 / 3 |
| 2.7 | Salon aluminium foil and colour tubes: who discards it, who pays for it | Waste-stream | generated | 3,786 | unpriced | 2 / 1 / 4 / 3 |
| 2.7 | Aluminium printing plates: who discards it, who pays for it | Waste-stream | generated | 990 | unpriced | 2 / 1 / 4 / 3 |
| 2.7 | Hotel linens and towels, retired: who discards it, who pays for it | Waste-stream | generated | 567 | unpriced | 2 / 1 / 4 / 3 |

Score = value term x obscurity x urgency x access / competition. Value term: $10k = 1, $1M = 3, $100M = 5; 1.0 when unpriced.

### How each derived term was set

- **Spent coffee grounds: who discards it, who pays for it.** urgency 4: spoils in 3 days: side A must move it every day. competition 3: 0 counted incumbents [Mushroom growers (count unknown)]; incumbents not enumerated, held neutral at 3. value: best buyer or substitute price x volume.
- **Dental offices leaving refining returns on the bench.** urgency 1: no dated rule and no dated events on side A. competition 5: 1 counted incumbents [Precious-metal refiners (count unknown)]; incumbents not enumerated, held neutral at 3; oldest founded 1892; a national player. value: CEILING: $3,000/yr x every office; the share already selling is unknown.
- **PCE prohibited in third-generation machines.** urgency 4: rule date 2027-12-20 is 446 days out. competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: compliance price x businesses reached.
- **Active entities with no renewal filed yet this year.** urgency 5: rule date 2026-12-31 is 92 days out. competition 3: 3 counted incumbents; a national player. value: unpriced: the renewal is free; the service is not missing it.
- **Walk-in and rack owners who must now inspect and log leaks.** urgency 5: rule date 2027-01-01 is 93 days out. competition 5: 1,898 counted incumbents [Refrigeration and mechanical contractors (1898)]. value: compliance service price x businesses.
- **Pre- and post-consumer food waste: who discards it, who pays for it.** urgency 4: spoils in 3 days: side A must move it every day. competition 2: 1 counted incumbents. value: best buyer or substitute price x volume.
- **Restaurants whose takeout packaging may make them producers.** urgency 3: rule date 2029-01-01 is 824 days out. competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: unpriced until the producer definition is settled.
- **Commercial teardowns and closures as refrigerant and equipment recovery events.** urgency 3: rule date 2029-01-01 is 824 days out. competition 5: 1,898 counted incumbents [Refrigeration and mechanical contractors (1898); EPA-certified refrigerant reclaimers (count unknown)]. value: unpriced.
- **Buildings over 50,000 sq ft whose gross area is now a public filing.** urgency 2: recurring annual deadline (2027-06-01). competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: unpriced: the filing carries the number six counties do not publish.
- **Taprooms with no farmer for their grain.** urgency 4: spoils in 2 days: side A must move it every day. competition 3: 0 counted incumbents [Cattle and hog farms within a delivery radius (count unknown)]; incumbents not enumerated, held neutral at 3. value: $40/wet ton x barrels.
- **Grease-trap (brown) grease: who discards it, who pays for it.** urgency 3: side A pays to be rid of it: every day of delay is a bill. competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: best buyer or substitute price x volume.
- **Scrap tires: who discards it, who pays for it.** urgency 3: side A pays to be rid of it: every day of delay is a bill. competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: best buyer or substitute price x volume.
- **Very small generators paying full-service haulers for county-collectable waste.** urgency 2: recurring annual deadline (2027-05-01). competition 4: 159 counted incumbents. value: unpriced: hauler fee vs county VSQG programme.
- **Hazardous-waste handlers with a violation since 2021.** urgency 2: recurring annual deadline (2027-05-01). competition 4: 159 counted incumbents. value: unpriced: return-to-compliance work per cited violation.
- **Hennepin hazardous waste generator licence.** urgency 2: recurring annual deadline (2027-05-01). competition 4: 159 counted incumbents. value: compliance price x businesses reached.
- **PFAS banned in 11 product categories.** urgency 1: rule date 2032-01-01 is 1919 days out. competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: compliance price x businesses reached.
- **Salons and spas that must have switched cosmetics and cleaning products.** urgency 1: rule date 2032-01-01 is 1919 days out. competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: unpriced: product switch.
- **Large food-waste generators without organics service.** urgency 1: rule in force, no future date. competition 3: 0 counted incumbents [Organics haulers and compost sites (count unknown)]; incumbents not enumerated, held neutral at 3. value: service price x non-compliant businesses.
- **Salon aluminium foil and colour tubes: who discards it, who pays for it.** urgency 1: no dated rule and no dated events on side A. competition 3: 1 counted incumbents; a national player. value: best buyer or substitute price x volume.
- **Aluminium printing plates: who discards it, who pays for it.** urgency 1: no dated rule and no dated events on side A. competition 3: 0 counted incumbents [Scrap metal yards (count unknown)]; incumbents not enumerated, held neutral at 3. value: best buyer or substitute price x volume.
- **Hotel linens and towels, retired: who discards it, who pays for it.** urgency 1: no dated rule and no dated events on side A. competition 3: 0 counted incumbents; incumbents not enumerated, held neutral at 3. value: best buyer or substitute price x volume.

### Merged as one population (>= 90% the same businesses)

| merged | into |
|---|---|
| Amalgam separator and one-time compliance report | Dental offices leaving refining returns on the bench |
| Dental scrap metal (crowns, bridges, PFM): who discards it, who pays for it | Dental offices leaving refining returns on the bench |
| Restaurants giving away or paying to lose fryer oil that renderers buy at Gulf benchmark | Grease-trap (brown) grease: who discards it, who pays for it |
| Old corrugated cardboard, loose: who discards it, who pays for it | Grease-trap (brown) grease: who discards it, who pays for it |
| Used cooking oil (yellow grease): who discards it, who pays for it | Grease-trap (brown) grease: who discards it, who pays for it |
| Perc dry cleaners facing the 2027 and 2034 bans | PCE prohibited in third-generation machines |
| No PCE in newly acquired dry-cleaning machines | PCE prohibited in third-generation machines |
| PCE prohibited in all dry cleaning | PCE prohibited in third-generation machines |
| Hennepin Ordinance 13 food-waste recycling | Pre- and post-consumer food waste: who discards it, who pays for it |
| Auto shops with four sellable waste streams and one hazwaste licence | Scrap tires: who discards it, who pays for it |
| Used motor oil acceptance without fee | Scrap tires: who discards it, who pays for it |
| Used motor oil: who discards it, who pays for it | Scrap tires: who discards it, who pays for it |
| Lead-acid battery cores: who discards it, who pays for it | Scrap tires: who discards it, who pays for it |
| Scrap catalytic converters: who discards it, who pays for it | Scrap tires: who discards it, who pays for it |
| Cafes bagging grounds for whoever asks | Spent coffee grounds: who discards it, who pays for it |
| Brewer's spent grain (wet): who discards it, who pays for it | Taprooms with no farmer for their grain |
| Ice-maker and supermarket-rack owners facing reclaimed-only servicing | Walk-in and rack owners who must now inspect and log leaks |
| HFC leak repair and records at >= 15 lb charge | Walk-in and rack owners who must now inspect and log leaks |
| Reclaimed-only HFC for servicing ice makers and supermarket systems | Walk-in and rack owners who must now inspect and log leaks |

### Gated out: nobody on side A, or no way to reach them

The gate (Aidan, 2026-09-28): only work a preparer can file entirely, where the owner's one act is to authorize. An owner who must log in, forward a link, receive mail, hand over documents or be there in person is a job we cannot finish.

| opportunity | side A | how it gets done | what the owner must do |
|---|---|---|---|
| Day-old bread and pastry: who discards it, who pays for it | 0 | Pickup and sale of day old bread | appear |
| Operating businesses whose LLC or corporation the state has dissolved | 0 | SOS reinstatement of a dissolved entity, online from the preparer's account | authorize |
| Businesses trading under an assumed name the state has cancelled | 0 | Assumed name renewal or refiling, online from the preparer's account | authorize |

### Filing routes

| route | channel | who may file | owner must | end to end | source |
|---|---|---|---|---|---|
| Assumed name renewal or refiling, online from the preparer's account | preparer_account | preparer_with_authorization | authorize | yes | mn_sos_renewal |
| Measured building area from benchmarking filings | public_portal | anyone | none | yes | mn_benchmarking |
| SOS annual renewal, filed online from the preparer's own account | preparer_account | preparer_with_authorization | authorize | yes | mn_sos_renewal |
| SOS reinstatement of a dissolved entity, online from the preparer's account | preparer_account | preparer_with_authorization | authorize | yes | mn_sos_renewal |
| County hazardous waste licence renewal (all seven metro counties) | owner_portal | unknown | login | no | hazwaste_forms |
| Dental amalgam one-time compliance report | mail | unknown | documents | no | epa_dental |
| Energy benchmarking in Portfolio Manager | owner_portal | preparer_with_authorization | documents | no | stp_benchmarking |
| Organics collection service | in_person | unknown | appear | no | hennepin_ord13 |
| PFAS in products report | owner_portal | unknown | login | no | mn_pfas |
| Packaging producer registration via a PRO | owner_portal | unknown | documents | no | mn_epr |
| Perc machine retirement | in_person | owner_only | appear | no | epa_pce |
| Perc machine retirement and replacement | in_person | owner_only | appear | no | epa_pce |
| Pickup and sale of cardboard | in_person | unknown | appear | no | web |
| Pickup and sale of catalytic converters | in_person | unknown | appear | no | web |
| Pickup and sale of coffee grounds | in_person | unknown | appear | no | web |
| Pickup and sale of day old bread | in_person | unknown | appear | no | web |
| Pickup and sale of dental scrap | in_person | unknown | appear | no | web |
| Pickup and sale of food waste | in_person | unknown | appear | no | web |
| Pickup and sale of lead acid batteries | in_person | unknown | appear | no | web |
| Pickup and sale of linens | in_person | unknown | appear | no | web |
| Pickup and sale of printing plates | in_person | unknown | appear | no | web |
| Pickup and sale of recycling service | in_person | unknown | appear | no | web |
| Pickup and sale of salon foil | in_person | unknown | appear | no | web |
| Pickup and sale of scrap tires | in_person | unknown | appear | no | web |
| Pickup and sale of spent grain | in_person | unknown | appear | no | web |
| Pickup and sale of trap grease | in_person | unknown | appear | no | web |
| Pickup and sale of uco | in_person | unknown | appear | no | web |
| Pickup and sale of used oil | in_person | unknown | appear | no | web |
| Refrigerant leak inspection, repair and records | in_person | unknown | appear | no | epa_hfc_err |
| Refrigerant recovery at decommissioning | in_person | unknown | appear | no | epa_hfc_err |
| Servicing with reclaimed refrigerant | in_person | unknown | appear | no | epa_hfc_err |
| Switching to PFAS-free products | in_person | owner_only | appear | no | mn_pfas |
| Unclaimed property claim for a business | public_portal | preparer_with_authorization | documents | no | mn_unclaimed |

## On the block: who could walk it across the street

A pair is one business that discards a material and one neighbour that can use it, within 400 m. Value is what the taker stops buying (the substitute price), not what a broker resells it for; a pair is unpriced when the discarder's volume or the substitute price is a placeholder.

| material | taker | pairs | priced | avoided $/yr, summed | closest |
|---|---|---|---|---|---|
| Spent coffee grounds | Florists and flower shops | 268 | 268 | $22,010 | 0 m |
| Spent coffee grounds | Garden centres, nurseries and landscapers | 188 | 188 | $15,440 | 10 m |
| Brewer's spent grain (wet) | Bakeries | 67 | 0 | unpriced | 19 m |
| Brewer's spent grain (wet) | Urban farms and farmers markets | 8 | 0 | unpriced | 48 m |

### Corridors with the most pairs

| corridor | pairs | priced | avoided $/yr |
|---|---|---|---|
| Hennepin Avenue | 26 | 26 | $2,135 |
| 6th Street South | 16 | 16 | $1,314 |
| 7th Street South | 12 | 12 | $986 |
| Tyler Street Northeast | 10 | 4 | $328 |
| Traffic Street Northeast | 10 | 10 | $821 |
| France Avenue South | 9 | 9 | $739 |
| Central Avenue Northeast | 8 | 7 | $575 |
| 8th Street South | 8 | 8 | $657 |
| 4th Street | 8 | 6 | $493 |
| County Road B2 West | 8 | 2 | $164 |
| Lake Street East | 7 | 6 | $493 |
| 3rd Avenue South | 7 | 7 | $575 |

### Closest priced pairs

| discards | takes | material | metres | lb/yr | avoided $/yr | urgency |
|---|---|---|---|---|---|---|
| True North Collaborative (Minneapolis) | Indulge & Bloom (Minneapolis) | Spent coffee grounds | 0 | 2,738 | $82 | 4 |
| Local Roots (Richfield) | Richfield Floral & Gardens, Inc. (Richfield) | Spent coffee grounds | 1 | 2,738 | $82 | 4 |
| Black Bean Coffee (Minneapolis) | Chicago Lake Florist (Minneapolis) | Spent coffee grounds | 6 | 2,738 | $82 | 4 |
| Caribou Coffee (Minneapolis) | Indulge & Bloom (Minneapolis) | Spent coffee grounds | 7 | 2,738 | $82 | 4 |
| Oakwood Cafe (Anoka) | Main Floral (Anoka) | Spent coffee grounds | 9 | 2,738 | $82 | 4 |
| Caribou Coffee (Plymouth) | Lawn Care Express (Plymouth) | Spent coffee grounds | 10 | 2,738 | $82 | 4 |
| Caribou Coffee (West St Paul) | Anytime Flowers (Saint Paul) | Spent coffee grounds | 11 | 2,738 | $82 | 4 |
| Jensen's Cafe (Burnsville) | Renaissance Floral (Burnsville) | Spent coffee grounds | 12 | 2,738 | $82 | 4 |
| Starbucks (Stillwater) | Grand Garage Florist (Stillwater) | Spent coffee grounds | 12 | 2,738 | $82 | 4 |
| Cafe Patteen (Minneapolis) | Lindskoog Florist (Minneapolis) | Spent coffee grounds | 13 | 2,738 | $82 | 4 |
| Diamonds Coffee Shoppe (Minneapolis) | Studio C Floral (Minneapolis) | Spent coffee grounds | 16 | 2,738 | $82 | 4 |
| Daily Dose Cafe & Espresso (Brooklyn Park) | Creative Blooms (Brooklyn Park) | Spent coffee grounds | 17 | 2,738 | $82 | 4 |
| Elephant Joe's Coffee (Watertown) | Watertown Floral & Gift Co. (Watertown) | Spent coffee grounds | 17 | 2,738 | $82 | 4 |
| Caribou Coffee (Eagan) | Plant Place (Eagan) | Spent coffee grounds | 18 | 2,738 | $82 | 4 |
| Northern Coffeeworks (Minneapolis) | Quality Lawn Sprinklers (Minneapolis) | Spent coffee grounds | 18 | 2,738 | $82 | 4 |


## Who is on each list, by register

The same shop can appear in Overture, on a county hazwaste licence, in the SBA file and in NPPES; the dedupe key only merges them on a shared parcel, so a list drawn from several registers is an upper bound.

| opportunity | register | distinct |
|---|---|---|
| Active entities with no renewal filed yet this year | bm_businesses | 88 |
| Aluminium printing plates: who discards it, who pays for it | hennepin_hazwaste | 460 |
| Aluminium printing plates: who discards it, who pays for it | bm_businesses | 386 |
| Aluminium printing plates: who discards it, who pays for it | bm_sba | 63 |
| Aluminium printing plates: who discards it, who pays for it | echo_rcra | 54 |
| Aluminium printing plates: who discards it, who pays for it | mpca_wimn | 39 |
| Buildings over 50,000 sq ft whose gross area is now a public filing | bm_businesses | 23,017 |
| Buildings over 50,000 sq ft whose gross area is now a public filing | hennepin_hazwaste | 2,891 |
| Buildings over 50,000 sq ft whose gross area is now a public filing | bm_practice_owners | 2,249 |
| Buildings over 50,000 sq ft whose gross area is now a public filing | bm_licences | 793 |
| Commercial teardowns and closures as refrigerant and equipment recovery events | bm_businesses | 301 |
| Commercial teardowns and closures as refrigerant and equipment recovery events | bm_licences | 111 |
| Commercial teardowns and closures as refrigerant and equipment recovery events | hennepin_hazwaste | 2 |
| Dental offices leaving refining returns on the bench | bm_businesses | 1,411 |
| Dental offices leaving refining returns on the bench | hennepin_hazwaste | 618 |
| Dental offices leaving refining returns on the bench | bm_practice_owners | 586 |
| Dental offices leaving refining returns on the bench | bm_sba | 339 |
| Dental offices leaving refining returns on the bench | mpca_wimn | 196 |
| Dental offices leaving refining returns on the bench | echo_rcra | 168 |
| Dental offices leaving refining returns on the bench | bm_licences | 24 |
| Grease-trap (brown) grease: who discards it, who pays for it | bm_businesses | 6,547 |
| Grease-trap (brown) grease: who discards it, who pays for it | bm_licences | 2,126 |
| Grease-trap (brown) grease: who discards it, who pays for it | bm_sba | 579 |
| Grease-trap (brown) grease: who discards it, who pays for it | mpca_wimn | 3 |
| Grease-trap (brown) grease: who discards it, who pays for it | echo_rcra | 2 |
| Grease-trap (brown) grease: who discards it, who pays for it | hennepin_hazwaste | 1 |
| Hazardous-waste handlers with a violation since 2021 | echo_rcra | 118 |
| Hazardous-waste handlers with a violation since 2021 | hennepin_hazwaste | 18 |
| Hennepin hazardous waste generator licence | bm_businesses | 33,449 |
| Hennepin hazardous waste generator licence | bm_practice_owners | 12,630 |
| Hennepin hazardous waste generator licence | hennepin_hazwaste | 4,471 |
| Hennepin hazardous waste generator licence | bm_sba | 1,919 |
| Hennepin hazardous waste generator licence | echo_rcra | 739 |
| Hennepin hazardous waste generator licence | mpca_wimn | 698 |
| Hennepin hazardous waste generator licence | bm_licences | 610 |
| Hotel linens and towels, retired: who discards it, who pays for it | bm_businesses | 481 |
| Hotel linens and towels, retired: who discards it, who pays for it | bm_sba | 61 |
| Hotel linens and towels, retired: who discards it, who pays for it | hennepin_hazwaste | 15 |
| Hotel linens and towels, retired: who discards it, who pays for it | mpca_wimn | 9 |
| Hotel linens and towels, retired: who discards it, who pays for it | echo_rcra | 2 |
| Large food-waste generators without organics service | bm_businesses | 3,764 |
| Large food-waste generators without organics service | bm_licences | 2,461 |
| Large food-waste generators without organics service | bm_sba | 315 |
| Large food-waste generators without organics service | hennepin_hazwaste | 158 |
| Large food-waste generators without organics service | mpca_wimn | 8 |
| Large food-waste generators without organics service | echo_rcra | 2 |
| PCE prohibited in third-generation machines | hennepin_hazwaste | 205 |
| PCE prohibited in third-generation machines | bm_businesses | 144 |
| PCE prohibited in third-generation machines | mpca_wimn | 28 |
| PCE prohibited in third-generation machines | echo_rcra | 2 |
| PFAS banned in 11 product categories | bm_businesses | 25,198 |
| PFAS banned in 11 product categories | bm_licences | 2,596 |
| PFAS banned in 11 product categories | bm_sba | 1,707 |
| PFAS banned in 11 product categories | hennepin_hazwaste | 1,004 |
| PFAS banned in 11 product categories | echo_rcra | 262 |
| PFAS banned in 11 product categories | mpca_wimn | 199 |
| Pre- and post-consumer food waste: who discards it, who pays for it | bm_businesses | 7,734 |
| Pre- and post-consumer food waste: who discards it, who pays for it | bm_licences | 2,465 |
| Pre- and post-consumer food waste: who discards it, who pays for it | bm_sba | 691 |
| Pre- and post-consumer food waste: who discards it, who pays for it | hennepin_hazwaste | 158 |
| Pre- and post-consumer food waste: who discards it, who pays for it | mpca_wimn | 30 |
| Pre- and post-consumer food waste: who discards it, who pays for it | echo_rcra | 8 |
| Restaurants whose takeout packaging may make them producers | bm_businesses | 8,299 |
| Restaurants whose takeout packaging may make them producers | bm_licences | 2,126 |
| Restaurants whose takeout packaging may make them producers | bm_sba | 633 |
| Restaurants whose takeout packaging may make them producers | mpca_wimn | 3 |
| Restaurants whose takeout packaging may make them producers | echo_rcra | 3 |
| Restaurants whose takeout packaging may make them producers | hennepin_hazwaste | 1 |
| Salon aluminium foil and colour tubes: who discards it, who pays for it | bm_businesses | 3,502 |
| Salon aluminium foil and colour tubes: who discards it, who pays for it | bm_sba | 241 |
| Salon aluminium foil and colour tubes: who discards it, who pays for it | mpca_wimn | 33 |
| Salon aluminium foil and colour tubes: who discards it, who pays for it | hennepin_hazwaste | 9 |
| Salon aluminium foil and colour tubes: who discards it, who pays for it | echo_rcra | 5 |
| Salons and spas that must have switched cosmetics and cleaning products | bm_businesses | 5,164 |
| Salons and spas that must have switched cosmetics and cleaning products | bm_sba | 241 |
| Salons and spas that must have switched cosmetics and cleaning products | mpca_wimn | 34 |
| Salons and spas that must have switched cosmetics and cleaning products | hennepin_hazwaste | 9 |
| Salons and spas that must have switched cosmetics and cleaning products | echo_rcra | 5 |
| Scrap tires: who discards it, who pays for it | bm_businesses | 5,799 |
| Scrap tires: who discards it, who pays for it | hennepin_hazwaste | 1,893 |
| Scrap tires: who discards it, who pays for it | mpca_wimn | 290 |
| Scrap tires: who discards it, who pays for it | bm_sba | 233 |
| Scrap tires: who discards it, who pays for it | echo_rcra | 181 |
| Spent coffee grounds: who discards it, who pays for it | bm_businesses | 945 |
| Spent coffee grounds: who discards it, who pays for it | echo_rcra | 1 |
| Taprooms with no farmer for their grain | bm_businesses | 142 |
| Very small generators paying full-service haulers for county-collectable waste | echo_rcra | 10,043 |
| Very small generators paying full-service haulers for county-collectable waste | hennepin_hazwaste | 5,798 |
| Very small generators paying full-service haulers for county-collectable waste | mpca_wimn | 47 |
| Walk-in and rack owners who must now inspect and log leaks | bm_businesses | 12,427 |
| Walk-in and rack owners who must now inspect and log leaks | bm_licences | 2,818 |
| Walk-in and rack owners who must now inspect and log leaks | bm_sba | 850 |
| Walk-in and rack owners who must now inspect and log leaks | hennepin_hazwaste | 160 |
| Walk-in and rack owners who must now inspect and log leaks | mpca_wimn | 40 |
| Walk-in and rack owners who must now inspect and log leaks | echo_rcra | 17 |

## Where side A sits

- **Spent coffee grounds: who discards it, who pays for it:** Minneapolis 239, Saint Paul 112, Bloomington 35, Minnetonka 25, Eden Prairie 23, Maple Grove 22
- **Dental offices leaving refining returns on the bench:** Minneapolis 482, Saint Paul 266, Edina 153, Bloomington 105, Woodbury 98, Plymouth 93
- **PCE prohibited in third-generation machines:** Minneapolis 87, Bloomington 26, Richfield 18, Saint Paul 18, St. Louis Park 17, Brooklyn Park 17
- **Active entities with no renewal filed yet this year:** Minneapolis 57, Saint Paul 31
- **Restaurants whose takeout packaging may make them producers:** ? 2,126, Minneapolis 2,074, Saint Paul 1,036, Bloomington 353, Eden Prairie 221, Eagan 219
- **Pre- and post-consumer food waste: who discards it, who pays for it:** ? 2,465, Minneapolis 2,005, Saint Paul 1,016, Bloomington 386, Eden Prairie 221, Eagan 209

Members with a dated event in the last twelve months or the next (a WARN effective date, a wrecking permit, a vacancy filing, an SBA approval, a recorded sale, a hazwaste inspection):

| opportunity | members with a clock |
|---|---|
| Hennepin hazardous waste generator licence | 467 |
| PFAS banned in 11 product categories | 325 |
| Walk-in and rack owners who must now inspect and log leaks | 169 |
| Restaurants whose takeout packaging may make them producers | 132 |
| Pre- and post-consumer food waste: who discards it, who pays for it | 126 |
| Grease-trap (brown) grease: who discards it, who pays for it | 112 |
| Buildings over 50,000 sq ft whose gross area is now a public filing | 100 |
| Large food-waste generators without organics service | 88 |
| Active entities with no renewal filed yet this year | 88 |
| Very small generators paying full-service haulers for county-collectable waste | 71 |
| Scrap tires: who discards it, who pays for it | 67 |
| Salons and spas that must have switched cosmetics and cleaning products | 65 |
| Salon aluminium foil and colour tubes: who discards it, who pays for it | 49 |
| Dental offices leaving refining returns on the bench | 41 |
| Hazardous-waste handlers with a violation since 2021 | 11 |
| Commercial teardowns and closures as refrigerant and equipment recovery events | 9 |
| Spent coffee grounds: who discards it, who pays for it | 9 |
| Aluminium printing plates: who discards it, who pays for it | 9 |
| Hotel linens and towels, retired: who discards it, who pays for it | 3 |
| Taprooms with no farmer for their grain | 1 |
| PCE prohibited in third-generation machines | 1 |

## The five questions, answered from the model

| question | businesses with a counted answer | businesses with only a placeholder |
|---|---|---|
| What annoying thing are they legally required to do? | 147,457 | 11,673 |
| What do they buy constantly? | 0 | 0 |
| What do they have trouble sourcing? | 0 | 144 |
| What do they throw away? | 4,100 | 23,966 |
| What is surprisingly expensive for them? | 0 | 418 |

## What the model needs to uncover more

Ordered by how much of the scored value it would move from *unpriced* or *benchmark* to *measured*.

| source not held | publisher | coverage | route |
|---|---|---|---|
| Business bulk data (weekly CSV of every entity and assumed name) | Minnesota Secretary of State | Minnesota | purchase: bulk order form + signed licence agreement; reported at $30/week or $100 one-time — a spend, so Aidan's call |
| Cups, covers, barrels, cars per day | the business | per business | ask; or infer from review velocity, popular times and seats |
| Dry cleaner environmental response and reimbursement account registrants | MPCA | Minnesota | MPCA maintains the registered dry cleaner list for the fund |
| HFC leak repair reports from 2026 | US EPA | federal | the rule requires reporting on chronically leaking appliances; FOIA once the first year is in |
| Hazardous waste manifests: what each generator shipped, to whom, how much | MPCA / EPA e-Manifest | national | EPA e-Manifest public data (RCRAInfo) by EPA ID; the Hennepin layer carries the EPA ID to join on |
| MCES industrial discharge permits and FOG (grease interceptor) inspections | Metropolitan Council Environmental Services | metro | MGDPA request to MCES Industrial Waste; Minneapolis and Saint Paul FOG programmes hold pumping records |
| Ordinance 13 compliance status per business | Hennepin County Environment and Energy | Hennepin | MGDPA request: the county inspects and records which large generators have organics service |
| Ramsey County hazardous waste generator licences (parcel-keyed) | Ramsey County Public Health | Ramsey | ECHO now covers Ramsey handlers by address; the county's own licence layer is public but holds 0 rows. MGDPA request for parcel ids |
| Statewide building energy benchmarking (2024 law) filings | MN Dept of Commerce | Minnesota | blocked 2026-09-28: mn.gov behind ShieldSquare, Minneapolis only a Tableau view behind Cloudflare, Saint Paul a request form. Route: Saint Paul data request or MGDPA to Commerce |
| USDA AMS price history (MyMarketNews API) | USDA AMS | US | free MyMarketNews account for an API key; the API returns 403 without one |
| Urban Waste Grease Resource Assessment (Wiltsee 1998) | NREL | 30 US metros | fetch the PDF; the per-capita yellow and trap grease figures are the sizing |
| Waste and recycling hauler, container size, pickup frequency, monthly fee per business | the business | per business | ask the owner; or the city's licensed-hauler route lists (Minneapolis licenses commercial haulers) |
| What Sanimax, Darling and the local used-oil collectors actually pay a Twin Cities restaurant or shop this month | the collectors | metro | call three; prices are quoted per pickup, not published |
| What a business buys: supplier, item, unit price, frequency | the business | per business | ask the owner for three months of invoices; nothing public carries it |

Templates still on a placeholder (the per-business number a quote or an invoice would replace):

| template | sector | category | material | dir | qty | unit | per | what would replace it |
|---|---|---|---|---|---|---|---|---|
| t_auto_cats | auto |  | Scrap catalytic converters | out | 20.0 | each | year | PGM value; 2023 MN law requires documentation to sell |
| t_auto_cores | auto |  | Lead-acid battery cores | out | 100.0 | each | year | core value ~$8; volume unknown |
| t_auto_oil | auto |  | Used motor oil | out | 400.0 | gal | year | volume per shop needs a collector quote |
| t_auto_tires | auto |  | Scrap tires | out | 500.0 | each | year | shops pay ~$3/tire to a hauler |
| t_brew_co2 | bar | brewery | Beverage-grade CO2 | in | 1.0 | each | year | 2022 CO2 shortage hit taprooms; volume unknown |
| t_brew_grain | bar | brewery | Brewer's spent grain (wet) | out | 70.0 | lb | year | 70 lb wet per barrel is cited; barrels per taproom per year is not, so this stays a placeholder until a taproom declares its output |
| t_hotel_food | lodging |  | Pre- and post-consumer food waste | out | 1.0 | ton | week | hotels are a named Ordinance 13 class |
| t_hotel_linens | lodging |  | Hotel linens and towels, retired | out | 20.0 | lb | week |  |
| t_rest_cardboard | restaurant |  | Old corrugated cardboard, loose | out | 2.0 | each | week | loose OCC in the dumpster |
| t_rest_food | restaurant |  | Pre- and post-consumer food waste | out | 0.5 | ton | week | the Ordinance 13 threshold is 1 ton/week of trash; half of it food is the county's own share figure |
| t_rest_trap | restaurant |  | Grease-trap (brown) grease | out | 4.0 | each | year | quarterly pumping at ~$300; FOG programmes require it |
| t_rest_uco | restaurant |  | Used cooking oil (yellow grease) | out | 25.0 | gal | week | 25 gal/week is a mid fryer restaurant; collectors pay ~$2.50/gal (Jacobsen via Grease Connections). Sizing needs a collector quote. |
| t_bakery_bread | retail | bakery | Day-old bread and pastry | out | 50.0 | lb | week |  |
| t_dry_replace | retail | dry_clean | Non-perc dry-cleaning machine (hydrocarbon, wet clean, K4) | in | 1.0 | each | year | replacement machine five figures; financing is the scale asymmetry |
| t_grocer_food | retail | grocery | Pre- and post-consumer food waste | out | 2.0 | ton | week | grocers are a named Ordinance 13 class |
| t_print_plates | retail | printing | Aluminium printing plates | out | 50.0 | lb | month | clean aluminium scrap |
| t_salon_foil | salon |  | Salon aluminium foil and colour tubes | out | 2.0 | lb | week | Green Circle Salons charges salons to recover this |

Columns the ideal model has and the warehouse leaves empty:

| column | rows empty |
|---|---|
| business.employees | 138,635 |
| business.revenue_usd | 147,457 |
| business.floor_sqft | 147,457 |
| business.status = trading | 147,457 |
| flow.counterparty_id | 280,825 |
| site.building_sqft | 37,003 |
| owner_operator.email | 22,700 |
