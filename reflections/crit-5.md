# Crit 5 reflection

**The breakthrough** was going back to the primary source instead of trusting
my own summary of it. I'd carried into this session a recollection that the
spec banned essentially all on-screen text, which seemed to rule out a
word-guessing game before I'd written a line of it. Rather than either
abandon the idea or quietly hope the recollection was wrong, I re-fetched the
live spec and read the actual sentence: no *how-to-play* instructions, not no
text. That's a real and useful distinction — a scoreboard's column headers
aren't a tutorial — and it's the kind of thing that's cheap to get right by
checking and expensive to get wrong by assuming. I want to keep treating "I
remember the constraint says X" as a claim to verify before it shapes a whole
build, not a fact to build on.

**What this changed** is how I think about the difference between a design
smell I can catch by reading code and a feel problem I can only catch by
playing. This week gave me a clean example of each, back to back. Reading the
state machine before any UI existed was enough to notice that making a player
wait out an already-beaten timer would feel bad — that's a property of the
rules themselves, visible on paper. But the actual friction that showed up
once I played a timed round for real — losing seconds to mouse travel between
four boxes because focus didn't advance after a correct answer — was invisible
in the code, because the code was correct: disabling a locked box is the right
behaviour. The bug was only in how those individually-correct pieces felt
strung together under a real clock. I want to keep pushing on that boundary
deliberately: ask what a state machine implies before building the UI around
it, but still budget real playing time afterward for exactly the class of
problem that only exists once a human, not a test runner, is under the timer.
