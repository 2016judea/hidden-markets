#!/usr/bin/env python3
"""First touches for PIPELINE.csv -> SENDS.csv, slotted around every other Zoho send.

Approved by Aidan 2026-10-21 ("schedule these emails to send"). Mailgun read STOP that
morning (5.51% permanent bounces vs a 3% stop, bricks scripts/outreach/mailgun_health.py),
so these go one-to-one from Zoho, scheduled, under ~/.claude/hooks/zoho_send_cap.py.

Range line is the PUBLIC one from DRAFTS.md. The request's own figures and deadline are
PAA 11.1-11.2 Confidential Information until HUD consents in writing; they never go here.

    python3 build_sends.py            # writes SENDS.csv (status=queued, slot times CT)
"""
import csv, importlib.util, json, os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
CT = ZoneInfo("America/Chicago")

spec = importlib.util.spec_from_file_location("cap", os.path.expanduser("~/.claude/hooks/zoho_send_cap.py"))
cap = importlib.util.module_from_spec(spec); spec.loader.exec_module(cap)

# Skipped, with the reason written into SENDS.csv.
SKIP = {
    "Lushfoil Photography Sim": "publisher Annapurna likely owns the code (Aidan, 10/21)",
    "Narrow One": "Discord only, no email",
    "Pigeon: A Love Story": "same studio and address as FACEMINER; one email per studio",
    "Gori: Cuddly Carnage": "contact is publisher Wired Productions' generic support address",
    "KARMA: The Dark World": "contact is publisher Wired Productions' generic support address",
    "The Midnight Walk": "contact is publisher Fast Travel Games' support address",
    "Drop Duchy": "contact is publisher The Arcade Crew's support address",
    "Stygian: Outer Gods": "contact is publisher Fulqrum Publishing's support address",
    "Dreamcore": "contact is at publisher Tlon Industries' domain",
    "Supermoves: World of Parkour": "makea.games has no MX record (dig 10/21): undeliverable",
}

GREET = {
    "The Axis Unseen": "Nate", "The Headliners": "Lucas", "ROGUE LIGHT DECK BUILDER": "Gil",
    "Incursion Red River": "Moritz", "Secret Agent Wizard Boy": "John and Evan",
    "Carry The Glass": "Çağatay and Enes", "Once Alive": "Cem", "Path Defenders: RPG Siege Defense": "Benjamin",
    "Zombies Per Minute": "Nicolas", "Dystopia RPG": "Samuel",
}

# Top 20: verbatim from DRAFTS.md. The rest: written 10/21 from PIPELINE.csv's own fields only.
FIRST = {
    "Pseudoregalia": "Pseudoregalia has about 15,000 Steam reviews, 97% positive, for a movement game you put out yourself in July 2023.",
    "The Axis Unseen": "The Axis Unseen is an open world built by one person and published under your own name in October 2024.",
    "The Forever Winter": "The Forever Winter has been in early access since September 2024, with about 19,000 Steam reviews and no publisher between you and it.",
    "Backrooms: Escape Together": "Backrooms: Escape Together has run since October 2022. Eleven procedurally generated levels, co-op for six, about 23,000 Steam reviews.",
    "Nuclear Nightmare": "Nuclear Nightmare launched in October 2024 and has about 11,500 Steam reviews, self-published.",
    "Deadzone: Rogue": "Deadzone: Rogue released in August 2025, solo or co-op, and sits at 83% positive on about 4,200 reviews.",
    "Murky Divers": "Murky Divers takes up to eight players into abandoned underwater labs, and you publish its mod kit on GitHub yourselves.",
    "Fast Food Simulator": "Fast Food Simulator has about 5,800 Steam reviews since December 2024, 94% positive.",
    "The Headliners": "The Headliners shipped in January 2025 and has about 6,000 Steam reviews, 85% positive.",
    "FACEMINER": "FACEMINER is a Three.js game on Steam with about 1,500 reviews. That's rare.",
    "PolyTrack": "PolyTrack has 691 ratings on itch at 4.7 stars, and it's Three.js with Bullet physics underneath.",
    "Slow Roads": "Slow Roads went to Steam in September 2026 at $7.99 and has about 970 reviews. An endless drive, generated in Three.js.",
    "stein.world": "stein.world has run as a browser MMORPG on Three.js since 2019.",
    "Cepheus Protocol": "Cepheus Protocol has been in early access since May 2020. An open-world RTS, self-published, about 3,000 reviews.",
    "Rivals of Aether II": "Rivals of Aether II launched in October 2024 with about 7,300 Steam reviews.",
    "Microlandia": "Microlandia is a city-builder on Three.js, $9.99 on Steam since December 2025.",
    "Be My Horde": "Be My Horde shipped in June 2024, self-published, 88% positive on about 1,200 reviews.",
    "While We Wait Here": "While We Wait Here has about 1,600 Steam reviews, 90% positive, for a game about serving your last customers before the world ends.",
    # --- written 10/21 ---
    "LOCKDOWN Protocol": "LOCKDOWN Protocol came out in November 2025 and has about 14,900 Steam reviews, a social deduction game for up to 16 players.",
    "Spirit City: Lofi Sessions": "Spirit City: Lofi Sessions has about 12,000 Steam reviews since April 2024, 98% positive.",
    "RATSHAKER™": "RATSHAKER has about 2,800 Steam reviews since it came out in October 2024.",
    "Zombieville USA 3D": "Zombieville USA 3D came to Steam in March 2025 and sits at 95% positive on about 1,800 reviews.",
    "Grimlord": "Grimlord has about 1,000 Steam reviews since December 2024, self-published.",
    "Eternal Strands": "Eternal Strands shipped in January 2025, self-published, with about 930 Steam reviews.",
    "KIBORG": "KIBORG came out in April 2025, self-published, with about 660 Steam reviews.",
    "Shashingo: Learn Japanese with Photography": "Shashingo has been teaching Japanese through photography since February 2024, with about 650 Steam reviews.",
    "ROGUE LIGHT DECK BUILDER": "ROGUE LIGHT DECK BUILDER has 549 Steam reviews, 96% positive, for a game you published yourself in March 2025.",
    "Metal Garden": "Metal Garden came out in March 2025 and sits at 98% positive on 528 Steam reviews.",
    "Orebound": "Orebound, your co-op mining and crafting game, has been on Steam since October 2024 with 435 reviews.",
    "Cinnabunny": "Cinnabunny has 368 Steam reviews since February 2025, 97% positive.",
    "Out of Sight": "Out of Sight came out in May 2025 and sits at 97% positive on 354 Steam reviews.",
    "Settlements Rising": "Settlements Rising has been on Steam since January 2025, a city builder with 335 reviews.",
    "Kristala": "Kristala came out in April 2026 and already has 228 Steam reviews.",
    "Knights Within": "Knights Within sits at 98% positive on 226 Steam reviews since May 2024.",
    "Darkblade Ascent": "Darkblade Ascent came out in October 2025 and has 105 Steam reviews.",
    "InFlux Redux": "InFlux Redux has 79 Steam reviews since November 2024, and every one of them is positive.",
    "Wild Assault": "Wild Assault came out in May 2026 and has about 2,300 Steam reviews.",
    "Incursion Red River": "Incursion Red River has about 5,200 Steam reviews since April 2024, self-published.",
    "Into the Radius 2": "Into the Radius 2 came out in April 2026 and has about 3,100 Steam reviews.",
    "QANGA": "QANGA has been on Steam since September 2024, self-published, with 417 reviews.",
    "Beyond Hanwell": "Beyond Hanwell came out in September 2024 and has 538 Steam reviews.",
    "UNDERWARD": "UNDERWARD came out in February 2025, a co-op horror game with 558 Steam reviews.",
    "Limoria": "Limoria came out on the last day of 2024 and has 143 Steam reviews.",
    "KILL IT WITH FIRE! 2": "KILL IT WITH FIRE! 2 came out in November 2025 and has about 1,100 Steam reviews.",
    "Secret Agent Wizard Boy": "Secret Agent Wizard Boy sits at 97% positive on 551 Steam reviews since March 2025.",
    "Carry The Glass": "Carry The Glass has about 1,900 Steam reviews since October 2024, a co-op game the two of you published yourselves.",
    "Once Alive": "Once Alive came out in November 2024 and has 342 Steam reviews.",
    "BLACKSHARD": "BLACKSHARD came out in April 2025, a dungeon crawler with 216 Steam reviews.",
    "Savanna Sam": "Savanna Sam has been on Steam since May 2025, after more than a year of solo work in Three.js.",
    "Path Defenders: RPG Siege Defense": "Path Defenders comes to Steam on November 10, an RPG siege defense game you built on your own.",
    "Velocity - Midnight Run": "Velocity - Midnight Run is a racer due on Steam this quarter.",
    "Doomsday: M.A.D.": "Doomsday: M.A.D. is a nuclear strategy sim due on Steam this quarter.",
    "PartyScape Chronicles": "PartyScape Chronicles went to Steam in September 2026, an idle MMORPG running on Three.js.",
    "SALVOR ADRIFT": "SALVOR ADRIFT has its Act One demo out ahead of the Steam release.",
    "Zombies Per Minute": "Zombies Per Minute is a zombie strategy sim headed for Steam in 2027.",
    "SHULERO – Dice Roguelike": "SHULERO came out on Steam in May 2026, a dice roguelike.",
    "Dystopia RPG": "Dystopia RPG is a fighting RPG headed for Steam in 2026.",
}
SUBJECT_NAME = {"RATSHAKER™": "RATSHAKER", "SHULERO – Dice Roguelike": "SHULERO",
                "Shashingo: Learn Japanese with Photography": "Shashingo",
                "Path Defenders: RPG Siege Defense": "Path Defenders"}

RANGE = {  # DRAFTS.md "Until HUD consents (public figures only)"
    "unreal": "DataVendor's public listings show codebases at $68K to $220K.",
    "three": "DataVendor's own docs say production codebases have licensed for up to $20,000 each.",
}
LOOK = {
    "unreal": ("What they look for: a UE5 project that builds on a stock engine, plays for 30 minutes\n"
               "or more, has git or Perforce history, and uses assets you own outright. Marketplace\n"
               "packs are the usual snag, so that's the first thing worth checking."),
    "three": ("What they look for: the real Three.js source, not the built bundle, that runs from a\n"
              "clean clone with no paid keys, plays for 30 minutes or more, and has git history. And\n"
              "assets you own outright."),
}


def possessive(name):
    return name + ("'" if name.endswith("s") else "'s")


def body(kind, name, first):
    """Paragraphs as single lines, so mail clients reflow them (the DRAFTS.md wraps are markdown)."""
    return _unwrap(_body(kind, name, first))


def _unwrap(text):
    paras = text.split("\n\n")
    keep = {"Best,\nAidan"}
    return "\n\n".join(p if p in keep else p.replace("\n", " ") for p in paras)


def _body(kind, name, first):
    return (f"Hi {name},\n\n{first}\n\n"
            "AI labs have started licensing the private source code of finished games, to teach\n"
            "models how real games get built. The licence is non-exclusive. You keep the game, the\n"
            f"IP and the Steam page, and you can license it again. {RANGE[kind]}\n\n"
            f"{LOOK[kind]}\n\n"
            "It costs you nothing. The marketplace, DataVendor, pays me a referral fee out of its\n"
            "own share, and your payout stays whole. If you'd rather not deal with the listing, I'll\n"
            "handle it.\n\nWorth fifteen minutes?\n\nBest,\nAidan\n\n"
            "Aidan Jude, Brick and Mortar AI LLC")


def slots(n, start):
    """Next n send times that pass the hook's own caps, 9:00-16:30 CT, 7-min grid."""
    times = []
    for line in open(cap.LEDGER):
        try: times.append(float(json.loads(line)["t"]))
        except Exception: pass
    out, t = [], start
    while len(out) < n:
        t += timedelta(minutes=7)
        if not (9 <= t.hour < 16 or (t.hour == 16 and t.minute <= 30)):
            continue
        e = t.timestamp()
        if all(cap.worst_window(times, e, w) <= c for w, c in cap.CAPS) and \
           min((abs(e - x) for x in times), default=999) >= cap.MIN_GAP:
            times.append(e); out.append(t)
    return out


def main():
    out = os.path.join(HERE, "SENDS.csv")
    if os.path.exists(out) and any(r.get("status") == "scheduled" for r in csv.DictReader(open(out))):
        raise SystemExit("SENDS.csv already holds scheduled sends (message ids). Rebuilding would re-slot them; edit by hand.")
    rows = list(csv.DictReader(open(os.path.join(HERE, "PIPELINE.csv"))))
    queue, skipped = [], []
    for r in rows:
        g = r["game"]
        if "@" not in r["contact"]:
            continue
        if g in SKIP:
            skipped.append((r, SKIP[g])); continue
        if g not in FIRST:
            skipped.append((r, "no first line: not enough data in PIPELINE.csv")); continue
        kind = "unreal" if r["request"].startswith("Unreal") else "three"
        queue.append(dict(rank=r["rank"], game=g, studio=r["studio"], email=r["contact"].strip(),
                          kind=kind, subject=possessive(SUBJECT_NAME.get(g, g)) + " source code",
                          body=body(kind, GREET.get(g, "there"), FIRST[g])))
    # top 20 first, then pipeline order
    queue.sort(key=lambda q: (0, int(q["rank"])) if q["rank"] else (1, 0))
    start = datetime.now(CT).replace(second=0, microsecond=0)
    for q, t in zip(queue, slots(len(queue), start)):
        q["scheduled_ct"] = t.strftime("%Y-%m-%d %H:%M")
    fields = ["rank", "game", "studio", "email", "kind", "subject", "status", "channel",
              "scheduled_ct", "message_id", "their_record", "reason", "body"]
    with open(os.path.join(HERE, "SENDS.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for q in queue:
            w.writerow({**q, "status": "queued", "channel": "zoho one-to-one (scheduled)",
                        "message_id": "", "their_record": q["body"].split("\n")[2], "reason": ""})
        for r, why in skipped:
            w.writerow({"rank": r["rank"], "game": r["game"], "studio": r["studio"],
                        "email": r["contact"], "status": "skipped", "reason": why})
    print(len(queue), "queued,", len(skipped), "skipped;",
          queue[0]["scheduled_ct"], "->", queue[-1]["scheduled_ct"])


if __name__ == "__main__":
    main()
