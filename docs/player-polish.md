# Player polish acceptance

The beginner rehearsal opens First Rehearsal with solo keys, Chill timing,
75% tempo and the guide part enabled. Normal play retains the selected song
and lineup. Results show the completed take and a clear way to play again.

The ready clock stays at zero; the completed clock stays at the song duration.
Pause presents an explicit resume action. Leaving the window or hiding the
tab pauses playback and clears held input so a missing key-up cannot leave a
note sounding. Resume remains a deliberate player action. Enter and Space
retain native activation on focused buttons; Shift+R resets the set without
claiming the keyboard part's unmodified R key. Early count-in practice is unscored;
the normal first-note timing window still permits an early hit.

## Soundcheck and saved setup

Open **Soundcheck** before a set and choose **Enable sound**. Mapped keyboard,
pad, piano and MIDI input can then audition the enabled instruments without
advancing time or changing scores. The panel displays the played part and input
source, the last MIDI note/device/channel and a warning when master volume is zero.

MIDI device/channel assignments are separate from the chart's musical source.
Each incoming note selects one enabled part: explicit device/channel, explicit
device/all channels, then automatic. Ties use lineup order. Automatic selects
drums for channel 10 and a melodic part for other channels, falling back to the
first automatic part if that preferred type is unavailable. Keyboard and touch
remain available regardless of MIDI assignments. Changing assignments releases
held MIDI notes through their original owner; reconnects refresh the input list.

Song, lineup, difficulty, tempo, guide, click, volume, focus view and MIDI routes
are restored after hydration. Invalid saved values safely fall back to defaults;
playback, audio permission and MIDI access are never restored automatically.
Missing assigned devices remain explicit rather than silently changing routes.

## Automated coverage

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`.
With Chromium installed and `npm run dev` running, `npm run test:session`
checks the actual React session, scoring, input handlers, Web Audio scheduler
and local storage. It controls song time and delays audio initialization to
exercise duplicate starts and cancellation without exposing production test
hooks. It also checks count-in input, focused-button keyboard activation,
held-note stability through volume and manual pause/resume, completion and
saved scores, chart-setting resets, beginner setup, focus-loss cleanup,
autoplay completing without changing personal bests, room settings pausing
playback, and opening the mobile setlist from focus mode.
`npm run test:setup` checks audio unlock and unscored warmup, simulated device
and channel routing, releases during reassignment, saved setup after reload and
invalid storage recovery. Its virtual MIDI devices exercise browser integration;
they do not establish physical instrument latency.

These source-module regressions run against the development server; production
render acceptance remains the separate browser smoke check.

## Physical acceptance still required

Browser execution does not establish MIDI-device latency or audible speaker
timing. On the intended computer and MIDI instrument, play First Rehearsal:

1. Connect MIDI and play a note and a sustained note. Confirm one visible hit
   per press and a clean release.
2. Play against the guide at 75% and 100% tempo. Listen for alignment and
   confirm the judgment feels consistent with the sound.
3. Hold a note, leave the game window, then return. Confirm it is paused,
   silent and resumes only when requested.
4. Unplug and reconnect the instrument. Confirm connection feedback and
   successful playing after reconnecting.

Use the production build for this pass. Commercial recordings and subjective
chart fairness require their own acceptance; this change does not claim to
validate them.
