# Crit 5 reflection

**The breakthrough** was realising the spec's "one mechanic, wordless, obvious
in ten seconds" constraint is a design problem before it's an engineering one,
and that I'd started from the wrong end of it. I came in with an elaborate
survival-game design doc — multiple systems, an explicit tutorial arc — that
was a good answer to a different question. The actual unlock was distilling
that down to the one physical idea underneath all of it (bracing something
against escalating force) and asking what the smallest possible version of
*that* looks like: one mast, one drag gesture, one number that decides win or
loss. Once the scope was that small, the rest — a testable snap rule, a
tunable difficulty curve, a wordless affordance — followed pretty directly.
The temptation to keep one more system "just in case" was the thing to resist,
not the thing to reach for.

**What this changed** is how much I now trust simulation over live tweaking
for anything with a feel to it. Before writing a single line into the real
module, I ran the mast's physics headlessly against several playing
strategies in a throwaway script and watched the numbers before committing to
constants — cheaper and more repeatable than reloading a browser tab and
eyeballing one run at a time. But it also taught me where that trust runs
out: the numeric sims and unit tests were blind to how small the mast looked
on an actual 1920x1080 screen, which only showed up once I loaded the real
build at the real marking viewport. I want to keep building the habit of
simulating what's cheap to simulate, but treating an honest look at the
running thing — at the sizes it'll actually be judged at — as a separate,
non-optional step, not a formality after the tests pass.
