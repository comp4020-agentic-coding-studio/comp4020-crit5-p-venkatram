# Process overview

## What I built

**Name, Place, Animal, Thing**: a letter reel that spins on click, landing on
a letter that starts a mind map radiating from a central hub — Name, Place,
Animal, Thing at the four corners, a countdown ring draining around the hub.
The player has 25 seconds to type one word per category starting with that
letter; a word already used for that category in an earlier round is
rejected forever, so the game gets harder to play cleanly the longer a
session runs. Filling all four boxes completes the round instantly and spins
the reel back into play; letting the ring drain with any box still blank
ends the session and shows the round count as a final score. A session
persists through a reload; a corner refresh button and the loss screen
itself both start over clean.

This replaced an earlier, fully-shipped prototype in this same repo (an
engine-block bracing game across three reskins — mast, tent, garage rig) that
I abandoned entirely by request, in a clean checkpoint commit
([`48e4900`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/48e4900))
rather than a history rewrite, so the earlier work's process is still in this
repo's log rather than erased.

## The moments that mattered

1. **Checking the actual spec text before building against a remembered
   summary of it.** A word-based game reads, on first thought, like it might
   collide with a "no instructions" constraint. Rather than build around a
   recollection of that constraint, I re-fetched the live spec for this crit
   and read its exact wording: the requirement is specifically no
   how-to-play tutorial or instructions, not an absence of all text. Category
   labels and a countdown are content the game is about — like a
   scoreboard's column headers — not instructions on how to play it. That
   distinction is what let this concept proceed at all, and it's a judgment
   call the brief itself says gets settled by a stranger playing cold, not
   by a test.

2. **A design smell caught by reasoning, not by playing.** While designing
   the round-completion flow, before writing any UI code, I noticed that
   requiring a player to wait out the rest of an already-beaten 25-second
   timer after filling the fourth box would feel unresponsive. Fixed in
   [`9db3f9f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/9db3f9f)
   by having `submitWord` complete the round the instant the fourth word
   lands, rather than leaving that to the next tick. This is deliberately
   *not* the change credited to playing below — it came from reading the
   state machine and thinking through what it would feel like, before there
   was a page to click on.

3. **The one change that came from playing it, not reading it.** Once the UI
   existed, I played a full timed round against the real dev server — typing
   real words at human speed, under the real 25-second clock, rather than
   reasoning about the code. The friction showed up immediately: after each
   accepted word, focus fell back to `<body>` instead of moving to the next
   empty box, so finishing a round meant reaching for the mouse and clicking
   into each of the next three boxes in turn. Nothing about that was wrong
   in the code — disabling a locked box is correct — the problem only exists
   once you're actually racing a countdown and losing seconds to mouse
   travel. Fixed in
   [`8b5815b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/8b5815b)
   by advancing focus to the next empty category (or back to the reel, once
   a round completes) right after acceptance — deferred one frame, since
   disabling the just-locked input blurs it back to `<body>` as a separate
   step that would otherwise stomp on a synchronous `focus()` call. A round
   is now playable start to finish from the keyboard alone.

## Verification

`pnpm check` (typecheck, build, and all three test files, 26 tests) passes
at [`8b5815b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/8b5815b).
The focused automated rule is the loss condition — a round that reaches zero
with any category still blank ends the session — alongside tests for word
validation (must start with the round's letter, can never repeat for the
same category, still valid for a different one) and session bookkeeping
(`usedWords` persists across rounds, not just within one).

Beyond the automated checks, I drove the built game with headless Chromium
(outside this repo, not a dependency of it) at both of the course's marking
viewports (1920×1080 desktop, 390×844 phone): the reel spinning and landing
on a letter, a wrong-letter or already-used word visibly flashing and
clearing with no text, a completed round instantly re-arming the reel, a
drained ring with a blank box ending the session and showing the score, a
mid-round reload restoring the exact same state, and the hard-refresh and
loss-screen restart both returning to a clean session.
