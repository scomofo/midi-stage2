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
open strings, fret 24 and wide shapes. It runs in `npm test`.

`npm run test:guitar` exercises the actual launch choices and keyboard fallback
gate, connection focus, unscored play-along/resume, partial MIDI chord preview,
six-string scoring, open/high-fret rendering fixtures, desktop docking and narrow
layouts, alongside the existing arcade/hold/input-cleanup checks. Rendering
fixtures do not modify the authored setlist or establish playable wide voicings.

Graphics, session, navigation, practice, soundcheck, import and production render
checks retain their separate acceptance scope. Virtual MIDI and controlled clocks
are automated evidence; physical instrument timing still needs the procedure in
`player-polish.md`.
