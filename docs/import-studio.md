# Desktop import review studio

Audio guitar, keyboard, bass and drum drafts now open a wide review workspace.
Authored MusicXML/string charts retain their existing review editor. Full-band
imports share the studio while keeping each instrument's edits and original-part
restore independent.

The actual decoded recording supplies a cached waveform envelope, with at least
200 bins per second across the supported recording lengths so zoom retains attack
detail. A zoomable, pannable note
timeline shows six guitar strings, drum families or exact keyboard/bass pitches.
Select a note on the timeline or in the bounded queue to edit its start, length,
pitch or guitar position. Arrow keys on the timeline move between notes; selection
and waveform seeking do not mark a draft as edited. Selected notes outside the
vertical pitch viewport are brought into view.

Amber marks below-high-confidence and unscored notes. Next needs review moves
through those notes, including recovered short guitar attacks. Confidence values
are estimates, not accuracy percentages. Draft checks describe structural checks
rather than displaying the former 100/100 quality score.

Corrections remain a local draft until Apply corrections validates the whole
part. Pending edits block audition, switching instruments, saving and downloading.
Undo/redo cover pending note edits, additions and deletions, including the selected
note. Applying commits the batch and starts fresh edit history. Restore original
restores one original part; a shared count-in change does not stretch any notes or
the recording. Drum aliases, source holds and confidence survive a no-op review.

Corrected + recording, corrected only and recording only provide A/B comparison.
Choose a preview start/length, hear only the selected guide note, or loop a short clip. Apply keeps the selected chord tone; zoom keeps it in view. Keyboard activation of the waveform seeks to the visible window start, and effectively empty clips are rejected before creating an audio context.
Recording and guide voices use one Web Audio clock; loops keep one cycle
scheduled ahead and the playhead follows audio time. Edits, tab changes, closing,
saving and hiding the page invalidate playback. The full native recording player
remains available under its disclosure and takes ownership when played.

The recording stays local; chart downloads contain every part but no audio bytes.
No recording is required to correct an imported chart or audition stage sounds.

## Accuracy and implementation evidence

- [Measured comparison with the previous precision pass](import-studio-results/comparison.md).
- [17 actual imports](import-studio-results/after.md), with unchanged raw outputs
  in [after.json](import-studio-results/after.json).
- [16 quality policies plus the remaining short-chord diagnostic](import-studio-results/gates.json).
- `npm run test:import-studio` checks the real short-note import, waveform,
  selection, keyboard navigation, undo/redo, deletion, canonical export, native
  audio-clock looping, A/B mixes, selected-note audition, cleanup and CPU fallback
  with both blocked and invalid WASM assets. It runs in the full-band CI job.
- Existing full-band, keyboard and drum browser helpers exercise the new editor
  while retaining native MIDI, backing-audio, persistence and cancellation checks.

QA captures remain under `/workspace/screenshots/`. The existing Playwright
helpers are the documented fallback after agent-browser failed twice during
initial setup. This change targets desktop; mobile work remains deferred.

## Verified 2026-10-19

- 677 tests passed (207 script checks, 470 domain checks), with typecheck and the
  production build passing. Lint has no errors and 10 existing warnings.
- The 17-case actual importer run preserves the previous precision/hold results
  in the other 14 original cases; the formerly empty short single-note case now
  produces six exact-pitch/onset matches. The two new controls remain separate.
- Full-band development and built-output runs pass native four-stem import,
  independent correction/restore, audio ownership and timing, export/reload,
  partial-band review and cancellation. The development run also checks mixed
  MIDI scoring; the production run uses `--ui-only`.
- Keyboard and drum development regressions pass native decoding/audio,
  instrument MIDI scoring, saved audio reload and editing/cancellation/error paths.
- Blocked and invalid WASM **binary fetches** both fall back to real CPU imports
  on development and built output, with six recovered notes and no uncaught page
  errors. Vite URL-export JavaScript modules are allowed through fault injection.
- Final development and built studio checks pass waveform/keyboard seeking,
  selection-aware zoom, history/deletion, isolated selected-note audio, bounded
  loops, mix comparison and cleanup. Fresh dependency optimization also passes
  the first real import after preloading the new runtime dependency.

Final framed studio captures: `/workspace/screenshots/greatness-framing-dev/` and
`/workspace/screenshots/greatness-framing-built/`. The full interaction checks are
in `/workspace/screenshots/greatness-delivery-dev/` and
`/workspace/screenshots/greatness-delivery-built/`. Full-band captures are in
`/workspace/screenshots/greatness-band-dev-final/` and
`/workspace/screenshots/greatness-band-built/`; CPU fallback evidence is in
`/workspace/screenshots/greatness-fallback-dev/` and
`/workspace/screenshots/greatness-studio-built/`.
