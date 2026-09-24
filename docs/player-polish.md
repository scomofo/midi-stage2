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
the normal first-note timing window still permits an early hit. Resuming during
the count-in plays its remaining clicks without restarting the take.

Completed results move focus to the result heading and into view. Subsequent
HUD updates leave focus alone, so Tab continues to the next action. If a personal
best cannot be saved because browser storage is blocked or full, results clearly
say **Score not saved**, preserve existing records, and keep replay available.

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

## Playable imports

**Import songs** opens a preview without starting audio or changing the selected
song. Validated chart JSON, constant-tempo MIDI files, and decoded audio files
can be added to the setlist. Failed imports leave the current selection intact.
Audio previews include **Listen to your track**, a local player for the original
recording. It never starts automatically or advances the game. Closing, replacing
or adding the preview stops audition playback and releases its temporary URL.
Only populated parts can be enabled; a suitable part is selected automatically.
Identical imports reuse their entry, and removing the selected import returns
to a fresh built-in set. Removing another entry preserves a paused take.
Import previews and errors move into view after processing. Saved-song actions
are disabled while reading or saving; closing the library remains available.

Audio imports analyze actual energy attacks into one any-note HIT lane and play
the original recording against the same audio clock as scoring. Count-in,
pause/resume, seek, volume and playback speed apply to the backing source. Speed
also changes its pitch. Preview notes explain approximate detection and tempo;
this does not claim note-for-note transcription or subjective musical fairness.
Solo rhythm charts also accept Space, with a wide touch pad and tap-specific
instructions. Holding Space cannot repeat-score notes or scroll the page;
focused buttons retain normal keyboard activation. The transport's **Reset set**
returns to ready without playback, while **Restart set** in the pause panel
starts a fresh take.

Chart metadata is saved locally; original files use IndexedDB. Missing audio
produces a reimport instruction instead of a silent set. Storage failures retain
a playable current-visit copy. Import cancellation releases unaccepted previews,
and loading media metadata checks the six-minute limit before full PCM decoding.
The importer reports checking, decoding and analysis progress. Analysis runs in
cooperative chunks so the library can close promptly. Cancellation releases
metadata resources and skips later work; a browser decode already in flight may
finish internally, but its cancelled result is not analyzed or added.

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

`npm run test:imports` exercises real file-picker JSON/MIDI import, playable
notes/holds, duplicate handling, persistence, invalid files, populated lineups,
removal and mobile layout. `npm run test:audio` uses original generated WAV,
MP3 and FLAC fixtures to check decoder support, detected hits, backing-buffer
playback, any-pitch MIDI input, count-in, pause/resume, speed, storage restoration
and missing-audio recovery. These fixtures contain known attacks; listening
acceptance on a varied music collection remains a separate check.

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
