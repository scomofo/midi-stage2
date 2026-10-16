# Keyboard audio drafts

Choose **Import songs → Keys (draft)** for a clean keyboard recording. For
separated files, expand **Use a separated keyboard stem**, select the original
song and its piano/keyboard stem, then **Build from keyboard stem**. The same
local stem files used by SparkSuite Stem Lab work here. Separation still happens
before import.

The draft estimates simultaneous notes, MIDI pitches and note lengths. Review
start times, lengths and pitches (including octaves), add or remove notes, and
apply corrections before adding or downloading. Chord notes can share a start
time. Restore original returns to the detected draft. The review shares the
existing drum workflow, with 16 rows per page and at most 6,000 notes.

Times and lengths remain recording seconds. Count-in defaults to 120 BPM and
can be changed without moving notes or stretching audio. Original backing
audio is saved and restored through the existing song library. A shorter stem
ends naturally while the full recording continues. Leading silence stays in
place; files are not shifted or trimmed. A longer stem is rejected.

## Transcription and limits

Spotify's [Basic Pitch](https://github.com/spotify/basic-pitch-ts), version
1.0.1, runs locally in a worker. Its model assets are bundled with the app;
audio is not uploaded. The worker is created only for keyboard transcription
and is terminated on success, failure or cancellation. Tensor intermediates are
released after each model window. CPU inference can take several minutes on
long recordings; the desktop controls remain responsive and Cancel stops it.

The analysis copy is mixed to mono and resampled to 22,050 Hz while preserving
elapsed seconds. Strongly inverted stereo channels are corrected in that copy
to prevent cancellation. Original playback samples are unchanged.

This is an estimated arrangement. Harmonics can become extra notes; soft notes,
short attacks and notes under pedal or other instruments can be missed. A clean
isolated keyboard/piano stem is preferred. The default postprocessor keeps
candidates at least 90 ms long with model activation at least 0.4; activation is
not a calibrated confidence percentage. Detection covers piano pitches A0–C8
(MIDI 21–108); manual review permits lengths down to 20 ms. Pitch bends and
pedal events are not represented. If more than 6,000 candidates survive, the
strongest are retained and a warning is shown.

The existing keyboard highway uses pitch-class lanes, with sustained targets
and chord input. Full MIDI octaves stay in the chart and piano guide, but the
current lane judge does not enforce octave-specific scoring. Simultaneous
octave doubles share a lane. This behavior is unchanged from MIDI imports.

Each audio file is limited to 50 MB and 1 second–6 minutes. The saved song needs
only the original backing and reviewed chart; the stem is needed again to
regenerate a draft. Downloaded JSON includes chart data, not audio. JSON alone
in a new browser plays the synthesized guide.

## Verification

`npm run test:keyboard-import` runs real model inference against the original
controlled chord/melody fixture, native WAV decoding, pitch/time/length editing,
count-in without retiming, export/reimport, replacement/restore, local model
loading, worker cancellation/failure, keyboard MIDI/holds and saved original
backing reload. It runs at a desktop viewport and retains captures plus the
reviewed chart. `--ui-only` supports the production build using the same real
worker and model.

The controlled fixture has five known notes: a C-major triad, G4 and C5. Its
acceptance checks pitches and onset timing within 40 ms. This is a regression
fixture, not an accuracy claim for real piano recordings. Diverse recordings,
pedal and timbre variations still need evaluation.

Model origin, unchanged asset hashes and Apache-2.0 licensing are recorded in
`public/models/basic-pitch/SOURCE.md` and `LICENSE`.
