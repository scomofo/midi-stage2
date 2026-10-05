// Isolate real audio processing from the expensive Canvas2D fixtures. Both use
// the production modules; this page needs no app rendering or fake FFT data.
export async function checkGraphicsAudio(browser, baseUrl) {
  const page = await browser.newPage();
  const fixtureUrl = new URL('/__graphics-audio-acceptance', baseUrl).href;
  try {
    await page.route(fixtureUrl, (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Stage audio acceptance</title><button>Enable audio</button>',
    }));
    await page.goto(fixtureUrl);
    await page.getByRole('button', { name: 'Enable audio', exact: true }).click();
    const results = [];
    // The delayed source outlasts the old 20 × 80 ms polling window. This is
    // scheduled by Web Audio itself, so it also exercises cold/silent samples.
    for (const startDelaySeconds of [0, 2]) {
      results.push(await page.evaluate(async (delay) => {
        const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
        const { waitForStageEnergy } = await import('/scripts/stage-energy-wait.mjs');
        const audio = new AudioEngine();
        let tone, gain, initDeadline;
        try {
          await Promise.race([
            audio.init(),
            new Promise((_, reject) => {
              initDeadline = setTimeout(() => reject(Error(
                `Audio initialization timed out: state=${audio.ctx?.state}, currentTime=${audio.ctx?.currentTime}`,
              )), 5000);
            }),
          ]);
          clearTimeout(initDeadline);
          const ctx = audio.ctx;
          tone = ctx.createOscillator();
          gain = ctx.createGain();
          tone.frequency.value = 90;
          gain.gain.value = 0.08;
          tone.connect(gain);
          gain.connect(audio.buses.backing);
          audio.running = true;
          tone.start(ctx.currentTime + delay);
          const signal = ({ level, bass }) => level > 0.1 && bass > 0.01;
          const silence = ({ level, bass }) => level <= 0.02 && bass <= 0.02;
          const backing = await waitForStageEnergy(audio, {
            label: 'Backing signal does not reach stage lighting analysis', predicate: signal,
          });
          audio.setVolume(0);
          const muted = await waitForStageEnergy(audio, {
            label: 'Master volume must not alter the light choreography', predicate: signal,
            // Ten gain time constants plus a full analysis window, in audio
            // time. A pre-mute sample cannot satisfy this assertion.
            minAudioSeconds: 0.2 + audio.stageAnalyser.fftSize / ctx.sampleRate,
          });
          const isolated = {};
          let bus = 'backing';
          for (const next of ['monitor', 'guide']) {
            gain.disconnect(audio.buses[bus]);
            gain.connect(audio.buses[next]);
            bus = next;
            isolated[next] = await waitForStageEnergy(audio, {
              label: `${next} sound leaked into backing lighting`, predicate: silence,
            });
          }
          gain.disconnect(audio.buses[bus]);
          gain.connect(audio.buses.backing);
          // Prove the source is still alive after isolation, and that the tap
          // recovers. Silence from a dead oscillator is not a passing fixture.
          const restored = await waitForStageEnergy(audio, {
            label: 'Backing analysis did not recover after rerouting', predicate: signal,
          });
          audio.stop();
          const stopped = { ...audio.readStageEnergy() };
          if (stopped.level !== 0 || stopped.bass !== 0) throw Error('Stopped audio must report no live stage energy');
          return { startDelaySeconds: delay, sampleRate: ctx.sampleRate, backing, muted, isolated, restored, stopped };
        } finally {
          clearTimeout(initDeadline);
          audio.stop();
          tone?.stop();
          gain?.disconnect();
          tone?.disconnect();
          if (audio.ctx && audio.ctx.state !== 'closed') await audio.ctx.close();
        }
      }, startDelaySeconds));
    }
    return results;
  } finally {
    await page.close();
  }
}
