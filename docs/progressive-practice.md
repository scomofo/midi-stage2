# Progressive section practice

Choose a passage, then use **Build up tempo** to choose a starting and target
tempo from 50% through 125%, in five-percentage-point steps. Enable progression,
then Start when ready. Ordinary practice is unchanged unless a goal is enabled.

Two consecutive completed scored takes at **95% accuracy or better**, with
**no misses, extra presses or broken holds**, advance the next take by five
percentage points. A difficult take clears the consecutive count and keeps the
current speed. An empty or interrupted take cannot qualify. Two strong takes
at the target complete the goal and stop automatic repeats. A single strong
take can establish the best clean tempo, but cannot advance the speed alone.

Tempo steps retain recording pitch using the existing streaming playback.
New takes keep count-ins and rebuild Judge timing windows for the new speed.
The previous take is stopped before the next one starts. A guarded handoff
between React configurations cancels restart on reset or context changes.
Turning Repeat section off stops after the current take, even if that take
earns a faster next step. Resume progression applies that saved next step;
it never starts playback. Changing the ordinary tempo selector pauses
progression; Pause progression leaves ordinary practice available.

## Scoring and play-along

Automatic progress uses actual game judgments from MIDI, mapped keys, pads or
arcade frets/strums. Imported exact-pitch guitar scoring still requires MIDI.
This measures performance against the current chart, not recording accuracy,
musical expression or real string/fret choice. An inaccurate imported chart
can produce misleading training feedback; review its notes before training.

Solo six-string guitar **Play along** stays unscored. Completing a play-along
take enables **Ready for faster**; at the target it enables **Confirm target
tempo**. Each confirmation can be used once. It advances only on the user's
explicit report, never records an accuracy percentage and never earns a best
clean tempo. Watching autoplay on other instruments earns no progress and
clears a pending strong-take streak. Pause/resume continues one take rather
than appending a new one; resetting an unfinished take does not append history.

## Saved progress

The panel keeps the target, next tempo, consecutive count, best clean tempo,
completed count and latest twelve take summaries. Scored and self-reported
takes are labeled separately. No practice score enters a full-song personal
best. The versioned local record retains the latest forty goals. Its context
includes a content fingerprint of the chart, the exact passage bounds,
difficulty and enabled instrument/source assignments. Chart or setup changes
therefore do not inherit unrelated progress.

Reload restores goal data without enabling progression or starting audio.
Continue the saved rehearsal or select the same passage, then explicitly
Resume progression. Active goals update the existing rehearsal bookmark only
after audio startup succeeds, including a newly started tempo and explicit
guitar play-along. An unsupported or malformed tempo is not restored; old
quarter-step preferences and bookmarks remain valid. Starting a new goal
replaces that context's history, as the panel explains.

Blocked or full storage leaves the current visit playable and displays a
warning. These goals are local to this browser, not account-synced achievements.

## Verification

Domain tests cover five-point speed validation, consecutive successes, difficult
and empty takes, misses/extras/broken holds, exact target capping, single-use
manual confirmation, bounded history/storage, corrupted storage and isolation.
Preferences and bookmarks round-trip earned intermediate tempos. The pitch PCM
checks include the new 80% step as well as the original offered tempos.

`npm run test:progressive-practice` drives the actual imported chart, native
Web Audio count-ins, MIDI event handlers, judges and rendered controls. It
does not seed progress or grading state or replace the game clock. A lower
pixel backing scale retains a 1440px desktop CSS viewport on software-rendered
CI machines. MIDI delivery follows scheduled audible count-in beats; real
late input is allowed to cause difficult takes, which must hold tempo rather
than being coerced into successful results.

The same helper runs against development and built output. It verifies earned
advancement, a deliberately omitted note, target completion, native tempo
scheduling, autoplay exclusion, repeat-off, reload/range isolation, explicit
resume, manual guitar confirmation and storage failure. Existing desktop
practice, targeted-practice and bookmark helpers protect ordinary transport
and full-song score isolation. QA artifacts stay under `/workspace/screenshots/`.
