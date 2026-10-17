# Audio import transcription benchmark

Actual local audio-file imports, browser decoding, Basic Pitch workers and chart post-processing. Exact MIDI pitch and 60 ms onset tolerance. Hold errors use pitch/onset matches, without a duration pre-filter.

Base commit: 6a1023600cd690e0bfe8693d42ce03be4b3e084c. Source, model and audio hashes are in report.json.

Source kinds stay separate: recorded-performance is an annotated GuitarSet excerpt; recorded-sample-render is digitally scheduled/transposed recorded timbre; analytical-render is a generated signal. The GuitarSet training/held-out relationship has not been established. This small corpus is not an estimate for arbitrary songs.

| Case | Instrument | Source kind | Ref / detected | Precision | Recall | F1 | Missed / extra | Octave substitutions | Import / regression |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| guitarset-comp | guitar | recorded-performance | 46 / 30 | 76.7% | 50.0% | 60.5% | 23 / 7 | 0 | imported / recorded |
| guitarset-solo | guitar | recorded-performance | 32 / 20 | 100.0% | 62.5% | 76.9% | 12 / 0 | 0 | imported / recorded |
| guitar-clean | guitar | recorded-sample-render | 3 / 3 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / recorded |
| guitar-chords | guitar | recorded-sample-render | 6 / 8 | 75.0% | 100.0% | 85.7% | 0 / 2 | 0 | imported / recorded |
| guitar-distorted | guitar | recorded-sample-render | 6 / 5 | 80.0% | 66.7% | 72.7% | 2 / 1 | 0 | imported / recorded |
| guitar-short-attacks | guitar | recorded-sample-render | 6 / 0 | 0.0% | 0.0% | 0.0% | 6 / 0 | 0 | no-detections / recorded |
| keys-harmonic | keys | analytical-render | 5 / 5 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / recorded |
| keys-sampled | keys | recorded-sample-render | 5 / 6 | 83.3% | 100.0% | 90.9% | 0 / 1 | 0 | imported / recorded |
| bass-harmonic | bass | analytical-render | 3 / 4 | 75.0% | 100.0% | 85.7% | 0 / 1 | 0 | imported / recorded |
| bass-sampled | bass | recorded-sample-render | 3 / 3 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / recorded |
| drums-overlap | drums | analytical-render | 42 / 35 | 100.0% | 83.3% | 90.9% | 7 / 0 | 0 | imported / recorded |
| drums-snare-only | drums | analytical-render | 7 / 7 | 100.0% | 100.0% | 100.0% | 0 / 0 | 0 | imported / recorded |
| keys-recording-tail | keys | analytical-render | 2 / 1 | 100.0% | 50.0% | 66.7% | 1 / 0 | 0 | imported / recorded |
| keys-silence | keys | analytical-render | 0 / 0 | — | — | — | 0 / 0 | 0 | no-detections / recorded |
| drums-silence | drums | analytical-render | 0 / 0 | — | — | — | 0 / 0 | 0 | no-detections / recorded |

| Case | Matched notes | Onset MAE (ms) | Onset p95 (ms) | Length MAE (ms) | Note-off MAE (ms) |
|---|---:|---:|---:|---:|---:|
| guitarset-comp | 23 | 9.7 | 20.8 | 493.9 | 491.8 |
| guitarset-solo | 20 | 11.7 | 22.2 | 185.6 | 184.5 |
| guitar-clean | 3 | 43.4 | 50.2 | 11.4 | 34.5 |
| guitar-chords | 6 | 36.7 | 50.2 | 38.2 | 13.4 |
| guitar-distorted | 4 | 42.5 | 50.2 | 267.5 | 226.9 |
| guitar-short-attacks | 0 | — | — | — | — |
| keys-harmonic | 5 | 3.3 | 3.7 | 24.5 | 25.7 |
| keys-sampled | 5 | 21.1 | 26.9 | 17.5 | 37.3 |
| bass-harmonic | 3 | 20.0 | 31.1 | 175.6 | 155.9 |
| bass-sampled | 3 | 30.3 | 38.5 | 7.6 | 28.2 |
| drums-overlap | 35 | 0.0 | 0.0 | — | — |
| drums-snare-only | 7 | 0.0 | 0.0 | — | — |
| keys-recording-tail | 1 | 31.1 | 31.1 | 68.9 | 37.8 |
| keys-silence | 0 | — | — | — | — |
| drums-silence | 0 | — | — | — | — |

Missed/extra include wrong-octave and wrong-pitch attacks. Octave substitutions pair otherwise unmatched reference and detected notes; added harmonic notes still count as extras even when substitutions are zero. Timing/length means cover matched notes only; missed counts remain visible. Percussion has no note-off labels. Synthetic gates and cropped final holds do not establish pedal, release or string/fret accuracy.

Regression floors protect this corpus from worsening. They are not a promise of transcription quality on other recordings. Diagnostic cases expose known failures and have no quality pass.

