import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Eye,
  Lamp,
  Menu,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeelPanel } from "@/components/stage/feel-panel";
import { PianoGuide } from "@/components/stage/piano-guide";
import { AudioEngine } from "@/lib/midi-stage/audio";
import {
  Judge,
  KEYS,
  expectedPitches,
  approachingPitches,
  formatTime,
  keyLabel,
  makeChart,
  stars,
  defaultPlayers,
} from "@/lib/midi-stage/engine";
import { loadFeel, saveFeel, FEEL_COPY, withPreset, type Feel } from "@/lib/midi-stage/feel";
import { catalog } from "@/lib/midi-stage/songs";
import { StageRenderer, spawnHitJuice } from "@/lib/midi-stage/renderer";
import type {
  Callout,
  Difficulty,
  Flash,
  Grade,
  Instrument,
  Particle,
  Player,
  Song,
  Status,
} from "@/lib/midi-stage/types";
import { cn } from "@/lib/utils";

type MidiStatus = { connected: boolean; last: string };
type Results = {
  score: number;
  accuracy: number;
  perfect: number;
  miss: number;
  extra: number;
  combo: number;
  stars: number;
  demo: boolean;
};

type Bag = {
  audio: AudioEngine;
  renderer: StageRenderer | null;
  songs: Song[];
  song: Song;
  players: Player[];
  judges: Map<Instrument, Judge>;
  status: Status;
  demo: boolean;
  speed: number;
  difficulty: Difficulty;
  volume: number;
  guide: boolean;
  metronome: boolean;
  particles: Particle[];
  flashes: Flash[];
  callouts: Callout[];
  energy: number;
  trauma: number;
  reduced: boolean;
  position: number;
  lastFrame: number;
  sounding: Set<number>;
  wrong: Set<number>;
  padFlash: Map<string, number>;
  pressed: Map<string, number>;
  bloom: number;
  feel: Feel;
  midiInputs: { onmidimessage: ((ev: MIDIMessageEvent) => void) | null }[];
  canvasPtrs: Map<number, { player: Player; lane: number; token: string }>;
  feelOpen: boolean;
  feelLane: number;
};

function loadBest(key: string) {
  try {
    return Number(localStorage.getItem(key) || 0) || 0;
  } catch {
    return 0;
  }
}
function saveBest(key: string, n: number) {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* ignore */
  }
}

function bestKey(song: Song, difficulty: string, speed: number, players: Player[]) {
  return `midi-stage-best/${song.id}/${difficulty}/${speed}/${players.filter((p) => p.enabled).map((p) => p.id).join(",")}`;
}

export function StageApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bag = useRef<Bag | null>(null);
  const [ready, setReady] = useState(false);
  const [songId, setSongId] = useState("open-stage");
  const [players, setPlayers] = useState<Player[]>(() => defaultPlayers());
  const [status, setStatus] = useState<Status>("ready");
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [speed, setSpeed] = useState(1);
  const [guide, setGuide] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [volume, setVolume] = useState(55);
  const [hud, setHud] = useState({
    score: 0,
    combo: 0,
    multiplier: 1,
    accuracy: 100,
    energy: 50,
    elapsed: 0,
    remaining: 90,
    section: "HOUSE LIGHTS",
    countdown: "",
    chord: "",
    gain: 0,
    pop: 0,
    bloom: 0,
    trauma: 0,
  });
  const [overlay, setOverlay] = useState(true);
  const [results, setResults] = useState<Results | null>(null);
  const [midi, setMidi] = useState<MidiStatus>({ connected: false, last: "Computer keys ready. MIDI is optional." });
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [piano, setPiano] = useState({
    expected: new Set<number>(),
    sounding: new Set<number>(),
    wrong: new Set<number>(),
    approaching: new Set<number>(),
  });
  const [padFlash, setPadFlash] = useState<Record<string, boolean>>({});
  const [padApproach, setPadApproach] = useState<Record<string, number>>({});
  const [padHeld, setPadHeld] = useState<Record<string, boolean>>({});
  const [best, setBest] = useState(0);
  const [feel, setFeel] = useState<Feel>(() => withPreset("house"));
  const [feelOpen, setFeelOpen] = useState(false);
  const [feelHydrated, setFeelHydrated] = useState(false);
  const [feelTap, setFeelTap] = useState(true);
  const previewFeelRef = useRef<(kind: "perfect" | "miss") => void>(() => {});

  const songs = useMemo(() => catalog(difficulty), [difficulty]);
  const song = songs.find((s) => s.id === songId) || songs[0]!;

  const initBag = useCallback(() => {
    const audio = bag.current?.audio || new AudioEngine();
    audio.stop();
    const b: Bag = {
      audio,
      renderer: bag.current?.renderer || null,
      songs,
      song,
      players: players.map((p) => ({ ...p })),
      judges: new Map(),
      status: "ready",
      demo: false,
      speed,
      difficulty,
      volume: audio.volume,
      guide: bag.current?.guide ?? false,
      metronome: bag.current?.metronome ?? false,
      particles: [],
      flashes: [],
      callouts: [],
      energy: 0.35,
      trauma: 0,
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      position: 0,
      lastFrame: performance.now(),
      sounding: new Set(),
      wrong: new Set(),
      padFlash: new Map(),
      pressed: new Map(),
      bloom: 0,
      feel: bag.current?.feel ?? feel,
      midiInputs: bag.current?.midiInputs || [],
      canvasPtrs: bag.current?.canvasPtrs || new Map(),
      feelOpen: bag.current?.feelOpen ?? false,
      feelLane: bag.current?.feelLane ?? 0,
    };
    bag.current = b;
    rebuild(b);
  }, [songs, song, players, speed, difficulty]);

  function rebuild(b: Bag) {
    b.judges.clear();
    for (const p of b.players.filter((p) => p.enabled)) {
      const chart = makeChart(b.song, p);
      b.judges.set(
        p.id,
        new Judge(chart, {
          difficulty: b.difficulty,
          speed: b.speed,
          drums: p.type === "drums",
          onJudge: (r) => onJudge(b, p, r.grade, r.note?.lane ?? r.lane ?? 0, r.delta, r.note?.pitch, r.score),
        }),
      );
    }
  }

  function onJudge(b: Bag, p: Player, grade: Grade, lane: number, delta: number, pitch?: number, score = 0) {
    const now = performance.now() / 1000;
    const feelNow = b.feel;
    b.callouts = b.callouts.filter((c) => c.until > now);
    if (feelNow.callouts) {
      b.callouts.push({
        player: p.id,
        grade,
        delta,
        until: now + 0.7,
        text: grade,
      });
    }
    const judge = b.judges.get(p.id);
    const combo = judge?.stats.combo ?? 0;
    if (feelNow.callouts && (grade === "perfect" || grade === "great" || grade === "good") && [10, 25, 50, 100, 200].includes(combo)) {
      b.callouts.push({
        player: p.id,
        grade: "perfect",
        delta: 0,
        until: now + 0.9,
        text: `${combo} STREAK`,
      });
    }
    if (grade === "perfect" || grade === "great" || grade === "good") {
      b.flashes.push({ player: p.id, lane, until: now + 0.16, kind: "hit" });
      b.padFlash.set(`${p.id}:${lane}`, now + 0.16);
      b.energy = Math.min(1, b.energy + (grade === "perfect" ? 0.045 : grade === "great" ? 0.025 : 0.012));
      b.bloom = Math.max(b.bloom, (grade === "perfect" ? 0.42 : grade === "great" ? 0.28 : 0.16) * feelNow.bloom);
      if (feelNow.hitsShake && feelNow.shake > 0) {
        b.trauma = Math.min(0.4, b.trauma + (grade === "perfect" ? 0.16 : 0.1) * feelNow.shake);
      }
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const active = b.players.filter((x) => x.enabled);
      const pi = Math.max(0, active.findIndex((x) => x.id === p.id));
      const x = (rect?.width || 800) * ((pi + 0.5) / Math.max(1, active.length));
      const y = (rect?.height || 480) * 0.78;
      const color = judge?.lanes[lane]?.color || "#8fd4c4";
      spawnHitJuice(b.particles, grade, x, y, color, b.reduced, p.id, lane, feelNow.floaters ? score : 0, feelNow.juice, feelNow.floaters);
      if (pitch != null) {
        b.sounding.add(pitch);
        setTimeout(() => b.sounding.delete(pitch), 180);
      }
    } else if (grade === "miss" || grade === "extra") {
      b.energy = Math.max(0.08, b.energy - 0.05);
      if (feelNow.shake > 0) b.trauma = Math.min(0.55, b.trauma + 0.28 * feelNow.shake);
      b.flashes.push({ player: p.id, lane, until: now + 0.12, kind: "miss" });
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const active = b.players.filter((x) => x.enabled);
      const pi = Math.max(0, active.findIndex((x) => x.id === p.id));
      const x = (rect?.width || 800) * ((pi + 0.5) / Math.max(1, active.length));
      const y = (rect?.height || 480) * 0.78;
      spawnHitJuice(b.particles, grade, x, y, "#d36a6a", b.reduced, p.id, lane, 0, feelNow.juice, false);
      if (pitch != null) {
        b.wrong.add(pitch);
        setTimeout(() => b.wrong.delete(pitch), 280);
      }
    }
    if (b.particles.length > 280) b.particles.splice(0, b.particles.length - 280);
  }

  function hit(b: Bag, p: Player, lane: number, token: string, velocity = 105) {
    const judge = b.judges.get(p.id);
    if (!judge || lane < 0 || lane >= judge.lanes.length) return;
    const pitch = judge.lanes[lane]!.pitch;
    const now = performance.now() / 1000;
    b.padFlash.set(`${p.id}:${lane}`, now + 0.16);
    b.pressed.set(`${p.id}:${lane}`, now + 0.18);
    b.flashes.push({ player: p.id, lane, until: now + 0.1, kind: "press" });
    const t = b.status === "playing" ? b.audio.songAt() : b.position;
    let matched = null;
    if (b.status === "playing" && !b.demo) matched = judge.hit(t, lane, token);
    if (!b.demo) b.audio.monitor(token, p.type, pitch, velocity, matched ? matched.duration / b.speed : 1.4);
  }

  function release(b: Bag, p: Player, token: string) {
    const t = b.status === "playing" ? b.audio.songAt() : b.position;
    b.judges.get(p.id)?.release(token, t);
    b.audio.release(token);
  }

  function playPiano(midi: number) {
    const b = bag.current;
    if (!b) return;
    const p = b.players.find((x) => x.id === "keys" && x.enabled);
    if (!p) return;
    const judge = b.judges.get("keys");
    const lane = judge?.lanes.findIndex((l) => l.pc === ((midi % 12) + 12) % 12) ?? -1;
    if (lane >= 0) hit(b, p, lane, `piano:${midi}`);
  }

  function releasePiano(midi: number) {
    const b = bag.current;
    if (!b) return;
    const p = b.players.find((x) => x.id === "keys" && x.enabled);
    if (!p) return;
    release(b, p, `piano:${midi}`);
  }

  function onCanvasPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const b = bag.current;
    const renderer = b?.renderer;
    if (!b || !renderer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const found = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!found) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const token = `canvas:${found.player.id}:${found.lane}:${e.pointerId}`;
    b.canvasPtrs.set(e.pointerId, { player: found.player, lane: found.lane, token });
    hit(b, found.player, found.lane, token);
  }

  function onCanvasPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    const b = bag.current;
    if (!b) return;
    const held = b.canvasPtrs.get(e.pointerId);
    if (!held) return;
    b.canvasPtrs.delete(e.pointerId);
    release(b, held.player, held.token);
  }

  function onCanvasPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const renderer = bag.current?.renderer;
    if (!renderer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const found = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top);
    e.currentTarget.style.cursor = found ? "pointer" : "default";
  }

  function previewFeel(kind: "perfect" | "miss") {
    const b = bag.current;
    if (!b) return;
    const p = b.players.find((x) => x.enabled);
    if (!p) return;
    const judge = b.judges.get(p.id);
    const laneCount = judge?.lanes.length || 1;
    b.feelLane = (b.feelLane + 1) % laneCount;
    const lane = b.feelLane;
    const color = judge?.lanes[lane]?.color || "#8fd4c4";
    const now = performance.now() / 1000;
    if (kind === "perfect") {
      b.bloom = Math.max(b.bloom, 0.5 * b.feel.bloom);
      if (b.feel.hitsShake && b.feel.shake > 0) b.trauma = Math.min(0.4, b.trauma + 0.18 * b.feel.shake);
      b.flashes.push({ player: p.id, lane, until: now + 0.16, kind: "hit" });
      b.padFlash.set(`${p.id}:${lane}`, now + 0.16);
      if (b.feel.callouts) {
        b.callouts.push({ player: p.id, grade: "perfect", delta: 0, until: now + 0.7, text: "perfect" });
      }
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      spawnHitJuice(
        b.particles,
        "perfect",
        (rect?.width || 800) * 0.5,
        (rect?.height || 480) * 0.78,
        color,
        b.reduced,
        p.id,
        lane,
        b.feel.floaters ? 100 : 0,
        b.feel.juice,
        b.feel.floaters,
      );
    } else {
      if (b.feel.shake > 0) b.trauma = Math.min(0.55, b.trauma + 0.32 * b.feel.shake);
      b.flashes.push({ player: p.id, lane, until: now + 0.12, kind: "miss" });
      if (b.feel.callouts) {
        b.callouts.push({ player: p.id, grade: "miss", delta: 0, until: now + 0.7, text: "miss" });
      }
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      spawnHitJuice(
        b.particles,
        "miss",
        (rect?.width || 800) * 0.5,
        (rect?.height || 480) * 0.78,
        "#d36a6a",
        b.reduced,
        p.id,
        lane,
        0,
        b.feel.juice,
        false,
      );
    }
  }
  previewFeelRef.current = previewFeel;

  const startSession = useCallback(async (demo = false) => {
    const b = bag.current;
    if (!b) return;
    try {
      if (b.status === "paused" && !demo) {
        await b.audio.begin({
          song: b.song,
          players: b.players,
          speed: b.speed,
          seek: b.position,
          countIn: false,
          guide: b.guide,
          demo: b.demo,
          metronome: b.metronome,
        });
        b.status = "playing";
        setStatus("playing");
        setOverlay(false);
        return;
      }
      b.demo = demo;
      b.position = 0;
      b.particles = [];
      b.callouts = [];
      b.flashes = [];
      b.energy = 0.4;
      b.bloom = 0;
      b.pressed.clear();
      rebuild(b);
      b.status = "starting";
      setStatus("starting");
      setResults(null);
      await b.audio.begin({
        song: b.song,
        players: b.players,
        speed: b.speed,
        seek: 0,
        countIn: true,
        guide: b.guide || demo,
        demo,
        metronome: b.metronome,
      });
      b.status = "playing";
      setStatus("playing");
      setOverlay(false);
    } catch (e) {
      b.status = "ready";
      setStatus("ready");
      setToast(e instanceof Error ? e.message : "Could not start the set.");
    }
  }, []);

  const pauseSession = useCallback((message?: string) => {
    const b = bag.current;
    if (!b || b.status !== "playing") return;
    b.position = b.audio.songAt();
    b.status = "paused";
    b.audio.stop();
    setStatus("paused");
    if (message) setToast(message);
  }, []);

  const resetReady = useCallback(() => {
    const b = bag.current;
    if (!b) return;
    b.audio.stop();
    b.status = "ready";
    b.demo = false;
    b.position = 0;
    b.particles = [];
    rebuild(b);
    setStatus("ready");
    setOverlay(true);
    setResults(null);
  }, []);

  function finish(b: Bag) {
    b.audio.stop();
    b.status = "ready";
    setStatus("ready");
    let score = 0;
    let perfect = 0;
    let miss = 0;
    let extra = 0;
    let combo = 0;
    let weight = 0;
    let n = 0;
    for (const j of b.judges.values()) {
      const f = j.finish(b.song.duration + 1);
      score += f.score;
      perfect += f.perfect;
      miss += f.miss;
      extra += f.extra;
      combo = Math.max(combo, f.maxCombo);
      weight += f.weight;
      n += f.perfect + f.great + f.good + f.miss + f.extra;
    }
    const accuracy = n ? (100 * weight) / n : 100;
    if (!b.demo) {
      const key = bestKey(b.song, b.difficulty, b.speed, b.players);
      if (score > loadBest(key)) {
        saveBest(key, score);
        setBest(score);
      }
    }
    setResults({
      score,
      accuracy,
      perfect,
      miss,
      extra,
      combo,
      stars: stars(accuracy),
      demo: b.demo,
    });
    setOverlay(true);
  }

  useEffect(() => {
    initBag();
    setStatus("ready");
    setResults(null);
    setOverlay(true);
    setReady(true);
    setBest(loadBest(bestKey(song, difficulty, speed, players)));
  }, [initBag, song, difficulty, speed, players]);

  // Listening controls belong to the live session. Rebuilding here would erase
  // scores and holds while the audio clock continued playing.
  useEffect(() => {
    const b = bag.current;
    if (!b) return;
    b.volume = volume / 100;
    b.guide = guide;
    b.metronome = metronome;
    b.audio.setVolume(b.volume);
  }, [volume, guide, metronome, initBag]);

  useEffect(() => {
    setFeel(loadFeel());
    setFeelHydrated(true);
  }, []);

  useEffect(() => {
    if (!feelHydrated) return;
    if (bag.current) bag.current.feel = feel;
    saveFeel(feel);
  }, [feel, feelHydrated]);

  useEffect(() => {
    if (bag.current) bag.current.feelOpen = feelOpen;
  }, [feelOpen]);

  useEffect(() => {
    if (!feelOpen || !feelTap) return;
    const bpm = bag.current?.song.bpm || 90;
    const ms = Math.max(640, Math.round((120 / bpm) * 1000));
    previewFeelRef.current("perfect");
    const id = window.setInterval(() => {
      const b = bag.current;
      if (!b || b.status === "playing" || b.reduced) return;
      previewFeelRef.current("perfect");
    }, ms);
    return () => window.clearInterval(id);
  }, [feelOpen, feelTap, song.bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new StageRenderer(canvas);
    renderer.resize();
    if (bag.current) bag.current.renderer = renderer;
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);
    let raf = 0;
    let lastHud = 0;
    const loop = (stamp: number) => {
      const b = bag.current;
      if (!b || !b.renderer) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const now = stamp / 1000;
      const dt = Math.min(0.1, (stamp - b.lastFrame) / 1000);
      b.lastFrame = stamp;
      let t = b.status === "playing" ? b.audio.songAt() : b.status === "ready" ? (now * 0.42) % Math.min(14, b.song.duration) : b.position;
      if (b.status === "playing") {
        if (b.audio.ctx && b.audio.ctx.state !== "running") {
          pauseSession("Audio was interrupted. Resume when ready.");
          t = b.position;
        } else {
          for (const p of b.players.filter((p) => p.enabled)) {
            const j = b.judges.get(p.id);
            if (!j) continue;
            if (b.demo) j.advanceDemo(t, p.id);
            j.tick(t);
          }
          if (t >= b.song.duration + 0.35 * b.speed) finish(b);
        }
      }
      b.trauma = Math.max(0, b.trauma - dt * 3.2);
      b.bloom = Math.max(0, b.bloom - dt * 4.6);
      if (b.feelOpen && b.status !== "playing") {
        const rest = 0.28 + 0.55 * b.feel.lights;
        b.energy += (rest - b.energy) * (1 - Math.exp(-2.4 * dt));
        const floor = 0.2 * b.feel.bloom;
        if (b.bloom < floor) b.bloom += (floor - b.bloom) * (1 - Math.exp(-3.2 * dt));
      } else {
        b.energy += (0.32 - b.energy) * (1 - Math.exp(-0.35 * dt));
      }
      for (const p of b.particles) {
        p.life += dt;
        if (p.kind === "spark") {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 220 * dt;
        } else if (p.kind === "ember") {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 18 * dt;
        } else if (p.kind === "float") {
          p.y += p.vy * dt;
        }
      }
      b.particles = b.particles.filter((p) => p.life < p.max);
      b.flashes = b.flashes.filter((f) => f.until > now);
      b.callouts = b.callouts.filter((c) => c.until > now);
      for (const [k, until] of b.pressed) if (until < now) b.pressed.delete(k);

      b.renderer.draw({
        song: b.song,
        players: b.players,
        judges: b.judges,
        status: b.status,
        demo: b.demo,
        speed: b.speed,
        t,
        now,
        energy: b.energy,
        trauma: b.trauma,
        bloom: b.bloom,
        combo: Math.max(0, ...[...b.judges.values()].map((j) => j.stats.combo)),
        particles: b.particles,
        flashes: b.flashes,
        callouts: b.callouts,
        pressed: b.pressed,
        reduced: b.reduced,
        feel: b.feel,
      });
      const shell = canvas.closest(".stage-shell") as HTMLElement | null;
      shell?.style.setProperty("--energy", String(b.energy));
      shell?.style.setProperty("--hit", String(b.bloom));

      if (stamp - lastHud > 80) {
        lastHud = stamp;
        let score = 0;
        let combo = 0;
        let multiplier = 1;
        let weight = 0;
        let n = 0;
        for (const j of b.judges.values()) {
          score += j.stats.score;
          combo = Math.max(combo, j.stats.combo);
          multiplier = Math.max(multiplier, j.multiplier);
          weight += j.stats.weight;
          n += j.stats.perfect + j.stats.great + j.stats.good + j.stats.miss + j.stats.extra;
        }
        const section = [...b.song.sections].reverse().find((s) => s.time <= Math.max(0, t));
        const beat = 60 / b.song.bpm;
        let countdown = "";
        if (b.status === "playing" && t < 0) {
          const count = Math.ceil(-t / beat);
          countdown = String(Math.max(1, Math.min(4, count)));
        } else if (b.status === "paused") countdown = "PAUSED";
        const harm = b.song.harmony?.filter((h) => h.time <= Math.max(0, t)).at(-1);
        setHud((prev) => ({
          score,
          combo,
          multiplier,
          accuracy: n ? (100 * weight) / n : 100,
          energy: Math.round(b.energy * 100),
          elapsed: Math.max(0, t),
          remaining: Math.max(0, b.song.duration - Math.max(0, t)),
          section: b.demo ? "AUTOPLAY" : section?.name || (t < 0 ? "COUNT IN" : "HOUSE LIGHTS"),
          countdown,
          chord: harm ? `${harm.roman}  ${harm.name}` : "",
          gain: b.feel.floaters && score > prev.score ? score - prev.score : b.feel.floaters ? prev.gain : 0,
          pop: score > prev.score ? prev.pop + 1 : prev.pop,
          bloom: b.bloom,
          trauma: b.trauma,
        }));
        const expected = new Set<number>();
        const approaching = new Set<number>();
        for (const p of b.players.filter((x) => x.enabled && x.type === "keys")) {
          for (const pitch of expectedPitches(b.song, Math.max(0, t), p)) expected.add(pitch);
          for (const pitch of approachingPitches(b.song, Math.max(0, t), p)) approaching.add(pitch);
        }
        setPiano({ expected, sounding: new Set(b.sounding), wrong: new Set(b.wrong), approaching });
        const flashes: Record<string, boolean> = {};
        const held: Record<string, boolean> = {};
        const approach: Record<string, number> = {};
        const look = 2.7 * b.speed;
        for (const [k, until] of b.padFlash) if (until > now) flashes[k] = true;
        for (const p of b.players.filter((x) => x.enabled)) {
          const j = b.judges.get(p.id);
          if (!j) continue;
          for (const n of j.activeHolds) {
            const key = `${p.id}:${n.lane}`;
            flashes[key] = true;
            held[key] = true;
          }
          const next = Array.from({ length: j.lanes.length }, () => Infinity);
          for (const note of j.notes) {
            if (note.state === 0 && note.time >= t && note.time < next[note.lane]!) next[note.lane] = note.time;
          }
          for (let i = 0; i < j.lanes.length; i++) {
            if (!Number.isFinite(next[i])) continue;
            const pr = 1 - (next[i]! - t) / look;
            if (pr > 0 && pr < 1) approach[`${p.id}:${i}`] = pr;
          }
        }
        setPadFlash(flashes);
        setPadHeld(held);
        setPadApproach(approach);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [pauseSession]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const b = bag.current;
      if (!b) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return;
      if (e.repeat) return;
      if (e.code === "Enter") {
        e.preventDefault();
        if (b.status === "playing") pauseSession();
        else void startSession(false);
        return;
      }
      if (e.code === "Escape") {
        if (b.status === "playing") pauseSession();
        return;
      }
      if (e.code === "KeyR" && b.status !== "playing") {
        resetReady();
        return;
      }
      for (const p of b.players.filter((p) => p.enabled)) {
        const lane = KEYS[p.id].indexOf(e.code);
        if (lane >= 0) {
          e.preventDefault();
          hit(b, p, lane, `key:${p.id}:${e.code}`);
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const b = bag.current;
      if (!b) return;
      for (const p of b.players.filter((p) => p.enabled)) {
        if (KEYS[p.id].includes(e.code)) release(b, p, `key:${p.id}:${e.code}`);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [pauseSession, startSession, resetReady]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  async function connectMidi() {
    const midiAccess = navigator.requestMIDIAccess;
    if (!midiAccess) {
      setToast("This browser has no Web MIDI. Use the computer keys.");
      return;
    }
    try {
      const access = await midiAccess.call(navigator, { sysex: false });
      const inputs: { onmidimessage: ((ev: MIDIMessageEvent) => void) | null }[] = [];
      const onMessage = (ev: MIDIMessageEvent) => {
        const b = bag.current;
        if (!b) return;
        const data = ev.data;
        if (!data || data.length < 2) return;
        const status = data[0]!;
        const type = status & 0xf0;
        const note = data[1]!;
        const vel = data[2] ?? 0;
        const channel = (status & 0x0f) + 1;
        if (type === 0x90 && vel) {
          setMidi({ connected: true, last: `Note ${note} · ch ${channel} · vel ${vel}` });
          for (const p of b.players.filter((p) => p.enabled)) {
            const judge = b.judges.get(p.id);
            if (!judge) continue;
            const lane = p.type === "drums"
              ? judge.lanes.findIndex((l) => l.notes?.includes(note))
              : judge.lanes.findIndex((l) => l.pc === ((note % 12) + 12) % 12);
            if (lane >= 0) hit(b, p, lane, `midi:${p.id}:${note}`, vel);
          }
        } else if (type === 0x80 || (type === 0x90 && !vel)) {
          for (const p of b.players.filter((p) => p.enabled)) release(b, p, `midi:${p.id}:${note}`);
        }
      };
      access.inputs.forEach((input) => {
        input.onmidimessage = onMessage;
        inputs.push(input);
      });
      if (bag.current) bag.current.midiInputs = inputs;
      setMidi({
        connected: inputs.length > 0,
        last: inputs.length ? `${inputs.length} MIDI input${inputs.length === 1 ? "" : "s"} live.` : "MIDI on. No inputs yet.",
      });
    } catch {
      setToast("MIDI permission was denied. Computer keys still work.");
    }
  }

  function togglePlayer(id: Instrument) {
    setPlayers((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
      if (!next.some((p) => p.enabled)) return prev;
      return next;
    });
    resetReady();
  }

  const enabled = players.filter((p) => p.enabled);
  const busy = status === "playing" || status === "starting";

  return (
    <div className="stage-shell flex min-h-dvh flex-col">
      <header className="relative z-20 flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-3">
          <span className="eq-bars" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <div>
            <div className="font-display text-[1.35rem] font-semibold tracking-[-0.04em] leading-none">
              MIDI <span className="text-accent">/</span> STAGE
            </div>
            <div className="mt-1 text-[10px] font-medium tracking-[0.18em] text-muted">REAL INSTRUMENTS. REAL PLAY.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 text-[10px] tracking-[0.16em] text-muted sm:flex">
            <span className={cn("size-1.5 rounded-full", midi.connected ? "bg-accent" : "bg-tungsten")} />
            LOCAL SET
          </span>
          <Button size="sm" variant="ghost" onClick={() => { setFeelTap(true); setFeelOpen(true); }}>
            <Lamp className="size-3.5" />
            <span className="hidden sm:inline">The room</span>
          </Button>
          <Button size="sm" variant="primary" onClick={() => void connectMidi()}>
            <Radio className="size-3.5" />
            Connect MIDI
          </Button>
          <Button size="icon" variant="ghost" className="lg:hidden size-11" aria-label="Open setlist" onClick={() => setMenu(true)}>
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      <div className="relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className={cn(
            "z-30 flex flex-col gap-5 border-border bg-bg/95 p-4 lg:static lg:border-r lg:bg-transparent",
            "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[min(320px,88vw)] max-lg:overflow-y-auto max-lg:shadow-[0_0_0_1px_rgba(239,232,220,0.08)]",
            menu ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
            "transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
        >
          <div className="flex items-center justify-between lg:hidden">
            <span className="text-[10px] tracking-[0.18em] text-muted">GREEN ROOM</span>
            <Button size="icon" variant="ghost" className="size-10" aria-label="Close setlist" onClick={() => setMenu(false)}>
              <X className="size-5" />
            </Button>
          </div>
          <div>
            <div className="text-[10px] font-semibold tracking-[0.2em] text-accent">THE HOUSE IS YOURS</div>
            <h1 className="font-display mt-2 text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-balance">
              Make some
              <br />
              <em className="not-italic text-accent">real noise.</em>
            </h1>
            <p className="mt-3 max-w-[28ch] text-pretty text-[13px] leading-relaxed text-muted">
              Notes roll toward the strike line. Hit them as they bloom. Start on keys, then bring the band.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[10px] font-semibold tracking-[0.18em] text-muted">SETLIST</h2>
              <span className="text-[9px] tracking-[0.14em] text-subtle">{String(songs.length).padStart(2, "0")} TRACKS</span>
            </div>
            <div className="flex flex-col gap-2">
              {songs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === song.id}
                  onClick={() => {
                    setSongId(s.id);
                    setMenu(false);
                    resetReady();
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-2 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.08)] transition-[background,box-shadow] duration-150",
                    s.id === song.id ? "bg-elevated shadow-[0_0_0_1px_rgba(143,212,196,0.45)]" : "bg-surface hover:bg-elevated",
                  )}
                >
                  <span className={cn("album", s.art)} />
                  <span className="min-w-0">
                    <strong className="block truncate text-[13px] font-medium">{s.name}</strong>
                    <small className="mt-0.5 block text-[10px] text-muted">
                      {s.bpm} BPM · {formatTime(Math.ceil(s.duration))}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[10px] font-semibold tracking-[0.18em] text-muted">YOUR LINEUP</h2>
              <span className="text-[9px] tracking-[0.14em] text-subtle">1–4 PLAYERS</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.enabled}
                  onClick={() => togglePlayer(p.id)}
                  className={cn(
                    "flex h-11 items-center justify-between rounded-xl px-3 text-[12px] font-medium shadow-[0_0_0_1px_rgba(239,232,220,0.1)]",
                    p.enabled ? "bg-elevated text-fg shadow-[0_0_0_1px_rgba(143,212,196,0.4)]" : "bg-surface text-muted",
                  )}
                >
                  {p.label}
                  <span className="text-[10px] text-accent">{p.enabled ? "ON" : "OFF"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-surface p-3 shadow-[0_0_0_1px_rgba(239,232,220,0.08)]">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <span className={cn("size-1.5 rounded-full", midi.connected ? "bg-accent" : "bg-tungsten")} />
              {midi.connected ? "MIDI live" : "Keyboard ready"}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{midi.last}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFeelTap(true);
              setFeelOpen(true);
              setMenu(false);
            }}
            className="rounded-xl bg-surface p-3 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.08)] hover:bg-elevated"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-muted">THE ROOM</span>
              <span className="text-[10px] tracking-[0.14em] text-accent">
                {feel.preset === "custom" ? "CUSTOM" : FEEL_COPY[feel.preset].label.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {feel.preset === "custom" ? "Your mix. Lights, sparks, and shake." : FEEL_COPY[feel.preset].line}
            </p>
          </button>
        </aside>

        {menu ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-bg/50 lg:hidden"
            aria-label="Dismiss setlist"
            onClick={() => setMenu(false)}
          />
        ) : null}

        <section className="flex min-w-0 flex-col px-3 pb-4 md:px-5">
          <div className="flex flex-wrap items-end justify-between gap-3 py-2">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.18em] text-subtle">
                {song.original ? "ORIGINAL SESSION" : "YOUR COLLECTION"} / {song.tag}
              </div>
              <h2 className="font-display mt-1 text-[1.7rem] font-semibold tracking-[-0.03em]">{song.name}</h2>
            </div>
            <div className="flex items-baseline gap-4 text-muted">
              <strong className="font-mono text-lg text-fg tabular-nums">
                {song.bpm} <span className="text-[10px] tracking-[0.14em] text-muted">BPM</span>
              </strong>
              <span className="font-mono text-sm tabular-nums">{formatTime(Math.ceil(song.duration))}</span>
              <span className="hidden rounded-full px-2 py-1 text-[9px] tracking-[0.14em] text-accent shadow-[0_0_0_1px_rgba(143,212,196,0.3)] sm:inline">
                NO-FAIL PRACTICE
              </span>
            </div>
          </div>
          <p className="mb-3 max-w-[70ch] text-[13px] text-pretty text-muted">{song.arrangementDescription}</p>

          <div className="grid grid-cols-2 gap-3 rounded-t-2xl bg-surface px-4 py-3 shadow-[0_0_0_1px_rgba(239,232,220,0.08)] sm:grid-cols-4 lg:grid-cols-5">
            <div className={cn("hud-chip accent", hud.gain > 0 && "pop")}>
              <span>SCORE</span>
              <strong key={hud.pop}>
                {hud.score.toLocaleString().padStart(6, "0")}
                {hud.gain > 0 ? <em className="gain">+{hud.gain}</em> : null}
              </strong>
            </div>
            <div className={cn("hud-chip", hud.combo >= 10 && "hot")}>
              <span>STREAK</span>
              <strong>
                {hud.combo} <small className="text-[10px] text-subtle">NOTES</small>
              </strong>
            </div>
            <div className="hud-chip">
              <span>MULTIPLIER</span>
              <strong>
                {hud.multiplier}
                <small className="text-[12px]">×</small>
              </strong>
            </div>
            <div className="hud-chip">
              <span>ACCURACY</span>
              <strong>
                {Math.round(hud.accuracy)}
                <small className="text-[10px] text-subtle">%</small>
              </strong>
            </div>
            <div className="hud-chip hidden lg:flex">
              <span>PERSONAL BEST</span>
              <strong className="text-muted">{best ? best.toLocaleString() : "—"}</strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-elevated px-4 py-2 text-[10px] tracking-[0.12em] text-muted">
            <label className="flex items-center gap-2">
              STAGE ENERGY
              <meter className={cn("energy-meter", hud.energy > 70 && "hot")} min={0} max={100} value={hud.energy} />
              <span className="font-mono tabular-nums text-fg">{hud.energy}%</span>
            </label>
            <span>{enabled.length === 1 ? "SOLO · FIND YOUR GROOVE" : `${enabled.length}-PLAYER BAND`}</span>
            <span className="text-tungsten">{hud.section}</span>
          </div>

          <div className="relative isolate min-h-[420px] flex-1 overflow-hidden rounded-b-2xl bg-[#07060a] shadow-[0_0_0_1px_rgba(239,232,220,0.08)] md:min-h-[520px]">
            <canvas
              ref={canvasRef}
              className="stage-canvas absolute inset-0 size-full"
              aria-label="Notes travel down each instrument highway. Hit the matching pad when a note reaches the strike line. You can also tap the receptors on the strike line."
              onPointerDown={onCanvasPointerDown}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              onPointerMove={onCanvasPointerMove}
            />
            {hud.countdown && status !== "ready" ? (
              <div className="pointer-events-none absolute inset-x-0 top-[22%] text-center font-display text-[5.5rem] font-semibold leading-none tracking-[-0.06em] text-accent">
                {hud.countdown === "PAUSED" ? "Ⅱ" : hud.countdown}
                <small className="mt-3 block text-[11px] tracking-[0.28em] text-muted">
                  {hud.countdown === "PAUSED" ? "PAUSED" : status === "playing" && bag.current?.demo ? "AUTOPLAY" : "COUNT IN"}
                </small>
              </div>
            ) : null}

            {overlay && status !== "playing" && !feelOpen ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_48%,rgba(7,6,10,0.58),rgba(7,6,10,0.16)_62%,transparent)] px-6 text-center">
                {results ? (
                  <div className="overlay-enter max-w-md">
                    <div className="text-[10px] tracking-[0.22em] text-muted">
                      {results.demo ? "AUTOPLAY · NOT SAVED" : "SET COMPLETE"}
                    </div>
                    <div className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em] md:text-5xl">
                      {results.demo ? "Now make it yours." : results.accuracy >= 90 ? "You found the pocket." : "The house is warming up."}
                    </div>
                    <div className="mt-3 font-mono text-5xl font-semibold tabular-nums text-accent">{results.score.toLocaleString()}</div>
                    <div className="mt-2 text-tungsten tracking-[0.2em]" aria-label={`${results.stars} of 5 stars`}>
                      {"●".repeat(results.stars)}
                      {"○".repeat(5 - results.stars)}
                    </div>
                    <p className="mt-3 text-[13px] text-muted">
                      {Math.round(results.accuracy)}% accuracy · {results.perfect} perfect · {results.miss} missed · streak {results.combo}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button onClick={() => void startSession(false)} disabled={!ready || busy}>
                        <Play className="size-4 translate-x-px" />
                        Play again
                      </Button>
                      <Button variant="secondary" onClick={() => setResults(null)}>
                        Back to house
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="overlay-enter max-w-md">
                    <div className="text-[10px] tracking-[0.22em] text-muted">YOUR NEXT SESSION</div>
                    <h3 className="mt-3 font-display text-5xl font-semibold tracking-[-0.05em] md:text-6xl">Take the stage.</h3>
                    <p className="mt-4 max-w-[36ch] text-base leading-relaxed text-muted text-pretty md:text-lg">
                      Gems roll toward the hot line. Hit the matching keys as they cross — or tap the strike line, pads, or piano.
                      {song.harmony ? " Chords light the piano. Play the glowing keys together." : ""}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button onClick={() => void startSession(false)} disabled={!ready || busy}>
                        <Play className="size-4 translate-x-px" />
                        Start set
                        <kbd className="ml-1 rounded-md bg-accent-fg/10 px-1.5 py-0.5 font-mono text-[10px]">ENTER</kbd>
                      </Button>
                      <Button variant="secondary" onClick={() => void startSession(true)} disabled={!ready || busy}>
                        <Eye className="size-4" />
                        Watch the house
                      </Button>
                    </div>
                    <p className="mt-3 text-[11px] text-subtle">Solo by default. Add your band from the green room.</p>
                  </div>
                )}
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between text-[9px] font-semibold tracking-[0.16em] text-muted">
              <span>{enabled.length === 1 ? "SOLO SESSION" : `${enabled.length}-PLAYER BAND`}</span>
              <span>{hud.section}</span>
            </div>
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-between text-[9px] tracking-[0.16em] text-subtle">
              <span>COMPUTER KEYS / MIDI</span>
              <span>{speed.toFixed(2)}× TEMPO</span>
            </div>
          </div>

          {song.harmony ? (
            <div className="mt-2 rounded-xl bg-surface px-3 py-2 shadow-[0_0_0_1px_rgba(239,232,220,0.08)]">
              <div className="mb-2 flex items-center justify-between text-[10px] tracking-[0.14em] text-muted">
                <span>TUNGSTEN: TARGET · SEA-GLASS: SOUNDING · ROSE: WRONG · TAP THE KEYS</span>
                <span className="font-mono text-accent">{hud.chord || "—"}</span>
              </div>
              <PianoGuide
                expected={piano.expected}
                sounding={piano.sounding}
                wrong={piano.wrong}
                approaching={piano.approaching}
                interactive={enabled.some((p) => p.id === "keys")}
                onPlay={playPiano}
                onRelease={releasePiano}
              />
            </div>
          ) : null}

          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-elevated">
              <div className="h-full bg-accent" style={{ width: `${song.duration ? (hud.elapsed / song.duration) * 100 : 0}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted">
              <span>{formatTime(hud.elapsed)}</span>
              <span>{status === "ready" ? "Ready when you are." : status === "paused" ? "Paused." : bag.current?.demo ? "Watching." : "Make it yours."}</span>
              <span>{formatTime(hud.remaining)}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void startSession(false)} disabled={!ready || busy}>
                {status === "paused" ? (
                  <>
                    <Play className="size-4 translate-x-px" /> Resume
                  </>
                ) : (
                  <>
                    <Play className="size-4 translate-x-px" /> Start set
                  </>
                )}
              </Button>
              <Button variant="secondary" onClick={() => pauseSession()} disabled={status !== "playing"}>
                <Pause className="size-4" /> Pause
              </Button>
              <Button variant="ghost" size="icon" aria-label="Restart" onClick={resetReady}>
                <RotateCcw className="size-4" />
              </Button>
            </div>
            <Button variant="ghost" onClick={() => void startSession(true)} disabled={!ready || busy}>
              <Eye className="size-4" /> Watch the house
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-[9px] tracking-[0.14em] text-muted">
              DIFFICULTY
              <select
                className="h-10 min-w-[120px] rounded-lg bg-elevated px-2 text-[13px] text-fg shadow-[0_0_0_1px_rgba(239,232,220,0.12)]"
                value={difficulty}
                disabled={busy}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                <option value="chill">Chill</option>
                <option value="standard">Standard</option>
                <option value="expert">Expert</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[9px] tracking-[0.14em] text-muted">
              TEMPO
              <select
                className="h-10 min-w-[100px] rounded-lg bg-elevated px-2 text-[13px] text-fg shadow-[0_0_0_1px_rgba(239,232,220,0.12)]"
                value={String(speed)}
                disabled={busy}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value="0.5">50%</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
                <option value="1.25">125%</option>
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={guide} disabled={busy} onChange={(e) => setGuide(e.target.checked)} suppressHydrationWarning />
              Guide part
            </label>
            <label className="flex h-10 items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={metronome} disabled={busy} onChange={(e) => setMetronome(e.target.checked)} suppressHydrationWarning />
              Click
            </label>
            <label className="ml-auto flex items-center gap-2 text-[9px] tracking-[0.14em] text-muted">
              <Volume2 className="size-4" />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                aria-label="Master volume"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                }}
                suppressHydrationWarning
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {enabled.map((p) => {
              const lanes = bag.current?.judges.get(p.id)?.lanes || [];
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[9px] tracking-[0.14em] text-muted">{p.label.toUpperCase()}</span>
                  <div className="grid flex-1 grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                    {lanes.map((lane, i) => (
                      <button
                        key={lane.short + i}
                        type="button"
                        className={cn(
                          "pad",
                          padFlash[`${p.id}:${i}`] && "flash",
                          padHeld[`${p.id}:${i}`] && "held",
                          (padApproach[`${p.id}:${i}`] || 0) > 0.82 && "soon",
                        )}
                        style={{
                          ["--pad-color" as string]: lane.color,
                          ["--approach" as string]: String(padApproach[`${p.id}:${i}`] || 0),
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
                          if (bag.current) hit(bag.current, p, i, `touch:${p.id}:${i}`);
                        }}
                        onPointerUp={() => bag.current && release(bag.current, p, `touch:${p.id}:${i}`)}
                        onPointerCancel={() => bag.current && release(bag.current, p, `touch:${p.id}:${i}`)}
                      >
                        <span>{lane.short}</span>
                        <kbd>{keyLabel(KEYS[p.id][i] || "")}</kbd>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-subtle">
            <kbd className="rounded bg-elevated px-1">ENTER</kbd> start / pause · <kbd className="rounded bg-elevated px-1">R</kbd> restart · Tap the strike line, pads, or piano. Hold melodic notes through their tails.
          </p>
        </section>
      </div>

      {feelOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-bg/55"
            aria-label="Close the room"
            onClick={() => setFeelOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-title"
            className="feel-sheet fixed inset-y-0 right-0 z-50 flex w-[min(400px,92vw)] flex-col overflow-hidden bg-bg shadow-[0_0_0_1px_rgba(239,232,220,0.1)]"
          >
            <FeelPanel
              feel={feel}
              reduced={bag.current?.reduced ?? false}
              tapping={feelTap}
              live={{ bloom: hud.bloom, trauma: hud.trauma }}
              onChange={(next) => {
                setFeel(next);
                const b = bag.current;
                if (!b) return;
                b.feel = next;
                if (b.status !== "playing") {
                  b.energy = 0.28 + 0.55 * next.lights;
                  b.bloom = Math.max(b.bloom, 0.28 * next.bloom);
                }
              }}
              onPreview={previewFeel}
              onToggleTap={() => setFeelTap((v) => !v)}
              onClose={() => setFeelOpen(false)}
            />
          </div>
        </>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 max-w-[min(640px,90vw)] -translate-x-1/2 rounded-xl bg-elevated px-4 py-3 text-[13px] text-fg shadow-[0_0_0_1px_rgba(143,212,196,0.35)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
