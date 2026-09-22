# Session stability acceptance

Live volume changes must preserve the session's score, combo, held notes,
position, and playback state. Guide and click settings can be changed while
paused and take effect on resume. Song, lineup, difficulty and tempo changes
start a fresh ready session; a paused session must not retain a misleading
Resume button after its chart changes.

## Automated checks

Use Node 22 or newer. Run `npm ci`, `npm test`, `npm run typecheck`, and
`npm run build`. Install Chromium with `npx playwright install chromium`,
start the app with `npm run dev`, then run `npm run test:session`.

The session regression uses the real React component, input handlers, scoring,
Web Audio engine and local storage with a controlled song clock. It checks a
scored hold through four volume changes, pause, listening option changes,
resume, release, song completion and saved score. It also checks that a tempo
change while paused creates a fresh session. It is a dev-server test because it
imports source modules to control time without adding production test hooks.

## Audible playback check

Start First Rehearsal, play a few notes, and adjust volume while the song plays.
Confirm the sound level changes, notes keep moving and score/streak remain.
Pause, change volume and listening options, then resume. Confirm progress
continues from the paused position and the song reaches its results screen.
Repeat from the production build. Real MIDI device acceptance remains separate
from synthetic keyboard events and browser audio execution.

## Follow-up work

Device/channel routing, Expert octave collisions and event-timestamp judgment
are outside this change. This regression does not establish physical MIDI
latency, speaker output timing or musical chart fairness.
