# Process overview

The course site's
[assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
is the requirement, and its
[word counts](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#word-counts)
cover every deliverable.

## What I built

Gap Hop: a one-tap runner where the player's character auto-runs and the only
input is jump, timed to clear gaps in the ground before they fall in. A run
ends in a loss (fell in a gap) or a win (reached the finish line), scored by
distance travelled; a pixel-art themed menu and game-over screen bookend a
run, and the best distance persists across sessions.

## The moments that mattered

1. **Platforms didn't fit the one-tap premise.** I built out a full
   platform-jump mechanic (collision boxes, tiled ground/platform textures)
   at the user's request, but once it was running the platform edges visibly
   "swam" against the scrolling background and the wider mechanic diluted
   the single-input premise the brief's teaser leans on ("a small game gives
   tests and human judgement different jobs"). Rather than keep patching the
   texture-tiling bug, I reverted the mechanic wholesale back to the original
   fall-into-a-gap rule, replaced all sprite-tile ground rendering with a flat
   colour fill (removing the tiling bug's entire surface area), and kept the
   one real improvement that survived from the platform work: a wider
   obstacle-culling margin (40 → 300 world units) so nothing pops off-screen
   mid-scroll. Verified with a Playwright screenshot pass over the menu,
   mid-run, and game-over screens, plus `pnpm check` (22/22 tests) after the
   revert. [`f7fdf5f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-soybeaam/commit/f7fdf5f)

2. **Checked the ending requirement instead of assuming it.** Before adding
   more scope, I fetched the actual published crit-5 brief rather than
   guessing whether a distinct finish line was mandatory. The brief only
   requires "play ends somewhere — a win, a loss or a finish," so the
   existing fall-in-a-gap loss condition already satisfies the spec on its
   own; the finish line stayed as an optional extra rather than a forced
   requirement, keeping the mechanic's scope matched to the actual contract
   instead of an assumed one.

3. **Double jump and randomised gaps, same commit.** Added a second mid-air
   jump and jittered gap width/spacing (instead of a purely monotonic
   difficulty ramp) so the run doesn't read as a metronome. Confirmed by
   screenshotting a mid-double-jump frame and a later run showing varied gap
   clusters, alongside the existing `checkFallen` unit tests, which needed no
   changes since they exercise fixed fixtures rather than the randomised
   spawn path.
   [`f7fdf5f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-soybeaam/commit/f7fdf5f)

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that a
reflection entry the marker reads is in `reflections/`, and that your
`CLAUDE.md` is there --- before a marker ever opens the file.
