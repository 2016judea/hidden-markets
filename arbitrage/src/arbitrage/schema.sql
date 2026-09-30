-- Hidden-Market Arbitrage: the data model.
--
-- Grounded in Aidan's post "Hidden-Market Arbitrage" (aidanjude.substack.com,
-- 2026-09-07):
--
--     Opportunity = value asymmetry x obscurity x buyer urgency x access advantage
--                   / competition
--
-- with six kinds of asymmetry (geographic, waste-stream, knowledge, regulatory,
-- cultural, scale), the inverted search ("brainstorm weird buyers"), five
-- questions per buyer (what do they buy constantly / what is surprisingly
-- expensive / what can't they source / what do they throw away / what are they
-- legally required to do), and the "would I ever know this?" obscurity test
-- with its gate: obscurity without accessibility is trivia.
--
-- This is the IDEAL model. Every column is what a perfect-world analysis needs,
-- whether or not the warehouse can fill it today. The loader marks how each row
-- was filled (`basis`) and where it came from (`source_id`), so the analysis
-- can say which of its conclusions rest on measured records and which on a
-- sector template. What the warehouse cannot fill is itself an output: the gap
-- list in docs/ARBITRAGE-DATA-MODEL.md is derived from the empty columns.
--
-- Layers:
--   0  vocabulary   the framework's own nouns, fixed
--   1  actors       businesses, sites, the people behind them, buyer classes,
--                   the counterparties who already broker each material
--   2  boundary     the five questions, normalised: every material crossing a
--                   business's edge, in, out or as an obligation; the prices on
--                   each side of the boundary; the clocks
--   3  output       opportunities, scored, with the named side-A list under each
--
-- Conventions: ids are TEXT and stable across loads; money is USD; quantities
-- carry their unit on the row; every fact-bearing row has `source_id` and
-- `basis`. `basis` is one of: measured (a record about this business),
-- declared (the business told us), benchmark (sector template x size),
-- inferred (a join or a rule), illustrative (a placeholder the analysis must
-- not count).

-- ---------------------------------------------------------------- layer 0

CREATE TABLE IF NOT EXISTS asymmetry_kind (
    id           TEXT PRIMARY KEY,   -- geographic | waste_stream | knowledge | regulatory | cultural | scale
    label        TEXT NOT NULL,
    hunt         TEXT NOT NULL       -- the post's one-line search question for this kind
);

CREATE TABLE IF NOT EXISTS buyer_question (
    id           TEXT PRIMARY KEY,   -- buys_constantly | surprisingly_expensive | hard_to_source | throws_away | legally_required
    label        TEXT NOT NULL,
    direction    TEXT NOT NULL,      -- which flow.direction answers it: in | out | obligation
    flow_test    TEXT NOT NULL       -- the predicate on flow that selects the answer
);

CREATE TABLE IF NOT EXISTS basis_kind (
    id           TEXT PRIMARY KEY,   -- measured | declared | benchmark | inferred | illustrative
    counts       BOOLEAN NOT NULL,   -- may the scorer sum it?
    label        TEXT NOT NULL
);

-- Provenance registry. One row per dataset, price list, rule text, interview
-- or study. Nothing fact-bearing exists without a row here.
CREATE TABLE IF NOT EXISTS source (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    publisher    TEXT,
    url          TEXT,
    kind         TEXT NOT NULL,      -- record | listing | derived | price_list | rule | study | interview | template
    licence      TEXT,
    retrieved    DATE,
    coverage     TEXT,               -- e.g. "Hennepin only", "7-county metro", "national"
    held         BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = a source we know of and do not hold
    how_to_get   TEXT                -- for held = FALSE: the route (portal, FOIA, purchase, ask the business)
);

-- ---------------------------------------------------------------- layer 1

-- One row per business. The unit of analysis. Ideal: a registry (who is
-- trading today, since when, how big). Held: a listing (Overture) joined to
-- licences, loans, providers and reviewed places.
CREATE TABLE IF NOT EXISTS business (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    sector           TEXT,               -- our sector key (restaurant, cafe, salon, auto, dentist ...)
    category         TEXT,               -- the source's finer category (coffee_shop, auto_body_shop ...)
    naics            TEXT,
    sic              INTEGER,            -- the SIC on a county hazwaste licence, when that is the register
    epa_id           TEXT,               -- EPA RCRA handler id: joins the county licence, ECHO and MPCA
    independent      BOOLEAN,            -- FALSE when a chain brand
    brand            TEXT,
    address          TEXT,
    city             TEXT,
    county           TEXT,
    postcode         TEXT,
    lat              DOUBLE,
    lon              DOUBLE,
    site_id          TEXT,               -- FK site.id (county + parcel id)
    status           TEXT,               -- trading | closed | unverified
    opened           DATE,               -- ideal: first licence / first observation
    licensed_since   DATE,
    employees        INTEGER,            -- ideal: measured; held: benchmark from trade
    employees_basis  TEXT,
    revenue_usd      DOUBLE,             -- ideal: declared; held: benchmark tier
    revenue_basis    TEXT,
    floor_sqft       DOUBLE,             -- ideal: lease; held: parcel footprint share
    seats            INTEGER,
    hours_per_week   DOUBLE,
    website          TEXT,
    phone            TEXT,
    email            TEXT,
    review_count     INTEGER,
    rating           DOUBLE,
    dedupe_key       TEXT,               -- site_id|first name token: the same shop seen by two registers counts once
    source_id        TEXT NOT NULL,
    basis            TEXT NOT NULL
);

-- One row per parcel a business sits on. The physical side of the boundary:
-- what the building is, who owns it, what has happened to it.
CREATE TABLE IF NOT EXISTS site (
    id                TEXT PRIMARY KEY,  -- county|parcel_id
    parcel_id         TEXT NOT NULL,
    county            TEXT NOT NULL,
    address           TEXT,
    city              TEXT,
    lat               DOUBLE,
    lon               DOUBLE,
    use               TEXT,              -- assessor tax class
    zoning            TEXT,
    corridor          TEXT,
    assessed_usd      DOUBLE,
    lot_sqft          DOUBLE,
    footprint_sqft    DOUBLE,
    building_sqft     DOUBLE,            -- derived; see parcels slice for the method
    stories           INTEGER,
    year_built        INTEGER,
    owner             TEXT,
    owner_kind        TEXT,              -- entity | person
    owner_occupied    BOOLEAN,
    flat_roof_proxy   BOOLEAN,           -- one-storey commercial >= metro median footprint
    flood_zone        TEXT,
    contaminated      BOOLEAN,           -- an MPCA record on the parcel
    contamination     TEXT,
    lead_service_line TEXT,              -- classification from the city inventory
    hazwaste_licensed BOOLEAN,           -- a county hazardous-waste generator licence on the parcel
    hazwaste_size     TEXT,              -- VSQG | SQG | LQG | MIG
    hazwaste_sic      INTEGER,           -- the generator's SIC code on the county licence
    hazwaste_name     TEXT,              -- operation name on the licence
    hazwaste_last_insp DATE,
    calls_311         INTEGER,
    open_permits      INTEGER,
    last_permit       DATE,
    last_sale         DATE,
    last_sale_usd     DOUBLE,
    vacant_registered BOOLEAN,
    teardown_permit   BOOLEAN,
    source_id         TEXT NOT NULL,
    basis             TEXT NOT NULL
);

-- The person or entity behind a business: the borrower on an SBA loan, the
-- official on an NPI record, the applicant on a licence, the taxpayer of record.
CREATE TABLE IF NOT EXISTS owner_operator (
    id            TEXT PRIMARY KEY,
    business_id   TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT,                  -- borrower | official | licensee | taxpayer | applicant
    title         TEXT,
    kind          TEXT,                  -- person | entity
    mailing       TEXT,
    email         TEXT,
    phone         TEXT,
    source_id     TEXT NOT NULL,
    basis         TEXT NOT NULL
);

-- The inverted search: the weird buyers. One row per class of buyer whose
-- inputs might be somebody else's waste, or whose waste might be somebody's
-- input. `sector` links it back to business.sector where the class is one we
-- can count in the market.
CREATE TABLE IF NOT EXISTS buyer_class (
    id            TEXT PRIMARY KEY,
    label         TEXT NOT NULL,
    sector        TEXT,                  -- business.sector when countable in the market, else NULL
    naics         TEXT,
    in_market     INTEGER,               -- count of such businesses in the metro, when known
    where_found   TEXT,                  -- how to enumerate them (a dataset, a registry, a trade body)
    note          TEXT,
    source_id     TEXT
);

-- Who already brokers a material. The competition term. `founded` and `scale`
-- are what the post says to look at: a 50-year-old industry is not obscure.
CREATE TABLE IF NOT EXISTS counterparty (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,         -- hauler | broker | refiner | processor | supplier | contractor | collector
    material_id   TEXT,                  -- FK material.id when specific
    trade         TEXT,                  -- contractor trade when from the permit register
    founded       INTEGER,
    scale         TEXT,                  -- local | regional | national
    geography     TEXT,
    sites_served  INTEGER,               -- from permits: parcels touched
    permits       INTEGER,
    first_seen    DATE,
    last_seen     DATE,
    mailing       TEXT,
    pays_or_charges TEXT,                -- pays | free_pickup | charges | unknown
    price_usd     DOUBLE,
    price_unit    TEXT,
    source_id     TEXT NOT NULL,
    basis         TEXT NOT NULL
);

-- Sector-level scale: how many businesses and workers a trade has here, and
-- what they earn. Sizes the side-A pool without a per-business measurement.
CREATE TABLE IF NOT EXISTS trade (
    naics                 TEXT PRIMARY KEY,
    label                 TEXT NOT NULL,
    sector                TEXT,           -- our sector key, when mapped
    establishments        INTEGER,
    establishments_year   INTEGER,
    employees             INTEGER,
    avg_weekly_wage_usd   DOUBLE,
    workers_per_business  DOUBLE,
    headcount_change_pct  DOUBLE,
    source_id             TEXT NOT NULL
);

-- ---------------------------------------------------------------- layer 2

-- The canonical thing that crosses a boundary: a byproduct, an input, a piece
-- of equipment, a service, a compliance obligation, a dataset.
CREATE TABLE IF NOT EXISTS material (
    id             TEXT PRIMARY KEY,
    label          TEXT NOT NULL,
    kind           TEXT NOT NULL,        -- byproduct | input | equipment | service | obligation | data | skill
    form           TEXT,                 -- solid | liquid | gas | object | service
    unit           TEXT NOT NULL,        -- the unit flows and prices are quoted in (lb, gal, ton, each, hour, year)
    shelf_life_days INTEGER,             -- NULL = indefinite
    hazard_class   TEXT,                 -- none | hazardous | regulated | perishable
    regulated_by   TEXT,                 -- the rule that governs handling, if any
    note           TEXT
);

-- Sector x material x direction template: what a typical business of this
-- sector does with this material, per unit of size. This is what lets the
-- five questions be asked of 88,000 businesses at once. Ideal: measured off
-- invoices and waste audits per business; held: published per-unit factors.
CREATE TABLE IF NOT EXISTS sector_flow_template (
    id             TEXT PRIMARY KEY,
    sector         TEXT,                 -- business.sector; NULL = every business
    category_like  TEXT,                 -- optional finer match on business.category (SQL LIKE)
    material_id    TEXT NOT NULL,
    direction      TEXT NOT NULL,        -- in | out | obligation
    qty_per_unit   DOUBLE,               -- quantity per `per` per `period`
    per            TEXT,                 -- business | employee | seat | sqft | revenue_1k
    period         TEXT,                 -- day | week | month | year
    unit           TEXT NOT NULL,
    unit_cost_usd  DOUBLE,               -- what the business pays (in) or pays to be rid of (out, negative = gets paid)
    lead_time_days INTEGER,              -- for in: how long to source
    sourcing_pain  INTEGER,              -- 0..5
    question_id    TEXT,                 -- buyer_question this template answers
    confidence     DOUBLE,               -- 0..1
    source_id      TEXT NOT NULL,
    basis          TEXT NOT NULL,
    note           TEXT
);

-- Every material crossing a business's boundary. The five questions, normalised.
CREATE TABLE IF NOT EXISTS flow (
    id               TEXT PRIMARY KEY,
    business_id      TEXT NOT NULL,
    material_id      TEXT NOT NULL,
    direction        TEXT NOT NULL,      -- in | out | obligation
    qty_per_year     DOUBLE,
    unit             TEXT NOT NULL,
    unit_cost_usd    DOUBLE,             -- + pays, - gets paid
    annual_cost_usd  DOUBLE,
    counterparty_id  TEXT,               -- who takes it / supplies it today
    lead_time_days   INTEGER,
    sourcing_pain    INTEGER,
    stockouts_per_year INTEGER,
    template_id      TEXT,               -- when basis = benchmark
    evidence_id      TEXT,
    confidence       DOUBLE,
    source_id        TEXT NOT NULL,
    basis            TEXT NOT NULL
);

-- A rule that manufactures demand. Regulatory asymmetry lives here.
CREATE TABLE IF NOT EXISTS obligation (
    id                TEXT PRIMARY KEY,
    label             TEXT NOT NULL,
    jurisdiction      TEXT NOT NULL,     -- federal | Minnesota | Hennepin | Ramsey | Minneapolis | Saint Paul | metro
    rule              TEXT NOT NULL,     -- citation
    requires          TEXT NOT NULL,     -- what a business must do
    applies_sector    TEXT,              -- business.sector match, comma list, or NULL = all
    applies_category  TEXT,              -- business.category LIKE
    applies_test      TEXT,              -- a further predicate in words (>= 1 ton/wk trash; >= 15 lb charge; >= 50k sqft)
    material_id       TEXT,              -- the material it is about
    frequency         TEXT,              -- once | annual | continuous | per_event
    effective         DATE,
    next_step         DATE,              -- the next date on the clock
    sunset            DATE,
    penalty           TEXT,
    compliance_cost_usd DOUBLE,          -- typical, per business
    vendors_in_market INTEGER,           -- who already sells compliance, when known
    obscurity         INTEGER,           -- 0..5: would an owner know this exists?
    source_id         TEXT NOT NULL,
    verified          BOOLEAN NOT NULL DEFAULT FALSE,   -- the date and threshold were read off the rule text
    note              TEXT
);

-- Observed price of a material on one side of the boundary, in one place, at
-- one time. Value asymmetry = the gap between two rows for the same material.
CREATE TABLE IF NOT EXISTS market_price (
    id             TEXT PRIMARY KEY,
    material_id    TEXT NOT NULL,
    side           TEXT NOT NULL,        -- disposal (what side A pays to be rid of it) | purchase (what side B pays for it) | collection (what a collector pays side A) | substitute (what a taker pays today for the input this replaces, per unit of this material)
    buyer_class_id TEXT,
    geography      TEXT NOT NULL,        -- metro | Minnesota | US | Gulf | ...
    price_usd      DOUBLE NOT NULL,      -- per unit; sign: + a price paid FOR it, - a fee paid to be RID of it
    unit           TEXT NOT NULL,
    observed       DATE,
    price_low_usd  DOUBLE,
    price_high_usd DOUBLE,
    source_id      TEXT NOT NULL,
    basis          TEXT NOT NULL,
    note           TEXT
);

-- A buyer class's need for a material: the other side of the boundary.
CREATE TABLE IF NOT EXISTS demand (
    id             TEXT PRIMARY KEY,
    buyer_class_id TEXT NOT NULL,
    material_id    TEXT NOT NULL,
    qty_per_year   DOUBLE,
    unit           TEXT,
    price_paid_usd DOUBLE,               -- per unit
    lead_time_days INTEGER,
    sourcing_pain  INTEGER,              -- 0..5
    urgency_clock  TEXT,                 -- what makes them act now
    geography      TEXT,
    source_id      TEXT NOT NULL,
    basis          TEXT NOT NULL,
    note           TEXT
);

-- The clock. Anything dated that changes what a business will do next.
CREATE TABLE IF NOT EXISTS event (
    id             TEXT PRIMARY KEY,
    business_id    TEXT,                 -- when tied to a business
    site_id        TEXT,                 -- when tied to a parcel
    kind           TEXT NOT NULL,        -- warn_notice | teardown_permit | vacant_registration | sba_approval | licence_expiry | sale | contamination | rule_effective | inspection
    happened       DATE,
    effective      DATE,                 -- when the consequence lands
    detail         TEXT,
    amount_usd     DOUBLE,
    source_id      TEXT NOT NULL,
    basis          TEXT NOT NULL
);

-- What WE hold that reaches one side of a boundary before anyone else.
CREATE TABLE IF NOT EXISTS access_asset (
    id            TEXT PRIMARY KEY,
    label         TEXT NOT NULL,
    kind          TEXT NOT NULL,         -- dataset | relationship | licence | channel | skill
    reaches       TEXT NOT NULL,         -- side_a | side_b | both
    material_id   TEXT,
    strength      INTEGER NOT NULL,      -- 0..5
    source_id     TEXT,
    note          TEXT
);

-- Provenance for a single fact: which record, which quote.
CREATE TABLE IF NOT EXISTS evidence (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL,
    record_ref  TEXT,
    quote       TEXT,
    value       TEXT,
    retrieved   DATE
);

-- How a piece of work actually gets filed, and what the owner must do. Added
-- 2026-09-28: Aidan, "Work we can do for someone in entirety is the only thing
-- worth selling because its the only thing someone would pay for not knowing
-- us." A route is end to end when a preparer can file it and the owner's only
-- act is to authorize (a signature on our page). Anything needing the owner's
-- own login, a link the county sends only to them, mail they must receive, or
-- documents only they hold is NOT end to end, and the scorer gates it out.
CREATE TABLE IF NOT EXISTS work_route (
    id                 TEXT PRIMARY KEY,
    label              TEXT NOT NULL,
    material_id        TEXT,                 -- the work, as a material
    obligation_id      TEXT,
    jurisdiction       TEXT NOT NULL,
    channel            TEXT NOT NULL,        -- preparer_account | email | mail | public_portal | owner_portal | owner_link | in_person | phone
    filer              TEXT NOT NULL,        -- anyone | preparer_with_authorization | owner_only | unknown
    owner_action       TEXT NOT NULL,        -- none | authorize | documents | login | forward_link | receive_mail | appear
    end_to_end         BOOLEAN NOT NULL,     -- filer <> owner_only AND owner_action IN (none, authorize)
    fee_to_agency_usd  DOUBLE,
    deadline           DATE,
    source_id          TEXT NOT NULL,
    quote              TEXT,
    note               TEXT
);

CREATE TABLE IF NOT EXISTS sos_status (
    business_id   TEXT NOT NULL,
    filing_name   TEXT,
    filing_type   TEXT,
    status        TEXT,                      -- active | inactive
    dissolved_on  DATE,
    last_renewal  DATE,
    filed_on      DATE,
    office        TEXT,
    source_id     TEXT NOT NULL,
    PRIMARY KEY (business_id, filing_name, filing_type)
);

-- ---------------------------------------------------------------- layer 3

-- One row per candidate mispricing. The equation's terms are columns; the
-- score is computed, never typed. `side_a_filter` is the SQL predicate on
-- business that names the supply; members are materialised below.
CREATE TABLE IF NOT EXISTS opportunity (
    id                 TEXT PRIMARY KEY,
    label              TEXT NOT NULL,
    material_id        TEXT NOT NULL,
    asymmetry_id       TEXT NOT NULL,
    side_a_filter      TEXT NOT NULL,     -- SQL on business (+ site) selecting the supply
    side_a_role        TEXT NOT NULL,     -- disposes | buys | must_comply | holds
    side_b_class_id    TEXT,              -- buyer_class.id
    side_b_role        TEXT,              -- buys | sells | services
    obligation_id      TEXT,
    -- the five terms, 0..5 unless stated
    value_asymmetry    DOUBLE,            -- USD per year across side A, or per business; see value_basis
    value_basis        TEXT,
    obscurity          INTEGER,
    urgency            INTEGER,
    urgency_clock      TEXT,
    access_advantage   INTEGER,
    competition        INTEGER,           -- 1..5; 5 = a 50-year-old industry
    accessibility      INTEGER,           -- 0..5; 0 = trivia
    -- filled by the scorer
    n_side_a           INTEGER,
    annual_qty         DOUBLE,
    qty_unit           TEXT,
    annual_value_usd   DOUBLE,
    score              DOUBLE,
    gated_out          BOOLEAN,           -- accessibility = 0 or n_side_a = 0
    -- derived by the scorer from the model, not typed (added 2026-09-28 after the
    -- first run ranked three hand-scored refrigerant rows on top: bias, not signal)
    origin             TEXT,              -- hypothesis (hand-written) | generated (from obligations and flows)
    urgency_derived    INTEGER,
    urgency_basis      TEXT,
    competition_derived INTEGER,
    competition_basis  TEXT,
    access_derived     INTEGER,
    access_basis       TEXT,
    priced             BOOLEAN,           -- a counted dollar value exists
    route_id           TEXT,              -- work_route this is filed through
    end_to_end         BOOLEAN,           -- from the route; FALSE gates the row out
    merged_into        TEXT,              -- another opportunity with >= 90% the same side A
    also               TEXT,              -- labels merged into this one
    note               TEXT,
    source_id          TEXT NOT NULL
);

-- The named side-A list under each opportunity: this business, this volume.
CREATE TABLE IF NOT EXISTS opportunity_member (
    opportunity_id  TEXT NOT NULL,
    business_id     TEXT NOT NULL,
    qty_per_year    DOUBLE,
    value_usd       DOUBLE,
    clock           DATE,                 -- the nearest event on this business, if any
    basis           TEXT NOT NULL,
    PRIMARY KEY (opportunity_id, business_id)
);

-- On the block (added 2026-09-30, Aidan's florist-and-cafe example). A taker is a
-- neighbour that can USE a discarded material; a pair is one discarder and one
-- taker within walking distance. The metro model prices a stream at what a broker
-- resells it for; here the value is what the taker stops buying, and the distance
-- is the margin, because hauling is what kills a $0/lb stream at any distance.
CREATE TABLE IF NOT EXISTS taker (
    id               TEXT PRIMARY KEY,
    material_id      TEXT NOT NULL,
    label            TEXT NOT NULL,
    side_b_filter    TEXT NOT NULL,       -- SQL on business_site alias b selecting the taker
    use              TEXT NOT NULL,       -- what the taker does with it
    price_id         TEXT,                -- market_price.id, side = substitute
    absorb_per_year  DOUBLE,              -- how much one taker can use; NULL = unknown
    unit             TEXT,
    source_id        TEXT NOT NULL,
    basis            TEXT NOT NULL,
    note             TEXT
);
CREATE TABLE IF NOT EXISTS pair (
    id               TEXT PRIMARY KEY,
    taker_id         TEXT NOT NULL,
    material_id      TEXT NOT NULL,
    a_business_id    TEXT NOT NULL,       -- discards it
    b_business_id    TEXT NOT NULL,       -- can use it
    distance_m       DOUBLE NOT NULL,
    proximity        DOUBLE NOT NULL,     -- 1.0 within 100 m, 0.8 within 250 m, 0.6 within the radius
    qty_per_year     DOUBLE,              -- what A discards (flow), capped by absorb when known
    unit             TEXT,
    qty_basis        TEXT,
    price_usd        DOUBLE,              -- substitute price per unit
    price_basis      TEXT,
    avoided_usd      DOUBLE,              -- qty x price when both bases count, else NULL
    urgency          INTEGER,             -- the material's clock (spoils, fee)
    score            DOUBLE,              -- avoided_usd x proximity; 0 when unpriced
    corridor         TEXT,                -- A's corridor when known
    note             TEXT
);
