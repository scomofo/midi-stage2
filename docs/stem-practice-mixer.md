# Stem practice playback

Desktop audio imports retain supplied drum, keyboard, guitar and bass stems
alongside the original recording. This works for full-band imports and the
existing single-instrument stem handoff. No new separation service is involved.
Files remain in this browser. Existing imports need their stems reimported to
enable the mixer; old single-recording saves still play normally.

In **Band mix**, choose **Original recording** or **Stem mix** while paused or
ready. These sources are exclusive: stem mode never layers the original over
the supplied stems or tries to subtract an instrument from it. Only supplied
stems play, including stems whose analysis found no chart notes. Unsupplied
instruments, vocals and other sounds are absent from stem mode.

Stem level, mute and solo work during playback without changing the score,
clock or note selection. Multiple solos are allowed; mute wins over solo. Solo
only considers stems that actually exist in this song. **Mute my part(s)**
switches to stem mode and mutes the available stems used by the current lineup,
clearing solos. **Reset levels** restores all levels/mutes/solos without changing
the backing source. Source changes require a pause; Resume keeps its position.

Every file starts at sample zero of the original recording timeline. All stem
sources use the same audio origin and source-time offset as the highway.
At 100%, recordings play directly; other tempos use synchronized, natural-pitch
audio chunks. Short stems stop at their own end. Passage selection, repeated
takes, pause/resume and tempo changes use the existing transport. Muted stems
keep running so unmuting stays in time. See [pitch-preserving practice](pitch-preserving-practice.md)
for the processing and quality limits.

The original and stems are one versioned IndexedDB row, committed atomically.
Legacy Blob rows are read as original-only assets. Mix settings are a separate
versioned, per-song local setting and never modify chart identity or exported
JSON. Removing a saved song removes the whole audio bundle and its mix settings.
If a write fails, the new files remain playable for this visit and a warning is
shown; any previously committed audio bundle remains available after reload.
Audio decode is deferred until Start, sequential, and cached for only the current
song/source mode. Cancelling startup cannot publish a stale decoded buffer.

## Verification

`npm run test:stem-mixer` uses real file selection, a native drum analysis and
Basic Pitch keyboard analysis. It checks a partial set with different file
lengths, source exclusivity, synchronized starts, live gain controls without
restarting playback, native audible output/silence, pause/resume, IndexedDB and
mix-setting reload, nonzero passage offsets, 75% tempo, repeated takes and complete
bundle removal. The same helper runs against built output without source-module
probes or mocked model/audio results. `test:full-band-import` additionally checks
four native stem sources starting together after saved reload. Focused domain
tests cover malformed settings, independent songs, missing solos, legacy blobs
and passage offsets. QA artifacts belong under `/workspace/screenshots/`.
