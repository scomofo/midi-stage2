# Measured transcription changes

Baseline: [PR70 measured report](../guitar-precision-results/after.json). New actual import run: [after.json](after.json). Only the original 15 cases enter this strict comparison; the two supplemental development controls are reported separately in [after.md](after.md).

Same audio bytes, independent reference labels, model weights and pitch/onset matching policy. Each row is a separate case; there is no pooled accuracy percentage. Full imports and matched-note timing are retained in the accompanying JSON reports.

| Case | Source kind | F1 before → after | Missed before → after | Extra before → after | Length MAE before → after (ms) |
|---|---|---:|---:|---:|---:|
| guitarset-comp | recorded-performance | 80.8% → 80.8% | 4 → 4 | 16 → 16 | 116.9 → 116.9 |
| guitarset-solo | recorded-performance | 82.5% → 82.5% | 6 → 6 | 5 → 5 | 182.3 → 182.3 |
| guitar-clean | recorded-sample-render | 100.0% → 100.0% | 0 → 0 | 0 → 0 | 11.4 → 11.4 |
| guitar-chords | recorded-sample-render | 85.7% → 85.7% | 0 → 0 | 2 → 2 | 38.2 → 38.2 |
| guitar-distorted | recorded-sample-render | 72.7% → 72.7% | 2 → 2 | 1 → 1 | 267.5 → 267.5 |
| guitar-short-attacks | recorded-sample-render | 0.0% → 100.0% | 6 → 0 | 0 → 0 | — → 38.3 |
| keys-harmonic | analytical-render | 100.0% → 100.0% | 0 → 0 | 0 → 0 | 24.5 → 24.5 |
| keys-sampled | recorded-sample-render | 90.9% → 90.9% | 0 → 0 | 1 → 1 | 17.5 → 17.5 |
| bass-harmonic | analytical-render | 85.7% → 85.7% | 0 → 0 | 1 → 1 | 175.6 → 175.6 |
| bass-sampled | recorded-sample-render | 100.0% → 100.0% | 0 → 0 | 0 → 0 | 7.6 → 7.6 |
| drums-overlap | analytical-render | 90.9% → 90.9% | 7 → 7 | 0 → 0 | — → — |
| drums-snare-only | analytical-render | 100.0% → 100.0% | 0 → 0 | 0 → 0 | — → — |
| keys-recording-tail | analytical-render | 100.0% → 100.0% | 0 → 0 | 0 → 0 | 52.7 → 52.7 |
| keys-silence | analytical-render | — | 0 → 0 | 0 → 0 | — → — |
| drums-silence | analytical-render | — | 0 → 0 | 0 → 0 | — → — |

F1 matches exact MIDI pitches within 60 ms. Length errors are measured only on pitch/onset matches; percussion note-offs are unannotated. Silence controls are shown without accuracy percentages.
