# Codebase broker

Indie devs and small studios sit on finished or shelved games whose private source code
AI labs will now license. We find the owners and get them a deal through DataVendor (HUD),
where Brick and Mortar AI LLC is a Tier 2 vendor. Started 2026-10-20.

- `PIPELINE.csv` — candidate owners, one row per game. Columns below.
- `DRAFTS.md` — first-touch template, personalised first lines for the top 20, and the
  note to HUD that unlocks the rest. **None sent.** Contacting people is Aidan's call.
- `data/` — raw pulls (PCGamingWiki UE5 backlinks, SteamSpy, Steam appdetails, itch.io
  Three.js feeds). `build_pipeline.py` turns them into `PIPELINE.csv`.

## Can we broker? Yes, two ways. One is clean today

Read off the PAA (`~/Desktop/public-records-gym/datavendor/PAA-unsigned-2026-10-20.pdf`)
and docs.datavendor.ai on 2026-10-20.

| Route | Rule | Our cut | Verdict |
|---|---|---|---|
| **Referral** — the dev signs up as their own vendor with our referral code and submits their own repo | Data vendor referral agreement (12 Sep 2026): 5% of what the buyer pays for a general referral; **7.5% for "identified supply"** (we name the specific game up front and DataVendor accepts it in writing); up to 10% if they approve it as rare. Paid out of DataVendor's share, "never deducted from… the payout owed to the referred vendor". 180-day window. | 5–10% of the sale, paid by HUD | **Use this.** The dev keeps their full 80%. We carry no warranty. |
| **Representation** — we list their repo under our vendor account | PAA 6.2: the vendor warrants it has "all necessary rights, licenses, and consents" and the content infringes nothing; s.10 indemnity is uncapped. Docs, Selling FAQ: a partner may "bring supply from many vendors… if you have a real supply network and the right to represent that supply. Revenue share, representation rights, and commercial terms are agreed case by case." | whatever we contract with the dev | Allowed in principle, but needs a written licence from each dev with a right to sublicense, plus HUD's case-by-case terms. And we would be warranting someone else's asset chain. Only for a dev who wants us to do everything. |

**The constraint that shapes every message: the request itself is confidential.** PAA 11.1
names "RFPs… made available within the Platform" as Confidential Information, and 11.2
bars disclosing it to any third party without HUD's written consent. So the $200,000 /
$20,000 figures and the November 3 deadline **cannot go in an email to a dev** until HUD
says yes in writing. What is public and quotable: DataVendor's homepage shows codebase
listings at $68K–$220K; its docs say well-documented production codebases "have licensed
for up to $20,000 each"; licences are non-exclusive and the seller keeps ownership. The
first ask in `DRAFTS.md` is the note to HUD asking for that consent and for identified-supply
acceptance on our list.

PAA 4 (non-circumvention) only bars going around HUD to the *buyer*. Talking to sellers is
fine.

## What the requests ask for (read via `GET /v2/opportunities/{id}`, 2026-10-20)

| Request | Pays | Closes | Must have |
|---|---|---|---|
| **Unreal Engine Game Codebases** | up to $200,000 a game; lower offers case by case | 2026-11-03 21:00 UTC | Private (not released as source or open source). Full source **and** assets the owner owns or can license. UE5, builds and launches into gameplay on a stock engine. Polished, **30+ minutes** playable without crashing, has depth. Git or Perforce history. Primarily human-written; disclose AI use. No secrets in code or history. C++ preferred, Blueprint OK. |
| **Three.js Game Codebases** | up to $20,000 a game | 2026-11-03 21:00 UTC | Same shape: private, full source + owned assets, high-end 3D browser game built mainly on Three.js, builds from a clean clone with no paid keys, real source not a minified bundle, polished 30+ min, git history, human-written, no secrets. |
| **Rare Coding Languages Codebase** | not stated | 2026-10-30 | Swift/Go/C/C++/MATLAB/Rust, 100+ merged PRs, 50k–10M LOC, 5+ contributors, 1,000+ commits, >25% test coverage, mostly pre-AI. |
| **COBOL Enterprise Codebase** | not stated | open | COBOL, 50+ merged PRs, 100k–10M LOC, 10+ contributors, 1,000+ commits, >25% coverage. |

Both game requests also want: a **30-minute recorded playtest**, engine/Node version and
build steps, a list of third-party assets and plugins, an AI-use note, any design docs.
Rejected outright: unmodified templates, tutorials or course projects, asset flips, client
work without rights. Non-exclusive: the dev keeps the game, keeps selling it.

Review: (1) a human plays the build and watches the playtest; (2) code review for quality,
share of real game code, assets, metadata; (3) an offer.

**The rights trap that will sink most UE5 indies.** Assets bought on Fab / the Unreal
Marketplace are licensed to use *in a product*, not to redistribute as source files. A game
built heavily on marketplace packs fails "assets you own or have the rights to license".
Ask every candidate for the third-party asset list before anything else.

Rare Languages and COBOL are not worked here: they want 5–10+ contributors, 1,000+ commits
and >25% coverage, which is a company's internal repo, not a game dev's. Different buyer
class, different list.

## Proposed cut

**Take HUD's 7.5% identified-supply referral fee and charge the dev nothing.** A dev offered
"free, and you keep your game" has no reason to say no, and the fee comes out of HUD's
20%. For a dev who wants us to do the work (playtest capture, secrets scrub, asset list,
listing), add a 10% service fee on their payout. Comparables: micro1 pays referrers 7.5%;
Troveo keeps 40% for doing the whole licensing job. Ours sits at the referral end because
our work is the introduction.

## Pipeline columns

`rank, request, game, studio, contact_person, engine, evidence_private_complete, status,
contact_channel, contact, store_url, owners_or_reviews, est_band, notes`

- `est_band` is our guess at where the game lands inside the request's range, from size,
  polish and reception. It is not an offer.
- `evidence_private_complete`: why we believe the code is private (commercial release, no
  public repo found) and the game is complete enough for 30 minutes.
- `contact`: a public business address from the Steam store's support field, the studio's
  site, or the itch.io page. No guessed addresses.
