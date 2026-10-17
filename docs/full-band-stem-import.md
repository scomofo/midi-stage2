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

The preview lists each instrument's detected note count. A guitar part includes
the string/fret editor, with suggested fingering. Its **Count-in tempo** changes
the count-in without moving notes in any part or stretching backing audio. Time,
length and fret corrections remain explicit edits. Download chart exports all
parts when this editor is present; JSON does not include audio. Original audio
is saved locally when the chart is added to the setlist.

After adding, choose parts in **Your lineup**. A guitar part does not force the
whole song into the solo guitar setup. Keys, drums and bass can be played while
guitar is off. Selecting only guitar uses the existing six-string cockpit.

For scored guitar in a mixed lineup, connect MIDI and assign its device/channel
in **Soundcheck**. Automatic routing sends melodic input to the first melodic
player, so a connected keyboard alone does not make guitar ready to score. Each
MIDI event belongs to one instrument. Other parts can use their mapped computer
keys or separate MIDI assignments. Watching the band runs without scoring.

This is an estimated arrangement. The automatic quality report and retained
model activations do not establish transcription accuracy. The guitar editor
does not currently edit the other full-band parts. Keyboard/bass gameplay uses
pitch-class lanes; full MIDI pitches remain in the chart. Vocal phrase imports
are separate and are not included in the four-part stem combiner.

## Verification

`npm test` runs the imported-song source tests with the existing Node runner.
This includes guitar, bass, confidence, difficulty, quality, handoff, package,
full-band and lineup coverage.

`npm run test:full-band-import` exercises native WAV file selection and all four
real analyses, including three Basic Pitch workers. It checks mismatched stem
preflight, local model loading, shared timing, count-in edits, canonical export,
mixed lineup, MIDI ownership, original backing, solo keys, saved reload and
cancellation. Only the dev gameplay clock and virtual MIDI ports are controlled;
the model results are not mocked. `--ui-only` runs the production UI without dev
module probes. Both runs use a desktop viewport.

Captures and exported charts are kept under `/workspace/screenshots`; CI saves
them as the `full-band-stems-desktop` artifact. The original deterministic audio
fixtures verify integration, not accuracy on commercial recordings or real
guitar/bass timbres. Broader musical evaluation remains necessary.
