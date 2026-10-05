// Wait for rendered audio, not a guessed amount of wall-clock playback time.
// This module has no Node dependencies so browser acceptance uses this same code.
export async function waitForStageEnergy(
  audio,
  {
    label,
    predicate,
    after = audio.ctx.currentTime,
    minAudioSeconds = audio.stageAnalyser.fftSize / audio.ctx.sampleRate,
    timeoutMs = 5000,
  },
  {
    now = () => performance.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const startedAt = now();
  const ctx = audio.ctx;
  const readyAt = after + minAudioSeconds;
  let sample;
  const failure = (reason) => new Error(
    `${label}: ${reason}; state=${sample.state}, ` +
    `elapsedWallMs=${now() - startedAt}, elapsedAudioSeconds=${sample.currentTime - after}, ` +
    `sampleRate=${ctx.sampleRate}, level=${sample.level}, bass=${sample.bass}`,
  );

  for (;;) {
    // AudioEngine reuses its result object. Preserve the observed values before
    // another read changes them, including values returned to the caller.
    const { level, bass } = audio.readStageEnergy();
    sample = { level, bass, currentTime: ctx.currentTime, state: ctx.state };
    if (![level, bass].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw failure('invalid stage energy (expected finite values between 0 and 1)');
    }
    const elapsed = now() - startedAt;
    if (
      elapsed <= timeoutMs && sample.state === 'running' &&
      sample.currentTime > after && sample.currentTime >= readyAt && predicate(sample)
    ) return sample;
    if (elapsed >= timeoutMs) throw failure('timed out waiting for rendered audio');
    // Polling only yields to the audio thread; it never establishes readiness.
    await sleep(Math.min(20, timeoutMs - elapsed));
  }
}
