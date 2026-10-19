# Audio import transcription benchmark

Run the app with `npm run dev`, then in the same environment run:

```sh
npm run test:transcription-benchmark
```

Install Playwright Chromium first if it is not already present. Reports and the
desktop capture are written under `/workspace/screenshots/transcription-benchmark/`.
Override that directory with `SESSION_SCREENSHOT_DIR` (still beneath
`/workspace/screenshots/`). The benchmark uses Vite's development module endpoint;
it does not claim to measure the production bundle. The separate full-band import
browser regression covers the built application's review/playback flow.

The `transcription-benchmark` CI job runs all 15 cases with the real local model,
applies the checked-in regression limits, and uploads JSON, Markdown and a desktop
capture. No audio/model downloads or API keys are needed after dependency setup.

For investigation:

```sh
npm run test:transcription-benchmark -- --only=guitarset-comp,keys-recording-tail
npm run test:transcription-benchmark -- --record-only
node scripts/compare-transcription-benchmarks.mjs BEFORE.json AFTER.json comparison.md
```

`--record-only` bypasses quality gates, never import or browser errors. Comparisons
refuse changed audio, reference labels, model hashes, case sets or metric policies.
Keep source files stable during inference: development hot reload can interrupt
an in-flight import. Reports capture the base commit, actual tested Git tree (including staged,
unstaged and untracked files), and a dirty flag. A temporary index preserves the
user's existing staging. Pipeline/model hashes remain available for diagnosis.

## What is measured

Every case calls the normal `importAudioFile` with a native browser `File`:
metadata checks, browser decoding, real worker inference, instrument cleanup,
fingering and validated chart construction. The runner captures raw worker events
for diagnosis and measures the **final imported chart** against independent labels.
It checks original duration, zero audio offset, worker termination, local model
requests and browser errors. Unexpected failures always fail the run, including
diagnostic cases. Silence and legitimate no-note rejection remain visible.

The corpus contains two annotated eight-second GuitarSet performances, controlled
renders of recorded acoustic guitar/piano/electric-bass samples, mathematical
keyboard/bass/drum signals, a 32-second recording-tail test and silence controls.
[Fixture attribution and preparation](../tests/fixtures/transcription-audio/README.md)
and [source hashes and reference notes](../tests/fixtures/transcription-audio/sources.json)
are checked in. No pooled percentage mixes these source kinds. The existing
`transcription-benchmarks.json` hand-written note lists test scorer arithmetic;
they are not audio-accuracy measurements.

| Quantity | Policy |
|---|---|
| Pitch | Exact MIDI semitone, including octave |
| Attack match | Within 60 ms; maximum-cardinality one-to-one pairing |
| Precision / recall / F1 | Final chart notes; duplicates and harmonic extras count |
| Missed / extra | Explicit counts and note indices in JSON |
| Octave substitutions | Otherwise unmatched notes with simultaneous octave-displaced pitches |
| Onset MAE / p95 | Absolute timing errors on matched notes |
| Length / note-off MAE | Measured after pitch/onset matching, without a length pre-filter |
| Unannotated note-offs | Null, including all percussion labels |
| Silence accuracy | Displayed as undefined; extra-note count is gated |

Pairing maximizes match count and prefers nearby candidates deterministically;
it does not promise globally minimum timing error among equivalent matchings.
Octave substitutions are a subset of missed/extra notes. Zero substitutions does
not mean there were no added octave harmonics. Timing means describe matched notes
only; missed counts must be read alongside them. Cropped final holds and rendered
gates do not validate pedal/release behavior or a performer's actual fingering.

## Fixes driven by the measurements

Guitar cleanup joined nearby same-pitch detections indiscriminately, turning
repeated attacks into long holds and blocking later suggested string positions.
The worker now identifies onset-backed detections with Basic Pitch's public
onset-only extraction pass, without extra neural inference. Cleanup joins only
explicitly recovered sustain fragments; onset-backed and unknown-provenance
attacks stay separate at that stage. Reusing a string within the solver's existing
15 ms release tolerance now shortens the earlier estimated hold so the resulting
chart validates.

The worker also previously truncated output using an integer 86-frames-per-second
estimate. It now retains all prepared windows and clips resulting notes to the
actual recording duration using the model's timestamp conversion. The recording
tail case protects a note beginning at 31.86 seconds in a 32-second file.

The checked-in before/after reports document measured behavior, including the
recall/precision tradeoff: preserving repeated attacks can also preserve extra
model detections. Regression floors bound both missed and extra counts; they are
case-specific stability limits, not a general transcription-quality promise.

## Measured run: 2026-10-17

The [complete comparison](transcription-benchmark-results/comparison.md),
[before report](transcription-benchmark-results/before.md) and
[after report](transcription-benchmark-results/after.md) retain every case.
[Before JSON](transcription-benchmark-results/before.json) and
[after JSON](transcription-benchmark-results/after.json) include notes, references,
raw worker events and pipeline/model/audio hashes. These measurements use the
same audio, labels, model and scoring policy. Their original runs did not capture
a full working-tree identity: historical metadata now identifies pipeline
revisions verified against every recorded source/model hash (before: `6a10236`;
after: `afc249a`), separately from HEAD at run time. No inference or metrics were
regenerated for that attribution correction. The after run passes 14 regression
policies; the remaining short-guitar case is diagnostic, not a quality pass.

| Case | Missed before → after | Extra before → after | Matched length MAE before → after |
|---|---:|---:|---:|
| GuitarSet comping, 46 labels | 23 → 4 | 7 → 19 | 493.9 → 116.9 ms |
| GuitarSet solo, 32 labels | 12 → 6 | 0 → 8 | 185.6 → 182.3 ms |
| Recording tail, 2 labels | 1 → 0 | 0 → 0 | 68.9 → 52.7 ms |

Comping F1 changes from 60.5% to 78.5%; solo from 76.9% to 78.8%. These are
clip-specific exact-pitch/onset F1 scores. Added guitar detections remain a real
precision cost. The other 12 cases retain their previous missed/extra counts;
short guitar attacks and hats coincident with snares remain unresolved.

## Guitar precision pass: 2026-10-19

A ringing pitch can falsely retrigger when a different note starts. Guitar import
now checks the decoded source audio after provenance-aware cleanup and before
fingering. It discards an adjacent same-pitch attack only when its fundamental
continues decaying and a different onset-backed pitch has a clear fundamental
rise. Overlapping short-window rebounds retain possible softer reattacks, even
when overall power falls. Unknown onsets, incomplete edge windows and ambiguous
audio retain their attacks. Stereo channels are checked independently, analysis
supports cancellation, and discarded events never extend the preceding hold.

This is a conservative heuristic, not proof of an attack's absence. It does not
resolve general harmonic/octave confusion or guarantee that every masked soft
reattack survives. The thresholds are development-corpus choices: 80 ms Hann
windows around the attack, at least 5% candidate fundamental power decay, a
fourfold neighboring fundamental rise, and retention on a 1.5-fold local power
rebound in overlapping 40 ms windows. The neighboring fundamental must carry at
least 10% of the strongest first three harmonic powers; this guards against using
a missing-fundamental octave guess as that evidence. Frequency checks allow
modest detuning.

The [full comparison](guitar-precision-results/comparison.md),
[after report](guitar-precision-results/after.md) and
[after JSON](guitar-precision-results/after.json) reuse the previous
[after JSON as the baseline](transcription-benchmark-results/after.json).
All 15 raw model-event lists are identical to that baseline. Only the two
GuitarSet final note lists change; the other 13 note lists and metrics are
identical.

| Eight-second clip | Matched notes | Missed | Extra before → after | F1 before → after | Matched length MAE |
|---|---:|---:|---:|---:|---:|
| GuitarSet comping | 42, unchanged | 4, unchanged | 19 → 16 | 78.5% → 80.8% | 116.9 ms, unchanged |
| GuitarSet solo | 26, unchanged | 6, unchanged | 8 → 5 | 78.8% → 82.5% | 182.3 ms, unchanged |

Matched onset and note-off errors also remain unchanged. The actual importer run
passes all 14 quality gates; the short-guitar case remains an explicit diagnostic.
Reviewed limits now retain the observed missed/extra bounds for these two clips.
These results are specific to these development excerpts, not a general song
accuracy estimate.

## Short attacks and the review studio: 2026-10-19

The [new measured comparison](import-studio-results/comparison.md) retains the same
15 original audio files, labels, model weights and exact-pitch/60 ms matching
policy. All six formerly missed 100 ms single-note guitar attacks now match,
with no extras, 35.8 ms onset MAE and 38.3 ms length MAE. The other 14 cases keep
identical pitch, onset, duration, velocity, fingering and metric results. WASM
arithmetic changes their confidence values slightly (maximum absolute difference
0.0000072); the note lists are not byte-identical.

Recovery uses a quiet lead-in, a clear brief release, independent periodicity and
fundamental evidence in the decoded source, plus an onset-backed model witness.
It only attempts isolated notes in E2–E4, retains accepted model attacks and does
not extend existing holds. Recovered notes receive an explicit lower-confidence
review value of 0.5, not a calibrated probability. This is a narrow recovery
heuristic, not instrument separation or a polyphonic guitar transcriber.

Two supplemental development controls use the existing recorded guitar sample:
varied short single notes match 4/4 with no extras (one recovered note), while
simultaneous short chords still miss 3/6 tones. The latter remains an explicit
diagnostic with no quality pass. These are development renders, not held-out
recordings. All 16 reviewed quality policies pass against the 17 saved actual
imports; [gates.json](import-studio-results/gates.json) records the post-run policy
evaluation without changing [the raw run](import-studio-results/after.json).

Pitch workers now use the pinned TFJS 3.21 WASM backend with local bundled assets
and a CPU fallback. Basic Pitch's public framing stays on CPU because that
version's WASM Fill kernel rejects the dtype omitted by signal.frame; inference
returns to WASM. Asset bytes are fetched and compiled before the legacy loader
starts; a missing or invalid runtime binary chooses the CPU fallback. No model weights or extraction thresholds changed.

The corpus run recorded roughly 2.4 s and 3.1 s of neural inference for the two
8 s GuitarSet excerpts. Whole-import wall times include loading, decoding and
post-processing; concurrent browser checks and cold caches make them unsuitable
as a general speed guarantee. The source hashes and exact tested tree remain in
the raw report. Subsequent changes affect review UI, browser checks and warning
pluralization; the measured recovery and inference algorithms are unchanged.

[Review studio behavior](import-studio.md) documents the desktop correction flow.

## Remaining limits

- Simultaneous short guitar chords still miss tones. The isolated single-note
  recovery does not address dense or continuous polyphonic attacks.
- The overlapping drum signal misses hats coincident with snares. The separate
  snare-only case guards against inventing hats while this remains unresolved.
- Distortion, harmonic false positives and hold errors remain visible in reports.
- Two clips from one GuitarSet player/style are not a representative evaluation;
  their training/held-out relationship to the shipped model is not established.
  Piano/bass sample renders are not real performances, and percussion is generated.
  There is no claim of mixed-song, stem-separation or real-drum accuracy here.
- Exact pitch in this benchmark does not change the existing keyboard highway's
  pitch-class MIDI scoring; octave-specific gameplay is separate work.

Do not automatically refresh `regression-floors.json` from new results. Review
changed audio/labels, misses, extras and matched-note errors before intentionally
changing a limit. Known diagnostics must remain visible until a demonstrated fix.
