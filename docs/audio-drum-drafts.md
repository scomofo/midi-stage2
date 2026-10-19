# Audio drum drafts

Choose **Import songs → Drums (draft)**, then an audio recording or drum stem.
The local detector creates separate kick, snare and hi-hat candidates for the
existing six-lane drum highway. It uses transient energy in low, mid and high
frequency bands; it does not separate instruments or use a trained classifier.
An isolated drum stem gives a cleaner input than a full mix. Bass, vocals and
other attacks can be mistaken for drums, and overlapping hits can be missed.

Listen to the source in the preview, correct hit times and drum types, add or
remove hits, and **Apply corrections** before adding or exporting. Toms, crash
and ride can be entered manually. The desktop [review studio](import-studio.md) uses a waveform and drum-family
timeline, with a focused inspector and a queue of up to 40 hits per page. It
supports at most 6,000 hits. Detection suppresses same-family repeats closer than 90 ms;
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

## SparkSuite Stem Lab files

[SparkSuite2.0 PR #62](https://github.com/scomofo/SparkSuite2.0/pull/62) adds a
local stem mixer and a Demucs guide. The lab consumes already separated files;
it does not perform separation or expose a stem export/service API. MIDI Stage
uses those same local files, without a second mixer or a cross-app session.

Choose **Drums (draft) → Use a separated drum stem**. Select the **original song**
for backing audio and the **drum stem** for analysis, then **Build from drum
stem**. A separate selector makes the drum assignment explicit, so renamed stem
files work too. Review and save the result through the normal drum workflow.
Switching Rhythm/Drums rebuilds from the appropriate input and retains the pair
while its preview exists. Selecting a new song through the ordinary file picker
starts a fresh import.

Both files are decoded locally and are limited individually to 50 MB and
1 second–6 minutes. MIDI Stage follows Stem Lab's rule: sample 0 is song time 0;
leading silence remains, with no trimming, shifting, stretching or sample
padding. A shorter drum stem ends naturally while the original song continues.
A stem longer than the original is rejected; select matching files from the
same song. Equal duration cannot prove alignment or that two files belong to
the same recording, so the producer must preserve the start position.

Only the original recording is stored for playback. The stem file is needed
again to regenerate a draft, but is not needed to play a saved reviewed chart.
Downloaded chart JSON still contains no audio. Choose **Keys (draft)** for the
separate [keyboard transcription workflow](keyboard-audio-drafts.md).

## Programmatic stem integration

The isolation feature can supply a decoded, aligned stem without replacing the
original mix used for playback:

```ts
const { chart, warnings, buffer: originalBacking } = await importAudioFile(
  originalSongFile,
  { mode: "drums", analysisFile: drumStemFile, signal, onProgress },
);
```

Alternatively, `analysisBuffer` accepts an AudioBuffer or the equivalent sample interface
(`sampleRate`, `length`, `duration`, `numberOfChannels`, `getChannelData`). Keep
the source timeline intact. Supply exactly one of `analysisFile` and
`analysisBuffer`. Shorter stems are accepted without modifying their samples;
the resulting chart keeps the original recording's duration. A longer stem is
rejected. File imports fingerprint both inputs. Sample-rate conversion must
preserve elapsed seconds.

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

`test:drum-stems` focuses on the paired-file path: native WAV decoding, a known
1.3-second first drum attack after leading silence, a nine-second stem against
a ten-second backing, mode rebuilds, reviewed export, six-lane MIDI scoring,
saved backing reload, longer-stem rejection and cancellation. Unit tests also
verify that stem samples remain unchanged and late cancelled decodes are ignored.

## Keyboard stems

The shared stem handoff also feeds **Keys (draft)**. Its local polyphonic model
and pitch/length review are described in [keyboard audio drafts](keyboard-audio-drafts.md).
Each analysis source shares the original recording's clock.
