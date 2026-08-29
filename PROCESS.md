# Process overview

## What I built

**Bolt the Engine**: an engine block sitting on a garage test rig, fastened
down at four mounts, shaking harder as the throttle ramps up over the run —
and drifting, so which mount is under the most strain keeps changing. The
only verb is click-drag from a small parts palette (plentiful bolts, one
scarce weld) onto a mount, which fastens it and instantly damps its shake; a
weld stiffens a mount more than a bolt does, and there are fewer materials
than mounts, so at least one always goes unfastened — a real decision about
where to spend the scarce weld. Strip any one mount past its strain limit and
the engine tips off the rig (loss); survive the full test window with every
mount intact and the rig settles calm (win). No text, no instructions, on
screen or off — the only affordances are the mounts' own colour and jitter,
live every frame, telling you which one is in trouble right now.

## The moments that mattered

1. **Renaming a tested mechanic without retesting the mechanic.** This game
   went through two full reskins before landing here (a mast, then a tent,
   then this rig), and each time the physics, the difficulty curve, and the
   drag-and-fasten interaction stayed identical — only names and rendering
   changed. The safety net was `spec/game.test.ts`: 26 tests, same count and
   same shape before and after each rename, because the tests assert on the
   *rule* (a mount stripping past its threshold, a weld out-stiffening a
   bolt, a fastened mount's shake cutting instantly) rather than on names. If
   a rename had silently changed behaviour, the tests would have caught it
   immediately rather than requiring a fresh round of manual verification. Landed
   in
   [`b16ff9d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/b16ff9d).

2. **The one change that came from playing it, not reading it.** Every rule
   and every constant passed `pnpm check` and a battery of simulated bracing
   strategies before I ever looked at a rendered frame. But the mount layout
   scaled the engine's width purely off viewport *height*
   (`Math.min(height * 0.65, 640)`), with no cap tied to the available
   *width*. At the phone marking viewport (390×844) that pushed the two
   outermost mounts — the two the difficulty curve depends on being seen and
   reached, since they're the most exposed to the drifting throttle — off
   the edge of the canvas entirely. No unit test or type check could have
   caught this; it only showed up in a headless screenshot of the actual
   built page at the actual marking size. Fixed by capping the span at
   `(width - paletteWidth()) * 0.85` as well, then re-verified with fresh
   screenshots at both marking viewports confirming all four mounts are
   visible and a drag onto an outer mount now lands. Also in
   [`b16ff9d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/b16ff9d).

3. **Verifying an assumption before calling it a bug.** A screenshot pass
   showed a weld placed during the wordless practice window seemingly vanish
   moments later, with no rendering error to explain it. Rather than patch
   the render code, I checked the state transition first: placing any
   material during practice ends practice and resets the run to
   `initialState()`, on purpose, so a practice placement never carries into
   the scored run. Confirming that against the code before touching anything
   saved a wasted fix for behaviour that was already correct.

## Verification

`pnpm check` (typecheck, build, and all three test files) passes at
[`b16ff9d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/b16ff9d).
Beyond the automated checks, I drove the built game with headless Chromium
(outside this repo, not a dependency of it) at both of the course's marking
viewports (1920×1080 desktop, 390×844 phone) to confirm, screenshot by
screenshot: the wordless practice window resetting into the real run, the
live drag line and mount colour/jitter feedback during an actual drag, a
weld landing and visibly protecting a mount, and an under-fastened engine
tipping off the rig — with all four mounts reachable on both viewports.
