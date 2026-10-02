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
