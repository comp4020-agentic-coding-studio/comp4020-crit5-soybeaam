# Crit 5 reflection

**What was the breakthrough that moved the work forward?**

Realising that a mechanic can be fully working and still be wrong. The
platform-jump version had correct collision, no visible bugs left, and passed
every check — but it wasn't the game the brief's one-tap premise was asking
for, and it carried a texture-tiling bug I kept re-patching instead of
questioning. The breakthrough was deciding to throw the mechanic away rather
than keep fixing it: reverting to the original single-run, fall-into-a-gap
rule removed the bug's entire surface area instead of chasing its symptoms,
and put the game back in line with what a one-tap runner is supposed to feel
like.

**What did this work change about who I want to be as a software developer?**

It sharpened when to stop patching and start reverting. My instinct is to fix
the bug in front of me; this week showed that the more useful question is
sometimes "does this code need to exist at all," not "how do I make this
version correct." I also want to keep checking the actual spec text before
adding scope, rather than assuming a requirement — confirming the brief only
needed *an* ending, not specifically a finish line, kept the game's scope
matched to what was actually asked instead of what I guessed was asked.
