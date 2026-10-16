# Authored guitar imports

Choose **Import songs**, then an uncompressed `.musicxml`/`.xml` guitar tablature
export or a version 4 `.midistage.json` chart. The library provides an original
Open-string Study example to try. One explicitly authored six-string tablature
staff becomes six fixed highway lanes with real fret numbers. Guitar MIDI scores
exact pitches, and Play along runs the synthesized guide without scoring.

## Review before adding

The desktop review table shows note times and lengths in seconds, string, fret
and sounding pitch. Edit those values, add or remove notes, then **Apply
corrections**. Unapplied or invalid corrections disable **Add to setlist** and
**Download chart**. Corrected pitch is derived from the authored tuning, string
and fret; it is never used to guess a fingering. A string cannot have overlapping
notes. Exact-pitch unisons on different strings keep separate notes and holds.

Changing **Chart tempo** rescales note times, note lengths, backing parts, section
markers and beat markers together. The time fields show their current values
after applying. Note edits clear imported guitar chord labels so a changed
fingering cannot retain an obsolete name; gameplay groups the reviewed pitches.
Moving notes past the end extends the chart within its one-hour
limit. Restore original returns to the preview's imported source. Closing the
library discards that preview; it does not modify an existing saved song.

**Download chart** saves canonical version 4 JSON. Reimporting that file restores
positions and tuning. Adding the same canonical chart reuses its setlist entry;
changing its notes creates a separate content identity. Browser storage preserves
the arrangement and its current selection, without restoring playback or MIDI
permission. All difficulty levels keep imported notes and change judging windows.

## Supported MusicXML data

The reader supports score-partwise, constant-tempo files containing exactly one
staff with authored technical `string` and `fret` data. It reads divisions,
durations, rests, simultaneous chord tones, backup/forward voice positioning,
pickup measures, ties, rehearsal markers, numeric tempo marks, staff tuning and
explicit transposition. Sounding pitch must agree with the tuning and fingering.
Tied notes become one sustained target instead of repeated attacks. Silent cue
notes are omitted with a warning, while their durations still position later
notes. Ordinary sounding notes printed at cue size remain playable.

Absent tuning uses standard E2 A2 D3 G3 B3 E4 with a visible warning; absent numeric
tempo uses 120 BPM with a warning and remains correctable in review. Other parts
and duplicate notation staves are omitted and reported. Non-4/4 note timing is
retained, with a warning that the stage's count-in/bar grid uses 4/4. Slides,
hammer-ons and pull-offs retain written attacks; their techniques are not scored.

The importer rejects compressed `.mxl`, score-timewise, multiple tablature staves,
tempo changes, repeats/endings/jumps requiring expansion, grace-note timing,
capos, mid-song tuning changes, bends, harmonics, tremolo/trills and glissandi.
The error explains what needs a different export. Direct Guitar Pro, PDF/image
tabs and audio-to-guitar transcription are outside this slice. Original recording
audio is not attached; playback uses stage instruments. MIDI cannot verify the
physical string used.

Format behavior follows the W3C MusicXML 4.0 references for
[tablature](https://www.w3.org/2021/06/musicxml40/tutorial/tablature/),
[note timing, chords and ties](https://www.w3.org/2021/06/musicxml40/tutorial/midi-compatible-part/)
and [transposition](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/transpose/).

## Verification

`guitar-import.test.ts` covers literal note timing, custom tuning, transposition,
chords, unisons, ties, silent cues and their timing, validation failures, atomic
review, tempo scaling and storage/canonical round trips. Existing shared-chart
and library tests guard the older formats and their identities. The XML parser
used by unit tests is a dev dependency; the browser import uses native DOMParser
and does not fetch DTDs.

`npm run test:guitar-import` drives the desktop UI through file selection, invalid
and valid edits, export/reimport, exact MIDI pitch scoring, unison holds, reload,
restore, deletion/addition, closing an unsaved preview and silent cue omission
without timing shifts. Only song time is controlled; the real React UI,
renderer, Judge, file picker and MIDI route are
used. The dedicated CI job retains screenshots and the downloaded chart under
`authored-guitar-import-desktop` for visual review. Automated fixtures do not
establish broad compatibility with every notation application's exports or
physical guitar tracking latency.
