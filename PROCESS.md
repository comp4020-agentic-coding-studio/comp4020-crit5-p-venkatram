# Process overview

## What I built

**Brace the Mast**: a single wooden mast, anchored in sand, swaying under wind
that ramps up over the run. The only verb is click-drag from the mast to the
ground, which plants a brace and instantly damps the sway; a brace higher up
counters more torque, so a limited four-brace budget forces a real decision
about when and how high to spend each one. Lean too far and the mast snaps
(loss); hold it through the full escalation window and the sky brightens to
dawn (win). No text, no instructions, on screen or off — the only affordance
is that the mast is the one thing moving.

## The moments that mattered

1. **Tuning by simulation, not by guessing and reloading.** A physics-feel
   game like this lives or dies on its constants (wind ramp, brace strength,
   snap angle), and tweaking them by playing one run at a time is slow and
   noisy — a single run only samples one bracing strategy. Instead of
   guessing values and eyeballing the result in the browser, I wrote a
   throwaway Node script that ran the same simulation headlessly against
   several bracing strategies (unbraced, reactive-low, front-loaded-high) and
   printed when each one snapped or survived, before any constant landed in
   the real module. That's how `WIN_TIME`, `RAMP_TIME`, `BRACE_STIFFNESS` and
   `SNAP_ANGLE` in
   [`9348643`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/9348643)
   arrived already producing the intended curve: an unbraced mast snaps in
   ~7s (obvious fast), two well-placed high braces reliably win, four
   low-placed braces reliably lose, and four mid-height braces produce a
   narrow near-miss loss — a discoverable "oh, height matters" moment. The
   scratch tuning script itself was never committed; the constants and the
   tests that pin them (`spec/game.test.ts` in the same commit) are the
   record of it.

2. **Caught my own spec violation before it shipped.** The spec's central
   constraint is that a stranger gets zero instructions, on screen or off —
   which includes screen-reader text. My first draft of the canvas's
   `aria-label` read "...drag from the mast to the ground to brace it",
   which is exactly the instruction the game isn't allowed to give. I caught
   this on review before ever running the page, and rewrote it to a purely
   descriptive label ("A tall wooden mast leaning in the wind on a sandy
   shore") in
   [`ef2c961`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/ef2c961).
   The nav and `<h1>` stay in the DOM in the same commit — the shipped
   invariants require a landmark and one heading — but are visually hidden,
   so the accessibility/SEO requirements and the "no tutorial" requirement
   don't fight each other.

3. **The one change that came from playing it, not reading it.** Everything
   above was validated by simulation and by unit tests, which is exactly the
   kind of check that can miss something purely visual. Headless Playwright
   passes at the course's actual marking viewports (1920x1080 desktop,
   390x844 phone — from the assessment page, not assumed) showed the mast
   rendering fine but reading as a thin tick mark lost in a lot of empty sky
   at 1920x1080, because its length was capped at a flat 420px chosen while
   testing at a much smaller window. No test could have caught this — it's
   only visible once you actually load the built page at the real viewport
   size. Fixed in
   [`922ac0d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/922ac0d)
   by scaling the mast's length with viewport height (capped at 600) instead
   of a flat number, then re-verified with another headless pass at both
   marking viewports to confirm drag-to-brace still worked and nothing broke
   on the narrow phone layout.

## Verification

`pnpm check` (typecheck, build, and all three test files — the shipped
invariants plus `spec/game.test.ts`) passes at
[`922ac0d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-p-venkatram/commit/922ac0d).
Beyond the automated checks, I drove the built game with headless Chromium
(outside this repo, not a dependency of it) to confirm, screenshot-by-screenshot:
an unbraced mast snapping and offering a click-to-restart, a bracing session
recovering from a near-snap, and a front-loaded bracing strategy holding
through to the dawn win state — at both of the course's marking viewports.
