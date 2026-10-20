# Full-band stem imports

In **Import songs**, expand **Build a full-band song from stems**. Choose the
original recording and any aligned drum, keyboard, guitar or bass stems, then
analyze them as one song. Files stay local. Stem separation happens before
import; the same local files used by SparkSuite Stem Lab can be selected here.

Every file starts at song time zero. Keep leading silence and do not trim or
shift a stem. Shorter stems end early; the original recording determines song
length and supplies saved backing playback. Recognizable mismatched filenames,
unsupported files and files over 50 MB are rejected before analysis begins.
Each recording must be 1 second–6 minutes long; a stem cannot outlast its master.

Supplied stems are also saved for the desktop [Band mix](stem-practice-mixer.md).
Choose the original recording or the supplied stem mix for gameplay; individual
stem levels, mute and solo stay live. A partial set plays only its supplied
tracks, without the original layered underneath. Mix settings survive reloads.

The preview lists each instrument's detected note count. **Review each instrument**
has tabs for the supplied drum, keyboard, guitar and bass parts. Missing parts
are disabled. Correct drum types and attack times, keyboard/bass pitches and
lengths, or guitar strings, frets and lengths. Guitar fingering is suggested;
bass pitches do not specify physical strings or frets. Keyboard pitches span
A0–C8; bass review uses the draft's E1–G4 range.

Apply corrections before switching tabs, adding or downloading. Invalid edits
stay in the editor so they can be fixed. **Restore original** restores only the
selected instrument to its initial detected notes, including after leaving and
returning to that tab. Other parts retain their corrections. **Count-in tempo**
is shared and restore retains the currently applied count-in. Changing it never
moves notes, timeline markers or backing audio. The earliest remaining note in
the combined chart determines the first beat. Editing pitches/timing clears
stale chord labels only for that part; restoring it restores its original labels.

**Listen to corrected…** auditions up to eight seconds from the chosen recording
time using stage instrument sounds. Its default start follows the earliest
applied note until a start time is chosen manually. **With original recording** adds the original
backing on the same audio clock at reduced volume. This previews the applied
chart; apply or restore pending changes first. Stop/restart, switching tabs,
editing, closing the library and starting a new import stop the audition. Playing
the original audio player also stops it, so two previews cannot play together.
This is a comparison guide, not a recreation of the source instrument's timbre.

**Download chart** exports every part, including when no guitar stem was supplied;
JSON does not include audio. Original audio is saved locally when the chart is
added to the setlist. Reload keeps all applied corrections and the original
recording. A full-band JSON import can be reviewed without attached audio;
audition then uses only stage instrument sounds. Standalone bass drafts use the
same pitch/time/length editor.

After adding, choose parts in **Your lineup**. A guitar part does not force the
whole song into the solo guitar setup. Keys, drums and bass can be played while
guitar is off. Selecting only guitar uses the existing six-string cockpit.

For scored guitar in a mixed lineup, connect MIDI and assign its device/channel
in **Soundcheck**. Automatic routing sends melodic input to the first melodic
player, so a connected keyboard alone does not make guitar ready to score. Each
MIDI event belongs to one instrument. Other parts can use their mapped computer
keys or separate MIDI assignments. Watching the band runs without scoring.

This is an estimated arrangement. The automatic quality report and retained
model activations do not establish transcription accuracy. Keyboard/bass gameplay uses
pitch-class lanes; full MIDI pitches remain in the chart. Vocal phrase imports
are separate and are not included in the four-part stem combiner.

## Verification

`npm test` runs the imported-song source tests with the existing Node runner.
This includes guitar, bass, confidence, difficulty, quality, handoff, package,
full-band and lineup coverage. Part-review regressions apply and restore all four
parts in sequence, preserve other notes/timeline markers, retain drum aliases
and confidence, reject invalid bass edits and round-trip the combined export.

`npm run test:full-band-import` exercises native WAV file selection and all four
real analyses, including three Basic Pitch workers. It checks mismatched stem
preflight, local model loading, shared timing, count-in edits, canonical export,
mixed lineup, MIDI ownership, original backing, solo keys, saved reload and
cancellation. It edits each part through its real tab, checks pending-change
protection and isolated restore, exports/reloads the combined corrections, and
checks actual Web Audio oscillator pitches, backing start/offset, audible output
and audition stop/restart/completion. Only the dev gameplay clock and virtual
MIDI ports are controlled; the model and audio results are not mocked. `--ui-only`
runs the production UI without dev module probes. Both runs use a desktop viewport.

Captures and exported charts are kept under `/workspace/screenshots`; CI saves
them as the `full-band-stems-desktop` artifact. The original deterministic audio
fixtures verify integration, not accuracy on commercial recordings or real
guitar/bass timbres. Broader musical evaluation remains necessary.
