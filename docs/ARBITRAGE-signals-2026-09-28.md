# Customer signals: which public event tells which trade about its next customer

Run 2026-09-29. Trailing twelve months. Every column is counted except known vendors and the trade mapping, which are typed and flagged.

Score = log10(events) x log10(buyer firms) x urgency x (1 + 4 x contact share) / (1 + known vendors). Urgency: correction order with a deadline 5, trigger 3, already bought 1.

| score | signal | events, 12 mo | with a phone, email or website | buyer firms (CBP) | events per buyer firm | urgency | known vendors |
|---|---|---|---|---|---|---|---|
| 278.5 | Minneapolis rental and housing code cases (correction orders on rental and owner-occupied housing) | 8,526 | 6,129 (72%) | 4,531 | 1.9 | 5 | none in this market |
| 246.5 | Minneapolis fire inspections of commercial buildings and high-occupancy dwellings | 3,330 | 2,712 (81%) | 1,933 | 1.7 | 5 | none in this market |
| 180.6 | Minneapolis food businesses cited for missing test kits, thermometers, signs, logs or soap | 804 | 634 (79%) | 982 | 0.8 | 5 | none known (unverified) |
| 176.8 | Minneapolis food businesses cited for cold holding above 41F or failing refrigeration | 645 | 524 (81%) | 912 | 0.7 | 5 | none known (unverified) |
| 173.1 | Minneapolis food businesses cited for walls, floors, ceilings in disrepair or dirty | 348 | 285 (82%) | 1,530 | 0.2 | 5 | none known (unverified) |
| 147.5 | Minneapolis food businesses cited for plumbing, drains, grease or backflow | 291 | 230 (79%) | 748 | 0.4 | 5 | none known (unverified) |
| 145.8 | Minneapolis nuisance cases (tall grass, junk, snow, graffiti, debris) | 10,536 | 3,155 (30%) | 1,988 | 5.3 | 5 | none in this market |
| 132.5 | Minneapolis food businesses cited for equipment in disrepair or uncertified equipment | 544 | 436 (80%) | 200 | 2.7 | 5 | none known (unverified) |
| 118.7 | Minneapolis food businesses cited for no certified food protection manager | 548 | 430 (78%) | 123 | 4.5 | 5 | none known (unverified) |
| 115.5 | Minneapolis food businesses cited for dirty exhaust ducts, hoods and filters | 431 | 344 (80%) | 122 | 3.5 | 5 | none known (unverified) |
| 86.6 | Minneapolis food businesses cited for pests, rodents or insects | 201 | 173 (86%) | 48 | 4.2 | 5 | none known (unverified) |
| 74.8 | Minneapolis vacant and condemned building cases | 514 | 66 (13%) | 4,393 | 0.1 | 5 | none in this market |
| 67.0 | Saint Paul DSI garbage, tall grass, snow, graffiti and dumping complaints (feed ends 2025-06-30) | 11,539 | 0 (0%) | 1,988 | 5.8 | 5 | none known (unverified) |
| 57.1 | Saint Paul DSI exterior and interior property complaints (feed ends 2025-06-30) | 1,834 | 0 (0%) | 3,153 | 0.6 | 5 | none known (unverified) |
| 55.8 | Saint Paul fire certificate of occupancy complaints on rental property (feed ends 2025-06-30) | 2,471 | 0 (0%) | 1,933 | 1.3 | 5 | none known (unverified) |
| 48.1 | Commercial new construction and tenant build-outs | 1,231 | 1,082 (88%) | 2,793 | 0.4 | 3 | Construction Monitor, Dodge Construction Network |
| 38.1 | Recorded commercial property sales | 2,765 | 1,540 (56%) | 2,701 | 1.0 | 3 | CoStar, Reonomy |
| 27.9 | SBA 7(a) and 504 approvals | 614 | 0 (0%) | 2,186 | 0.3 | 3 | none known (unverified) |
| 26.1 | Minneapolis 311 requests about animals, rodents and waste | 11,257 | 0 (0%) | 140 | 80.4 | 3 | none known (unverified) |
| 22.7 | Wrecking and demolition permits | 86 | 22 (26%) | 207 | 0.4 | 5 | Construction Monitor |
| 14.4 | Residential building permits: remodels, additions, new homes | 9,185 | 958 (10%) | 2,645 | 3.5 | 3 | Construction Monitor, BuildZoom, Shovels |
| 8.0 | WARN layoff and closure notices | 35 | 0 (0%) | 2,795 | 0.0 | 3 | WARNTracker |
| 7.3 | Residential plumbing, mechanical and electrical permits | 19,936 | 3,186 (16%) | 1,330 | 15.0 | 1 | Construction Monitor, Shovels |

## Proof someone already pays for it

- **Minneapolis rental and housing code cases (correction orders on rental and owner-occupied housing):** CodeViolations (getcodeviolations.com): $49/mo to contractors for code-violation addresses by trade, 56+ cities; addresses only, owner contact 'coming later'; zero Minnesota cities (read 2026-09-28)
- **Minneapolis fire inspections of commercial buildings and high-occupancy dwellings:** CodeViolations (getcodeviolations.com): $49/mo to contractors for code-violation addresses by trade, 56+ cities; addresses only, owner contact 'coming later'; zero Minnesota cities (read 2026-09-28)
- **Minneapolis nuisance cases (tall grass, junk, snow, graffiti, debris):** CodeViolations (getcodeviolations.com): $49/mo to contractors for code-violation addresses by trade, 56+ cities; addresses only, owner contact 'coming later'; zero Minnesota cities (read 2026-09-28)
- **Minneapolis vacant and condemned building cases:** CodeViolations (getcodeviolations.com): $49/mo to contractors for code-violation addresses by trade, 56+ cities; addresses only, owner contact 'coming later'; zero Minnesota cities (read 2026-09-28)

## Who buys each signal

- **Minneapolis rental and housing code cases (correction orders on rental and owner-occupied housing):** Painting and wall covering contractors (500 firms): painting orders; Roofing contractors (327 firms): roof and gutter orders; Plumbing, heating, and air-conditioning contractors (748 firms): plumbing, heating, water heater orders; Electrical contractors and other wiring installation contractors (582 firms): electrical orders; Residential remodelers (1,723 firms): repair-and-remodel orders; All other specialty trade contractors (603 firms): handyman, windows, doors, stairs; Exterminating and pest control services (48 firms): pest orders
- **Minneapolis fire inspections of commercial buildings and high-occupancy dwellings:** Plumbing, heating, and air-conditioning contractors (748 firms): sprinkler, alarm and hood systems; Electrical contractors and other wiring installation contractors (582 firms): electrical and exit lighting; All other specialty trade contractors (603 firms): fire doors and extinguishers
- **Minneapolis food businesses cited for missing test kits, thermometers, signs, logs or soap:** Service establishment equipment and supplies merchant wholesalers (55 firms): food safety supplies and chemical service; Janitorial services (927 firms): chemical and sanitation service
- **Minneapolis food businesses cited for cold holding above 41F or failing refrigeration:** Plumbing, heating, and air-conditioning contractors (748 firms): refrigeration and walk-in repair; Commercial and industrial machinery and equipment (except automotive and electronic) repair and maintenance (164 firms): commercial kitchen equipment repair
- **Minneapolis food businesses cited for walls, floors, ceilings in disrepair or dirty:** Janitorial services (927 firms): commercial kitchen cleaning; All other specialty trade contractors (603 firms): floor, wall and ceiling repair
- **Minneapolis food businesses cited for plumbing, drains, grease or backflow:** Plumbing, heating, and air-conditioning contractors (748 firms): plumbing repair
- **Minneapolis nuisance cases (tall grass, junk, snow, graffiti, debris):** Landscaping services (1,293 firms): tall grass and snow orders; Solid waste collection (92 firms): junk and debris removal; All other specialty trade contractors (603 firms): graffiti and repair
- **Minneapolis food businesses cited for equipment in disrepair or uncertified equipment:** Commercial and industrial machinery and equipment (except automotive and electronic) repair and maintenance (164 firms): commercial kitchen equipment repair; Other commercial equipment merchant wholesalers (36 firms): replacement equipment
- **Minneapolis food businesses cited for no certified food protection manager:** All other miscellaneous schools and instruction (123 firms): food manager certification courses
- **Minneapolis food businesses cited for dirty exhaust ducts, hoods and filters:** Other services to buildings and dwellings (122 firms): hood and duct cleaning
- **Minneapolis food businesses cited for pests, rodents or insects:** Exterminating and pest control services (48 firms): pest control contract
- **Minneapolis vacant and condemned building cases:** Residential remodelers (1,723 firms): rehab of a vacant house; Site preparation contractors (275 firms): board-up and site work; Offices of real estate agents and brokers (2,321 firms): agents and investors buying distressed property; Security guards and patrol services (74 firms): security for a vacant building
- **Saint Paul DSI garbage, tall grass, snow, graffiti and dumping complaints (feed ends 2025-06-30):** Landscaping services (1,293 firms): tall grass and snow; Solid waste collection (92 firms): garbage, rubbish and dumping; All other specialty trade contractors (603 firms): graffiti removal
- **Saint Paul DSI exterior and interior property complaints (feed ends 2025-06-30):** Painting and wall covering contractors (500 firms): painting and siding orders; Roofing contractors (327 firms): roof and gutter orders; Residential remodelers (1,723 firms): repair-and-remodel orders; All other specialty trade contractors (603 firms): handyman, windows, doors, stairs
- **Saint Paul fire certificate of occupancy complaints on rental property (feed ends 2025-06-30):** Plumbing, heating, and air-conditioning contractors (748 firms): plumbing, heating and smoke alarms; Electrical contractors and other wiring installation contractors (582 firms): electrical; All other specialty trade contractors (603 firms): egress windows, doors, handrails
- **Commercial new construction and tenant build-outs:** Sign manufacturing (73 firms): signs for the new tenant; Security systems services (except locksmiths) (50 firms): security and access systems; Janitorial services (927 firms): commercial cleaning contracts; Insurance agencies and brokerages (1,669 firms): insurance for the new location; Furniture merchant wholesalers (74 firms): office and restaurant furniture
- **Recorded commercial property sales:** Residential property managers (725 firms): property management for a new owner; Insurance agencies and brokerages (1,669 firms): insurance at change of ownership; Commercial and institutional building construction (307 firms): renovation by the new owner
- **SBA 7(a) and 504 approvals:** Offices of certified public accountants (481 firms): bookkeeping and tax for a newly funded business; Insurance agencies and brokerages (1,669 firms): insurance the lender requires; Other commercial equipment merchant wholesalers (36 firms): equipment for the build
- **Minneapolis 311 requests about animals, rodents and waste:** Exterminating and pest control services (48 firms): pest control; Solid waste collection (92 firms): junk and bulky waste
- **Wrecking and demolition permits:** Remediation services (59 firms): asbestos survey and abatement before demolition; Solid waste collection (92 firms): roll-off containers; Recyclable material merchant wholesalers (56 firms): salvage and scrap
- **Residential building permits: remodels, additions, new homes:** Flooring contractors (275 firms): flooring after the remodel; Finish carpentry contractors (382 firms): finish carpentry and cabinets; Solid waste collection (92 firms): dumpsters; Landscaping services (1,293 firms): landscaping a new home; All other specialty trade contractors (603 firms): fencing, decks, windows
- **WARN layoff and closure notices:** Temporary help services (474 firms): temporary staffing and outplacement; Offices of real estate agents and brokers (2,321 firms): commercial space coming free
- **Residential plumbing, mechanical and electrical permits:** Plumbing, heating, and air-conditioning contractors (748 firms): an HVAC swap signals the next service contract; Electrical contractors and other wiring installation contractors (582 firms): panel upgrades before EV chargers and solar
