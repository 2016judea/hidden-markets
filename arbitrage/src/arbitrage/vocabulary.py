"""Seed rows for the arbitrage model: the framework's nouns, plus every
material, buyer class, template, obligation, price and demand row the
2026-09-28 session could ground.

Every row carries a source id. A source with `held=False` is one we know
exists and do not hold; `how_to_get` says the route. A template or price with
basis `illustrative` is a placeholder the scorer does not sum — it exists so
the gap shows up as a gap, not as a zero.

Grounded 2026-09-28 in Aidan's post (aidanjude.substack.com/p/hidden-market-
arbitrage) and the web reads logged in docs/ARBITRAGE-DATA-MODEL.md.
"""

from __future__ import annotations

ASYMMETRY_KINDS = [
    ("geographic", "Geographic", "What does Minnesota have that somebody 2,000 miles away has difficulty obtaining?"),
    ("waste_stream", "Waste-stream", "What are businesses paying someone to take away that another business is paying someone to acquire?"),
    ("knowledge", "Knowledge", "What is not scarce, only unknown where it is?"),
    ("regulatory", "Regulatory", "What new rule makes thousands of owners say: how do I do that?"),
    ("cultural", "Cultural", "What does one community systematically undervalue relative to another?"),
    ("scale", "Scale", "Which customer does nobody's operating model fit?"),
]

BUYER_QUESTIONS = [
    ("buys_constantly", "What do they buy constantly?", "in", "direction='in' AND qty_per_year > 0"),
    ("surprisingly_expensive", "What is surprisingly expensive for them?", "in", "direction='in' AND annual_cost_usd is high against the sector benchmark"),
    ("hard_to_source", "What do they have trouble sourcing?", "in", "direction='in' AND (sourcing_pain >= 3 OR lead_time_days >= 30)"),
    ("throws_away", "What do they throw away?", "out", "direction='out'"),
    ("legally_required", "What annoying thing are they legally required to do?", "obligation", "direction='obligation'"),
]

BASIS_KINDS = [
    ("measured", True, "a record about this business"),
    ("declared", True, "the business or a counterparty said so"),
    ("benchmark", True, "sector template x size"),
    ("inferred", True, "a join or a rule"),
    ("illustrative", False, "placeholder; not summed"),
]

# id, name, publisher, url, kind, licence, retrieved, coverage, held, how_to_get
SOURCES = [
    ("post", "Hidden-Market Arbitrage", "Aidan Jude", "https://aidanjude.substack.com/p/hidden-market-arbitrage", "study", None, "2026-09-28", "framework", True, None),
    ("bm_businesses", "Businesses observed on commercial parcels", "Brick & Mortar / Overture Maps", "website/api/_data/exports/businesses.json", "listing", "CDLA-Permissive-2.0", "2026-09-28", "7-county metro", True, None),
    ("bm_licences", "Food and liquor licences", "Brick & Mortar / Minneapolis + Saint Paul", "website/api/_data/exports/licences.json", "record", "open data", "2026-09-28", "Minneapolis + Saint Paul", True, None),
    ("bm_sba", "SBA 7(a) and 504 loans", "Brick & Mortar / SBA FOIA", "website/api/_data/exports/sba-loans.json", "record", "public domain", "2026-09-28", "7-county metro", True, None),
    ("bm_providers", "NPPES providers", "Brick & Mortar / CMS NPPES", "website/api/_data/exports/providers.json", "record", "public domain", "2026-09-28", "Minnesota", True, None),
    ("bm_practice_owners", "Practices that own their building", "Brick & Mortar", "website/api/_data/exports/practice-owners.json", "derived", None, "2026-09-28", "7-county metro", True, None),
    ("bm_corridors", "Commercial parcels on named corridors", "Brick & Mortar / county GIS", "website/api/_data/exports/corridors.json", "derived", None, "2026-09-28", "7-county metro", True, None),
    ("bm_assessor", "Assessor values, locally assessed parcels", "Brick & Mortar / county assessors", "website/api/_data/exports/assessor.json", "record", None, "2026-09-28", "Hennepin", True, None),
    ("bm_sales", "Recorded commercial sales", "Brick & Mortar / county recorders", "website/api/_data/exports/sales.json", "record", None, "2026-09-28", "7-county metro", True, None),
    ("bm_contamination", "MPCA sites on parcels", "Brick & Mortar / MPCA", "website/api/_data/exports/contamination.json", "record", None, "2026-09-28", "7-county metro", True, None),
    ("bm_lead", "Lead service line inventory", "Brick & Mortar / City of Minneapolis", "website/api/_data/exports/lead-service-lines.json", "record", None, "2026-09-28", "Minneapolis", True, None),
    ("bm_vacancies", "Vacant building registrations", "Brick & Mortar / Minneapolis + Saint Paul", "website/api/_data/exports/vacancies.json", "record", None, "2026-09-28", "Minneapolis + Saint Paul", True, None),
    ("bm_teardowns", "Wrecking permits", "Brick & Mortar / city permits", "website/api/_data/exports/teardowns.json", "record", None, "2026-09-28", "Minneapolis + Saint Paul", True, None),
    ("bm_warn", "WARN layoff notices", "Brick & Mortar / MN DEED", "website/api/_data/exports/layoff-notices.json", "record", None, "2026-09-28", "Minnesota", True, None),
    ("bm_contractors", "Firms pulling commercial permits", "Brick & Mortar / city permits", "website/api/_data/exports/contractors.json", "derived", None, "2026-09-28", "Minneapolis + Saint Paul", True, None),
    ("bm_permits", "Commercial permits", "Brick & Mortar / city permits", "website/api/_data/twincities_permits.json", "record", None, "2026-09-28", "Minneapolis + Saint Paul", True, None),
    ("bm_trades", "Trades: establishments, workers, wages", "Brick & Mortar / Census CBP + BLS QCEW", "website/api/_data/exports/trades.json", "derived", "public domain", "2026-09-28", "7-county metro", True, None),
    ("bm_reviews", "Reviewed places and their reviews", "Brick & Mortar / Outscraper", "bricks.duckdb", "listing", "not redistributable", "2026-09-28", "193 places", True, None),
    ("hennepin_hazwaste", "Hazardous Waste Generators (licensed sites)", "Hennepin County GIS", "https://gis.hennepin.us/arcgis/rest/services/HennepinData/ENVIRONMENT/MapServer/0", "record", "open data", "2026-09-28", "Hennepin", True, None),
    ("echo_rcra", "RCRA hazardous waste handlers, violations and enforcement (ECHO)", "US EPA", "https://echo.epa.gov/files/echodownloads/rcra_downloads.zip", "record", "public domain", "2026-09-28", "7-county metro", True, None),
    ("mpca_wimn", "What's In My Neighborhood regulated sites", "MPCA", "https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_pca/env_my_neighborhood/FeatureServer/0", "record", "public", "2026-09-28", "7-county metro", True, None),
    ("usda_ams", "National Animal By-Product and Ethanol feedstuff reports, week of 2026-09-21", "USDA AMS Market News", "https://www.ams.usda.gov/mnreports/ams_3510.pdf", "price_list", "public domain", "2026-09-28", "Minnesota", True, None),
    ("usda_ams_series", "USDA AMS price history (MyMarketNews API)", "USDA AMS", "https://marsapi.ams.usda.gov", "price_list", "public domain", None, "US", False, "free MyMarketNews account for an API key; the API returns 403 without one"),
    ("mn_sos", "Business Filing Search (MBLS) and renewal rules", "Minnesota Secretary of State", "https://mblsportal.sos.mn.gov/Business/Search", "record", "public", "2026-09-28", "Minnesota", True, None),
    ("mn_sos_renewal", "How to renew / reinstate your business filing", "Minnesota Secretary of State", "https://www.sos.mn.gov/business-liens/business-help/how-to-renew-your-business-filing/", "rule", None, "2026-09-28", "Minnesota", True, None),
    ("mn_sos_bulk", "Business bulk data (weekly CSV of every entity and assumed name)", "Minnesota Secretary of State", "https://www.sos.mn.gov/business-liens/business-liens-data/minnesota-business-snapshot-data", "record", "licence agreement", None, "Minnesota", False, "purchase: bulk order form + signed licence agreement; reported at $30/week or $100 one-time — a spend, so Aidan's call"),
    ("hazwaste_forms", "Seven metro counties' hazardous waste licence renewal routes", "county sites, researched 2026-09-28", "data/cache/hazwaste_forms/COUNTIES.md", "rule", None, "2026-09-28", "7-county metro", True, None),
    ("mn_unclaimed", "Unclaimed property claims and finder rules (Minn. Stat. 345.515, 345.55)", "MN Commerce / Revisor", "https://www.revisor.mn.gov/statutes/cite/345/pdf", "rule", None, "2026-09-28", "Minnesota", True, None),
    ("hennepin_value_appeal", "Assessment appeals and letter of authorization", "Hennepin County", "https://www.hennepincounty.gov/services/property/assessment", "rule", None, "2026-09-28", "Hennepin", True, None),
    ("epa_hfc_err", "Emissions Reduction and Reclamation rule (AIM Act subsection h)", "US EPA", "https://www.epa.gov/hfcs/reporting-resources-emissions-reduction-reclamation-rule", "rule", None, "2026-09-28", "federal", True, None),
    ("hennepin_ord13", "Hennepin County Ordinance 13 (food waste recycling)", "Hennepin County", "https://www.hennepincounty.gov/services/environment/recycling/business-recycling/food-waste-recycling-compliance-businesses", "rule", None, "2026-09-28", "Hennepin", True, None),
    ("mn_115a151", "Minn. Stat. 115A.151 commercial recycling", "Minnesota Revisor", "https://www.revisor.mn.gov/statutes/cite/115A.151", "rule", None, "2026-09-28", "metro counties", True, None),
    ("epa_pce", "PCE risk management rule under TSCA", "US EPA", "https://www.epa.gov/assessing-and-managing-chemicals-under-tsca/risk-management-perchloroethylene-pce", "rule", None, "2026-09-28", "federal", True, None),
    ("epa_dental", "Dental effluent guidelines, 40 CFR 441", "US EPA", "https://www.epa.gov/eg/dental-effluent-guidelines", "rule", None, "2026-09-28", "federal", True, None),
    ("mn_pfas", "PFAS in products (Amara's Law) prohibitions and reporting", "MPCA", "https://www.pca.state.mn.us/air-water-land-climate/2025-pfas-prohibitions", "rule", None, "2026-09-28", "Minnesota", True, None),
    ("mn_epr", "Packaging Waste and Cost Reduction Act", "MPCA", "https://www.pca.state.mn.us/air-water-land-climate/extended-producer-responsibility-for-packaging", "rule", None, "2026-09-28", "Minnesota", True, None),
    ("stp_benchmarking", "Energy benchmarking ordinance (handed to the State 2025)", "City of Saint Paul", "https://www.stpaul.gov/departments/mayors-office/energize-saint-paul/energy-benchmarking-ordinance", "rule", None, "2026-09-28", "Saint Paul", True, None),
    ("mn_325e112", "Minn. Stat. 325E.112 used motor oil acceptance", "Minnesota Revisor", "https://www.revisor.mn.gov/statutes/cite/325E.112", "rule", None, "2026-09-28", "Minnesota", True, None),
    ("hennepin_hw_licence", "Hazardous waste licensing and renewal", "Hennepin County", "https://www.hennepincounty.gov/services/licenses-certificates/business/hazardous-waste-licensing-regulation/hazardous-waste-licensing-and-renewal", "rule", None, "2026-09-28", "Hennepin", True, None),
    ("uco_prices", "Used cooking oil / yellow grease prices", "USDA via Restaurant Technologies; Fastmarkets Jacobsen via Reiter USA", "https://www.rti-inc.com/blog/how-much-is-used-cooking-oil-worth/", "price_list", None, "2026-09-28", "US", True, None),
    ("uco_collect", "What collectors pay restaurants for UCO", "Jacobsen via Grease Connections", "https://greaseconnections.com/can-you-sell-grease-for-money/", "price_list", None, "2026-09-28", "US", True, None),
    ("spent_grain", "Spent grain per barrel and open-market value", "Brewers Association; Untappd", "https://www.brewersassociation.org/government-affairs/brews-to-barns/", "study", None, "2026-09-28", "US", True, None),
    ("coffee_grounds", "Cafe spent-grounds volume", "GroCycle", "https://grocycle.com/growing-mushrooms-in-coffee-grounds/", "study", None, "2026-09-28", "US", True, None),
    ("dakota_prairie", "Dakota Prairie Composting products and pricing (the former SMSC Organics facility, Shakopee)", "Dakota Prairie Composting", "https://dakotaprairiecomposting.com/all-products/", "price_list", None, "2026-09-30", "metro", True, None),
    ("dental_scrap", "Dental scrap refining returns per office", "Core Scientific; Garfield Refining", "https://core-scientific.com/what-is-dental-scrap-1/", "price_list", None, "2026-09-28", "US", True, None),
    ("nrel_grease", "Urban Waste Grease Resource Assessment (Wiltsee 1998)", "NREL", "https://www.nrel.gov/docs/legosti/fy99/26141.pdf", "study", None, None, "30 US metros", False, "fetch the PDF; the per-capita yellow and trap grease figures are the sizing"),
    # not held: the sources the gap list names
    ("ramsey_hazwaste", "Ramsey County hazardous waste generator licences (parcel-keyed)", "Ramsey County Public Health", None, "record", None, None, "Ramsey", False, "ECHO now covers Ramsey handlers by address; the county's own licence layer is public but holds 0 rows. MGDPA request for parcel ids"),
    ("hennepin_ord13_compliance", "Ordinance 13 compliance status per business", "Hennepin County Environment and Energy", None, "record", None, None, "Hennepin", False, "MGDPA request: the county inspects and records which large generators have organics service"),
    ("hauler_contracts", "Waste and recycling hauler, container size, pickup frequency, monthly fee per business", "the business", None, "declared", None, None, "per business", False, "ask the owner; or the city's licensed-hauler route lists (Minneapolis licenses commercial haulers)"),
    ("supplier_invoices", "What a business buys: supplier, item, unit price, frequency", "the business", None, "declared", None, None, "per business", False, "ask the owner for three months of invoices; nothing public carries it"),
    ("pos_volume", "Cups, covers, barrels, cars per day", "the business", None, "declared", None, None, "per business", False, "ask; or infer from review velocity, popular times and seats"),
    ("mces_permits", "MCES industrial discharge permits and FOG (grease interceptor) inspections", "Metropolitan Council Environmental Services", None, "record", None, None, "metro", False, "MGDPA request to MCES Industrial Waste; Minneapolis and Saint Paul FOG programmes hold pumping records"),
    ("mpca_haz_manifests", "Hazardous waste manifests: what each generator shipped, to whom, how much", "MPCA / EPA e-Manifest", "https://rcrainfo.epa.gov/", "record", None, None, "national", False, "EPA e-Manifest public data (RCRAInfo) by EPA ID; the Hennepin layer carries the EPA ID to join on"),
    ("epa_608_leak_reports", "HFC leak repair reports from 2026", "US EPA", None, "record", None, None, "federal", False, "the rule requires reporting on chronically leaking appliances; FOIA once the first year is in"),
    ("mn_benchmarking", "Statewide building energy benchmarking (2024 law) filings", "MN Dept of Commerce", None, "record", None, None, "Minnesota", False, "blocked 2026-09-28: mn.gov behind ShieldSquare, Minneapolis only a Tableau view behind Cloudflare, Saint Paul a request form. Route: Saint Paul data request or MGDPA to Commerce"),
    ("mn_dry_cleaner_fund", "Dry cleaner environmental response and reimbursement account registrants", "MPCA", None, "record", None, None, "Minnesota", False, "MPCA maintains the registered dry cleaner list for the fund"),
    ("collector_prices_local", "What Sanimax, Darling and the local used-oil collectors actually pay a Twin Cities restaurant or shop this month", "the collectors", None, "price_list", None, None, "metro", False, "call three; prices are quoted per pickup, not published"),
    ("web", "Public company websites (founding year, service area)", "various", None, "listing", None, "2026-09-28", "US", True, None),
]

# id, label, kind, form, unit, shelf_life_days, hazard_class, regulated_by, note
MATERIALS = [
    ("uco", "Used cooking oil (yellow grease)", "byproduct", "liquid", "gal", 90, "none", "MPCA used oil rules", "renewable diesel feedstock; collectors pay"),
    ("trap_grease", "Grease-trap (brown) grease", "byproduct", "liquid", "gal", 30, "regulated", "MCES / city FOG programmes", "pumped at a fee; low value"),
    ("food_waste", "Pre- and post-consumer food waste", "byproduct", "solid", "ton", 3, "perishable", "Hennepin Ordinance 13", None),
    ("spent_grain", "Brewer's spent grain (wet)", "byproduct", "solid", "lb", 2, "perishable", None, "cattle feed; bakery flour"),
    ("spent_yeast", "Spent brewer's yeast", "byproduct", "liquid", "gal", 7, "perishable", None, None),
    ("coffee_grounds", "Spent coffee grounds", "byproduct", "solid", "lb", 3, "perishable", None, "mushroom substrate, cosmetics, vermicompost"),
    ("cardboard", "Old corrugated cardboard, loose", "byproduct", "solid", "ton", None, "none", "Minn. Stat. 115A.151", None),
    ("pallets", "Wood pallets", "byproduct", "object", "each", None, "none", None, None),
    ("used_oil", "Used motor oil", "byproduct", "liquid", "gal", None, "regulated", "MPCA used oil; Minn. Stat. 325E.112", "collectors pay or charge with crude"),
    ("lead_acid_batteries", "Lead-acid battery cores", "byproduct", "object", "each", None, "hazardous", "MN battery return law", "core value; scrap lead"),
    ("scrap_tires", "Scrap tires", "byproduct", "object", "each", None, "regulated", "MPCA waste tire rules", "shops pay a fee per tire"),
    ("catalytic_converters", "Scrap catalytic converters", "byproduct", "object", "each", None, "none", "MN 2023 catalytic converter sale rules", "PGM value; documentation now required to sell"),
    ("antifreeze", "Used antifreeze", "byproduct", "liquid", "gal", None, "hazardous", "county hazwaste licence", None),
    ("solvent", "Spent parts-washer solvent", "byproduct", "liquid", "gal", None, "hazardous", "county hazwaste licence", None),
    ("dental_scrap", "Dental scrap metal (crowns, bridges, PFM)", "byproduct", "object", "year", None, "none", None, "refiners pay; average office ~$3k/yr"),
    ("amalgam", "Amalgam separator waste", "byproduct", "solid", "each", None, "hazardous", "40 CFR 441", "separator cartridge; recycled mercury"),
    ("xray_fixer", "Silver-bearing X-ray fixer", "byproduct", "liquid", "gal", None, "hazardous", "county hazwaste licence", "mostly gone digital"),
    ("hair_clippings", "Hair clippings", "byproduct", "solid", "lb", None, "none", None, "oil-spill booms; niche"),
    ("salon_foil", "Salon aluminium foil and colour tubes", "byproduct", "solid", "lb", None, "none", None, "Green Circle Salons sells this recovery"),
    ("printing_plates", "Aluminium printing plates", "byproduct", "solid", "lb", None, "none", None, "scrap aluminium, clean"),
    ("perc", "Perchloroethylene and perc-contaminated waste", "byproduct", "liquid", "gal", None, "hazardous", "EPA TSCA PCE rule 2024", "phase-out manufactures demand for replacement machines"),
    ("perc_machine", "Perc dry-cleaning machine (3rd/4th/5th gen)", "equipment", "object", "each", None, "regulated", "EPA TSCA PCE rule 2024", "must be retired by 2027 or 2034"),
    ("alt_solvent_machine", "Non-perc dry-cleaning machine (hydrocarbon, wet clean, K4)", "equipment", "object", "each", None, "none", None, "the replacement; five-figure capital"),
    ("hfc_refrigerant", "HFC refrigerant charge in walk-ins, racks and ice machines", "input", "gas", "lb", None, "regulated", "EPA ERR rule (AIM Act)", "leak repair from 2026-01-01 at >= 15 lb; reclaimed-only servicing 2029 for ice makers and supermarket systems"),
    ("reclaimed_hfc", "Reclaimed HFC refrigerant", "input", "gas", "lb", None, "regulated", "EPA ERR rule (AIM Act)", "mandatory for servicing named sectors from 2029"),
    ("linens", "Hotel linens and towels, retired", "byproduct", "solid", "lb", None, "none", None, "textile recyclers, rag trade"),
    ("hotel_soap", "Partly used hotel soap", "byproduct", "solid", "lb", None, "none", None, "Clean the World"),
    ("organics_service", "Organics (food waste) collection service", "service", "service", "year", None, "none", "Hennepin Ordinance 13", "the compliance product"),
    ("recycling_service", "Commercial recycling, three materials", "service", "service", "year", None, "none", "Minn. Stat. 115A.151", None),
    ("leak_inspection", "Refrigerant leak inspection, repair and record", "service", "service", "year", None, "none", "EPA ERR rule (AIM Act)", None),
    ("hazwaste_licence", "County hazardous waste generator licence", "obligation", "service", "year", None, "none", "Hennepin County Ordinance 7", "annual, May 1 to April 30"),
    ("pfas_report", "PFAS in products report", "obligation", "service", "each", None, "none", "Minn. Stat. 116.943", "manufacturers; $800 fee"),
    ("pfas_free_cosmetics", "PFAS-free cosmetics, cleaning products, cookware", "input", "object", "each", None, "none", "Minn. Stat. 116.943", "the 2025 ban forces a switch on buyers"),
    ("sos_renewal", "Secretary of State annual renewal (LLC, corporation)", "obligation", "service", "each", None, "none", "Minn. Stat. 322C.0210; 302A.821", "free for most domestic entities; missing it dissolves the entity"),
    ("sos_reinstatement", "Reinstatement of a dissolved LLC or corporation", "service", "service", "each", None, "none", "Minn. Stat. 322C.0211; 302A.822", "a renewal for the current year plus a fee; name must still be free"),
    ("assumed_name_renewal", "Assumed name (DBA) annual renewal", "obligation", "service", "each", None, "none", "Minn. Stat. 333.055", "a lapsed assumed name is cancelled and can be taken"),
    ("unclaimed_claim", "Unclaimed property claim for a business", "service", "service", "each", None, "none", "Minn. Stat. ch. 345", "finder fee capped at 10%; agreements void within 24 months of remittance"),
    ("energy_benchmark", "Energy benchmarking submission", "obligation", "service", "year", None, "none", "MN 2024 benchmarking law", ">= 50,000 sq ft"),
    ("building_area", "Gross building area (measured)", "data", "service", "each", None, "none", None, "six of seven counties publish none"),
    ("espresso_machine", "Commercial espresso machine, used", "equipment", "object", "each", None, "none", None, "resale market"),
    ("co2", "Beverage-grade CO2", "input", "gas", "lb", None, "none", None, "breweries and taprooms buy; 2022 shortage"),
    ("day_old_bread", "Day-old bread and pastry", "byproduct", "solid", "lb", 1, "perishable", None, "beer, croutons, feed"),
]

# id, label, sector, naics, in_market, where_found, note, source_id
BUYER_CLASSES = [
    ("renderers", "Renderers and renewable-diesel feedstock buyers", None, "311613", None, "Sanimax (South Saint Paul), Darling Ingredients", "buy UCO by the pound", "web"),
    ("cattle_farms", "Cattle and hog farms within a delivery radius", None, "112", None, "MDA feedlot registrations; Brewers Association Brews to Barns", "take spent grain wet", "spent_grain"),
    ("mushroom_farms", "Mushroom growers", None, "111411", None, "MDA licensed produce; farmers markets", "coffee grounds as substrate", "coffee_grounds"),
    ("vermicompost", "Worm farms and small composters", None, "325314", None, "MPCA compost facility permits", None, "web"),
    ("organics_haulers", "Organics haulers and compost sites", None, "562111", None, "Hennepin County list of organics haulers; SMSC Organics", "sell compliance with Ordinance 13", "hennepin_ord13"),
    ("refiners", "Precious-metal refiners", None, "331492", None, "Garfield Refining (1892), Core Scientific", "buy dental scrap by mail", "dental_scrap"),
    ("scrap_yards", "Scrap metal yards", None, "423930", None, "MN scrap dealer registrations (Minn. Stat. 325E.21)", "aluminium plates, converters, cores", "web"),
    ("used_oil_collectors", "Used oil collectors and re-refiners", None, "562998", None, "Safety-Kleen (1968), local collectors", "pay or charge with crude", "web"),
    ("mechanical_contractors", "Refrigeration and mechanical contractors", "contractor", "238220", None, "bm_contractors trade = systems", "sell leak inspection and repair", "bm_contractors"),
    ("hfc_reclaimers", "EPA-certified refrigerant reclaimers", None, "325120", None, "EPA list of certified reclaimers", "buy recovered HFC", "epa_hfc_err"),
    ("drycleaning_dealers", "Dry-cleaning equipment dealers and financers", None, "423850", None, "DLI member suppliers", "sell the replacement machine", "epa_pce"),
    ("cosmetics_makers", "Small cosmetics and soap makers", None, "325620", None, "MN cottage cosmetics; Etsy sellers in metro", "coffee-grounds exfoliants", "web"),
    ("pallet_recyclers", "Pallet recyclers", None, "321920", None, "web", "pay per pallet", "web"),
    ("textile_recyclers", "Textile recyclers and rag traders", None, "423930", None, "web", "hotel linens", "web"),
    ("bakeries", "Bakeries and spent-grain flour makers", "retail", "311811", None, "bm_businesses category bakery", "spent grain as flour", "spent_grain"),
    ("breweries", "Breweries and taprooms", "bar", "312120", None, "bm_businesses category brewery", "buy CO2, sell spent grain", "bm_businesses"),
    ("restaurants", "Restaurants and cafes", "restaurant", "722", None, "bm_businesses sector restaurant/cafe", "dispose UCO, food waste, cardboard", "bm_businesses"),
    ("dentists", "Dental practices", "health", "621210", None, "bm_businesses category LIKE dent; hazwaste SIC 8021", "dental scrap; amalgam", "bm_businesses"),
    ("auto_shops", "Auto repair and body shops", "auto", "811111", None, "bm_businesses sector auto; hazwaste SIC 7538/7532", "used oil, cores, tires, converters", "bm_businesses"),
    ("dry_cleaners", "Dry cleaners", "retail", "812320", None, "bm_businesses category dry_cleaning; hazwaste SIC 7216", "perc phase-out", "bm_businesses"),
    ("salons", "Hair and beauty salons", "salon", "812112", None, "bm_businesses sector salon", "foil, colour tubes, hair; PFAS cosmetics switch", "bm_businesses"),
    ("printers", "Commercial printers", "retail", "323111", None, "bm_businesses category printing_services; hazwaste SIC 2752/2759", "aluminium plates", "bm_businesses"),
    ("hotels", "Hotels", "lodging", "721110", None, "bm_businesses sector lodging", "linens, soap, food waste", "bm_businesses"),
    ("grocers", "Grocery stores and supermarkets", "retail", "445110", None, "bm_businesses category grocery_store/supermarket", "HFC racks; food waste", "bm_businesses"),
    ("lenders_equipment", "Equipment lenders and SBA 7(a) lenders", None, "522", None, "bm_sba lender column", "finance the replacement machine", "bm_sba"),
]

# Sector x material templates. Fields:
# id, sector, category_like, material_id, direction, qty_per_unit, per, period, unit,
# unit_cost_usd, lead_time_days, sourcing_pain, question_id, confidence, source_id, basis, note
#
# qty_per_unit x units(per) x period_factor = qty_per_year.
TEMPLATES = [
    # restaurants: UCO. Restaurant Technologies quotes collectors paying per gallon; volume per restaurant is
    # the weak link and is marked illustrative until invoices or a collector quote exist.
    ("t_rest_uco", "restaurant", None, "uco", "out", 25.0, "business", "week", "gal", -2.5, None, 0, "throws_away", 0.3, "uco_collect", "illustrative", "25 gal/week is a mid fryer restaurant; collectors pay ~$2.50/gal (Jacobsen via Grease Connections). Sizing needs a collector quote."),
    ("t_rest_trap", "restaurant", None, "trap_grease", "out", 4.0, "business", "year", "each", 300.0, None, 0, "legally_required", 0.4, "web", "illustrative", "quarterly pumping at ~$300; FOG programmes require it"),
    ("t_rest_food", "restaurant", None, "food_waste", "out", 0.5, "business", "week", "ton", 90.0, None, 0, "throws_away", 0.3, "hennepin_ord13", "illustrative", "the Ordinance 13 threshold is 1 ton/week of trash; half of it food is the county's own share figure"),
    ("t_rest_cardboard", "restaurant", None, "cardboard", "out", 2.0, "business", "week", "each", 0.0, None, 0, "throws_away", 0.3, "web", "illustrative", "loose OCC in the dumpster"),
    ("t_rest_hfc", "restaurant", None, "hfc_refrigerant", "in", 1.0, "business", "year", "each", 0.0, None, 0, "legally_required", 0.6, "epa_hfc_err", "benchmark", "one walk-in or reach-in bank per restaurant; leak repair applies only at >= 15 lb charge, which a walk-in often crosses"),
    ("t_rest_ice", "restaurant", None, "reclaimed_hfc", "in", 1.0, "business", "year", "each", 0.0, None, 0, "legally_required", 0.7, "epa_hfc_err", "benchmark", "an automatic commercial ice maker per restaurant; reclaimed-only servicing from 2029-01-01"),
    ("t_cafe_grounds", "cafe", "coffee", "coffee_grounds", "out", 7.5, "business", "day", "lb", 0.0, None, 0, "throws_away", 0.5, "coffee_grounds", "benchmark", "GroCycle: cafes hand out 5-10 lb bags daily. Category-scoped 2026-09-30: sector cafe also holds ice-cream shops, smoothie bars, bakeries and NAICS 722515 sports concessions, none of which brew"),
    ("t_cafe_grounds_cafe", "cafe", "cafe", "coffee_grounds", "out", 7.5, "business", "day", "lb", 0.0, None, 0, "throws_away", 0.5, "coffee_grounds", "benchmark", "the cafe and cafeteria categories; same benchmark"),
    ("t_cafe_ice", "cafe", None, "reclaimed_hfc", "in", 1.0, "business", "year", "each", 0.0, None, 0, "legally_required", 0.5, "epa_hfc_err", "benchmark", "ice maker"),
    ("t_bar_ice", "bar", None, "reclaimed_hfc", "in", 1.0, "business", "year", "each", 0.0, None, 0, "legally_required", 0.7, "epa_hfc_err", "benchmark", "ice maker; walk-in keg cooler"),
    ("t_brew_grain", "bar", "brewery", "spent_grain", "out", 70.0, "business", "year", "lb", 0.0, None, 0, "throws_away", 0.5, "spent_grain", "illustrative", "70 lb wet per barrel is cited; barrels per taproom per year is not, so this stays a placeholder until a taproom declares its output"),
    ("t_brew_co2", "bar", "brewery", "co2", "in", 1.0, "business", "year", "each", 0.0, None, 3, "hard_to_source", 0.4, "web", "illustrative", "2022 CO2 shortage hit taprooms; volume unknown"),
    ("t_auto_oil", "auto", None, "used_oil", "out", 400.0, "business", "year", "gal", 0.0, None, 0, "throws_away", 0.3, "mn_325e112", "illustrative", "volume per shop needs a collector quote"),
    ("t_auto_cores", "auto", None, "lead_acid_batteries", "out", 100.0, "business", "year", "each", -8.0, None, 0, "throws_away", 0.3, "web", "illustrative", "core value ~$8; volume unknown"),
    ("t_auto_tires", "auto", None, "scrap_tires", "out", 500.0, "business", "year", "each", 3.0, None, 0, "throws_away", 0.3, "web", "illustrative", "shops pay ~$3/tire to a hauler"),
    ("t_auto_cats", "auto", None, "catalytic_converters", "out", 20.0, "business", "year", "each", -100.0, None, 0, "throws_away", 0.2, "web", "illustrative", "PGM value; 2023 MN law requires documentation to sell"),
    ("t_auto_hw", "auto", None, "hazwaste_licence", "obligation", 1.0, "business", "year", "year", 0.0, None, 0, "legally_required", 0.9, "hennepin_hw_licence", "benchmark", "every shop with solvent, antifreeze or used oil holds a county licence"),
    ("t_dent_scrap", "health", "dent", "dental_scrap", "out", 1.0, "business", "year", "year", None, None, 0, "throws_away", 0.6, "dental_scrap", "benchmark", "average office ~$3,000/yr in refining returns; whether THIS office already sends a kit is unknown, so the summed value is a ceiling"),
    ("t_dent_amalgam", "health", "dent", "amalgam", "obligation", 1.0, "business", "year", "each", 250.0, None, 0, "legally_required", 0.7, "epa_dental", "benchmark", "separator cartridge change and one-time compliance report"),
    ("t_dent_hw", "health", "dent", "hazwaste_licence", "obligation", 1.0, "business", "year", "year", 0.0, None, 0, "legally_required", 0.9, "hennepin_hw_licence", "benchmark", "SIC 8021 is the second-largest generator class in Hennepin"),
    ("t_salon_foil", "salon", None, "salon_foil", "out", 2.0, "business", "week", "lb", 0.0, None, 0, "throws_away", 0.3, "web", "illustrative", "Green Circle Salons charges salons to recover this"),
    ("t_salon_pfas", "salon", None, "pfas_free_cosmetics", "in", 1.0, "business", "year", "each", 0.0, None, 2, "legally_required", 0.5, "mn_pfas", "benchmark", "cosmetics with intentionally added PFAS banned from sale 2025-01-01"),
    ("t_print_plates", "retail", "printing", "printing_plates", "out", 50.0, "business", "month", "lb", -0.5, None, 0, "throws_away", 0.3, "web", "illustrative", "clean aluminium scrap"),
    ("t_print_hw", "retail", "printing", "hazwaste_licence", "obligation", 1.0, "business", "year", "year", 0.0, None, 0, "legally_required", 0.9, "hennepin_hw_licence", "benchmark", "SIC 2752/2759 in the generator list"),
    ("t_dry_perc", "retail", "dry_clean", "perc_machine", "obligation", 1.0, "business", "year", "each", 0.0, None, 0, "legally_required", 0.7, "epa_pce", "benchmark", "each shop has one machine; generation unknown until inspected"),
    ("t_dry_replace", "retail", "dry_clean", "alt_solvent_machine", "in", 1.0, "business", "year", "each", 60000.0, 90, 4, "surprisingly_expensive", 0.4, "web", "illustrative", "replacement machine five figures; financing is the scale asymmetry"),
    ("t_dry_hw", "retail", "dry_clean", "hazwaste_licence", "obligation", 1.0, "business", "year", "year", 0.0, None, 0, "legally_required", 0.9, "hennepin_hw_licence", "benchmark", "SIC 7216"),
    ("t_hotel_linens", "lodging", None, "linens", "out", 20.0, "business", "week", "lb", 0.0, None, 0, "throws_away", 0.3, "web", "illustrative", None),
    ("t_hotel_food", "lodging", None, "food_waste", "out", 1.0, "business", "week", "ton", 90.0, None, 0, "legally_required", 0.3, "hennepin_ord13", "illustrative", "hotels are a named Ordinance 13 class"),
    ("t_hotel_hfc", "lodging", None, "reclaimed_hfc", "in", 4.0, "business", "year", "each", 0.0, None, 0, "legally_required", 0.6, "epa_hfc_err", "benchmark", "ice makers on every floor"),
    ("t_grocer_hfc", "retail", "grocery", "hfc_refrigerant", "in", 1.0, "business", "year", "each", 0.0, None, 0, "legally_required", 0.8, "epa_hfc_err", "benchmark", "supermarket racks: hundreds of lb; leak detection 2026/2027; reclaimed-only 2029"),
    ("t_grocer_food", "retail", "grocery", "food_waste", "out", 2.0, "business", "week", "ton", 90.0, None, 0, "legally_required", 0.4, "hennepin_ord13", "illustrative", "grocers are a named Ordinance 13 class"),
    ("t_bakery_bread", "retail", "bakery", "day_old_bread", "out", 50.0, "business", "week", "lb", 0.0, None, 0, "throws_away", 0.3, "web", "illustrative", None),
    ("t_all_recycling", None, None, "recycling_service", "obligation", 1.0, "business", "year", "year", 0.0, None, 0, "legally_required", 0.5, "mn_115a151", "benchmark", "applies at >= 4 cu yd/week of trash, NAICS 42-81, metro counties"),
]

# id, label, jurisdiction, rule, requires, applies_sector, applies_category, applies_test, material_id,
# frequency, effective, next_step, sunset, penalty, compliance_cost_usd, vendors_in_market, obscurity, source_id, verified, note
OBLIGATIONS = [
    ("o_hfc_leak", "HFC leak repair and records at >= 15 lb charge", "federal", "40 CFR 84 subpart C (AIM Act s.(h)), 2024", "inspect, repair within 30 days, keep records, report chronic leakers", "restaurant,cafe,bar,lodging,retail", "grocery", "appliance charge >= 15 lb HFC with GWP > 53", "hfc_refrigerant", "continuous", "2026-01-01", "2027-01-01", None, "EPA civil penalty per day per violation", 600.0, None, 4, "epa_hfc_err", True, "threshold fell from 50 lb to 15 lb; automatic leak detection on existing commercial refrigeration from 2027-01-01"),
    ("o_hfc_reclaimed", "Reclaimed-only HFC for servicing ice makers and supermarket systems", "federal", "40 CFR 84 subpart C", "service automatic commercial ice makers, supermarket systems and refrigerated transport with reclaimed HFC only", "restaurant,cafe,bar,lodging,retail", "grocery", "owns an automatic commercial ice maker or supermarket rack", "reclaimed_hfc", "continuous", "2029-01-01", "2029-01-01", None, None, None, None, 5, "epa_hfc_err", True, "manufactures demand for reclaimed gas and for recovery at every decommissioning"),
    ("o_ord13", "Hennepin Ordinance 13 food-waste recycling", "Hennepin", "Hennepin County Ordinance 13 (2018 rev.)", "restaurants, hotels, grocers, residential care and offices with dining that generate >= 1 ton/week of trash must have organics recycling", "restaurant,lodging,retail", "grocery", ">= 1 ton of trash per week", "organics_service", "continuous", "2020-01-01", None, None, "county enforcement, education first", 2400.0, None, 2, "hennepin_ord13", True, "compliance status per business is a county record we do not hold"),
    ("o_115a151", "Metro commercial recycling of three materials", "metro", "Minn. Stat. 115A.151", "commercial buildings in metro counties with NAICS 42-81 tenants contracting >= 4 cu yd/week of trash must recycle at least three materials", None, None, ">= 4 cubic yards per week of solid waste collection", "recycling_service", "continuous", "2016-01-01", None, None, None, 1200.0, None, 2, "mn_115a151", True, None),
    ("o_pce_new", "No PCE in newly acquired dry-cleaning machines", "federal", "TSCA s.6 PCE rule, 89 FR (2024-12-18)", "any machine acquired on or after 2025-06-16 may not use PCE", "retail", "dry_clean", None, "perc_machine", "once", "2025-06-16", "2027-12-20", None, "TSCA", None, None, 4, "epa_pce", True, None),
    ("o_pce_3rd", "PCE prohibited in third-generation machines", "federal", "TSCA s.6 PCE rule", "retire or convert third-generation machines", "retail", "dry_clean", "machine generation = 3", "perc_machine", "once", "2027-12-20", "2027-12-20", None, "TSCA", 60000.0, None, 4, "epa_pce", True, "the first hard clock on every perc shop"),
    ("o_pce_all", "PCE prohibited in all dry cleaning", "federal", "TSCA s.6 PCE rule", "retire every perc machine", "retail", "dry_clean", None, "perc_machine", "once", "2034-12-19", "2034-12-19", None, "TSCA", 60000.0, None, 4, "epa_pce", True, None),
    ("o_dental", "Amalgam separator and one-time compliance report", "federal", "40 CFR 441 (2017-06-14)", "operate an ISO 11143 separator; no scrap amalgam to drain; no bleach line cleaners; file a one-time report", "health", "dent", "places or removes amalgam", "amalgam", "once", "2020-07-14", None, None, "CWA pretreatment", 1500.0, None, 3, "epa_dental", False, "existing offices' compliance date read from memory of the rule, not off the page fetched; verify"),
    ("o_hw_licence", "Hennepin hazardous waste generator licence", "Hennepin", "Hennepin County Ordinance 7", "any generator must hold an annual licence (May 1 to April 30), submit a management plan summary, and be inspected", "auto,health,retail,salon", None, "generates any hazardous waste; VSQG <= 220 lb/month", "hazwaste_licence", "annual", "2026-05-01", "2027-05-01", None, "county", 300.0, None, 2, "hennepin_hw_licence", True, "13,049 open licences on the county's public layer"),
    ("o_pfas_ban", "PFAS banned in 11 product categories", "Minnesota", "Minn. Stat. 116.943 (Amara's Law)", "no sale of carpets, cleaning products, cookware, cosmetics, dental floss, fabric treatments, juvenile products, menstruation products, textile furnishings, ski wax, upholstered furniture with intentionally added PFAS", "salon,spa,retail,restaurant", None, "sells or uses a banned category", "pfas_free_cosmetics", "continuous", "2025-01-01", "2032-01-01", None, "MPCA", None, None, 3, "mn_pfas", True, "2032: all products unless currently unavoidable use"),
    ("o_pfas_report", "PFAS in products reporting", "Minnesota", "Minn. Stat. 116.943; Minn. R. 7026", "manufacturers of products with intentionally added PFAS sold in MN report to MPCA and pay $800", None, None, "is a manufacturer", "pfas_report", "once", "2026-09-15", "2026-09-15", None, "MPCA", 800.0, None, 4, "mn_pfas", True, "deadline moved from 2026-07-01 to 2026-09-15 on 2026-04-15; one 90-day extension on request"),
    ("o_epr", "Packaging producer responsibility", "Minnesota", "Packaging Waste and Cost Reduction Act (2024)", "producers of packaging, food packaging and paper join a PRO; no covered material without a PRO agreement from 2029", None, None, "producer with >= $2M global revenue and >= 1 ton into MN", "cardboard", "annual", "2025-07-01", "2029-01-01", None, "MPCA", None, None, 4, "mn_epr", True, "whether a restaurant's takeout packaging makes it a producer is the open question"),
    ("o_benchmark", "Building energy benchmarking >= 50,000 sq ft", "Minnesota", "Saint Paul ordinance (2020-2025), now the 2024 state law", "benchmark energy and water in Portfolio Manager annually by June 1", None, None, "building >= 50,000 sq ft", "energy_benchmark", "annual", "2026-06-01", "2027-06-01", None, "city / Commerce", 500.0, None, 3, "stp_benchmarking", True, "the filing carries gross floor area, which six counties do not publish"),
    ("o_sos_renewal", "Annual renewal with the Secretary of State", "Minnesota", "Minn. Stat. 322C.0210 (LLC), 302A.821 (corp)", "file an annual renewal each calendar year; miss it and the state administratively dissolves the entity", None, None, "is an LLC or corporation", "sos_renewal", "annual", "2026-01-01", "2026-12-31", None, "administrative dissolution: loss of good standing, of the name, and of the liability shield's paperwork", 0.0, None, 4, "mn_sos_renewal", True, "free for most; filed from any account by anyone the business authorizes"),
    ("o_used_oil", "Used motor oil acceptance without fee", "Minnesota", "Minn. Stat. 325E.112", "a business accepting used motor oil may not charge for <= 10 gal per person per month", "auto", None, "sells motor oil at retail", "used_oil", "continuous", None, None, None, None, None, None, 3, "mn_325e112", True, None),
]

# id, material_id, side, buyer_class_id, geography, price_usd, unit, observed, low, high, source_id, basis, note
PRICES = [
    ("p_uco_usda", "uco", "purchase", "renderers", "US", 0.31, "lb", "2026-09-28", 0.21, 0.41, "uco_prices", "declared", "USDA yellow grease range"),
    ("p_uco_gulf", "uco", "purchase", "renderers", "Gulf", 0.485, "lb", "2025-03-31", 0.47, 0.50, "uco_prices", "declared", "Fastmarkets Jacobsen Q1 2025 UCO Gulf benchmark"),
    ("p_uco_restaurant", "uco", "collection", "renderers", "US", 3.0, "gal", "2026-09-28", 2.5, 3.5, "uco_collect", "declared", "what collectors pay a restaurant for quality oil"),
    ("p_uco_mn_usda", "uco", "purchase", "renderers", "Minnesota", 0.54, "lb", "2026-09-25", 0.51, 0.59, "usda_ams", "declared", "USDA AMS yellow grease, Minnesota, FOB; 40 c/lb a year ago"),
    ("p_grain_feed_sub", "spent_grain", "substitute", None, "Minnesota", 0.0275, "lb", "2026-09-25", None, None, "usda_ams", "declared", "wet distillers grains at $55/ton: what a feeder or a bakery-feed buyer pays for the wet feed spent grain replaces"),
    ("p_grain_wdg_sub", "spent_grain", "purchase", "cattle_farms", "Minnesota", 0.0275, "lb", "2026-09-25", None, None, "usda_ams", "declared", "wet distillers grains at $55/ton, the feed a lot compares wet spent grain against"),
    ("p_grain_market", "spent_grain", "purchase", "cattle_farms", "US", 0.02, "lb", "2026-09-28", 0.0, 0.04, "spent_grain", "declared", "$40 per wet ton open market; most is given away"),
    ("p_grain_disposal", "spent_grain", "disposal", None, "US", -0.03, "lb", "2026-09-28", None, None, "spent_grain", "illustrative", "landfill tip fee when no farmer takes it"),
    ("p_grounds", "coffee_grounds", "purchase", "mushroom_farms", "US", 0.0, "lb", "2026-09-28", 0.0, 0.0, "coffee_grounds", "declared", "cafes set bags aside free"),
    ("p_grounds_compost_sub", "coffee_grounds", "substitute", None, "metro", 0.03, "lb", "2026-09-30", 0.025, 0.24, "dakota_prairie", "declared", "finished compost $30/cu yd bulk (~1,000-1,200 lb) is what a garden shop or landscaper pays for the soil amendment grounds replace; bagged is $9.50/bag, ~$0.24/lb, the high end"),
    ("p_dental", "dental_scrap", "collection", "refiners", "US", 3000.0, "year", "2026-09-28", 500.0, 10000.0, "dental_scrap", "declared", "average refining return per office per year"),
    ("p_food_disposal", "food_waste", "disposal", None, "metro", -90.0, "ton", "2026-09-28", None, None, "web", "illustrative", "metro landfill/transfer tip fee order of magnitude"),
    ("p_organics_service", "organics_service", "purchase", "organics_haulers", "metro", 2400.0, "year", "2026-09-28", 1200.0, 4800.0, "web", "illustrative", "a weekly organics cart for a restaurant"),
    ("p_cores", "lead_acid_batteries", "collection", "scrap_yards", "US", 8.0, "each", "2026-09-28", 5.0, 12.0, "web", "illustrative", None),
    ("p_tires", "scrap_tires", "disposal", None, "metro", -3.0, "each", "2026-09-28", None, None, "web", "illustrative", None),
    ("p_cats", "catalytic_converters", "collection", "scrap_yards", "US", 100.0, "each", "2026-09-28", 30.0, 500.0, "web", "illustrative", None),
    ("p_plates", "printing_plates", "collection", "scrap_yards", "US", 0.5, "lb", "2026-09-28", 0.4, 0.7, "web", "illustrative", "clean aluminium scrap"),
    ("p_alt_machine", "alt_solvent_machine", "purchase", "dry_cleaners", "US", 60000.0, "each", "2026-09-28", 40000.0, 150000.0, "web", "illustrative", None),
    ("p_leak_service", "leak_inspection", "purchase", "restaurants", "metro", 600.0, "year", "2026-09-28", 300.0, 1500.0, "web", "illustrative", "quarterly inspection and records for one walk-in"),
    ("p_hw_licence", "hazwaste_licence", "purchase", None, "Hennepin", 300.0, "year", "2026-09-28", 100.0, 1000.0, "hennepin_hw_licence", "illustrative", "fee scales with generator size"),
    ("p_pfas_report", "pfas_report", "purchase", None, "Minnesota", 800.0, "each", "2026-09-28", 800.0, 800.0, "mn_pfas", "declared", "one-time reporting fee"),
]

# Takers on the block: a neighbour that can USE a discarded material. Filter is SQL on
# business_site alias b. Added 2026-09-30.
# id, material_id, label, side_b_filter, use, price_id, absorb_per_year, unit, source_id, basis, note
TAKERS = [
    ("k_grounds_garden", "coffee_grounds", "Garden centres, nurseries and landscapers",
     "lower(b.category) IN ('nursery_and_gardening', 'gardener', 'landscaping', 'landscaping_services', 'urban_farm', 'botanical_garden')",
     "soil amendment and compost feedstock in place of bought compost", "p_grounds_compost_sub", None, "lb", "coffee_grounds", "declared",
     "GroCycle and Starbucks' Grounds for Your Garden (since 1995) both describe cafes handing grounds to gardeners; how much one shop can use is not cited"),
    ("k_grounds_florist", "coffee_grounds", "Florists and flower shops",
     "lower(b.category) = 'florist' OR (lower(b.category) = 'flowers_and_gifts_shop' AND (lower(b.name) LIKE '%flor%' OR lower(b.name) LIKE '%flower%' OR lower(b.name) LIKE '%bloom%' OR lower(b.name) LIKE '%petal%' OR lower(b.name) LIKE '%blossom%' OR lower(b.name) LIKE '%plant%'))",
     "potting and planter mix for the plants they grow or sell", "p_grounds_compost_sub", None, "lb", "coffee_grounds", "declared",
     "Aidan's example, 2026-09-30: the flower shop that walks across the street for the cafe's grounds. Overture files mall gift shops (Spencer's, BoxLunch) under flowers_and_gifts_shop, so that category counts only with a floral name"),
    ("k_grain_bakery", "spent_grain", "Bakeries",
     "lower(b.category) LIKE '%bakery%'",
     "flour extender in bread and crackers", "p_grain_feed_sub", None, "lb", "spent_grain", "declared",
     "Brewers Association Brews to Barns names bakeries among spent-grain takers; ReGrained built a product on it. Value floor is the feed price, not flour"),
    ("k_grain_farm", "spent_grain", "Urban farms and farmers markets",
     "lower(b.category) IN ('farm', 'urban_farm', 'dairy_farm', 'poultry_farm', 'farmers_market')",
     "animal feed and compost", "p_grain_feed_sub", None, "lb", "spent_grain", "declared", None),
]

# id, buyer_class_id, material_id, qty_per_year, unit, price_paid_usd, lead_time_days, sourcing_pain, urgency_clock, geography, source_id, basis, note
DEMAND = [
    ("d_renderers_uco", "renderers", "uco", None, "lb", 0.485, 0, 2, "renewable diesel capacity coming online 2026 (NRA projects a 4-7% lift)", "US", "uco_prices", "declared", None),
    ("d_farms_grain", "cattle_farms", "spent_grain", None, "lb", 0.02, 0, 1, "seasonal feed cost", "metro radius", "spent_grain", "declared", None),
    ("d_mushroom_grounds", "mushroom_farms", "coffee_grounds", None, "lb", 0.0, 0, 2, "weekly grow cycle", "metro", "coffee_grounds", "declared", None),
    ("d_refiners_dental", "refiners", "dental_scrap", None, "year", 3000.0, 0, 1, "none; refiners already mail kits", "US", "dental_scrap", "declared", "a 130-year-old industry"),
    ("d_haulers_organics", "organics_haulers", "organics_service", None, "year", 2400.0, 0, 1, "Ordinance 13 enforcement", "Hennepin", "hennepin_ord13", "illustrative", None),
    ("d_contractors_leak", "mechanical_contractors", "leak_inspection", None, "year", 600.0, 0, 1, "2026-01-01 leak repair; 2027-01-01 leak detection", "metro", "epa_hfc_err", "illustrative", None),
    ("d_reclaimers_hfc", "hfc_reclaimers", "hfc_refrigerant", None, "lb", None, 0, 3, "reclaimed-only servicing 2029-01-01; virgin HFC production capped", "US", "epa_hfc_err", "declared", "recovered gas becomes the input"),
    ("d_dealers_machines", "drycleaning_dealers", "alt_solvent_machine", None, "each", 60000.0, 90, 2, "2027-12-20 third-gen ban; 2034-12-19 all", "US", "epa_pce", "illustrative", None),
    ("d_contractors_reclaim", "mechanical_contractors", "reclaimed_hfc", None, "lb", None, 0, 2, "2029-01-01", "metro", "epa_hfc_err", "declared", "the same contractors who service the ice maker sell the reclaimed gas"),
    ("d_contractors_recover", "mechanical_contractors", "hfc_refrigerant", None, "lb", None, 0, 2, "recovery at decommissioning", "metro", "epa_hfc_err", "declared", "recovery is a certified-technician job"),
    ("d_scrap_plates", "scrap_yards", "printing_plates", None, "lb", 0.5, 0, 1, None, "metro", "web", "illustrative", None),
    ("d_scrap_cats", "scrap_yards", "catalytic_converters", None, "each", 100.0, 0, 2, "2023 MN documentation law", "metro", "web", "illustrative", None),
]

# id, name, role, material_id, trade, founded, scale, geography, pays_or_charges, price_usd, price_unit, source_id, basis
COUNTERPARTIES = [
    ("cp_northwest", "Northwest Registered Agent", "filer", "sos_renewal", None, 1998, "national", "US", "charges", None, None, "web", "declared"),
    ("cp_zenbusiness", "ZenBusiness", "filer", "sos_renewal", None, 2015, "national", "US", "charges", None, None, "web", "declared"),
    ("cp_legalzoom", "LegalZoom", "filer", "sos_renewal", None, 2001, "national", "US", "charges", None, None, "web", "declared"),
    ("cp_sanimax", "Sanimax", "renderer", "uco", None, 1939, "national", "South Saint Paul plant", "pays", 3.0, "gal", "web", "declared"),
    ("cp_darling", "Darling Ingredients", "renderer", "uco", None, 1882, "national", "US", "pays", None, None, "web", "declared"),
    ("cp_safety_kleen", "Safety-Kleen", "collector", "used_oil", None, 1968, "national", "US", "unknown", None, None, "web", "declared"),
    ("cp_garfield", "Garfield Refining", "refiner", "dental_scrap", None, 1892, "national", "US", "pays", 3000.0, "year", "dental_scrap", "declared"),
    ("cp_smsc", "SMSC Organics Recycling Facility", "processor", "food_waste", None, 2011, "regional", "Shakopee", "charges", None, None, "web", "declared"),
    ("cp_green_circle", "Green Circle Salons", "collector", "salon_foil", None, 2009, "national", "US + Canada", "charges", None, None, "web", "declared"),
    ("cp_clean_world", "Clean the World", "collector", "hotel_soap", None, 2009, "national", "US", "charges", None, None, "web", "declared"),
]

# id, label, kind, reaches, material_id, strength, source_id, note
ACCESS_ASSETS = [
    ("a_hazwaste", "13,049 open Hennepin hazardous-waste generators on parcel ids with SIC and last inspection", "dataset", "side_a", "hazwaste_licence", 5, "hennepin_hazwaste", "names every dentist, auto shop, printer and dry cleaner the county licenses; nobody else joins it to parcels and businesses"),
    ("a_businesses", "88,433 businesses on commercial parcels with sector and category", "dataset", "side_a", None, 4, "bm_businesses", None),
    ("a_permits", "48,266 commercial permits with the firm that pulled each", "dataset", "side_b", "leak_inspection", 4, "bm_permits", "the mechanical contractors who will sell HFC compliance are already enumerated with their sites"),
    ("a_sba", "8,822 SBA borrowers with lender, amount and jobs", "dataset", "both", "alt_solvent_machine", 3, "bm_sba", "which dry cleaners and restaurants already borrow, and from whom"),
    ("a_footprints", "Measured footprints on 807,532 parcels; derived area on 20,540", "dataset", "side_a", "building_area", 4, "bm_corridors", "sizes the benchmarking population without the assessor"),
    ("a_events", "WARN, wrecking, vacancy and sale events on parcels", "dataset", "side_a", None, 3, "bm_teardowns", "the clock"),
    ("a_reviews", "46,320 reviews on 193 places", "dataset", "side_a", None, 1, "bm_reviews", "the post ranks the review corpus lowest; kept for what it says about volume"),
]

# opportunities counted by parcel rather than by business: a building-level fact
COUNT_BY_SITE = {"op_benchmark_area", "op_teardown_recovery"}

# id, label, material_id, asymmetry_id, side_a_filter, side_a_role, side_b_class_id, side_b_role, obligation_id,
# value_basis, obscurity, urgency, urgency_clock, access_advantage, competition, accessibility, note, source_id
#
# side_a_filter is SQL over the view `business_site` (business b joined to site s).
OPPORTUNITIES = [
    ("op_hfc_leak", "Walk-in and rack owners who must now inspect and log leaks", "leak_inspection", "regulatory",
     "b.sector IN ('restaurant','cafe','bar','lodging') OR b.category LIKE '%grocery%' OR b.category LIKE '%supermarket%'",
     "must_comply", "mechanical_contractors", "services", "o_hfc_leak", "compliance service price x businesses", 4, 5, "2026-01-01 in force; 2027-01-01 leak detection on existing commercial refrigeration", 4, 2, 4,
     "the contractors are enumerated in the permit register; the owners are enumerated here; neither knows the rule", "epa_hfc_err"),
    ("op_hfc_reclaim", "Ice-maker and supermarket-rack owners facing reclaimed-only servicing", "reclaimed_hfc", "regulatory",
     "b.sector IN ('restaurant','cafe','bar','lodging') OR b.category LIKE '%grocery%' OR b.category LIKE '%supermarket%'",
     "must_comply", "hfc_reclaimers", "buys", "o_hfc_reclaimed", "unpriced: recovered gas per decommissioning", 5, 3, "2029-01-01", 3, 2, 3,
     "recovered HFC becomes the scarce input; every closure and teardown is a recovery event", "epa_hfc_err"),
    ("op_pce", "Perc dry cleaners facing the 2027 and 2034 bans", "alt_solvent_machine", "regulatory",
     "b.category LIKE '%dry_clean%' OR b.sic = 7216",
     "must_comply", "drycleaning_dealers", "sells", "o_pce_3rd", "replacement machine price x shops", 4, 4, "2027-12-20 third-gen; 2034-12-19 all", 4, 3, 3,
     "scale asymmetry too: a $60k machine for a $300k shop is the customer nobody's financing fits; the site is also a future MPCA cleanup", "epa_pce"),
    ("op_uco", "Restaurants giving away or paying to lose fryer oil that renderers buy at Gulf benchmark", "uco", "waste_stream",
     "b.sector = 'restaurant'",
     "disposes", "renderers", "buys", None, "collection price x gallons", 1, 2, "renewable diesel capacity 2026", 3, 5, 2,
     "a 140-year-old industry (Darling 1882, Sanimax 1939 with a plant in South Saint Paul); the only seam is which shops are on no contract", "uco_prices"),
    ("op_dental_scrap", "Dental offices leaving refining returns on the bench", "dental_scrap", "knowledge",
     "b.category LIKE '%dent%' OR b.sic = 8021",
     "holds", "refiners", "buys", None, "CEILING: $3,000/yr x every office; the share already selling is unknown", 2, 1, "none", 3, 5, 2,
     "Garfield Refining has mailed kits since 1892; the value is in which offices have never sent one, which no record shows", "dental_scrap"),
    ("op_ord13", "Large food-waste generators without organics service", "organics_service", "regulatory",
     "(b.sector IN ('restaurant','lodging') OR b.category LIKE '%grocery%' OR b.category LIKE '%supermarket%') AND b.county = 'hennepin'",
     "must_comply", "organics_haulers", "services", "o_ord13", "service price x non-compliant businesses", 2, 2, "in force since 2020; enforcement is educational", 2, 3, 3,
     "the county holds the compliance list and we do not; without it this is a service everyone already sells", "hennepin_ord13"),
    ("op_spent_grain", "Taprooms with no farmer for their grain", "spent_grain", "waste_stream",
     "b.category LIKE '%brewery%'",
     "disposes", "cattle_farms", "buys", None, "$40/wet ton x barrels", 2, 1, "none; brewery closures are the clock", 2, 2, 3,
     "90% already reused nationally; the seam is the small taproom that lacks the farmer contact", "spent_grain"),
    ("op_coffee_grounds", "Cafes bagging grounds for whoever asks", "coffee_grounds", "waste_stream",
     "lower(b.category) LIKE '%coffee%' OR lower(b.category) LIKE 'cafe%'",
     "disposes", "mushroom_farms", "buys", None, "$0; volume only", 2, 1, "none", 3, 1, 3,
     "obscure and accessible, and worth nothing per pound: the post's own warning about trivia", "coffee_grounds"),
    ("op_hazwaste_vsqg", "Very small generators paying full-service haulers for county-collectable waste", "hazwaste_licence", "scale",
     "b.status = 'licensed:VSQG'",
     "must_comply", "used_oil_collectors", "services", "o_hw_licence", "unpriced: hauler fee vs county VSQG programme", 3, 2, "annual licence renewal May 1", 5, 3, 4,
     "8,626 VSQGs; the county's own collection programme takes <= 220 lb/month; who pays a national hauler instead is the list", "hennepin_hazwaste"),
    ("op_benchmark_area", "Buildings over 50,000 sq ft whose gross area is now a public filing", "building_area", "knowledge",
     "s.footprint_sqft >= 25000",
     "holds", None, None, "o_benchmark", "unpriced: the filing carries the number six counties do not publish", 4, 2, "June 1 annual filing", 4, 1, 3,
     "footprint >= 25,000 at two storeys crosses 50,000; the state's benchmarking disclosure is the route to measured area", "stp_benchmarking"),
    ("op_pfas_salons", "Salons and spas that must have switched cosmetics and cleaning products", "pfas_free_cosmetics", "regulatory",
     "b.sector IN ('salon','spa')",
     "buys", "cosmetics_makers", "sells", "o_pfas_ban", "unpriced: product switch", 3, 2, "2025-01-01 in force; 2032 everything", 2, 3, 2,
     "the ban falls on manufacturers and sellers; the salon's exposure is what it retails", "mn_pfas"),
    ("op_epr_packaging", "Restaurants whose takeout packaging may make them producers", "cardboard", "regulatory",
     "b.sector IN ('restaurant','cafe')",
     "must_comply", None, None, "o_epr", "unpriced until the producer definition is settled", 4, 2, "2029-01-01", 2, 2, 1,
     "accessibility gated: whether a restaurant is a producer is unresolved, and the de minimis line exempts most", "mn_epr"),
    ("op_auto_streams", "Auto shops with four sellable waste streams and one hazwaste licence", "used_oil", "waste_stream",
     "b.sector = 'auto' OR b.sic IN (7538, 7532, 7549, 5541)",
     "disposes", "used_oil_collectors", "buys", "o_hw_licence", "unpriced: collector quotes needed", 2, 2, "licence renewal May 1; crude price", 4, 4, 3,
     "the largest generator class in Hennepin (SIC 7538: 1,361); oil, cores, converters and tires each have a buyer and each is priced per pickup", "hennepin_hazwaste"),
    ("op_rcra_violators", "Hazardous-waste handlers with a violation since 2021", "hazwaste_licence", "regulatory",
     "b.id IN (SELECT business_id FROM event WHERE kind = 'violation' AND happened >= DATE '2021-01-01')",
     "must_comply", "used_oil_collectors", "services", "o_hw_licence", "unpriced: return-to-compliance work per cited violation", 3, 4, "the violation date and its scheduled compliance date", 4, 3, 4,
     "measured, not templated: EPA and MPCA already cited these handlers; a return-to-compliance date is on the record", "echo_rcra"),
    ("op_sos_dissolved", "Operating businesses whose LLC or corporation the state has dissolved", "sos_reinstatement", "knowledge",
     "b.id IN (SELECT business_id FROM sos_status GROUP BY 1 HAVING BOOL_OR(status = 'inactive' AND filing_type NOT LIKE 'Assumed%') AND NOT BOOL_OR(status = 'active' AND filing_type NOT LIKE 'Assumed%'))",
     "must_comply", None, None, "o_sos_renewal", "unpriced: reinstatement fee plus our fee; the value is the entity back in good standing", 5, 3, "already dissolved", 4, 3, 5,
     "they are trading as a business the state says does not exist; we file the renewal and reinstatement from our own SOS account on their authorization", "mn_sos"),
    ("op_sos_renewal_due", "Active entities with no renewal filed yet this year", "sos_renewal", "regulatory",
     "b.id IN (SELECT business_id FROM sos_status WHERE status = 'active' AND filing_type NOT LIKE 'Assumed%' AND (last_renewal IS NULL OR last_renewal < DATE '2026-01-01'))",
     "must_comply", None, None, "o_sos_renewal", "unpriced: the renewal is free; the service is not missing it", 3, 4, "2026-12-31", 4, 3, 5,
     "the whole job is one filing a year from our account; the clock is December 31", "mn_sos"),
    ("op_assumed_lapsed", "Businesses trading under an assumed name the state has cancelled", "assumed_name_renewal", "knowledge",
     "b.id IN (SELECT business_id FROM sos_status GROUP BY 1 HAVING BOOL_OR(filing_type LIKE 'Assumed%') AND NOT BOOL_OR(filing_type LIKE 'Assumed%' AND status = 'active'))",
     "must_comply", None, None, None, "unpriced: refiling the name; the risk is someone else taking it", 4, 2, "the name is free for anyone to take", 4, 3, 5,
     "the storefront name is up for grabs; we refile it", "mn_sos"),
    ("op_teardown_recovery", "Commercial teardowns and closures as refrigerant and equipment recovery events", "hfc_refrigerant", "regulatory",
     "(s.teardown_permit = TRUE OR s.vacant_registered = TRUE) AND (b.sector IN ('restaurant','cafe','bar','lodging') OR b.category LIKE '%grocery%' OR b.category LIKE '%supermarket%')",
     "holds", "hfc_reclaimers", "buys", "o_hfc_reclaimed", "unpriced", 5, 4, "the wrecking permit date", 4, 1, 3,
     "the permit lands before the wrecking crew; the gas in the walk-in is worth more from 2029 than the walk-in", "bm_teardowns"),
]


# How each piece of work is filed. end_to_end is recomputed by the loader from
# filer and owner_action; the literal here is only a readable restatement.
# id, label, material_id, obligation_id, jurisdiction, channel, filer, owner_action, fee_to_agency_usd, deadline, source_id, quote, note
ROUTES = [
    ("r_sos_renewal", "SOS annual renewal, filed online from the preparer's own account", "sos_renewal", "o_sos_renewal", "Minnesota", "preparer_account", "preparer_with_authorization", "authorize", 0.0, "2026-12-31", "mn_sos_renewal",
     "any person who is affiliated with your business can file ... or someone outside the business (such as an attorney)", "registered-agent firms file this for clients from their own accounts"),
    ("r_sos_reinstate", "SOS reinstatement of a dissolved entity, online from the preparer's account", "sos_reinstatement", "o_sos_renewal", "Minnesota", "preparer_account", "preparer_with_authorization", "authorize", None, None, "mn_sos_renewal",
     "you may have it retroactively reinstated (as long as the name is still available) by filing a renewal for the current year and paying a fee", "fee amount not read off the page; verify before quoting"),
    ("r_assumed_name", "Assumed name renewal or refiling, online from the preparer's account", "assumed_name_renewal", None, "Minnesota", "preparer_account", "preparer_with_authorization", "authorize", None, "2026-12-31", "mn_sos_renewal", None, "same Business Filings Online system"),
    ("r_hw_metro", "County hazardous waste licence renewal (all seven metro counties)", "hazwaste_licence", "o_hw_licence", "7-county metro", "owner_portal", "unknown", "login", None, None, "hazwaste_forms",
     "Hennepin portal login; Ramsey rcxnet login; Dakota secure link to the business; Washington per-person SharePoint access; Anoka form mailed to the business; Scott inspector brings forms; Carver call the inspector", "no county publishes a preparer route"),
    ("r_unclaimed", "Unclaimed property claim for a business", "unclaimed_claim", None, "Minnesota", "public_portal", "preparer_with_authorization", "documents", None, None, "mn_unclaimed",
     "total compensation may not exceed 10% ... agreements ... through 24 months after the property is paid ... are void", "the claimant proves ownership with its own documents"),
    ("r_hfc_service", "Refrigerant leak inspection, repair and records", "leak_inspection", "o_hfc_leak", "federal", "in_person", "unknown", "appear", None, "2027-01-01", "epa_hfc_err", None, "a certified technician at the unit; physical work"),
    ("r_hfc_reclaim", "Servicing with reclaimed refrigerant", "reclaimed_hfc", "o_hfc_reclaimed", "federal", "in_person", "unknown", "appear", None, "2029-01-01", "epa_hfc_err", None, "physical work"),
    ("r_hfc_recover", "Refrigerant recovery at decommissioning", "hfc_refrigerant", None, "federal", "in_person", "unknown", "appear", None, None, "epa_hfc_err", None, "physical work"),
    ("r_pce", "Perc machine retirement and replacement", "alt_solvent_machine", "o_pce_3rd", "federal", "in_person", "owner_only", "appear", None, "2027-12-20", "epa_pce", None, "capital purchase and install; financing needs the owner's documents"),
    ("r_pce_machine", "Perc machine retirement", "perc_machine", "o_pce_3rd", "federal", "in_person", "owner_only", "appear", None, "2027-12-20", "epa_pce", None, None),
    ("r_benchmark", "Energy benchmarking in Portfolio Manager", "energy_benchmark", "o_benchmark", "Minnesota", "owner_portal", "preparer_with_authorization", "documents", None, "2027-06-01", "stp_benchmarking", None, "needs the owner's utility data"),
    ("r_building_area", "Measured building area from benchmarking filings", "building_area", None, "Minnesota", "public_portal", "anyone", "none", None, None, "mn_benchmarking", None, "data work, not a service to the owner"),
    ("r_pfas", "PFAS in products report", "pfas_report", "o_pfas_report", "Minnesota", "owner_portal", "unknown", "login", 800.0, "2026-09-15", "mn_pfas", None, None),
    ("r_pfas_switch", "Switching to PFAS-free products", "pfas_free_cosmetics", "o_pfas_ban", "Minnesota", "in_person", "owner_only", "appear", None, None, "mn_pfas", None, None),
    ("r_epr", "Packaging producer registration via a PRO", "cardboard", "o_epr", "Minnesota", "owner_portal", "unknown", "documents", None, "2029-01-01", "mn_epr", None, None),
    ("r_organics", "Organics collection service", "organics_service", "o_ord13", "Hennepin", "in_person", "unknown", "appear", None, None, "hennepin_ord13", None, "a truck"),
    ("r_dental_amalgam", "Dental amalgam one-time compliance report", "amalgam", "o_dental", "federal", "mail", "unknown", "documents", None, None, "epa_dental", None, "needs separator make, model and certification from the office"),
]
for _m in ("uco", "trap_grease", "food_waste", "spent_grain", "coffee_grounds", "cardboard", "used_oil", "lead_acid_batteries", "scrap_tires",
           "catalytic_converters", "dental_scrap", "salon_foil", "printing_plates", "linens", "day_old_bread", "recycling_service"):
    ROUTES.append((f"r_pickup_{_m}", f"Pickup and sale of {_m.replace('_', ' ')}", _m, None, "metro", "in_person", "unknown", "appear", None, None, "web", None, "physical: a truck, a route, a buyer"))
