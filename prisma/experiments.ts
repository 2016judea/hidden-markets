/**
 * The eighteen seed experiments.
 *
 * No prior definitions of these existed on disk when this was built
 * (2026-09-07), so each is authored here to the brief's shape: a falsifiable
 * hypothesis, an offer we could actually honour, the titles that would own the
 * problem, numeric success criteria against the 25-contact scout stage, and the
 * regulatory exposure that decides whether a transaction is even legal.
 *
 * Edit these freely — they are data, and the operator's judgement about a market
 * is worth more than the version written before any email went out.
 */
export type SeedExperiment = {
  slug: string;
  name: string;
  buyerPersona: string;
  hypothesis: string;
  likelyProblem: string;
  offer: string;
  targetTitles: string[];
  targetOrgTypes: string[];
  targetGeography: string;
  exclusionCriteria: string[];
  qualificationCriteria: string[];
  researchStrategy: string;
  successCriteria: string[];
  safetyNotes: string;
  monetizationPaths: string[];
  /**
   * Search phrases for the directory sweep, which enumerates for a tenth of a
   * cent per organization instead of seven. Empty means this buyer is not a
   * listed local business — a municipal utility, a permitted facility — and
   * discovery falls back to the model or to an imported public list.
   */
  directoryQueries: string[];
  /**
   * Metros to sweep, "City, ST". Optional — omitted means the default national
   * list in src/lib/domain/metros.ts. Set it when a hypothesis is regional.
   */
  directoryLocations?: string[];
};

export const SEED_EXPERIMENTS: SeedExperiment[] = [
  {
    slug: "funeral-homes-rush-memorial",
    name: "Funeral homes — rush memorial production",
    buyerPersona:
      "Owner or funeral director at an independent funeral home doing 60-300 services a year, who personally handles the family meeting and the printing.",
    hypothesis:
      "Independent funeral homes routinely need memorial print (folders, register books, boards, video tributes) produced in under 48 hours, and pay a premium or absorb staff overtime to hit it, because families finalise photos and wording late.",
    likelyProblem:
      "The gap between a family delivering photos and the service is often under two days, and the local printer's turnaround does not fit inside it.",
    offer:
      "We are researching how rush memorial print actually gets done. Nothing to sell yet — we want to know what happens when a family is late with the photos.",
    targetTitles: ["Owner", "Funeral Director", "General Manager", "Office Manager", "Preneed Director"],
    targetOrgTypes: ["Funeral home", "Funeral home group", "Crematory"],
    targetGeography: "United States",
    exclusionCriteria: [
      "Large corporate consolidators (SCI, StoneMor) — production is centralised and the local director has no discretion",
      "Cemetery-only operations with no service facility",
    ],
    qualificationCriteria: [
      "Independent or small group, under ~10 locations",
      "A named director or owner, not a generic info@ address",
      "Runs its own services rather than referring them out",
    ],
    researchStrategy:
      "State funeral director association member directories, state licensing boards (funeral establishments are licensed and the licensee is public), and NFDA member listings.",
    successCriteria: [
      "At least 4 of 25 describe a specific rush job in the last 90 days",
      "At least 2 name what they currently pay or the overtime it costs",
      "At least 1 asks us to quote or source something",
    ],
    safetyNotes:
      "Grief-adjacent. Never use urgency language, never reference a specific decedent or service, and never contact a family. Written contact with the business only. Several states regulate funeral-industry solicitation — check state rules before any paid engagement.",
    monetizationPaths: ["Rush print brokerage", "Overflow production matching", "Template/asset licensing"],
    directoryQueries: ["funeral home", "funeral director"],
  },
  {
    slug: "cemeteries-burial-record-digitization",
    name: "Cemeteries — burial-record digitization",
    buyerPersona:
      "Sexton, superintendent or board member of a municipal, religious or association cemetery whose burial records are on index cards, ledgers or a hand-drawn plot map.",
    hypothesis:
      "Small and mid-size cemeteries hold their authoritative burial and plot-ownership records on paper, cannot answer an ownership question quickly, and face a real liability when a plot is double-sold — enough to pay for digitisation.",
    likelyProblem:
      "The only complete record is a paper ledger and one person's memory, and that person is retiring.",
    offer:
      "We are researching how small cemeteries keep burial and plot-ownership records. We want to understand the failure cases, not sell software.",
    targetTitles: ["Sexton", "Cemetery Superintendent", "Cemetery Manager", "Board President", "City Clerk", "Public Works Director"],
    targetOrgTypes: ["Municipal cemetery", "Association cemetery", "Religious cemetery", "Rural cemetery district"],
    targetGeography: "United States",
    exclusionCriteria: ["Large corporate cemetery operators", "Cemeteries already on a named management platform"],
    qualificationCriteria: [
      "Under ~10,000 interments, or municipally run",
      "Evidence of paper records or a hand-drawn map",
      "A named steward we can write to",
    ],
    researchStrategy:
      "Municipal websites (cemetery is usually under Public Works or the Clerk), state cemetery board registries, and county association listings. Council minutes often name the sexton.",
    successCriteria: [
      "At least 5 of 25 confirm records are primarily on paper",
      "At least 2 describe a specific ownership dispute or lost record",
      "At least 1 asks what digitisation would cost",
    ],
    safetyNotes:
      "Burial records contain personal data about the deceased and plot owners. Never request or store records in this research phase. Some states regulate cemetery record retention — a digitisation engagement would need to meet the state's retention rule, not replace it.",
    monetizationPaths: ["Scanning and indexing service", "Record-search fulfilment", "Plot-map reconstruction"],
    directoryQueries: ["cemetery"],
  },
  {
    slug: "marinas-slip-waitlist",
    name: "Marinas — slip and waitlist operations",
    buyerPersona:
      "Harbormaster or marina manager running 80-500 slips with a multi-year waitlist kept in a spreadsheet.",
    hypothesis:
      "Marinas with waitlists longer than their slip count spend real staff time on waitlist administration and fairness disputes, and lose revenue to slips sitting empty between assignments.",
    likelyProblem:
      "The waitlist is a spreadsheet, position is contested, and nobody can tell a caller where they actually stand.",
    offer:
      "We are researching how marinas actually run their slip waitlists. We want to hear what breaks, not pitch you a system.",
    targetTitles: ["Harbormaster", "Marina Manager", "Dockmaster", "Operations Manager", "Port Director"],
    targetOrgTypes: ["Municipal marina", "Private marina", "Yacht club", "Port authority"],
    targetGeography: "United States coastal states and the Great Lakes",
    exclusionCriteria: ["Marinas under 40 slips", "Dry-stack-only facilities"],
    qualificationCriteria: ["80+ slips", "Evidence of a waitlist", "A named harbormaster or manager"],
    researchStrategy:
      "Municipal harbor department pages, state boating agency marina registries, and marina association directories. Municipal harbormasters are usually named on the city site.",
    successCriteria: [
      "At least 6 of 25 confirm a waitlist longer than one year",
      "At least 3 describe hours per week spent on it",
      "At least 1 names a dispute that cost them money or a slip",
    ],
    safetyNotes:
      "Waitlist data is personal data about boat owners. Municipal marinas may be subject to public-records law both ways — what they send us could itself be a public record.",
    monetizationPaths: ["Waitlist administration service", "Slip-turnover software", "Seasonal audit engagement"],
    directoryQueries: ["marina", "yacht club"],
  },
  {
    slug: "museums-collection-metadata",
    name: "Museums — collection metadata cleanup",
    buyerPersona:
      "Registrar or collections manager at a museum with 5,000-500,000 objects and a catalogue with known gaps.",
    hypothesis:
      "Small and mid-size museums hold catalogues with systematic metadata gaps that block grant reporting and online publication, and have periodic grant money that could pay to fix them.",
    likelyProblem:
      "The catalogue was migrated twice, the dimension fields are inconsistent, and nobody has time to reconcile 40,000 records.",
    offer:
      "We are researching where collection catalogues actually break. We would like to hear what your worst field is.",
    targetTitles: ["Registrar", "Collections Manager", "Curator", "Director of Collections", "Archivist"],
    targetOrgTypes: ["Museum", "Historical society", "University collection", "Botanical garden", "Archive"],
    targetGeography: "United States",
    exclusionCriteria: ["Institutions with in-house digital collections teams over 5 people", "Museums with no catalogue at all"],
    qualificationCriteria: ["A named registrar or collections manager", "Evidence of a collection database", "Not a national institution"],
    researchStrategy:
      "AAM and regional museum association member lists, state humanities council grantee lists (grantees have both catalogues and money), and IMLS grant award data.",
    successCriteria: [
      "At least 5 of 25 name a specific metadata problem",
      "At least 2 mention a grant that funds or could fund it",
      "At least 1 asks for a scope or a quote",
    ],
    safetyNotes:
      "Some collections carry cultural sensitivity and repatriation obligations (NAGPRA in the US). Never propose publishing or reprocessing culturally sensitive material. Object location data is a security matter and must never be requested.",
    monetizationPaths: ["Metadata remediation projects", "Grant-funded digitisation", "Controlled-vocabulary reconciliation"],
    directoryQueries: ["museum", "historical society"],
  },
  {
    slug: "commercial-laundries-linen-loss",
    name: "Commercial laundries — linen-loss reconciliation",
    buyerPersona:
      "Owner or operations manager of a commercial laundry serving hotels, restaurants or healthcare, billing customers for lost linen.",
    hypothesis:
      "Commercial laundries lose a measurable percentage of linen per cycle, cannot reconcile it against customer counts, and absorb or dispute the cost rather than resolving it.",
    likelyProblem:
      "Counts disagree at every handoff, and the argument with the customer costs more than the towels.",
    offer:
      "We are researching how linen loss is actually counted and argued about. We want the real numbers, not the brochure ones.",
    targetTitles: ["Owner", "General Manager", "Operations Manager", "Plant Manager", "Production Manager"],
    targetOrgTypes: ["Commercial laundry", "Linen service", "Healthcare laundry", "Uniform rental"],
    targetGeography: "United States",
    exclusionCriteria: ["National uniform-rental chains", "On-premise hotel laundries with no external customers"],
    qualificationCriteria: ["Independent operator", "Serves external customers", "A named owner or plant manager"],
    researchStrategy:
      "TRSA member listings, state health department laundry licences where they exist, and local business directories. Healthcare laundries are often accredited and listed.",
    successCriteria: [
      "At least 5 of 25 give a loss percentage or dollar figure",
      "At least 3 describe how they currently reconcile",
      "At least 1 asks about RFID or a counting method",
    ],
    safetyNotes:
      "Healthcare linen touches infection-control regulation (and in some states, licensure). Never advise on hygienic processing. Loss figures are commercially sensitive — treat them as confidential to this research.",
    monetizationPaths: ["Reconciliation service", "RFID/tracking integration brokerage", "Loss audit engagement"],
    directoryQueries: ["commercial laundry", "linen service"],
  },
  {
    slug: "mushroom-farms-substrate",
    name: "Mushroom farms — substrate sourcing",
    buyerPersona:
      "Owner or head grower at a commercial mushroom farm buying sawdust, straw, soy hulls, bran or grain by the pallet.",
    hypothesis:
      "Commercial mushroom growers face volatile substrate supply and price, buy from whoever answers the phone, and would value a reliable line on bulk hardwood sawdust and supplements.",
    likelyProblem:
      "The sawdust supplier is a sawmill with no interest in a small regular order, and a bad batch kills a whole run.",
    offer:
      "We are researching how substrate actually gets sourced. We want to know who you buy from and what goes wrong.",
    targetTitles: ["Owner", "Head Grower", "Farm Manager", "Production Manager", "Operations Manager"],
    targetOrgTypes: ["Mushroom farm", "Specialty mushroom producer", "Vertical farm", "Mushroom spawn producer"],
    targetGeography: "United States and Canada",
    exclusionCriteria: [
      "Hobby and home-grow operations — they supply themselves and have no budget line",
      "Psilocybin operations, in any jurisdiction",
    ],
    qualificationCriteria: ["Commercial scale — sells wholesale or to restaurants", "Buys substrate rather than making it from waste", "A named grower or owner"],
    researchStrategy:
      "State agriculture department producer directories, farmers-market vendor lists, specialty produce distributor supplier lists, and mushroom industry association membership.",
    successCriteria: [
      "At least 6 of 25 name their current substrate supplier or say they have none reliable",
      "At least 3 describe a supply failure or price shock",
      "At least 1 asks what we can source and at what volume",
    ],
    safetyNotes:
      "Strictly culinary and commercial species. Any reply touching psilocybin ends the thread immediately and the prospect is marked do-not-contact. Substrate for food production may fall under FSMA — never make a food-safety claim.",
    monetizationPaths: ["Substrate brokerage", "Group buying", "Supplier introductions"],
    directoryQueries: ["mushroom farm"],
  },
  {
    slug: "universities-equipment-surplus",
    name: "Universities — scientific equipment surplus and sourcing",
    buyerPersona:
      "Surplus property manager, lab manager or department purchasing officer at a university that both disposes of and needs used scientific equipment.",
    hypothesis:
      "University surplus programs sell working scientific equipment far below its replacement value while labs at other institutions buy the same equipment new, because neither side can see the other.",
    likelyProblem:
      "A working centrifuge goes to auction for $200 while a lab two states away budgets $9,000 for the same model.",
    offer:
      "We are researching how university surplus and lab equipment sourcing actually work at both ends. We would like to see what goes out and what comes in.",
    targetTitles: ["Surplus Property Manager", "Lab Manager", "Purchasing Manager", "Research Facilities Manager", "Director of Procurement"],
    targetOrgTypes: ["University", "Research institute", "Community college", "Teaching hospital"],
    targetGeography: "United States",
    exclusionCriteria: ["Institutions with no research function", "Contacts in central IT surplus only"],
    qualificationCriteria: ["Named surplus or lab contact", "Institution runs wet labs or instrumentation", "Public surplus program or lab purchasing authority"],
    researchStrategy:
      "University surplus property department pages (public universities almost all publish one), state surplus auction sites, and departmental lab manager listings.",
    successCriteria: [
      "At least 6 of 25 confirm they dispose of working equipment",
      "At least 3 name a specific instrument they needed and struggled to find",
      "At least 2 asks about a specific item",
    ],
    safetyNotes:
      "Lab equipment may carry chemical, biological or radiological contamination history, and some instruments (lasers, radiation sources, certain centrifuge rotors) carry disposal and licensing rules. Never represent decontamination status. Export-controlled instruments exist — a transaction would need ITAR/EAR screening.",
    monetizationPaths: ["Surplus-to-lab matching", "Consignment brokerage", "Equipment sourcing fee"],
    directoryQueries: ["university"],
  },
  {
    slug: "meat-processors-byproduct",
    name: "Meat processors — byproduct monetization",
    buyerPersona:
      "Owner or plant manager at a small or mid-size USDA-inspected meat processor paying to dispose of offal, bone, fat or hide.",
    hypothesis:
      "Small meat processors pay a renderer to remove byproducts that have buyers (pet food, bone broth, tallow, leather), because the renderer relationship is inherited and nobody has priced the alternatives.",
    likelyProblem: "They pay per pull for something someone else would pay them for.",
    offer:
      "We are researching what happens to byproduct at small plants and what it costs. We want the disposal invoice reality, not the industry average.",
    targetTitles: ["Owner", "Plant Manager", "Operations Manager", "General Manager", "Production Supervisor"],
    targetOrgTypes: ["Meat processor", "Custom slaughterhouse", "Poultry processor", "Specialty butcher"],
    targetGeography: "United States",
    exclusionCriteria: ["The large integrators (Tyson, JBS, Cargill, Smithfield) — byproduct is already a business line", "Retail-only butchers with no slaughter or fabrication"],
    qualificationCriteria: ["USDA or state inspected", "Under ~200 employees", "A named owner or plant manager"],
    researchStrategy:
      "The USDA FSIS Meat, Poultry and Egg Product Inspection Directory is a public list of every inspected establishment with address and contact. State departments of agriculture publish state-inspected plants.",
    successCriteria: [
      "At least 6 of 25 confirm they pay for byproduct removal",
      "At least 3 give a monthly cost",
      "At least 1 asks whether a buyer exists for a specific stream",
    ],
    safetyNotes:
      "Heavily regulated: FSIS inspection, state rendering rules, and BSE-related specified-risk-material restrictions determine what may legally move and where. Never advise on what may be diverted from rendering. Any real transaction needs a regulatory review first, not after.",
    monetizationPaths: ["Byproduct buyer matching", "Rendering contract renegotiation", "Brokerage on diverted streams"],
    directoryQueries: ["meat processing plant", "slaughterhouse"],
  },
  {
    slug: "luxury-hotels-lost-property",
    name: "Luxury hotels — lost-property fulfilment",
    buyerPersona:
      "Director of housekeeping, front office manager or guest relations manager at a 4- or 5-star property handling lost-and-found returns.",
    hypothesis:
      "Luxury properties handle a steady volume of lost property where the guest wants replacement rather than return, and staff spend unbudgeted time sourcing a discontinued item to protect the relationship.",
    likelyProblem:
      "A guest leaves behind something irreplaceable, and a manager spends two days on eBay trying to find another one.",
    offer:
      "We are researching what happens to lost property at high-end hotels, particularly the cases where returning it is not the answer.",
    targetTitles: ["Director of Housekeeping", "Front Office Manager", "Guest Relations Manager", "Director of Rooms", "General Manager"],
    targetOrgTypes: ["Luxury hotel", "Boutique hotel", "Resort", "Private club"],
    targetGeography: "United States",
    exclusionCriteria: ["Limited-service and budget brands", "Corporate brand offices rather than a specific property"],
    qualificationCriteria: ["4-star or above, or an independent luxury property", "A named departmental manager at a specific property", "Not a chain HQ"],
    researchStrategy:
      "Property websites and press pages, hotel association member lists, and local tourism board partner listings. Property-level managers are frequently named in local press and LinkedIn-visible role listings.",
    successCriteria: [
      "At least 5 of 25 describe a specific sourcing episode",
      "At least 2 estimate the frequency",
      "At least 1 asks whether we could find something for them",
    ],
    safetyNotes:
      "Guest privacy is absolute. Never request guest names, room numbers, dates or any identifying detail. Some jurisdictions have statutory lost-property holding periods — never advise on disposition timing.",
    monetizationPaths: ["Sourcing service", "Concierge partnership", "Per-item finder fee"],
    directoryQueries: ["luxury hotel", "boutique hotel"],
  },
  {
    slug: "municipal-obsolete-parts",
    name: "Municipalities and water utilities — obsolete infrastructure parts",
    buyerPersona:
      "Wastewater superintendent, water utility maintenance manager or public works director responsible for keeping 20-40 year old pumps, controls and drives running.",
    hypothesis:
      "Municipal water and wastewater facilities cannot source components for equipment the OEM has discontinued, run on cannibalised spares, and will pay a premium for a working replacement because the alternative is a capital project.",
    likelyProblem:
      "A discontinued controller, board, drive or impeller fails, the OEM says it is unsupported, and the plant runs on a workaround.",
    offer:
      "We are researching how plants source parts for equipment the manufacturer no longer supports. If you have one you cannot find, tell us and we will go looking.",
    targetTitles: [
      "Wastewater Superintendent",
      "Water Superintendent",
      "Maintenance Manager",
      "Utilities Director",
      "Public Works Director",
      "Chief Plant Operator",
      "Purchasing Manager",
    ],
    targetOrgTypes: ["Municipal wastewater facility", "Water utility", "Public works department", "Regional sanitation district", "Water authority"],
    targetGeography: "United States",
    exclusionCriteria: ["Engineering consultancies and system integrators — they specify, they do not maintain", "Equipment vendors and reps"],
    qualificationCriteria: [
      "Operates its own treatment or pumping infrastructure",
      "A named operations or maintenance person, not a general clerk",
      "Evidence of ageing equipment: a capital plan, a sole-source justification, an emergency purchase",
    ],
    researchStrategy:
      "Municipal staff directories; state environmental agency permitted-facility lists (every treatment plant is permitted and the operator is named); council agendas, where sole-source and emergency purchase justifications explicitly name discontinued equipment. NOTE: ~/Desktop/the-google-of-obsolete-infrastructure-parts already extracts exactly these sole-source records off the Legistar API for 20+ agencies — it is a ready-made source of both organizations and problem evidence for this experiment.",
    successCriteria: [
      "At least 6 of 25 name a specific obsolete component",
      "At least 4 name a manufacturer and model",
      "At least 2 ask us to try to find one",
    ],
    safetyNotes:
      "Public agencies buy under procurement law: above a threshold they must competitively bid, and a sole-source purchase needs a written justification. Never suggest a way around that. Drinking-water components may need NSF/ANSI 61 certification — never represent a part as potable-water rated. Municipal email is often a public record.",
    monetizationPaths: ["Sourcing fee per part", "Surplus and secondary market brokerage", "Obsolescence audit engagement"],
    directoryQueries: [],
  },
  {
    slug: "laboratories-replacement-parts",
    name: "Laboratories — scientific equipment replacement parts",
    buyerPersona:
      "Lab manager or instrumentation specialist at a clinical, environmental or industrial lab running instruments past the manufacturer's support window.",
    hypothesis:
      "Labs run out-of-support instruments because replacement means requalification, and the parts that keep them alive are the constraint — not the capital.",
    likelyProblem:
      "A pump, lamp, board or detector fails on a validated instrument, and replacing the instrument means revalidating the method.",
    offer:
      "We are researching how labs keep out-of-support instruments running. We want to hear which part you dread failing.",
    targetTitles: ["Laboratory Manager", "Lab Director", "Instrumentation Specialist", "QA Manager", "Technical Director", "Purchasing Manager"],
    targetOrgTypes: ["Clinical laboratory", "Environmental laboratory", "Industrial/QC laboratory", "Water testing laboratory", "Contract research organization"],
    targetGeography: "United States",
    exclusionCriteria: ["Instrument manufacturers and their service arms", "Labs inside institutions already covered by the universities experiment"],
    qualificationCriteria: ["Operates its own instrumentation", "Accredited or certified (implies validated methods)", "A named technical contact"],
    researchStrategy:
      "State environmental laboratory certification lists, CLIA laboratory registries, A2LA and NELAP accreditation directories — all public and all name the facility and usually a technical contact.",
    successCriteria: [
      "At least 5 of 25 name an out-of-support instrument they still run",
      "At least 3 name a specific part",
      "At least 1 asks us to source one",
    ],
    safetyNotes:
      "Clinical labs are regulated under CLIA and instruments may be FDA-cleared as devices; a non-OEM part can invalidate clearance or accreditation. Never represent a part as validated, equivalent or compliant. This is research into the problem, not a parts business, until that question is answered properly.",
    monetizationPaths: ["Parts sourcing", "Refurbished instrument brokerage", "End-of-life planning engagement"],
    directoryQueries: ["environmental testing laboratory", "analytical laboratory"],
  },
  {
    slug: "auction-houses-lot-identification",
    name: "Auction houses — obscure lot identification and enrichment",
    buyerPersona:
      "Owner, cataloguer or specialist at a regional auction house cataloguing estate lots outside their expertise.",
    hypothesis:
      "Regional auction houses under-realise on lots they cannot identify, catalogue them generically, and would pay for identification that converts a $40 box lot into a $400 attributed one.",
    likelyProblem:
      "An estate arrives with 300 objects and one cataloguer who knows furniture but not scientific instruments, militaria or Asian ceramics.",
    offer:
      "We are researching how regional houses handle lots outside their specialisms. We would like to know what you catalogue as 'miscellaneous'.",
    targetTitles: ["Owner", "Auctioneer", "Cataloguer", "Specialist", "Consignment Manager", "Gallery Director"],
    targetOrgTypes: ["Regional auction house", "Estate auction company", "Online auction platform", "Appraisal firm"],
    targetGeography: "United States",
    exclusionCriteria: [
      "The international houses (Sotheby's, Christie's, Bonhams, Phillips) — they have in-house specialists in every category",
      "Vehicle- and equipment-only auctioneers",
    ],
    qualificationCriteria: ["Runs catalogued sales rather than pure liquidation", "Handles estate content", "A named specialist or owner"],
    researchStrategy:
      "State auctioneer licensing boards (auctioneers are licensed and public in most states), auction aggregator platform seller lists, and NAA membership.",
    successCriteria: [
      "At least 5 of 25 describe a category they cannot catalogue",
      "At least 3 give an estimate of how often it happens",
      "At least 1 sends an actual object to identify",
    ],
    safetyNotes:
      "Ivory, firearms, Native American cultural items (NAGPRA), and antiquities carry hard legal restrictions on sale and transport. Never offer to identify or value in a way that could facilitate an illegal sale. We are not appraisers and must never present an opinion as an appraisal.",
    monetizationPaths: ["Per-lot identification", "Catalogue enrichment", "Specialist referral network"],
    directoryQueries: ["auction house", "estate auction"],
  },
  {
    slug: "ski-resorts-lift-components",
    name: "Ski resorts — lift and snowmaking component sourcing",
    buyerPersona:
      "Lift maintenance manager or mountain operations director at a resort running lifts and snowmaking plant installed in the 1970s-1990s.",
    hypothesis:
      "Ski resorts maintain lifts and snowmaking equipment whose manufacturers no longer exist or no longer support them, hold critical spares privately, and face a season-ending outage if a part cannot be found.",
    likelyProblem:
      "A drive component, gearbox part or control board on a 1980s lift fails, and the manufacturer was absorbed three times since.",
    offer:
      "We are researching how resorts source parts for older lifts and snowmaking plant. If there is one you cannot get, we would like to know what it is.",
    targetTitles: ["Lift Maintenance Manager", "Mountain Operations Manager", "Director of Mountain Operations", "Lift Mechanic Supervisor", "Snowmaking Manager", "General Manager"],
    targetOrgTypes: ["Ski resort", "Ski area", "Municipal ski hill", "Nordic center with lifts"],
    targetGeography: "United States and Canada",
    exclusionCriteria: ["Lift manufacturers and their service arms", "Resorts whose lifts are all under 10 years old"],
    qualificationCriteria: ["Operates aerial or surface lifts", "Evidence of lifts over 25 years old", "A named maintenance or operations person"],
    researchStrategy:
      "State tramway safety board registries — most ski states inspect and publish lift inventories with install years, which identifies both the resort and the ageing equipment. NSAA membership lists and resort operations pages.",
    successCriteria: [
      "At least 6 of 25 name an ageing lift or plant item",
      "At least 4 name a manufacturer and model",
      "At least 2 ask us to look for a part",
    ],
    safetyNotes:
      "Passenger ropeways are life-safety systems regulated by state tramway boards and ANSI B77. A non-conforming part on a lift is a safety and legal matter. Never represent a part as suitable, conforming or safe — every sourced component would need the resort's own engineer and the state board to sign it off.",
    monetizationPaths: ["Parts sourcing", "Decommissioned-lift salvage brokerage", "Cross-resort spares network"],
    directoryQueries: ["ski resort"],
  },
  {
    slug: "airports-gse-parts",
    name: "Airports and GSE operators — obsolete ground support equipment parts",
    buyerPersona:
      "Ground support equipment manager or maintenance supervisor at an airport authority, FBO or ground handler maintaining ageing tugs, belt loaders, deicers and GPUs.",
    hypothesis:
      "GSE fleets run well past manufacturer support, parts come from cannibalised units, and an out-of-service deicer or tug in season costs more per day than any part.",
    likelyProblem:
      "A discontinued hydraulic, electrical or drive component on a 25-year-old tug, and the OEM is gone.",
    offer:
      "We are researching how GSE fleets get parts for equipment nobody supports any more. Tell us the unit you are keeping alive.",
    targetTitles: ["GSE Manager", "Ground Support Equipment Supervisor", "Maintenance Manager", "Director of Operations", "Fleet Manager", "Airport Operations Manager"],
    targetOrgTypes: ["Airport authority", "FBO", "Ground handling company", "Regional airline maintenance base", "Cargo handler"],
    targetGeography: "United States",
    exclusionCriteria: [
      "Anything touching aircraft parts — airworthy components are a different legal universe",
      "GSE manufacturers and dealers",
    ],
    qualificationCriteria: ["Maintains its own GSE fleet", "A named GSE or maintenance contact", "Evidence of equipment over 15 years old"],
    researchStrategy:
      "FAA airport master records and airport authority staff directories, FBO listings, and airport board minutes (GSE capital purchases appear there with make and model).",
    successCriteria: [
      "At least 6 of 25 name an out-of-support GSE unit",
      "At least 4 name a manufacturer and model",
      "At least 2 ask us to source something",
    ],
    safetyNotes:
      "STRICT BOUNDARY: ground support equipment only. Anything that touches an aircraft — any part with a part number in an aircraft's maintenance program — is FAA-regulated (14 CFR Part 21/43/145), requires traceability and airworthiness approval, and is entirely out of scope. If a reply drifts toward aircraft parts, escalate to the operator immediately and do not answer it.",
    monetizationPaths: ["GSE parts sourcing", "Fleet retirement and salvage brokerage", "Cross-airport spares matching"],
    directoryQueries: ["fixed base operator", "airport"],
  },
  {
    slug: "breweries-byproduct-buyers",
    name: "Breweries — recurring byproduct buyers",
    buyerPersona:
      "Owner or head brewer at a production brewery generating spent grain, trub and yeast on every brew day.",
    hypothesis:
      "Production breweries give spent grain away or pay to remove it, the arrangement is fragile (one farmer with one truck), and a failed pickup stops the brew schedule.",
    likelyProblem:
      "Spent grain has to leave on brew day, the arrangement depends on one person, and there is no plan B.",
    offer:
      "We are researching where spent grain actually goes and what happens when the pickup does not come.",
    targetTitles: ["Owner", "Head Brewer", "Brewmaster", "Production Manager", "Operations Manager"],
    targetOrgTypes: ["Production brewery", "Regional brewery", "Brewpub with packaging", "Distillery"],
    targetGeography: "United States",
    exclusionCriteria: ["The national brewers — byproduct is already contracted at scale", "Brewpubs under ~500 bbl/year with trivial volume"],
    qualificationCriteria: ["Over ~1,000 bbl annual production", "A named brewer or owner", "Independent"],
    researchStrategy:
      "TTB's public brewer permit list, Brewers Association member directories, and state alcohol control board licensee lists — all name the business and often the principal.",
    successCriteria: [
      "At least 7 of 25 describe their current spent grain arrangement",
      "At least 3 describe a failed or fragile pickup",
      "At least 1 asks whether we could find a buyer or a backup",
    ],
    safetyNotes:
      "Spent grain fed to animals is regulated feed — the FDA's FSMA animal food rules apply, with a specific exemption pathway for breweries. Never advise on feed safety or claim a stream is feed-grade. Alcohol businesses are TTB-licensed; nothing here touches product.",
    monetizationPaths: ["Byproduct buyer matching", "Backup hauler network", "Higher-value stream brokerage"],
    directoryQueries: ["brewery"],
  },
  {
    slug: "dental-labs-overflow-capacity",
    name: "Dental labs — overflow capacity matching",
    buyerPersona:
      "Owner or production manager of a dental laboratory that turns away or delays work when capacity is full.",
    hypothesis:
      "Dental labs have volatile weekly volume, turn away or delay cases at peak while other labs sit idle, and have no trusted way to place overflow.",
    likelyProblem:
      "A week of unexpected volume means either late cases or turning down a dentist who will then find someone else permanently.",
    offer:
      "We are researching how labs handle weeks where the work exceeds the bench. We want to know what you actually do.",
    targetTitles: ["Owner", "Laboratory Manager", "Production Manager", "Technical Director", "Head Technician"],
    targetOrgTypes: ["Dental laboratory", "Crown and bridge lab", "Denture lab", "Orthodontic lab"],
    targetGeography: "United States",
    exclusionCriteria: ["Large national labs with multiple production sites", "Offshore-only labs"],
    qualificationCriteria: ["Independent lab", "A named owner or manager", "Does its own production"],
    researchStrategy:
      "NADL member directories, state dental lab registration lists where they exist, and dental association vendor listings.",
    successCriteria: [
      "At least 5 of 25 confirm they have turned away or delayed work",
      "At least 3 describe how often",
      "At least 1 asks how a matching arrangement would work",
    ],
    safetyNotes:
      "Dental devices are FDA-regulated and labs must be registered; work is done on a dentist's prescription. Case data may include patient identifiers, so never request a case file, an impression scan or anything with a patient name. Any matching arrangement would need each lab's own registration and the prescribing dentist's consent.",
    monetizationPaths: ["Overflow matching marketplace", "Capacity brokerage fee", "Peak-season partnerships"],
    directoryQueries: ["dental laboratory"],
  },
  {
    slug: "data-centers-switchgear",
    name: "Data centers and electrical contractors — transformer and switchgear sourcing",
    buyerPersona:
      "Facilities or critical-infrastructure manager at a data center, or a project manager at an electrical contractor, waiting on transformers and switchgear.",
    hypothesis:
      "Lead times on transformers and switchgear have stretched into years, projects are held up by a single piece of gear, and buyers will pay materially over list for available or used equipment. Measured 2026-09-07: a reconditioned 2500 kVA padmount resells for about $25k and ships in two weeks, against 80-120 weeks for new — and the same unit's scrap value is low four figures.",
    likelyProblem:
      "A project is fully funded and cannot energise because a transformer is 80 weeks out.",
    offer:
      "We are researching what people actually do when the transformer is two years out. We want to hear the workarounds. We already publish, free, the Twin Cities commercial buildings with a wrecking permit and the large commercial electrical jobs, newest first with the contractor named (brickandmortar.dev/datasets/teardowns) — so we can sometimes say where a working unit is about to come out of service.",
    targetTitles: ["Facilities Manager", "Critical Facilities Manager", "Project Manager", "Director of Engineering", "Procurement Manager", "Electrical Superintendent"],
    targetOrgTypes: ["Data center operator", "Colocation provider", "Electrical contractor", "Industrial facility", "Utility"],
    targetGeography: "United States",
    exclusionCriteria: ["Equipment manufacturers and their distributors", "Residential electrical contractors"],
    qualificationCriteria: ["Buys medium-voltage or large distribution equipment", "A named engineering or procurement contact", "Evidence of active projects"],
    researchStrategy:
      "Data center industry directories, state and municipal electrical permit records (which name the contractor and the scope), utility interconnection queues, and construction trade press project announcements.\n\nCROSS-REFERENCE, UPDATED 2026-09-07 EVENING — THE SUPPLY SIDE HAS STARTED. ~/Desktop/scrapwatch (private repo, live at scrapwatch.vercel.app) is this market approached from the SUPPLY side: a free daily email alert on commercial wrecking permits and top-decile commercial electrical permits in Minneapolis and Saint Paul, reading the bricks platform's `teardowns` dataset (brickandmortar.dev/datasets/teardowns, CC BY 4.0, 560 rows: 207 teardowns, 353 electrical). The bricks permits layer now refreshes daily at 06:30 (scripts/refresh_permits.sh); the first real alert fired 2026-09-07 on three new Minneapolis teardowns. Two supply-side heads-up emails went out 2026-09-07 (Aidan sent; nothing pitched, the only ask was \"was this useful\"): H&H Buying & Selling, Minneapolis (sales@handh.net) and T&R Electric, Colman SD (sales@trelectric.com); chase diarised 2026-09-21; Maddox (sales@maddox.com) is the third if either replies. This experiment is the DEMAND side of the same trade and is the half nobody has touched yet. If both halves find signal, the business is the join, not either half. Measured limits: 27 commercial/multifamily wrecking permits in Minneapolis in the trailing year (registers to 2026-09-04); Saint Paul's permit feed stopped publishing 2025-06-30, so its zero is a feed gap, not a fact; the metro count is small and only becomes a business repeated city by city.",
    successCriteria: [
      "At least 6 of 25 confirm a lead-time-driven delay",
      "At least 4 name specific equipment and a quoted lead time",
      "At least 2 ask whether we can find available gear",
    ],
    safetyNotes:
      "Medium- and high-voltage equipment is life-safety critical and must meet its application's ratings, testing and utility acceptance. Never represent a used unit's condition, rating or suitability. Any real transaction needs the buyer's engineer of record and independent testing — and that is not something this research can substitute for. Pre-1980 units may contain PCB-contaminated oil, which carries TSCA disposal and handling obligations; never advise on it and never imply a unit is clean.",
    monetizationPaths: [
      "Equipment sourcing fee",
      "Used and surplus brokerage",
      "Lead-time intelligence subscription",
      "Joining this demand side to scrapwatch's supply side — the only path here that neither half has alone",
    ],
    directoryQueries: ["data center", "electrical contractor"],
  },
  {
    slug: "historic-preservation-materials",
    name: "Historic preservation — hard-to-find historic materials",
    buyerPersona:
      "Preservation architect, restoration contractor or historic property manager who needs a material that matches an original and is no longer made.",
    hypothesis:
      "Historic restoration projects stall on materials that are no longer manufactured — specific brick, glass, tile, hardware, terra cotta — and the review process forbids a modern substitute, so the buyer will pay far above material value for a match.",
    likelyProblem:
      "The commission will not approve a substitute and the original manufacturer closed in 1954.",
    offer:
      "We are researching how restoration teams find materials that are no longer made. Tell us what you are hunting for right now.",
    targetTitles: ["Preservation Architect", "Restoration Contractor", "Project Manager", "Facilities Director", "Preservation Officer", "Owner"],
    targetOrgTypes: ["Preservation architecture firm", "Restoration contractor", "Historic site", "Municipal preservation office", "House museum"],
    targetGeography: "United States",
    exclusionCriteria: ["Salvage dealers — they are the supply side, not the buyers", "General contractors with no preservation work"],
    qualificationCriteria: ["Active restoration work on listed or historic-district property", "A named professional", "Evidence of an actual project"],
    researchStrategy:
      "State Historic Preservation Office project and tax-credit lists (public, and they name the project and often the architect), local historic commission agendas and approvals, and preservation trade association directories.",
    successCriteria: [
      "At least 6 of 25 name a specific material they could not source",
      "At least 3 describe a project delayed by it",
      "At least 2 ask us to look for something",
    ],
    safetyNotes:
      "Historic materials frequently contain lead paint and asbestos, and salvaged architectural elements are sometimes stolen — provenance matters legally as well as ethically. Never represent a material as hazard-free, and never source an item without a traceable chain of custody. Work on listed properties is governed by the Secretary of the Interior's Standards and local commission approval.",
    monetizationPaths: ["Materials sourcing fee", "Salvage network brokerage", "Custom reproduction matching"],
    directoryQueries: ["restoration contractor", "historic preservation"],
  },
  {
    slug: "used-electrical-gear-supply",
    name: "Used transformers and switchgear — the supply side: refurbishers, dealers and scrap",
    buyerPersona:
      "The person who buys used electrical gear before a scrap yard gets it: surplus buying at a refurbisher with a yard (Maddox, Sunbelt Solomon, T&R Electric), purchasing at a regional used-equipment dealer (H&H Buying & Selling, Minneapolis), or the resale side of a scrap yard.",
    hypothesis:
      "Their scarce input is not buyers, it is seller leads: knowing which building is about to shed a working $20k-$500k unit that someone else sees as metal weight. They already pay for this — the 'who buys transformers near Minneapolis' sites are programmatic SEO run by two-person brokers — so a free, specific heads-up read off the permit desk (address, contractor, date, still standing) will get a reply, and a reply is the signal.",
    likelyProblem:
      "A commercial building comes down and the transformer leaves as steel because nobody who would have paid five times scrap knew the wrecking permit had been issued.",
    offer:
      "The heads-up itself, free and specific: the commercial buildings in Minneapolis and Saint Paul with a wrecking permit or a top-decile electrical permit, newest first, with the contractor named. The only ask is whether it was useful. Nothing is pitched.",
    targetTitles: ["Director of Surplus Buying", "Purchasing Manager", "Buyer", "Owner", "Investment Recovery", "Sales Manager"],
    targetOrgTypes: ["Transformer refurbisher", "Used electrical equipment dealer", "Electrical surplus broker", "Scrap yard with a resale side", "Demolition contractor"],
    targetGeography: "Upper Midwest first (Minnesota, Wisconsin, Iowa, the Dakotas); national refurbishers second",
    exclusionCriteria: ["Data center operators and electrical contractors waiting on gear — that is the demand side, experiment data-centers-switchgear", "Equipment manufacturers and their authorised distributors"],
    qualificationCriteria: ["Publishes a 'we buy' or 'surplus wanted' page", "A reachable purchasing mailbox or named buyer, verified off their own site", "Buys the class of gear a commercial teardown yields (padmount, dry-type, switchgear, bus duct)"],
    researchStrategy:
      "STARTED 2026-09-07. The supply signal is built and live: brickandmortar.dev/datasets/teardowns (free, CC BY 4.0, 560 rows: 207 commercial teardowns, 353 top-decile Saint Paul electrical permits, refreshed daily at 06:30 by bricks/scripts/refresh_permits.sh) and scrapwatch.vercel.app (github.com/2016judea/scrapwatch, private), a free daily email alert on new rows by city and kind. Buyer list so far, each verified off the company's own site, never an aggregator: H&H Buying & Selling (3236 California St NE, Minneapolis, sales@handh.net); T&R Electric Supply (Colman SD, since 1961, sales@trelectric.com, has a Surplus Wanted page); Maddox Industrial Transformer (sales@maddox.com, pays 'up to 5x scrap'); Sunbelt Solomon (form and phone only). Two heads-ups sent 2026-09-07 (H&H, T&R) by Aidan via Zoho, outside this pipeline; chase 2026-09-21. Next: Maddox if either replies; the programmatic SEO buyers (thecircuitbreakersource, electricalequipmentbuyers, surplusequipmentbuyer — Southern California, gmail inboxes) as a second tranche because they are already paying Google for exactly this lead. Measured limits: 27 commercial/multifamily wrecking permits in Minneapolis in the trailing year; Saint Paul's permit feed stopped publishing 2025-06-30 (a feed gap, not a fact); a reconditioned 2500 kVA padmount resells for about $25k in two weeks against 80-120 weeks new, scrap is low four figures. Real money per unit, small count per metro; a business only if repeated city by city. This is the SUPPLY half of data-centers-switchgear; if both halves find signal the business is the join. DIRECTORY LESSON (batch 1, 2026-09-07): 'electrical supply' and 'transformer supplier' in a business directory mean NEW-equipment distributors (Viking, Crescent, EMSCO), and 'surplus' alone pulls building-materials resale (Habitat ReStore, ReUse Warehouse); 7 of the first 8 candidates were rejected by hand for that. Directory terms must say USED or BUYERS; the qualification step is not a cheap place to learn this at $0.12 a rejection.",
    successCriteria: [
      "At least 2 of 5 contacted say the heads-up was useful",
      "At least 1 asks for the next one, or signs up at scrapwatch.vercel.app with a non-test address",
      "At least 1 names what should be on the row that is not there yet",
    ],
    safetyNotes:
      "A permit says who is taking a building apart and when; it never says what equipment is inside, and every heads-up says so. Never represent a unit's condition, rating or PCB status; pre-1980 oil-filled units may be PCB-contaminated (40 CFR 761) and that is the buyer's test, not ours. Contractor mailing addresses come from the public permit record and are used only to name the firm.",
    monetizationPaths: [
      "Alert subscription — the record stays free, the notification is what is paid for",
      "Per-lead fee to refurbishers, paid on a unit actually recovered",
      "Repeating the feed city by city, which is the only path to real scale",
      "Joining this supply side to data-centers-switchgear's demand side — the only path neither half has alone",
    ],
    // Narrow on purpose. "scrap metal dealer" would list hundreds of yards
    // with no resale side, and every one of them costs a $0.12 research call to
    // reject. The qualifier is cheap; the researcher upstream of it is not.
    // Used/surplus side only. "transformer supplier" returned new-equipment distributors
    // (Viking, Crescent) in batch 1, which the exclusion criteria then pay to reject.
    directoryQueries: ["used electrical equipment", "surplus electrical equipment", "used transformers", "electrical equipment buyers", "transformer rebuild"],
    directoryLocations: ["Minneapolis, MN", "Saint Paul, MN", "Milwaukee, WI", "Des Moines, IA", "Sioux Falls, SD", "Fargo, ND", "Omaha, NE", "Duluth, MN"],
  },
];
