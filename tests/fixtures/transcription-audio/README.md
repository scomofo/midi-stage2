# Transcription reference audio

All assets are checked in. Running the benchmark needs no dataset downloads,
audio encoder, API key or external model service. `sources.json` records source
URLs, licenses, source-file SHA-256 hashes, transformations, reference notes and
the hashes of the included assets. The runner verifies those hashes before
analyzing audio. Labels are independent of model output.

## Recorded performances

`guitarset-comp.flac` and `guitarset-solo.flac` are the first eight seconds of
GuitarSet 1.1.0 tracks `00_BN1-129-Eb_comp_mic.wav` and
`00_BN1-129-Eb_solo_mic.wav`. Source: [GuitarSet on Zenodo](https://zenodo.org/records/3371780),
DOI 10.5281/zenodo.3371780, **CC BY 4.0**. Credit: Qingyang Xi, Rachel M. Bittner,
Johan Pauwels, Xuzhou Ye and Juan P. Bello. Publication: *GuitarSet: A Dataset for
Guitar Transcription*, ISMIR 2018. [Dataset website](https://guitarset.weebly.com/).

Changes: crop from sample zero to eight seconds, convert to mono 22050 Hz FLAC;
no time shift. Reference observations come from all six `note_midi` annotations
in the matching JAMS file. Round pitch to the nearest MIDI semitone; retain
original onset times, clipping lengths at the excerpt end. Neither selected
track appears in the dataset's published timing/duplicate-note error notices.
These two excerpts are a small diagnostic set; their training/held-out status
for the shipped model has not been established.

The chord-review pass also includes the first eight seconds of
`01_Rock1-130-A_comp_mic.wav` and `03_Funk1-114-Ab_comp_mic.wav` as
`guitarset-rock-chords.flac` and `guitarset-funk-chords.flac`. Same source,
license, attribution, extraction and reference policy as above. These tracks use
different players/styles from the existing excerpts. They were selected before
inspecting transcription or suggestion results; the audit thresholds were fixed
before that run. Neither appears in the published timing/duplicate notices.
They are independently annotated recordings, not a model-held-out claim. Both
remain diagnostic cases without quality gates. Suggestion matches are scored
against reference notes missed by the chart and are kept separate from chart
accuracy: unaccepted suggestions are never detected chart notes.

To recreate the audio from the original archive entries:

```sh
ffmpeg -i 00_BN1-129-Eb_comp_mic.wav -t 8 -ac 1 -ar 22050 -c:a flac guitarset-comp.flac
ffmpeg -i 00_BN1-129-Eb_solo_mic.wav -t 8 -ac 1 -ar 22050 -c:a flac guitarset-solo.flac
```

## Recorded samples used in renders

`guitar-acoustic-E2.wav`, `piano-C4.wav` and `bass-electric-E1.wav` derive from
[N. Brosowsky's tonejs-instruments samples](https://github.com/nbrosowsky/tonejs-instruments),
commit `622c2f1c32c8cfce4158ddc3eb26e518ddef37e5`, **CC BY 3.0** as stated by
that collection. Its [source credits](https://github.com/nbrosowsky/tonejs-instruments/blob/622c2f1c32c8cfce4158ddc3eb26e518ddef37e5/sample-source-info.txt)
name University of Iowa for acoustic guitar, VSO2 for piano, and Karoryfer for
electric bass. The included files preserve the first two seconds, decoded from
MP3 to mono 22050 Hz 16-bit PCM WAV. The curator previously edited samples for
consistent playback; these are not unprocessed performances.

`scripts/fixtures/transcription-audio.mjs` digitally schedules, gates and
transposes those samples and optionally applies soft clipping for the distorted
case. Onsets/pitches/lengths come from the render schedule. These cases test
recorded timbre under controlled rendering; they do not establish performance,
pedal, slide, strumming or amplifier accuracy.

## Generated signals

The harmonic keyboard/bass, overlapping drums, isolated snares, recording-tail
and silence cases use original mathematical signals. No commercial recording
or third-party percussion sample is used. Percussion labels specify attacks and
families only; note-off times are intentionally unannotated.

The sample count and duration are validated before inference. Native browser
file import still performs its own metadata/decode checks and all normal
transcription/post-processing. Regression floors are separate from labels and
protect these specific cases; they are not a real-song accuracy percentage.

License links: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
