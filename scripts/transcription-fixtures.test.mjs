import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDuration, readPcmWav, renderSample, transcriptionAudioCases } from './fixtures/transcription-audio.mjs';

test('audio benchmark covers each instrument with bounded independent labels and pinned source bytes', async () => {
  const { cases, sourceManifestHash } = await transcriptionAudioCases();
  assert.match(sourceManifestHash, /^[a-f0-9]{64}$/);
  assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length);
  assert.deepEqual([...new Set(cases.filter((entry) => entry.reference.length).map((entry) => entry.instrument))].sort(), ['bass', 'drums', 'guitar', 'keys']);
  assert.equal(cases.filter((entry) => entry.kind === 'recorded-performance').length, 4);
  for (const entry of cases) {
    assert.equal(entry.duration, fixtureDuration(entry.audio));
    if (entry.kind === 'recorded-performance') assert.equal(entry.duration, 8);
    if (entry.instrument === 'drums') assert.ok(entry.reference.every((note) => note.duration === undefined), 'percussion note-offs are not invented');
  }
  assert.ok(cases.some((entry) => entry.duration === 32 && entry.reference.at(-1).time > 31.8), 'retain the original recording tail');
});

test('sample renderer rejects incomplete input instead of inventing a labeled silent note', () => {
  assert.throws(() => readPcmWav(Buffer.alloc(44)), /Invalid PCM/);
  assert.throws(() => renderSample({ samples: new Float32Array(2), sampleRate: 22050 }, 60, [{ time: 0.5, duration: 0.5, pitch: 60 }]), /exceeds the source/);
});
