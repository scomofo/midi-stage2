import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForStageEnergy } from './stage-energy-wait.mjs';

const silent = { level: 0, bass: 0 };
const audible = { level: 0.22, bass: 0.12 };
const hasBacking = ({ level, bass }) => level > 0.1 && bass > 0.01;

function fixture({
  audioTime = (ms) => ms / 1000,
  state = () => 'running',
  energy = () => audible,
} = {}) {
  let wallMs = 0;
  const reused = { ...silent };
  const audio = {
    ctx: {
      sampleRate: 48000,
      get currentTime() { return audioTime(wallMs); },
      get state() { return state(wallMs); },
    },
    stageAnalyser: { fftSize: 1024 },
    readStageEnergy: () => Object.assign(reused, energy(wallMs)),
  };
  const clock = {
    now: () => wallMs,
    sleep: async (ms) => { wallMs += ms; },
  };
  return { audio, clock, reused };
}

test('accepts audio-clock progress and signal arriving after the former 1.6-second budget', async () => {
  const { audio, clock } = fixture({
    audioTime: (ms) => Math.max(0, ms - 2000) / 1000,
    energy: (ms) => ms >= 2400 ? audible : silent,
  });
  const sample = await waitForStageEnergy(audio, { label: 'backing', predicate: hasBacking }, clock);
  assert.equal(clock.now(), 2400);
  assert.equal(sample.currentTime, 0.4);
  assert.equal(sample.level, audible.level);
});

test('a frozen audio clock cannot satisfy even an always-true predicate', async () => {
  const { audio, clock } = fixture({ audioTime: () => 7 });
  let evaluated = false;
  await assert.rejects(waitForStageEnergy(audio, {
    label: 'frozen backing', minAudioSeconds: 0, timeoutMs: 100,
    predicate: () => { evaluated = true; return true; },
  }, clock), (error) => {
    assert.match(error.message, /frozen backing: timed out/);
    assert.match(error.message, /state=running/);
    assert.match(error.message, /elapsedWallMs=100, elapsedAudioSeconds=0/);
    assert.match(error.message, /sampleRate=48000, level=0.22, bass=0.12/);
    return true;
  });
  assert.equal(evaluated, false);
});

test('a suspended context cannot pass with stale positive analyser data', async () => {
  const { audio, clock } = fixture({ state: () => 'suspended' });
  await assert.rejects(waitForStageEnergy(audio, {
    label: 'suspended backing', predicate: hasBacking, timeoutMs: 100,
  }, clock), /suspended backing: timed out.*state=suspended/);
});

test('advancing audio time with permanent silence still fails the positive signal proof', async () => {
  const { audio, clock } = fixture({ energy: () => silent });
  await assert.rejects(waitForStageEnergy(audio, {
    label: 'disconnected backing', predicate: hasBacking, timeoutMs: 100,
  }, clock), /disconnected backing: timed out.*elapsedAudioSeconds=0.1.*level=0, bass=0/);
});

test('waits for a full audio window after a transition before accepting positive or zero energy', async () => {
  for (const energy of [audible, silent]) {
    const { audio, clock } = fixture({ audioTime: (ms) => 12 + ms / 1000, energy: () => energy });
    let firstPredicateTime;
    const sample = await waitForStageEnergy(audio, {
      label: 'route transition', after: 12, minAudioSeconds: 0.2,
      predicate: (value) => { firstPredicateTime ??= value.currentTime; return true; },
    }, clock);
    assert.equal(firstPredicateTime, 12.2);
    assert.equal(sample.currentTime, 12.2);
    assert.equal(clock.now(), 200);
  }
});

test('rejects nonfinite and out-of-range levels or bass instead of allowing loose comparisons to pass', async () => {
  for (const key of ['level', 'bass']) {
    for (const value of [NaN, Infinity, -Infinity, -0.1, 1.1]) {
      const { audio, clock } = fixture({ energy: () => ({ ...audible, [key]: value }) });
      await assert.rejects(waitForStageEnergy(audio, {
        label: 'invalid analyser', predicate: () => true,
      }, clock), /invalid analyser: invalid stage energy/);
    }
  }
});

test('returns a snapshot when AudioEngine reuses its energy object', async () => {
  const { audio, clock, reused } = fixture();
  const sample = await waitForStageEnergy(audio, { label: 'backing', predicate: hasBacking }, clock);
  Object.assign(reused, silent);
  assert.deepEqual(sample, { ...audible, currentTime: 0.04, state: 'running' });
});
