# Shared Chart Format — MIDI Stage ↔ MIDI Stage 2

**Status:** v1 contract (this document). Implemented by `src/lib/midi-stage/chart-format.ts`
(parser/validator → `Song`). No UI import yet — parsing only.

## 1. Purpose

`midi-stage` (vanilla JS, Song Workshop with MIDI/audio import) and `midi-stage2`
(React rewrite, procedural songs) should be able to play the same songs. The
workshop already exports a chart JSON (`songs/workshop-example.midistage.json`
in the `midi-stage` repo); this document promotes that shape to a **shared,
versioned contract** both engines commit to, and records every deliberate
mapping decision where the two engines differ.

## 2. Identity

```json
{ "schema": "midi-stage-chart", "version": 1, ... }
```

- `schema` is the literal string `"midi-stage-chart"`. (We keep the workshop's
  existing `schema` key rather than renaming it to `format`: every chart the
  workshop has ever exported already uses it, so renaming would break
  compatibility for zero benefit.)
- `version` is `1`, `2`, or `3`:
  - **1** — plain chart (the common case).
  - **2** — rhythm-only chart (`"matching": "rhythm"`): the whole band plays on
    a single "any note" lane. **Not supported by stage2** (it has no
    rhythm-only lane mode); the parser rejects these with `UNSUPPORTED_MATCHING`.
  - **3** — chart carries `chordHighways` for keys/guitar. Supported: stage2
    folds them into `Song.harmony` (display-only chord names), see §6.
- A version-1 file that *contains* `chordHighways` is normalized to version 3
  on parse, mirroring the workshop's own `validate()`.

## 3. Core fields (wire-compatible with Song Workshop exports)

All times and durations are **seconds** (floats). Pitches are MIDI note numbers.

| Field | Type | Rules |
|---|---|---|
| `schema` | string | Must be `"midi-stage-chart"`. |
| `version` | 1 \| 2 \| 3 | See §2. Anything else → `UNSUPPORTED_VERSION`. |
| `id` | string | Non-empty, ≤ 160 chars. (The workshop additionally requires a `chart-` prefix; the shared parser is deliberately lenient — see §6.) |
| `title` | string | Non-empty after trimming. |
| `bpm` | number | 20–400. The song's nominal tempo. |
| `duration` | number | 0.25–3600 s. |
| `firstBeat` | number | Default `0`. 0–`duration`. Offset of beat 1; used when beat markers must be generated. |
| `audioOffset` | number | Default `0`. −120–120 s. Backing-track alignment; preserved by stage2, not yet used (all stage2 audio is synthesized). |
| `audioName` | string | Default `""`. Backing audio file name; preserved, not yet used. |
| `origin` | string | Default `"manual"`. Workshop values: `midi`, `practice`, `manual`, `audio-rhythm`. Preserved as-is. |
| `parts` | array | Exactly 4 entries, one per instrument `drums`/`keys`/`guitar`/`bass` (any order; normalized to that order). Each: `{ "type", "notes": [...] }`. |
| `parts[].notes[]` | object | `{ "time", "duration", "pitch", "velocity"? }`. See note rules below. |
| `tempoMap` | array | Default `[]`. `[{ "time", "bpm" }]` sorted by strictly increasing `time`; `bpm` in 0.01–6e7. Empty ≡ single `{time:0, bpm}` entry. **Must be constant** for stage2 (see §6). |
| `beats` | array | Default `[]`. `[{ "time", "bar" }]` sorted by strictly increasing `time`. Empty → generated from `firstBeat` + `bpm` (mirrors the workshop's `grid()`). |

### Note rules

- `time`: 0 ≤ time < duration.
- `duration`: 0.02–3600 s, and `time + duration` must not exceed `duration`
  (tiny epsilon allowed). **Duration is the shared representation of hold
  notes** — see §7.
- `pitch`: integer 0–127. Drum notes must fall in a supported drum lane group
  (see §5), otherwise `DRUM_PITCH_UNMAPPED`.
- `velocity`: integer 1–127, default `100`.
- Notes are sorted by `(time, pitch)` on parse; exact `(time, pitch)`
  duplicates are dropped (mirrors the workshop).
- At most 60,000 notes total per chart.

### Optional extensions

| Field | Type | Rules |
|---|---|---|
| `sections` | array | `[{ "time", "name" }]` sorted by `time`, `0 ≤ time ≤ duration`. Not emitted by the workshop; stage2 generates `[{time:0, name:title}]` when absent. |
| `chordHighways` | object | `{ "keys": [...], "guitar": [...] }`. Version-3 entries `{ "time", "duration", "pitches": [2–6 distinct MIDI pitches], "name"?, "roman"? }`, sorted by `time`. Folded into `Song.harmony` (see §6). |

## 4. Worked example (minimal)

```json
{
  "schema": "midi-stage-chart",
  "version": 1,
  "id": "chart-first-rehearsal",
  "title": "First Rehearsal",
  "bpm": 96,
  "duration": 20,
  "firstBeat": 0,
  "audioOffset": 0,
  "audioName": "",
  "origin": "manual",
  "parts": [
    { "type": "drums", "notes": [{ "time": 0, "duration": 0.12, "pitch": 36, "velocity": 98 }] },
    { "type": "keys", "notes": [{ "time": 0, "duration": 1.5, "pitch": 64 }] },
    { "type": "guitar", "notes": [{ "time": 0, "duration": 1.65, "pitch": 40 }] },
    { "type": "bass", "notes": [{ "time": 0, "duration": 1.65, "pitch": 28 }] }
  ],
  "tempoMap": [],
  "beats": []
}
```

## 5. Lanes are derived, never stored

Neither engine stores lanes in the chart. Both derive them deterministically at
`makeChart` time from pitches:

- **Drums** — 6 fixed lanes from pitch groups (identical table in both repos):
  KICK {35,36} · SNARE {37,38,39,40} · HI-HAT {42,44,46} · TOMS
  {41,43,45,47,48,50} · CRASH {49,52,55,57} · RIDE {51,53,59}.
- **Keys / guitar / bass** — one lane per distinct pitch *class* in the part,
  sorted ascending. Any pitch 0–127 maps to a lane.

Because the tables and the derivation are identical, a pitch list means the
same lanes in both games. Authors write pitches; players see lanes.

## 6. Deliberate mapping decisions (stage2 parser)

| Concept | Decision |
|---|---|
| Variable tempo maps | **Rejected** (`VARIABLE_TEMPO_UNSUPPORTED`). Both stage2 engines (audio clock, metronome, renderer) assume constant `bpm`. A multi-entry map with a single repeated bpm is accepted and collapsed. Supporting true tempo changes is future work. |
| Rhythm-only charts (v2, `matching:"rhythm"`) | **Rejected** (`UNSUPPORTED_MATCHING`). stage2 has no single "any note" lane mode. |
| `chordHighways` (v3) | Accepted. Entries are converted to `Song.harmony` (`{time, duration, name, roman}`) — display-only chord labels that stage2's own chord grouping consults for roman numerals. The highway *targets* themselves are not a gameplay concept in stage2: stage2 auto-groups simultaneous keys/guitar notes into named chords in `makeChart`. |
| `firstBeat` | Only used to generate `beats` when the chart omits them. Note times are absolute in both engines; nothing is shifted. |
| `audioOffset` / `audioName` | Preserved on `Song` (new optional fields) for future import-UI/backing-track work; the engine ignores them today. |
| Chart `id` format | Lenient (non-empty ≤160 chars). The workshop's `chart-` prefix rule is a workshop authoring convention, not a playback requirement; stage2's own songs use ids like `open-stage`. |
| `subtitle` / `tag` / `art` | Not in the wire format (the workshop generates display text itself). Parser sets `subtitle: ""`, `tag: "IMPORT"`, `art: "open"` (an existing renderer theme). |
| `original` | `false` — mirrors the workshop, where workshop songs are never "original". |
| Missing `sections` | Single section named after the chart title. |
| Missing/empty `beats` | Generated from `firstBeat` + `bpm`, exactly like the workshop's `grid()`. |
| `velocity` absent | Defaults to `100` (workshop behavior). |

## 7. Engine interplay (what "plays the same" means)

- **Holds.** Representation is shared (`duration`); mechanics differ per engine.
  In stage2, a non-drum note with `duration / speed ≥ 0.35` s becomes a hold in
  `Judge` (press, keep held, release near the end). Authors who want a hold in
  stage2 should write generous durations; short stabs stay taps in both games.
- **Chords.** stage2 groups simultaneous keys/guitar notes (same millisecond)
  into a named chord via its chord templates; midi-stage can additionally carry
  explicit `chordHighways` targets. Simultaneous notes play as chords in both.
- **Timing windows.** Both engines use identical per-difficulty windows
  (chill `[0.07, 0.12, 0.19]`, standard `[0.045, 0.09, 0.14]`, expert
  `[0.025, 0.055, 0.09]` s), so the chart carries no difficulty data —
  difficulty stays an engine-side choice.
- **Judgment details** (combo multipliers, hold-break rules, `verifiedHolds`)
  remain engine-specific and are intentionally *not* part of the format.

## 8. Versioning policy

- Patch-level clarifications never change `version`.
- New **optional** fields may be added without a version bump; parsers must
  ignore unknown fields.
- New **required** fields or changed semantics bump `version`; parsers reject
  unknown versions with `UNSUPPORTED_VERSION` (fail closed, never guess).
- The canonical serializer (`serializeSharedChart`) always emits the normalized
  form the validator accepts, so `parse(serialize(parse(x)))` is stable.

## 9. Open questions / follow-ups

1. **Workshop → stage2 exporter:** a one-click "Export for Stage 2" in the
   workshop (or a script) producing this exact JSON.
2. **In-game import UI:** file picker → `parseSharedChart` → add to song
   catalog. Needs UX for validation errors.
3. **Variable tempo:** requires audio-clock and renderer work in stage2
   (tempo-aware `songAt()`, beat grid, note approach speed).
4. **Rhythm-only mode:** port midi-stage's single-lane `any` mode if
   audio-rhythm charts should be playable.
5. **Round-trip fidelity:** `Song` → shared JSON export from stage2 (the
   serializer covers canonical charts; a `songToSharedChart` for procedural
   songs is still missing).
6. **Drum lane table sync:** the 6-group table is duplicated in three places
   (midi-stage `core.js`, stage2 `engine.ts`, stage2 `chart-format.ts`
   validator). A shared package or codegen would remove the drift risk.
