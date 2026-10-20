# Chord review evidence

The 17 existing imports retain identical chart notes (including confidence, fingering and holds) and all scoring metrics. Same model, audio and independent labels. Unverified suggestions never change chart accuracy. The 16 existing quality policies pass; short chords and the two new comping recordings remain diagnostic.

| Case | Chart matched / reference | Missed / extra chart notes | Suggestions | Match a missed reference / extra suggestions |
|---|---:|---:|---:|---:|
| guitarset-comp | 42 / 46 | 4 / 16 | 0 | — |
| guitarset-solo | 26 / 32 | 6 / 5 | 1 | 0 / 1 |
| guitarset-rock-chords | 51 / 65 | 14 / 4 | 0 | — |
| guitarset-funk-chords | 40 / 49 | 9 / 12 | 1 | 1 / 0 |
| guitar-clean | 3 / 3 | 0 / 0 | 0 | — |
| guitar-chords | 6 / 6 | 0 / 2 | 0 | — |
| guitar-distorted | 4 / 6 | 2 / 1 | 0 | — |
| guitar-short-attacks | 6 / 6 | 0 / 0 | 0 | — |
| guitar-short-varied | 4 / 4 | 0 / 0 | 0 | — |
| guitar-short-chords | 3 / 6 | 3 / 0 | 2 | 2 / 0 |

Suggestion matches use exact MIDI pitch and 60 ms onset tolerance against reference notes the chart missed. They have their own one-to-one matching and never count as detected chart notes. The two short-chord suggestions both match missing tones; the completely absent model E2 cannot be suggested. Across four recorded performance clips, one suggestion matches a missed note and another is false. These counts are too small for an accuracy estimate and do not justify automatic insertion.

The two new first-eight-second clips (different players, Rock and Funk comping) were selected before inspecting model/suggestion output. Audit SHA-256 was fixed at `2cfa03d36a9a870d48f2d960b8900e08e23188b63c95d056b655bd974b36b474` before this run, and was not tuned afterward. Their model training/held-out relationship is unknown. See the fixture source manifest for licenses, independent JAMS labels, source hashes and transformations.

[Raw native-import evidence](after.json) preserves the actual measured revision, source/model hashes, raw model events, suggestions, matches and recording bytes hashes. [Chart report](after.md). Later changes only refine the studio presentation, accepted-note decimal formatting and regression coverage; transcription/audit source hashes are unchanged.
