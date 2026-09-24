# Audio import fixtures

These are original, synthetic test recordings, with no sampled music or third-party audio.
Each file contains eight seconds of a quiet 110 Hz tone and seeded noise, plus twelve short percussion hits at 0.6-second intervals. All three files contain actual audio in the format their extension names.

- `rehearsal-pulse.wav`: mono 8 kHz, unsigned 8-bit PCM.
- `rehearsal-pulse.mp3`: mono 16 kHz, 24 kbps MPEG audio.
- `rehearsal-pulse.flac`: lossless encoding of the WAV fixture.

The browser regression reads these small files directly, so CI does not need an encoder. `scripts/audio-import-regression.mjs` also generates a silent WAV in memory to verify the no-rhythm error state.
