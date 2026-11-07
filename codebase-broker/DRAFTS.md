# Drafts — none sent

> **2026-10-21:** Aidan approved sending. 57 first touches scheduled in Zoho, 10/24 09:21 to 10/31 11:06 CT, public range line only; 9 skipped. Per-row status, time and message id: `SENDS.csv` (built by `build_sends.py`).

Drafted 2026-10-20 for Aidan to read. Channel: one-to-one from the Zoho mailbox (25 a
day cap), each opening on the reader's own game. Addresses are in `PIPELINE.csv`.

**Send order.** Draft 0 to HUD goes first. Its answer decides which range line the dev
emails carry (see "The range line" below). And the identified-supply acceptance it asks
for is what makes our fee 7.5% instead of 5%.

---

## 0. To HUD / DataVendor

Send through the in-app feedback, or book the call at
cal.com/team/hud/talk-to-us-data-vendor-platform. No public partner address found.

> **Subject:** Game codebase requests: bringing you the devs
>
> Hi,
>
> We're a Tier 2 vendor, Brick and Mortar AI LLC. The Unreal and Three.js game requests
> that went up today are supply that mostly sits with people who have never heard of
> DataVendor. A solo dev with a finished game on Steam and the repo on a laptop.
>
> I've built a list of 82 of them. 59 UE5 games and 23 Three.js games, all commercial
> releases with no public source. I'd like to send each one to you on our referral code.
>
> Two asks. First, written consent under PAA 11.2 to tell them the request exists, with
> its range and deadline. Without it, the email can only say "labs license game code",
> and nobody moves before November 3 on that. Second, identified-supply acceptance under
> 3.2 of the referral agreement for the games on the list, which I can send as a sheet.
>
> And one question. For a dev who would rather we packaged and listed the game for them,
> what does representation look like on your side?
>
> Best,
> Aidan
>
> Aidan Jude, Brick and Mortar AI LLC

---

## 1. Template — Unreal

> **Subject:** {Game}'s source code
>
> Hi {name},
>
> {first line: their own game, from the list below}
>
> AI labs have started licensing the private source code of finished games, to teach
> models how real games get built. The licence is non-exclusive. You keep the game, the
> IP and the Steam page, and you can license it again. {range line}
>
> What they look for: a UE5 project that builds on a stock engine, plays for 30 minutes
> or more, has git or Perforce history, and uses assets you own outright. Marketplace
> packs are the usual snag, so that's the first thing worth checking.
>
> It costs you nothing. The marketplace, DataVendor, pays me a referral fee out of its
> own share, and your payout stays whole. If you'd rather not deal with the listing, I'll
> handle it.
>
> Worth fifteen minutes?
>
> Best,
> Aidan
>
> Aidan Jude, Brick and Mortar AI LLC

## 2. Template — Three.js

Same as above, with this paragraph swapped in for the UE5 one:

> What they look for: the real Three.js source, not the built bundle, that runs from a
> clean clone with no paid keys, plays for 30 minutes or more, and has git history. And
> assets you own outright.

## The range line

| When | Unreal | Three.js |
|---|---|---|
| **Until HUD consents** (public figures only) | DataVendor's public listings show codebases at $68K to $220K. | DataVendor's own docs say production codebases have licensed for up to $20,000 each. |
| **After written consent** | One buyer is licensing UE5 games right now, up to $200,000 each, and stops taking them November 3. | One buyer is licensing Three.js games right now, up to $20,000 each, and stops taking them November 3. |

The request's terms are Confidential Information under PAA 11.1–11.2. The second row
does not go out on our word alone.

---

## First lines, top 20

Every figure comes from `data/` (SteamSpy review counts, Steam store dates, itch ratings),
pulled 2026-10-20.

1. **Pseudoregalia** (sup.rittzler@gmail.com): Pseudoregalia has about 15,000 Steam
   reviews, 97% positive, for a movement game you put out yourself in July 2023.
2. **The Axis Unseen** (Nate Purkeypile, justpurkeygamesllc@gmail.com): The Axis Unseen
   is an open world built by one person and published under your own name in October 2024.
3. **The Forever Winter** (havefun@fundogstudios.com): The Forever Winter has been in
   early access since September 2024, with about 19,000 Steam reviews and no publisher
   between you and it.
4. **Backrooms: Escape Together** (support@triiodide.dev): Backrooms: Escape Together has
   run since October 2022. Eleven procedurally generated levels, co-op for six, about
   23,000 Steam reviews.
5. **Nuclear Nightmare** (info@bgproductions.com): Nuclear Nightmare launched in October
   2024 and has about 11,500 Steam reviews, self-published.
6. **Deadzone: Rogue** (community@prophecygames.com): Deadzone: Rogue released in August
   2025, solo or co-op, and sits at 83% positive on about 4,200 reviews.
7. **Murky Divers** (support@embers.games): Murky Divers takes up to eight players into
   abandoned underwater labs, and you publish its mod kit on GitHub yourselves.
8. **Fast Food Simulator** (contact@noceilinggames.com): Fast Food Simulator has about
   5,800 Steam reviews since December 2024, 94% positive.
9. **The Headliners** (Lucas Sceaux, lucas_sceaux@hotmail.com): The Headliners shipped in
   January 2025 and has about 6,000 Steam reviews, 85% positive.
10. **FACEMINER** (contact@wristwork.com): FACEMINER is a Three.js game on Steam with about
    1,500 reviews. That's rare.
11. **PolyTrack** (info@kodub.com): PolyTrack has 691 ratings on itch at 4.7 stars, and
    it's Three.js with Bullet physics underneath.
12. **Narrow One** (Pelican Party, Discord only): Narrow One has 848 itch ratings at 4.6
    stars, a multiplayer shooter on Three.js that went to Steam in August 2025.
13. **Slow Roads** (support@slowroads.io): Slow Roads went to Steam in September 2026 at
    $7.99 and has about 970 reviews. An endless drive, generated in Three.js.
14. **stein.world** (contact@stein.world): stein.world has run as a browser MMORPG on
    Three.js since 2019.
15. **Cepheus Protocol** (support@halcyonwinds.com): Cepheus Protocol has been in early
    access since May 2020. An open-world RTS, self-published, about 3,000 reviews.
16. **Rivals of Aether II** (contact@rivalsofaether.com): Rivals of Aether II launched in
    October 2024 with about 7,300 Steam reviews.
17. **Microlandia** (support@microlandia.city): Microlandia is a city-builder on Three.js,
    $9.99 on Steam since December 2025.
18. **Be My Horde** (support@polishedgames.com): Be My Horde shipped in June 2024,
    self-published, 88% positive on about 1,200 reviews.
19. **While We Wait Here** (badvicesgames@gmail.com): While We Wait Here has about 1,600
    Steam reviews, 90% positive, for a game about serving your last customers before the
    world ends.
20. **Lushfoil Photography Sim** (Matt Newell, support@lushfoil.com): Lushfoil came out in
    April 2025 through Annapurna, and every one of those landscapes started on your
    machine.

Before any of these go: Narrow One has no email, so it's a Discord DM or nothing.
Lushfoil's address may route to Annapurna, and the publisher deal may own the code.

## Reply draft, Nate Purkeypile (The Axis Unseen), 2026-11-07

Re: The Axis Unseen's source code. He asked 11/06: "Are the marketplace packs a deal breaker for this? That game uses a few of them." Note: DataVendor's UE5 request closed 2026-11-03 21:00 UTC, before his reply.

> Hi Nate,
>
> Not by itself. It depends on how much the game leans on them.
>
> Marketplace packs are licensed to ship inside a game, not to hand over as source files. So they come out of what gets licensed. If a few packs are props and textures, the project usually survives without them. If they're the character, the animation set or the world, it doesn't.
>
> The open request I wrote about closed on November 3. But they buy in rounds, and the asset question is the same every time. Could you send me the list of packs and what each one does in the game? I'll tell you straight whether it's worth a listing.
>
> Best,
> Aidan
