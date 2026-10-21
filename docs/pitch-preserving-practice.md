# Pitch-preserving practice

Imported original recordings and supplied instrument stems now keep their
original pitch at 50%, 75% and 125% tempo. At 100%, the existing direct recording
path is unchanged. Synthesized MIDI parts already retain their note pitches.
Choose tempo while ready or paused; changing tempo resets the take as before.
There is no new service, model, upload, dependency or file format.

## Timing and resource use

`pitch-stretch.ts` implements streaming waveform similarity overlap-add (WSOLA).
It crossfades natural-rate grains on a fixed output grid, matching overlapping
waveforms within a bounded search around the nominal source time. The search
uses joint multichannel correlation rather than a mono sum, so opposite-polarity
stereo cannot cancel its reference. Every stem and stereo channel shares the
same chosen positions; mute, solo and level changes do not alter that mapping.

The processor borrows decoded PCM and generates at most 200.1 ms per block.
Web Audio schedules these natural-rate blocks with a 350 ms lookahead on the
existing audio clock. Only the first block is queued during a distant count-in.
There is no full-song stretched copy or cache. Ended sources disconnect normally;
pause/reset cancel queued blocks with the existing stop envelopes. Shared stem
gain buses disconnect after those envelopes finish. A stalled scheduler skips
to the current timeline instead of replaying old chunks late.

Highways, scoring, guide sounds and metronome continue to use the existing
`origin` and `speed`. Passage offsets stay in source seconds. The processor
clips each stem to its available duration and the passage end, with all chunks
using the same output origin. Resume starts at the paused source position;
repeat creates a fresh processor at the original passage offset and count-in.

## Quality limits

This is practice playback, with short crossfades rather than studio mastering.
Dense mixes and sharp drum attacks can sound softer or textured at extreme
tempos. Window matching can move local attacks by tens of milliseconds; it does
not accumulate timing drift. The regression bound is 50 ms on the labeled
attack fixture, not a guarantee for every recording. No pitch transposition,
automatic tuning, chart-note correction or transcription improvement is implied.

Method reference: Verhelst and Roelands,
[An Overlap-Add Technique Based on Waveform Similarity (WSOLA)](https://researchportal.vub.be/en/publications/an-overlap-add-technique-based-on-waveform-similarity-wsola-for-h/),
ICASSP 1993. The implementation here is local project code.

## Verification

Domain tests measure actual output frequencies from 55–880 Hz at every changed
tempo, exact output length, discontinuities, four-stem stereo phase, silent and
short inputs, source offsets, end clipping, late attacks and scheduler recovery.

`npm run test:pitch-playback` imports a real two-pitch WAV through the app and
reads native Web Audio FFT output at all four tempos. It checks contiguous chunk
scheduling, audible output, silence while paused, resume, a nonzero passage in
the second pitch region, a repeated take, cancelled startup and saved tempo.
It runs against development and production output without source-module probes,
fake audio nodes, mocked FFTs or a fake game clock.

`test:stem-mixer` also exercises synchronized slower stem chunks, live solo and
mute on the persistent stem buses, a shorter ended stem and repeated passages.
The original-buffer offset assertions in `test:practice` remain at 100%; the
new native-clock tests cover slower practice. Existing helpers accept
`--desktop-only` to respect the project's desktop scope. QA artifacts belong
under `/workspace/screenshots/`.
