# MIDI / STAGE 2

A browser MIDI rhythm game — real instruments, real play. Built with
**React 19 + TanStack Start + Vite + Tailwind CSS v4**; the stage is rendered on
`<canvas>` and every sound is synthesized live with the **Web Audio API**. This
is the React rewrite of the vanilla-JS
[`midi-stage`](https://github.com/scomofo/midi-stage).

## How it works

- Pick a song from the setlist and a lineup of 1–4 players (drums, keys,
  guitar, bass). Five songs ship with the game, all procedurally generated:
  **First Rehearsal**, **Open Stage**, **Neon Circuit**, **After Hours**, and
  **Voltage Run**.
- Notes stream down the lane highway; hit them in time. Timing windows scale
  with tempo and difficulty (chill / standard / expert); long notes are hold
  notes, and sustained holds earn extra score.
- Judgment and the song clock run off the **audio clock** (output-latency
  compensated), so scoring stays fair even when you touch volume, tempo, or
  pause mid-song.

## Getting started

Requires **Node 22+**.

```sh
npm ci
npm run dev   # serves the app on http://0.0.0.0:8082
```

## Scripts

| Script              | What it does                                                          |
|---------------------|-----------------------------------------------------------------------|
| `npm run dev`       | Dev server on `0.0.0.0:8082`                                          |
| `npm run build`     | Production build (plus DB migration)                                  |
| `npm run typecheck` | `tsc --noEmit`                                                        |
| `npm run lint`      | `eslint .`                                                            |
| `npm test`          | Script tests (`node --test`) plus platform unit tests                 |
| `npm run test:session` | Playwright session regression — needs Chromium and `npm run dev` running |
| `npm run test:setup` | Soundcheck, MIDI routing and saved-setup browser regression |
| `npm run test:imports` | Chart/MIDI import, playback, saved songs and mobile regression |
| `npm run test:audio` | Real WAV/MP3/FLAC import, backing playback, storage and rhythm-input regression |

## Player experience

Playback controls stay above the highway. **Focus stage** expands the playfield;
**Try beginner rehearsal** starts solo keys at 75% tempo with Chill timing, guide
and click enabled. Results show the judgement breakdown, sustained notes, a
personal best and a practice tip, with replay and next-song actions.

**Soundcheck** enables audio before a set so you can try mapped keys, pads, or MIDI
without scoring. Choose a device and channel for each part; automatic routing
sends channel 10 to drums and other channels to the first available melodic part.
Each MIDI note plays one part. Explicit channel assignments take priority over
all-channel assignments, followed by automatic routing; ties follow lineup order.

Your song, lineup, difficulty, tempo, guide, click, volume, focus view and MIDI
assignments are remembered on this browser. Returning always opens a fresh ready
set. MIDI permission and sound still require a click, and a missing assigned
device stays marked disconnected until you reconnect or choose another input.

Leaving the window, hiding the tab, disconnecting a MIDI input, or opening a
settings panel pauses the set. Resume is deliberate. The game bundles its fonts
locally, and the keyboard/piano controls support focus and touch cancellation.
See `docs/player-polish.md` for the acceptance boundary.

The full acceptance loop from `docs/session-stability.md`:

```sh
npm ci && npm test && npm run typecheck && npm run build
npx playwright install chromium
npm run dev        # in one terminal
npm run test:session
```

## Controls

- **Enter** starts/pauses when the stage has focus; **Escape** pauses or closes a panel.
- **Shift+R** resets while paused/ready; unmodified R remains a playable keys lane.

- **Keyboard** — one lane per key, per instrument:
  - Drums: `Space D F G H J`
  - Keys: `A S W E R T Y U I O P [`
  - Guitar: `Z X C V B N M , . / ; '`
  - Bass: `1 2 3 4 5 6 7 8 9 0 − =`
- **Pointer / touch** — tap the on-stage lane pads, or play the piano guide and
  the stage canvas directly.
- **MIDI** — hit *Connect MIDI* (no sysex). Note-on hits the lane, note-off
  releases the hold; devices plugged in after connecting are picked up
  automatically.

## Imported songs

Choose **Import songs** in the setlist, select a file, review the detected parts
and warnings, then choose **Add to setlist**. Nothing starts until you press Start.

- **MP3, WAV, FLAC and other browser-supported audio:** generates a single HIT
  lane from detected attacks and plays the original recording in sync. Press the
  shown computer key, tap the pad, or play any MIDI note. This is a rhythm chart;
  dense mixes and vocals may create extra or missed hits. Tempo is estimated for
  count-in/click; actual hit times follow the recording. Audio is limited to
  50 MB and six minutes. Tempo changes playback speed and pitch.
- **MIDI (.mid/.midi):** preserves note timing, chords and holds from constant-tempo
  format 0/1 files, grouping General MIDI drums, guitar, bass and other instruments
  into the stage parts. Unsupported percussion/expression is reported. Variable
  tempo, SMPTE timing and format 2 are rejected. Limit: 4 MB.
- **Stage charts (.midistage.json):** validates versions 1/3 pitch charts and
  explicit version 2 rhythm charts. Referenced audio in JSON is not attached
  automatically. Limit: 4 MB. See `docs/chart-format.md`.

Up to 12 imports are remembered in this browser: chart metadata in local storage,
original audio in IndexedDB. Files are processed locally and are never uploaded.
If storage is unavailable, the current visit remains playable and a warning
explains what was not saved. Reimporting the same file does not duplicate it.
Remove imports from **Your songs**; the original files are unchanged. Parts with
no notes are disabled so every selected highway has something to play.

## The room

The stage feel is customizable — shake, juice, bloom, punch, lights, crowd,
trails, gobos, and moving-head cues — with Calm / House / Arena presets. Your
settings persist in `localStorage` and are validated against the preset on
every load.

## Session-stability contract

The rules `docs/session-stability.md` guarantees:

- Live **volume changes** preserve score, combo, held notes, position, and
  playback state.
- Guide and click settings can be changed while **paused** and take effect on
  resume.
- Changing **song, lineup, difficulty, or tempo** starts a fresh ready session;
  a paused session must not keep a misleading Resume button after its chart
  changes.

The Playwright session regression enforces this with a controlled song clock:
a scored hold through four volume changes, pause, listening-option changes,
resume, release, song completion and saved score — plus a check that a tempo
change while paused creates a fresh session.
