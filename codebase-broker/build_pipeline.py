"""Build PIPELINE.csv from the raw pulls in data/.

Sources (all pulled 2026-10-20):
  data/pcgw_ue5_titles.json, pcgw_ue5_infobox.json  PCGamingWiki pages linking Engine:Unreal_Engine_5 (751)
  data/steamspy.json                                SteamSpy owners + review counts per app
  data/steam_ue5.json, steam_threejs.json           Steam appdetails: developer, publisher, site, support email
  data/itch_*.xml, itchpages/details.json           itch.io "made with Three.js" feeds + game pages

The shortlist below is hand-picked from those pulls. Filters for UE5: not a major publisher,
SteamSpy reviews >= ~70, >= 70% positive, commercial release (so the code is private by
default). est_band is a guess at where the game lands in the request's range, not an offer.
Run: python3 build_pipeline.py
"""
import csv
import json
from pathlib import Path

D = Path(__file__).parent / "data"
st = {**json.load(open(D / "steam_ue5.json")), **json.load(open(D / "steam_threejs.json"))}
spy = json.load(open(D / "steamspy.json"))

UE = "Unreal Engine Game Codebases"
TJ = "Three.js Game Codebases"
NO_REPO = "no public source repo (gh search 10/20: mods/trainers only)"

# (rank or 0, request, steam appid or None, est_band, notes, overrides)
ROWS = [
    # ---- top 20, ranked ----
    (1, UE, "2365810", "$100k-200k", "Small team, self-published, 97% of 15k reviews. Deep movement system = real C++/BP gameplay code. " + NO_REPO, {}),
    (2, UE, "1807810", "$60k-150k", "Solo dev (Nate Purkeypile, ex-Bethesda). Open world, self-published, 200-500k owners (SteamSpy est.). " + NO_REPO, {"contact_person": "Nate Purkeypile"}),
    (3, UE, "2828860", "$100k-200k", "Self-published, 500k-1M owners. AI, looting, squad systems. Still in active early access, so they may value a non-exclusive cash event mid-development.", {}),
    (4, UE, "2141730", "$100k-200k", "Self-published co-op, 11 procedurally generated levels, 23k reviews. Networking + procgen = systems the request names. " + NO_REPO, {}),
    (5, UE, "2909110", "$80k-200k", "Self-published co-op horror, 11.5k reviews 82%. " + NO_REPO, {}),
    (6, UE, "3228590", "$80k-200k", "Self-published roguelite FPS, solo/co-op, 4.2k reviews 83%. " + NO_REPO, {}),
    (7, UE, "2963880", "$60k-150k", "Self-published, up to 8 players, 4.5k reviews 89%. Studio publishes its own mod kit on GitHub (EmbersGames/MurkyDiversMod), not the game source.", {}),
    (8, UE, "2916430", "$60k-150k", "Self-published co-op sim, 5.8k reviews 94%. " + NO_REPO, {}),
    (9, UE, "3059070", "$60k-150k", "Self-published co-op, 6k reviews 85%. Support address is a personal Hotmail: likely solo or tiny team.", {"contact_person": "Lucas Sceaux"}),
    (10, TJ, "2276980", "$15k-20k", "Three.js per its itch page. On Steam since Feb 2025, 1.5k reviews. Polished, hours of play. Same studio's Pigeon: A Love Story is a second Three.js game.", {}),
    (11, TJ, None, "$15k-20k", "Three.js + Bullet physics racer, 4.7 stars from 691 itch ratings, also on Poki and CrazyGames. Solo dev. Track editor + physics = 'complex systems'. Third-party clones on GitHub, not the source.", {"game": "PolyTrack", "studio": "Kodub", "engine": "Three.js + Bullet", "contact_channel": "email (kodub.com/contact)", "contact": "info@kodub.com", "store_url": "https://kodub.itch.io/polytrack", "owners_or_reviews": "691 itch ratings, 4.7"}),
    (12, TJ, "3788170", "$15k-20k", "Three.js multiplayer archery shooter, 4.6 stars from 848 itch ratings, Steam Aug 2025. Studio also ships Raccoon Retail (Three.js). Only fan mod repos on GitHub.", {"contact_channel": "Discord (discord.gg/PhwWYkzfEw) or Steam; no public email found", "contact": "", "owners_or_reviews": "848 itch ratings, 4.6; free on Steam"}),
    (13, TJ, "3431300", "$15k-20k", "Three.js procedural driving, Steam Sep 2026, 970 reviews at $7.99. CHECK: a third-party GitHub repo claims 'OLD slowroads source code' (likely a scraped bundle of the old web build).", {}),
    (14, TJ, "1049660", "$15k-20k", "Browser MMORPG on Three.js since 2019, client + server. Studio site lists contact@pg5-studio.com too.", {"owners_or_reviews": "160 itch ratings, 4.2; free on Steam"}),
    (15, UE, "979640", "$40k-120k", "Self-published open-world RTS in early access since 2020. Long git history likely. " + NO_REPO, {}),
    (16, UE, "2217000", "$100k-200k", "Platform fighter with rollback netcode, 7.3k reviews. Co-published with offbrand games: confirm who holds the code rights.", {}),
    (17, TJ, "4094120", "$10k-20k", "City-builder sim on Three.js, $9.99 on Steam since Dec 2025, 214 reviews. Simulation systems.", {}),
    (18, UE, "2499520", "$40k-100k", "Self-published roguelite, 1.2k reviews 88%. " + NO_REPO, {}),
    (19, UE, "2213120", "$20k-60k", "Self-published narrative game, 1.6k reviews 90%, gmail support: tiny team. Check it reaches 30 min of play (it should).", {}),
    (20, UE, "1749860", "$60k-150k", "Solo dev (Matt Newell), Annapurna-published. Photoreal UE5 landscapes. Publisher deal may cover rights: ask the dev first.", {"contact_person": "Matt Newell"}),
    # ---- the rest, UE5 ----
    (0, UE, "2780980", "$100k-200k", "Social deduction, 16 players, 1-2M owners, gmail support: small team. High value.", {}),
    (0, UE, "2113850", "$20k-60k", "Ambient lofi game, 12k reviews 98%. Check '30 min of gameplay with depth'.", {}),
    (0, UE, "3290710", "$10k-30k", "Short arcade game, 2.8k reviews. May fall short of 30 min depth.", {}),
    (0, UE, "1801520", "$30k-80k", "Mika Mobile, arcade shooter, 1.8k reviews 95%.", {}),
    (0, UE, "1910860", "$20k-60k", "Metalcat Interactive, self-published action RPG.", {}),
    (0, UE, "1491410", "$100k-200k", "Yellow Brick Games (ex-BioWare leads), elemental physics systems. Mid-size studio.", {}),
    (0, UE, "2405060", "$40k-120k", "Sobaka Studio, self-published action roguelite.", {}),
    (0, UE, "1632490", "$20k-60k", "Language-learning game, self-published.", {}),
    (0, UE, "3149370", "$10k-40k", "Solo dev Gil Lawson, 96% of 549 reviews.", {"contact_person": "Gil Lawson"}),
    (0, UE, "3539440", "$20k-60k", "Tinerasoft, 98% of 528 reviews.", {}),
    (0, UE, "2467810", "$20k-60k", "Emberforge, mining/crafting co-op.", {}),
    (0, UE, "2794830", "$20k-60k", "Reky Studios, 97% of 368 reviews.", {}),
    (0, UE, "2526310", "$20k-60k", "The Gang Studio, 97% of 354 reviews.", {}),
    (0, UE, "2378910", "$20k-60k", "The Catalyst Crew, city builder.", {}),
    (0, UE, "1206410", "$30k-80k", "Astral Clocktower, action RPG, released Apr 2026.", {}),
    (0, UE, "2406180", "$10k-40k", "Indecision Labs, 98% of 226 reviews, gmail.", {}),
    (0, UE, "2406370", "$10k-40k", "PST Games, released Oct 2025.", {}),
    (0, UE, "2475790", "$10k-40k", "DMTesseracT, free-to-play; no support email on Steam.", {"contact_channel": "site (dmtesseract.com)"}),
    (0, UE, "867150", "$10k-40k", "Impromptu Games, puzzle, 100% of 79 reviews.", {}),
    (0, UE, "1959580", "$20k-60k", "Makea Games, parkour systems.", {}),
    (0, UE, "2827230", "$40k-120k", "Combat Cat Studio (China), PvP shooter.", {}),
    (0, UE, "2116120", "$40k-120k", "Games of Tomorrow GmbH, extract shooter, 5.2k reviews.", {"contact_person": "Moritz Naser"}),
    (0, UE, "2307350", "$60k-150k", "CM Immersive, VR survival. VR may be off-target for the buyer: ask.", {}),
    (0, UE, "1648190", "$20k-60k", "iolaCorp, sci-fi RPG.", {}),
    (0, UE, "2565550", "$10k-40k", "Steel Arts Software, survival horror.", {}),
    (0, UE, "3025290", "$20k-60k", "INTENSE (Japan), co-op horror.", {}),
    (0, UE, "3351140", "$10k-30k", "Farkas Interactive, adventure.", {}),
    (0, UE, "3183730", "$10k-40k", "Stunbyte, driving roguelite. No support email on Steam.", {"contact_channel": "site (driveloopgame.com)"}),
    (0, UE, "1429850", "$40k-120k", "Artificer, Devolver-published tactics. No support email; Devolver may hold rights.", {"contact_channel": "studio site / Devolver"}),
    (0, UE, "1299690", "$40k-100k", "Angry Demon Studio. Steam support goes to publisher Wired Productions: reach the studio directly.", {}),
    (0, UE, "2357000", "$40k-100k", "Casey Donnellan Games, tinyBuild-published. tinyBuild may hold IP.", {}),
    (0, UE, "2863640", "$60k-150k", "MoonHood (Sweden), claymation look. Support goes to publisher Fast Travel Games.", {}),
    (0, UE, "3111080", "$20k-60k", "Two brothers, John and Evan Szymanski. 97% of 551.", {"contact_person": "John Szymanski"}),
    (0, UE, "2525310", "$40k-100k", "Sleepy Mill Studio, puzzle-strategy. Support goes to publisher The Arcade Crew.", {}),
    (0, UE, "2453060", "$20k-60k", "Montraluz, liminal exploration. Published by Tlön Industries.", {}),
    (0, UE, "3263320", "$20k-60k", "Two devs (Cagatay Demir, Enes Kaplan), co-op.", {}),
    (0, UE, "2019760", "$10k-40k", "Dragonis Games, horror. No support email on Steam.", {"contact_channel": "Steam page / socials"}),
    (0, UE, "2336440", "$10k-40k", "Solo dev Cem Boray Yildirim, GameDev.ist-published.", {"contact_person": "Cem Boray Yildirim"}),
    (0, UE, "2067050", "$40k-120k", "Dee Dee Creations, physics-driven. Published by Maximum Entertainment. No support email.", {"contact_channel": "studio socials"}),
    (0, UE, "1376200", "$60k-150k", "Pollard Studio (China), psychological thriller. Support goes to publisher Wired.", {}),
    (0, UE, "1778840", "$20k-60k", "Infuse Studio, Silver Lining-published. No support email.", {"contact_channel": "studio site"}),
    (0, UE, "2581410", "$20k-60k", "Misterial Games, Fulqrum-published.", {}),
    (0, UE, "3223390", "$20k-60k", "Redlock Studio, dungeon crawler.", {}),
    (0, UE, None, "$100k-200k", "CLOSURE. UE5 MMORPG, studio closed early 2026 (WARN notices), pulled from Steam 2026-02-02. Who holds the code now (founder, lender, receiver) is the first question.", {"game": "Ashes of Creation", "studio": "Intrepid Studios (closed)", "engine": "UE5", "contact_channel": "find the rights holder", "contact": "", "store_url": "https://en.wikipedia.org/wiki/Ashes_of_Creation", "owners_or_reviews": "delisted"}),
    (0, UE, None, "$20k-80k", "CLOSURE. UE5 survival game, delisted, studio shut Dec 2023. Rights holder unclear; reputational baggage.", {"game": "The Day Before", "studio": "Fntastic (closed)", "engine": "UE5", "contact_channel": "find the rights holder", "contact": "", "store_url": "https://en.wikipedia.org/wiki/The_Day_Before", "owners_or_reviews": "delisted"}),
    # ---- the rest, Three.js ----
    (0, TJ, "3876710", "$10k-20k", "Wristwork's second Three.js game, on Steam Aug 2026.", {}),
    (0, TJ, None, "$8k-15k", "Pelican Party's Three.js retail sim, 4.8 stars on itch.", {"game": "Raccoon Retail", "studio": "Pelican Party", "engine": "Three.js", "contact_channel": "Discord (discord.gg/PhwWYkzfEw)", "contact": "", "store_url": "https://raccoonretail.com", "owners_or_reviews": "27 itch ratings, 4.8"}),
    (0, TJ, "2824230", "$10k-20k", "4,249 itch ratings at 4.8, Steam 2024. CHECK: the dev's engine sk2tch is public on GitHub (qwook/sk2tch); the game content may still be private.", {"contact_channel": "site (lastseenonline.com) / Discord"}),
    (0, TJ, "3038250", "$8k-15k", "Over a year of solo work (dev's three.js forum post, 2025), Electron build on Steam.", {}),
    (0, TJ, "4819620", "$5k-12k", "RPG siege defense, Steam Nov 2026, solo dev.", {"contact_person": "Benjamin Adams"}),
    (0, TJ, "5023550", "$5k-12k", "Racer, Steam Q4 2026.", {}),
    (0, TJ, "5464230", "$5k-12k", "Nuclear strategy sim, Steam Q4 2026.", {}),
    (0, TJ, "5043260", "$5k-15k", "Idle MMORPG on Three.js, Steam Sep 2026.", {}),
    (0, TJ, "5292670", "$5k-12k", "Voxel RPG in development, Steam TBA. Contact via Discord / Mastodon.", {"contact_channel": "Discord (discord.gg/zSxNhUb8Ka)", "contact": ""}),
    (0, TJ, "5253460", "$5k-12k", "Survival, Act One demo, Steam coming soon.", {}),
    (0, TJ, "4416970", "$5k-12k", "Zombie strategy sim, Steam 2027.", {"contact_person": "Nicolas"}),
    (0, TJ, "4688240", "$3k-8k", "Dice roguelike, Three.js + GDevelop: check it is mainly Three.js.", {}),
    (0, TJ, "3888070", "$3k-10k", "Fighting RPG; itch lists Godot and Box2D alongside Three.js: check it is mainly Three.js.", {"contact_person": "Samuel Harrison"}),
    (0, TJ, None, "$3k-8k", "Paid ($5) Three.js puzzle on itch.", {"game": "CrazeOh", "studio": "TripShred", "engine": "Three.js", "contact_channel": "Discord (discord.gg/suhggkeZef)", "contact": "", "store_url": "https://tripshred.itch.io/crazeoh", "owners_or_reviews": "3 itch ratings"}),
    (0, TJ, None, "$5k-12k", "Paid ($9.99) Three.js RPG on itch, released Jun 2026.", {"game": "Iron Abyss", "studio": "OTR HVN", "engine": "Three.js", "contact_channel": "itch.io page", "contact": "", "store_url": "https://otrhvn.itch.io/iron-abyss", "owners_or_reviews": "3 itch ratings"}),
    (0, TJ, None, "$3k-8k", "Three.js puzzle adventure, 4.4 stars from 17 itch ratings (2022).", {"game": "Laputa: Riddles In The Sky", "studio": "Xavier Burrow", "engine": "Three.js", "contact_channel": "itch.io page", "contact": "", "store_url": "https://getpixel.itch.io/laputa", "owners_or_reviews": "17 itch ratings"}),
    (0, TJ, None, "$3k-8k", "Three.js adventure on itch.", {"game": "Dungeon Cartographer", "studio": "lexenson", "engine": "Three.js", "contact_channel": "itch.io page", "contact": "", "store_url": "https://lexenson.itch.io/dungeon-cartographer", "owners_or_reviews": "4 itch ratings"}),
]

COLS = ["rank", "request", "game", "studio", "contact_person", "engine", "evidence_private_complete",
        "status", "contact_channel", "contact", "store_url", "owners_or_reviews", "est_band", "notes"]


def row(rank, req, appid, band, notes, ov):
    r = {c: "" for c in COLS}
    r.update(rank=rank or "", request=req, est_band=band, notes=notes, status="not contacted")
    if appid:
        s, sp = st.get(appid, {}), spy.get(appid, {})
        reviews = sp.get("positive", 0) + sp.get("negative", 0) if sp.get("name") else (s.get("recommendations") or {}).get("total")
        owners = f"{sp['owners']} owners, " if sp.get("owners") else ""
        rel = (s.get("release_date") or {}).get("date", "")
        r.update(
            game=s.get("name", ""), studio=", ".join(s.get("developers") or []),
            engine="UE5" if req == UE else "Three.js",
            evidence_private_complete=f"Commercial Steam release ({rel}); publisher: {', '.join(s.get('publishers') or [])}",
            contact_channel="email (Steam support field)" if (s.get("support_info") or {}).get("email") else "",
            contact=(s.get("support_info") or {}).get("email", ""),
            store_url=f"https://store.steampowered.com/app/{appid}/",
            owners_or_reviews=f"{owners}{reviews or 0} reviews",
        )
        if s.get("website"):
            r["notes"] += f" Site: {s['website']}"
    r.update(ov)
    if not appid and not r["evidence_private_complete"]:
        r["evidence_private_complete"] = "Commercial/closed release, no source repo found"
    return r


rows = [row(*x) for x in ROWS]
rows.sort(key=lambda r: (r["rank"] == "", r["rank"] if r["rank"] else 0))
with open(Path(__file__).parent / "PIPELINE.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)
from collections import Counter
print(len(rows), "rows", dict(Counter(r["request"] for r in rows)),
      "with email:", sum(1 for r in rows if "@" in r["contact"]))
