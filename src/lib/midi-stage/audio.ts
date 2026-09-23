import type { Instrument, Song, Player } from "./types";
import { sourceForSafe } from "./audio-helpers";

type Voice = { source: AudioScheduledSourceNode; gain: GainNode; stopped: boolean; stop: () => void };

type Event = {
  time: number;
  click?: boolean;
  accent?: boolean;
  type?: Instrument;
  pitch?: number;
  velocity?: number;
  duration?: number;
  level?: number;
  destination?: AudioNode;
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  buses: Record<string, GainNode> = {};
  nodes = new Set<Voice>();
  origin = 0;
  speed = 1;
  running = false;
  events: Event[] = [];
  cursor = 0;
  timer: ReturnType<typeof setInterval> | null = null;
  volume = 0.55;
  monitorVoices = new Map<string, Voice>();
  waves: Partial<Record<Instrument, PeriodicWave>> = {};
  noise: AudioBuffer | null = null;
  generation = 0;
  song: Song | null = null;

  async init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error("Web Audio is unavailable in this browser.");
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.5;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 8;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);
      for (const name of ["backing", "monitor", "guide"]) {
        const bus = this.ctx.createGain();
        bus.gain.value = name === "monitor" ? 0.9 : 1;
        bus.connect(this.master);
        this.buses[name] = bus;
      }
      if (this.ctx.createPeriodicWave) {
        const partials: Record<string, number[]> = {
          keys: [0, 1, 0.33, 0.16, 0.06, 0.025],
          guitar: [0, 1, 0.65, 0.36, 0.22, 0.13, 0.08],
          bass: [0, 1, 0.42, 0.17, 0.08],
        };
        for (const [type, p] of Object.entries(partials)) {
          this.waves[type as Instrument] = this.ctx.createPeriodicWave(new Float32Array(p.length), Float32Array.from(p));
        }
      }
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const a = this.noise.getChannelData(0);
      let seed = 12553;
      for (let i = 0; i < a.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        a[i] = (seed >>> 0) / 2147483648 - 1;
      }
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.ctx.state !== "running") throw new Error("Audio could not start. Click Start again.");
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.02);
  }

  contextAt(stamp = performance.now()) {
    if (!this.ctx) return 0;
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && typeof ts.contextTime === "number" && ts.contextTime > 0 && typeof ts.performanceTime === "number" && ts.performanceTime > 0) {
      return ts.contextTime + (stamp - ts.performanceTime) / 1000;
    }
    return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0) + (stamp - performance.now()) / 1000;
  }

  songAt(stamp = performance.now()) {
    return (this.contextAt(stamp) - this.origin) * this.speed;
  }

  track(source: AudioScheduledSourceNode, gain: GainNode, filter?: BiquadFilterNode) {
    const voice: Voice = {
      source,
      gain,
      stopped: false,
      stop: () => {
        if (voice.stopped || !this.ctx) return;
        voice.stopped = true;
        try {
          gain.gain.cancelScheduledValues(this.ctx.currentTime);
          gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.012);
          source.stop(this.ctx.currentTime + 0.05);
        } catch {
          /* already stopped */
        }
      },
    };
    this.nodes.add(voice);
    source.onended = () => {
      this.nodes.delete(voice);
      try {
        source.disconnect();
        gain.disconnect();
        filter?.disconnect();
      } catch {
        /* noop */
      }
    };
    return voice;
  }

  tone(
    type: Instrument,
    pitch: number,
    velocity = 90,
    at?: number,
    duration = 0.3,
    level = 1,
    destination?: AudioNode,
  ) {
    const ctx = this.ctx!;
    const start = Math.max(ctx.currentTime, at ?? ctx.currentTime);
    const dest = destination || this.buses.backing || this.master!;
    const v = Math.max(0.01, velocity / 127) * level;
    if (type === "drums") return this.drum(pitch, v, start, dest);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const freq = 440 * Math.pow(2, (pitch - 69) / 12);
    osc.type = type === "bass" || type === "guitar" ? "sawtooth" : "triangle";
    osc.frequency.value = freq;
    const wave = this.waves[type];
    if (wave) osc.setPeriodicWave(wave);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "bass" ? 700 : type === "guitar" ? 2200 : 4000, start);
    filter.frequency.exponentialRampToValueAtTime(type === "bass" ? 160 : 900, start + Math.min(duration, 0.35));
    filter.Q.value = 0.5;
    const sustain = Math.max(0.06, Math.min(duration, 10));
    const amp = v * (type === "bass" ? 0.2 : type === "guitar" ? 0.095 : 0.23);
    const attack = type === "guitar" ? 0.003 : type === "bass" ? 0.008 : 0.005;
    const tail = type === "bass" ? 0.15 : 0.24;
    const body = type === "keys" ? 0.32 : type === "guitar" ? 0.24 : 0.58;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), start + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * body), start + Math.min(0.12, sustain));
    gain.gain.setValueAtTime(Math.max(0.0002, amp * body * 0.8), start + sustain);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + sustain + tail);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    const voice = this.track(osc, gain, filter);
    osc.start(start);
    osc.stop(start + sustain + tail + 0.01);
    return voice;
  }

  drum(pitch: number, v: number, start: number, destination: AudioNode) {
    const ctx = this.ctx!;
    let freq: number;
    let duration: number;
    let kind: "kick" | "noise" | "tom" | "metal";
    if ([35, 36].includes(pitch)) {
      freq = 150;
      duration = 0.27;
      kind = "kick";
    } else if ([37, 38, 39, 40].includes(pitch)) {
      freq = 1500;
      duration = 0.15;
      kind = "noise";
    } else if ([41, 43, 45, 47, 48, 50].includes(pitch)) {
      freq = 95 + (pitch - 41) * 15;
      duration = 0.24;
      kind = "tom";
    } else {
      freq = [49, 52, 55, 57].includes(pitch) ? 5000 : 8000;
      duration = [49, 52, 55, 57].includes(pitch) ? 0.6 : pitch === 46 ? 0.28 : 0.075;
      kind = "metal";
    }
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    let source: AudioScheduledSourceNode;
    if (kind === "kick" || kind === "tom") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(kind === "kick" ? 45 : freq * 0.55, start + duration);
      filter.type = "lowpass";
      filter.frequency.value = 1000;
      source = osc;
    } else {
      const buf = ctx.createBufferSource();
      buf.buffer = this.noise;
      filter.type = kind === "metal" ? "highpass" : "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = 0.55;
      source = buf;
    }
    const amp = v * (kind === "kick" ? 0.65 : kind === "metal" ? 0.18 : 0.36);
    gain.gain.setValueAtTime(Math.max(0.0002, amp), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    const voice = this.track(source, gain, filter);
    source.start(start);
    source.stop(start + duration + 0.01);
    return voice;
  }

  click(at: number, accent = false) {
    if (!this.ctx || !this.master) return;
    const start = Math.max(at, this.ctx.currentTime);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = accent ? 1400 : 1000;
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
    osc.connect(gain);
    gain.connect(this.master);
    this.track(osc, gain);
    osc.start(start);
    osc.stop(start + 0.05);
  }

  async begin(opts: {
    song: Song;
    players: Player[];
    speed: number;
    seek?: number;
    end?: number;
    countIn?: boolean;
    guide?: boolean;
    demo?: boolean;
    metronome?: boolean;
  }) {
    this.stop();
    const ticket = this.generation;
    await this.init();
    if (ticket !== this.generation) return;
    const { song, players, speed } = opts;
    const seek = opts.seek ?? 0;
    const end = opts.end ?? song.duration;
    const countIn = opts.countIn !== false;
    this.speed = speed;
    this.song = song;
    const beat = 60 / song.bpm;
    const pre = countIn ? (4 * beat) / speed : 0.12;
    this.origin = this.ctx!.currentTime + 0.12 + pre - seek / speed;
    this.events = [];
    if (countIn) for (let i = 4; i > 0; i--) this.events.push({ time: seek - i * beat, click: true, accent: i === 4 });
    if (opts.metronome) {
      for (const b of song.beats) if (b.time >= seek && b.time < end) this.events.push({ time: b.time, click: true, accent: b.bar });
    }
    const enabled = new Set(players.filter((p) => p.enabled).map((p) => sourceForSafe(song, p).id));
    for (const part of song.parts) {
      const selected = enabled.has(part.id);
      if (selected && !opts.guide && !opts.demo) continue;
      const player = players.find((p) => p.enabled && sourceForSafe(song, p).id === part.id);
      const type = (player?.type || part.type) as Instrument;
      const destination = selected ? this.buses.guide : this.buses.backing;
      for (const n of part.notes) {
        if (n.time >= seek - 1e-6 && n.time < end) {
          this.events.push({
            ...n,
            type,
            destination,
            level: selected ? 0.42 : 0.65,
            duration: Math.min(n.duration, end - n.time) / speed,
          });
        }
      }
    }
    this.events.sort((a, b) => a.time - b.time);
    this.cursor = 0;
    this.running = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  schedule() {
    if (!this.running || !this.ctx) return;
    const until = (this.ctx.currentTime + 0.12 - this.origin) * this.speed;
    while (this.cursor < this.events.length && this.events[this.cursor]!.time <= until) {
      const e = this.events[this.cursor++]!;
      const at = this.origin + e.time / this.speed;
      if (at < this.ctx.currentTime - 0.07) continue;
      if (e.click) this.click(at, e.accent);
      else if (e.type != null && e.pitch != null) {
        this.tone(e.type, e.pitch, e.velocity, at, e.duration, e.level, e.destination);
      }
    }
  }

  stop() {
    this.generation++;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const n of [...this.nodes]) n.stop();
    this.monitorVoices.clear();
  }

  monitor(token: string, type: Instrument, pitch: number, velocity: number, duration = 1) {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.release(token);
    const v = this.tone(type, pitch, velocity, this.ctx.currentTime, duration, 0.85, this.buses.monitor);
    if (type !== "drums") {
      this.monitorVoices.set(token, v);
      // Evict the token when the voice ends naturally, not only on release().
      const ended = v.source.onended;
      v.source.onended = (ev) => {
        if (this.monitorVoices.get(token) === v) this.monitorVoices.delete(token);
        ended?.call(v.source, ev);
      };
    }
  }

  release(token: string) {
    const v = this.monitorVoices.get(token);
    if (v) {
      v.stop();
      this.monitorVoices.delete(token);
    }
  }
}
