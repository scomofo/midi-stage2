# Audio drum drafts

Choose **Import songs → Drums (draft)**, then an audio recording or drum stem.
The local detector creates separate kick, snare and hi-hat candidates for the
existing six-lane drum highway. It uses transient energy in low, mid and high
frequency bands; it does not separate instruments or use a trained classifier.
An isolated drum stem gives a cleaner input than a full mix. Bass, vocals and
other attacks can be mistaken for drums, and overlapping hits can be missed.

Listen to the source in the preview, correct hit times and drum types, add or
remove hits, and **Apply corrections** before adding or exporting. Toms, crash
and ride can be entered manually. Review has 16 rows per page and supports at
most 6,000 hits. Detection suppresses same-family repeats closer than 90 ms;
manual corrections allow hits at least 20 ms apart. Restore original returns to the detected draft; closing the
preview discards unsaved changes without changing a saved song.

Times stay in recording seconds. Changing **Count-in tempo** changes only the
count-in/click estimate, not hit times, recording length or source audio. The
original recording is saved through the existing browser audio storage and
plays behind the reviewed drum highway. Computer keys and mapped drum MIDI
score the assigned drum family; this is not the generic one-lane rhythm mode.

Downloaded Stage JSON contains the chart and source filename, not audio bytes.
Reimporting it preserves chart identity; an existing matching library entry can
keep its saved recording. JSON alone in a new browser plays the synthesized guide.
The existing **Rhythm** option keeps its original behavior.

## Stem isolation integration

The isolation feature can supply a decoded, aligned stem without replacing the
original mix used for playback:

```ts
const { chart, warnings, buffer: originalBacking } = await importAudioFile(
  originalSongFile,
  { mode: "drums", analysisBuffer: alignedDrumStem, signal, onProgress },
);
```

`analysisBuffer` accepts an AudioBuffer or the equivalent sample interface
(`sampleRate`, `length`, `duration`, `numberOfChannels`, `getChannelData`). Keep
leading silence, timing and total duration aligned with the original recording;
the importer rejects a duration mismatch greater than two original audio samples.
Duration validation cannot detect an equally long shifted stem, so the isolation
producer must preserve the start position. Do not trim, time-stretch or normalize
timing independently. Sample-rate conversion must preserve elapsed seconds.

For an already decoded pipeline, `analyzeDecodedSongAudio(stem, name, fingerprint,
{ mode: "drums", signal, onProgress })` returns chart data only and cooperatively
yields to keep cancellation responsive. It never attaches its input as backing
audio. The integration retains the original mix separately. No separator, remote
upload, service credentials or additional model download is included here.

## Evidence and limits

The shared original eight-second fixture contains known kick, snare and hat
events, including simultaneous strikes. The current 44.1-kHz unit result within
40 ms is:

| Family | Source events | Matched | Extra detected |
| --- | ---: | ---: | ---: |
| Kick | 7 | 7 | 0 |
| Snare | 7 | 7 | 0 |
| Hi-hat | 28 | 21 | 0 |

Seven hats under snare attacks are missed. These are controlled-fixture results,
not an accuracy percentage for real songs. Sustained sine notes and silence are
rejected, opposite-phase stereo retains its attacks, and review/JSON identity,
family-specific judging, aligned-stem/backing separation and cancellation are
covered by unit tests. Diverse real recordings still need evaluation. Lower
sample-rate inputs contain less high-frequency evidence for hat estimates.

`test:audio-drums` exercises native WAV decoding, review validation, correction,
export/reimport, mode changes, six drum lanes, mapped MIDI judging, original
backing and IndexedDB reload. CI retains desktop captures and the reviewed chart.
The production UI check uses `--ui-only`; its import/review/export behavior uses
the same native decoding and analysis.

## Next: keyboard stems

The shared stem handoff supplies the analysis/backing boundary. Keyboard charts
still need polyphonic note onset, pitch and duration transcription plus a pitched
note review UI. [Basic Pitch](https://github.com/spotify/basic-pitch-ts) is a
candidate browser transcriber; its own documentation says it works best on one
instrument at a time. It is not integrated in this milestone. Full-mix instrument
separation belongs to the separate isolation feature, then each stem can feed
the appropriate transcriber and share the original recording's clock.
