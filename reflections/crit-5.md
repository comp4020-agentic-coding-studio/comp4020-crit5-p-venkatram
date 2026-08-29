# Crit 5 reflection

**The breakthrough** was realising the spec's "one mechanic, wordless,
obvious in ten seconds" constraint is a design problem before it's an
engineering one, and that I'd started from the wrong end of it. I came in
with an elaborate survival-game design doc — multiple systems, an explicit
tutorial arc — that was a good answer to a different question. The actual
unlock was distilling that down to the one physical idea underneath all of
it (fastening something against escalating, drifting force) and asking what
the smallest possible version of *that* looks like: a handful of mounts, one
drag gesture, one number per mount that decides win or loss. Once the scope
was that small, the rest — a testable strip rule, a tunable difficulty
curve, a wordless affordance — followed pretty directly. That same
narrowness is also why the game survived two full reskins (mast, then tent,
then this garage rig) without a rewrite: the mechanic underneath never
changed, so only names and rendering ever had to.

**What this changed** is how much I now trust simulation over live tweaking
for anything with a feel to it, and how sharply I've learned where that
trust runs out. Before any constant landed in the real module, I ran the
mount physics headlessly against several fastening strategies in a
throwaway script and watched the numbers — cheaper and more repeatable than
reloading a browser tab and eyeballing one run at a time. But the numeric
sims and unit tests were blind to a purely geometric bug: the engine's
layout scaled off viewport height with no cap on width, which quietly pushed
the two outermost — and most important — mounts off the canvas entirely on
the phone marking viewport. That only surfaced once I loaded the actual
build at the actual marking size and looked. I want to keep building the
habit of simulating what's cheap to simulate, but treating an honest look
at the running thing — at the sizes it'll actually be judged at — as a
separate, non-optional step, not a formality after the tests pass.
