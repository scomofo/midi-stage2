# Manual chord suggestions in the desktop studio

Guitar audio imports now carry unverified suggestions separately from chart
notes. The Chord suggestions panel shows pitch, timestamp and estimated length,
focuses the waveform, and outlines a proposed note with a dashed `?`. It offers
three short auditions on the same Web Audio clock: recording phrase, suggestion
plus recording, or synthesized suggestion alone. Listening never edits the chart.

Accept adds an editable note on a free string, preserving all existing fingerings,
holds and other instruments. A duplicate pitch near the same attack, full review
queue, invalid draft or unavailable string blocks acceptance with an explanation.
Accepted notes have no invented confidence score. Dismiss adds no note. Both
choices participate in undo/redo and the existing Apply corrections workflow;
pending changes block listening, save/export and full-band instrument switches.
Applied decisions survive instrument-tab remounts within this import. Restore
original resets the selected part and its guitar decisions. Unaccepted suggestions
and review decisions are not exported or saved as gameplay notes; reopening an
export does not recreate an analysis session.

## Analysis changes

- Audit against events actually retained in the chart. Previously the audit
  treated weak processed events as accepted even when draft filtering removed
  them, so they could suppress their own suggestions.
- Compare the 75 ms Hann-window peak with that window's own semitone response.
  The fixed 2.5x flank ratio rejected even the intended 90 ms A2 test tone. The
  replacement requires 60% of the pure-window excess ratio, capped at 2.5x.
  These are development heuristics, not a calibrated probability or independent
  proof that a pitch is present. Raw onset-backed model evidence and a coincident
  retained onset are still required; common overtone intervals are excluded.
- Check the first two source channels independently, including right-panned or
  opposite-phase signals, rather than relying on channel zero or averaging.
- Bound input scans to 24,000 events per list, 64 events per time bucket and
  128 expensive spectral checks. Dense buckets are skipped. Time buckets bound
  nearby-event lookups. Analysis cooperates with the browser on an 8 ms work
  budget and checks AbortSignal before/after task boundaries and throughout the
  loops. An individual projection is bounded by a 75 ms window at up to 192 kHz.
  Reaching a limit produces an explicit import warning; it does not modify notes.

## Recorded evidence

[Comparison and suggestion errors](chord-review-results/comparison.md),
[raw 19-import run](chord-review-results/after.json),
[chart metrics](chord-review-results/after.md).

All 17 original chart note lists, confidence values and metrics are unchanged.
The short-chord fixture still has 3/6 chart tones; two of its three missed tones
are available as suggestions. An absent model pitch cannot be suggested.

Two new independently annotated GuitarSet comping excerpts (different players,
Rock and Funk) were selected before inspecting their output, with the audit
thresholds already fixed. One produces no suggestion despite 14 missed notes;
the other offers one suggestion that matches a missed note. The existing solo
excerpt also produces one false suggestion. These small counts justify manual
review, not automatic insertion or a general song-accuracy claim. Model
training/held-out relationships are unknown. Licenses, source hashes,
transformations and independent labels are in the fixture manifest.

## Regression coverage

`npm run test:chord-review` imports real short-chord audio through visible desktop
controls in both single-guitar and two-stem full-band flows. It checks audition
source/tone isolation and clock alignment, no automatic chart insertion,
accept/dismiss, undo/redo, pending guards, duplicate prevention, tab persistence,
export, independent restore and native audio/worker cleanup. CI runs it alongside
the existing full-band and import-studio regressions. It also runs against built
output without using development-only application probes.

The studio seek check waits for the rendered preview value after a seek request
crosses the parent render and audition effect. Reading the existing field
immediately can return the previous note's `0.835` seconds; the
[native development trace](chord-review-results/seek-dev.json) records exactly
that stale read before the correct panned-window start of `3` seconds appears.
The original zero-window expectation remains zero. Regression coverage exercises
Enter and Space with 4x CPU throttling, both keys at a nonzero window start, and
pointer seeking within that window. These are state-based waits with a bounded
timeout, without a fixed sleep or changes to the application's seek behavior.

Focused domain tests cover five sample rates, rejected adjacent pitches,
independent stereo channels, malformed/edge inputs, work limits, cancellation
scheduled after audio analysis begins, lossless history, free-string acceptance
and occupied-string rejection. `AGENTS.project.md` records the user's existing
desktop-only scope so generic mobile guidance does not redirect later passes.
