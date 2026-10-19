# Audio import transcription benchmark

Actual local audio-file imports, browser decoding, Basic Pitch workers and chart post-processing. Exact MIDI pitch and 60 ms onset tolerance. Hold errors use pitch/onset matches, without a duration pre-filter.

Base commit: d61ad7515f0b9f2e016267dffc2b1472f0f75604. Tested Git tree: f319ba6539f47c699811e692579000e532004b60. Uncommitted changes: yes. Source, model and audio hashes are in after.json. That JSON preserves the original record-only run. The reviewed quality policies shown below were evaluated afterward; gates.json records the policy and raw-report hashes.

Source kinds stay separate: recorded-performance is an annotated GuitarSet excerpt; recorded-sample-render is digitally scheduled/transposed recorded timbre; analytical-render is a generated signal. The GuitarSet training/held-out relationship has not been established. This small corpus is not an estimate for arbitrary songs.

| Case | Instrument | Source kind | Ref / detected | Precision | Recall | F1 | Missed / extra | Octave substitutions | Import / regression |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| guitarset-comp | guitar | recorded-performance | 46 / 58 | 72.4% | 91.3% | 80.8% | 4 / 16 | 0 | imported / pass |
| guitarset-solo | guitar | recorded-performance | 32 / 31 | 83.9% | 81.3% | 82.5% | 6 / 5 | 0 | imported / pass |
| guitar-clean | guitar | recorded-sample-render | 3 / 3 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / pass |
| guitar-chords | guitar | recorded-sample-render | 6 / 8 | 75.0% | 100.0% | 85.7% | 0 / 2 | 0 | imported / pass |
| guitar-distorted | guitar | recorded-sample-render | 6 / 5 | 80.0% | 66.7% | 72.7% | 2 / 1 | 0 | imported / pass |
| guitar-short-attacks | guitar | recorded-sample-render | 6 / 6 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / pass |
| guitar-short-varied | guitar | recorded-sample-render | 4 / 4 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / pass |
| guitar-short-chords | guitar | recorded-sample-render | 6 / 3 | 100.0% | 50.0% | 66.7% | 3 / 0 | 0 | imported / diagnostic |
| keys-harmonic | keys | analytical-render | 5 / 5 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / pass |
| keys-sampled | keys | recorded-sample-render | 5 / 6 | 83.3% | 100.0% | 90.9% | 0 / 1 | 0 | imported / pass |
| bass-harmonic | bass | analytical-render | 3 / 4 | 75.0% | 100.0% | 85.7% | 0 / 1 | 0 | imported / pass |
| bass-sampled | bass | recorded-sample-render | 3 / 3 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / pass |
| drums-overlap | drums | analytical-render | 42 / 35 | 100.0% | 83.3% | 90.9% | 7 / 0 | 0 | imported / pass |
| drums-snare-only | drums | analytical-render | 7 / 7 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / pass |
| keys-recording-tail | keys | analytical-render | 2 / 2 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / pass |
| keys-silence | keys | analytical-render | 0 / 0 | — | — | — | 0 / 0 | 0 | no-detections / pass |
| drums-silence | drums | analytical-render | 0 / 0 | — | — | — | 0 / 0 | 0 | no-detections / pass |

| Case | Matched notes | Onset MAE (ms) | Onset p95 (ms) | Length MAE (ms) | Note-off MAE (ms) |
|---|---:|---:|---:|---:|---:|
| guitarset-comp | 42 | 11.4 | 23.2 | 116.9 | 121.8 |
| guitarset-solo | 26 | 11.7 | 22.2 | 182.3 | 184.4 |
| guitar-clean | 3 | 43.4 | 50.2 | 11.4 | 34.5 |
| guitar-chords | 6 | 36.7 | 50.2 | 38.2 | 13.4 |
| guitar-distorted | 4 | 42.5 | 50.2 | 267.5 | 226.9 |
| guitar-short-attacks | 6 | 35.8 | 42.5 | 38.3 | 2.5 |
| guitar-short-varied | 4 | 35.5 | 42.3 | 19.9 | 36.7 |
| guitar-short-chords | 3 | 30.1 | 38.5 | 8.5 | 22.2 |
| keys-harmonic | 5 | 3.3 | 3.7 | 24.5 | 25.7 |
| keys-sampled | 5 | 21.1 | 26.9 | 17.5 | 37.3 |
| bass-harmonic | 3 | 20.0 | 31.1 | 175.6 | 155.9 |
| bass-sampled | 3 | 30.3 | 38.5 | 7.6 | 28.2 |
| drums-overlap | 35 | 0.0 | 0.0 | — | — |
| drums-snare-only | 7 | 0.0 | 0.0 | — | — |
| keys-recording-tail | 2 | 18.0 | 28.1 | 52.7 | 34.7 |
| keys-silence | 0 | — | — | — | — |
| drums-silence | 0 | — | — | — | — |

Missed/extra include wrong-octave and wrong-pitch attacks. Octave substitutions pair otherwise unmatched reference and detected notes; added harmonic notes still count as extras even when substitutions are zero. Timing/length means cover matched notes only; missed counts remain visible. Percussion has no note-off labels. Synthetic gates and cropped final holds do not establish pedal, release or string/fret accuracy.

Regression floors protect this corpus from worsening. They are not a promise of transcription quality on other recordings. Diagnostic cases expose known failures and have no quality pass.

- guitar-short-chords: Three of six simultaneous short chord tones remain missed. The isolated short-note recovery does not attempt polyphonic separation; this supplemental development control has no quality pass.
