# Guitar cockpit

Backline Drive pairs its six-string highway with a spatial preview of the next
authored fingering. The fretboard follows tablature orientation: high E at the
top, low E at the bottom. Each marker names an actual fret. A circled **0** means
open; **×** means skip that string. The **Then** line previews the following
attack's strings and frets.

The usual view contains five numbered frets. Wider shapes expand to eight
columns. High-position windows explicitly name omitted lower frets and show a
dashed break; unusually wide shapes also mark gaps between displayed columns.
Every authored target through fret 24 stays visible. This preview shows physical
positions; the highway's scrolling cross-lines still represent beats.

A chord keeps its complete fingering while successive MIDI notes arrive. Once
all its tones are judged, the preview advances to the next unresolved attack,
even while sustained notes ring. Preview lookup uses the same late-hit window
as the judge, respects pause/count-in/passage time, and does not consume notes.

During scored play, a matched chord tone keeps its fret numeral and gains a
check badge. **1 / 3 pitches matched** describes the attack's progress, not
sustain completion or verified physical string choice. Once the whole attack
resolves, its acknowledgment gives way to the next shape.

The recent-input readout names the received MIDI note with its octave and the
actual judgment. Rejected notes distinguish a different pitch, an octave
difference, an already matched tone and input between target windows. Target
names come from the nearest unresolved attack inside the judge's timing window;
input outside that window is not called a pitch mistake. A rejection still
counts as an extra under the existing scoring rules.

Unmatched pitches receive neutral feedback. They never flash a string inferred
from another occurrence of the pitch in the chart. Only an actual judged target
can acknowledge its authored lane. The readout returns to listening after two
seconds and clears on pause, fresh take, reset, completion or chart change.
Ready Soundcheck remains unscored, and Play along suppresses personal progress
and pitch diagnostics. This is a MIDI pitch check, not an acoustic tuner: it
does not measure cents, physical string identity or hardware latency.

During desktop play, the preview sits beside the highway. Narrow windows place
it above the highway. Focused play hides the song introduction, search launcher
and passage choices while keeping transport and session feedback available.
Pausing restores those choices; Ctrl/Command K still opens Stage Finder.

During a take, a compact **Prepare shape** cue shows the musical beats until the
current fingering's attack. Its track fills over the final four beats, then the
label becomes **Strike window** while the target is inside the active Judge's
inclusive timing window. Aim for the strike line; this availability cue is not a
grade or a guarantee of Perfect timing. The regular count-in remains separate.

The cue uses the same authored song clock as the highway. Tempo changes how long
a beat takes, not the number of musical beats shown. Pause freezes both the beat
readout and track; ready Soundcheck and reset show no active timing cue. Passage
practice uses the rebased passage clock. Partial chords retain their attack cue,
and resolving the group prepares the next attack. Play along gets the same musical
guidance without personal scoring. After the final attack, **No more attacks ·
Follow sustain tails** preserves the distinction between a completed attack and
an ongoing hold. The track has no independent animation or live announcement of
each beat update.

Enable **Picking guide** in Session setup for optional **Suggested picking** in
the cockpit. **This shape** and **Then** show a downstroke or upstroke for the
same current and following fingerings already previewed. Fretted and open-string
targets keep their fret numerals. The directions use the existing eighth-note
beat-grid suggestion, not an authored picking transcription or detected hand
motion; MIDI pitch scoring does not judge direction. Arrows describe the picking
hand: downstroke toward high E, upstroke toward low E, irrespective of the tab
view's high-E-at-top orientation.

The suggestion keeps the current stroke throughout a partially matched chord,
then advances when that shape resolves or its late window expires. Negative
count-in clocks, passage offsets and slower tempo retain the song's original beat
phase. Pausing freezes the current and following suggestions. Play along can show
them without personal scoring, and the final sustain has no further picking suggestion.
Toggle the guide while playing without resetting scores, held notes or playback.
The saved preference is shared with **Strum arrows** on other guitar/rhythm charts.

The highway uses a quiet neck surface, metallic strings with distinct gauges,
a timing strike plate, tuning labels and open-note rings. Note numbers remain
upright and visible; scoring, string order, sustain ownership and hit geometry
are unchanged.

## Starting a take

Without a usable guitar MIDI route, **Connect guitar MIDI** opens Soundcheck,
requests MIDI access if needed, and brings its heading and routing controls into
view. Connecting does not start a take. **Play along** runs the synthesized guide
immediately without scoring or saving a personal best. A paused play-along can
resume without a MIDI device. The keyboard shortcut still guards scored starts
when a route is missing or disabled.

With a usable route, **Start set** scores exact pitches. Ordinary MIDI does not
verify physical string choice. A regular guitar cable/audio interface does not
provide MIDI; microphone pitch detection and latency calibration remain outside
this feature. Arcade guitar and other song controls keep their existing input
rules.

## Verification

`guitar-preview.test.ts` covers partial chords through a real Judge, inclusive
late boundaries, settled groups, count-in, arcade metadata, long-chart lookup,
open strings, fret 24, wide shapes and individually matched equal pitches on
different authored strings. `guitar-pitch-feedback.test.ts` uses real Judge
results for retry, duplicate, overlapping target, octave and timing-window
boundaries across difficulties and tempos, with long-chart lookup and mutation
checks. Both run in `npm test`.

`npm run test:guitar` exercises the actual launch choices and keyboard fallback
gate, connection focus, unscored play-along/resume, partial MIDI chord preview,
six-string scoring, open/high-fret rendering fixtures, desktop docking and narrow
layouts, live pitch/partial-chord diagnostics, neutral rejected-note feedback,
and pause/reset/Soundcheck/demo isolation alongside the existing arcade/hold/input-cleanup checks. Rendering
fixtures do not modify the authored setlist or establish playable wide voicings.

Graphics, session, navigation, practice, soundcheck, import and production render
checks retain their separate acceptance scope. Virtual MIDI and controlled clocks
are automated evidence; physical instrument timing still needs the procedure in
`player-polish.md`.

`guitar-attack-cue.test.ts` checks the cue against actual Judge boundaries at every
difficulty and tempo, count-in, partial chords and ringing sustains. The guitar
browser regression also checks clock-driven progress, pause freezing, ready/reset
isolation, Play along, passage-local attacks, 75% tempo and final sustain guidance.
It also checks the real-guitar picking toggle, both stroke directions, current and
following shape linkage, partial-chord retention, paused/slow practice guidance,
final-attack clearing and saved state without changing scoring or held notes.
