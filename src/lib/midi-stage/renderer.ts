import type { Callout, ChartNote, Flash, Grade, Instrument, Particle, Player, Song } from "./types";
import { Judge, clamp, currentHarmony, keyLabel, KEYS } from "./engine";
import type { Feel } from "./feel";

const GRADE_COLOR: Record<Grade, string> = {
  perfect: "#8fd4c4",
  great: "#8aa4c4",
  good: "#e0b27a",
  miss: "#d36a6a",
  extra: "#c48a7a",
  release: "#e0b27a",
};

const GRADE_LABEL: Record<Grade, string> = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  miss: "MISS",
  extra: "EXTRA",
  release: "HOLD IT",
};

type Geom = {
  point: (lane: number, progress: number) => { x: number; y: number; width: number; scale: number; railW: number };
  n: number;
  hit: number;
  cx: number;
  bw: number;
};

export type DrawState = {
  song: Song;
  players: Player[];
  judges: Map<Instrument, Judge>;
  status: string;
  demo: boolean;
  speed: number;
  t: number;
  now: number;
  energy: number;
  trauma: number;
  bloom: number;
  combo: number;
  particles: Particle[];
  flashes: Flash[];
  callouts: Callout[];
  pressed: Map<string, number>;
  reduced: boolean;
  feel: Feel;
};

function hexA(hex: string, a: number) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function noise(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class StageRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  motes: { x: number; y: number; s: number; p: number }[] = [];
  crowd: { x: number; y: number; s: number; phase: number }[] = [];
  geom = new Map<Instrument, Geom>();
  active: Player[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    for (let i = 0; i < 70; i++) {
      this.motes.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.4, p: Math.random() * Math.PI * 2 });
    }
    for (let i = 0; i < 140; i++) {
      this.crowd.push({
        x: Math.random(),
        y: 0.72 + Math.random() * 0.26,
        s: 0.6 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  hitTest(x: number, y: number): { player: Player; lane: number } | null {
    for (const p of this.active) {
      const g = this.geom.get(p.id);
      if (!g) continue;
      if (y < g.hit - 64 || y > g.hit + 52) continue;
      const left = g.point(0, 1).x;
      const right = g.point(g.n, 1).x;
      if (x < left - 10 || x > right + 10) continue;
      const span = Math.max(1, right - left);
      const lane = Math.min(g.n - 1, Math.max(0, Math.floor(((x - left) / span) * g.n)));
      return { player: p, lane };
    }
    return null;
  }

  draw(state: DrawState) {
    const { ctx } = this;
    const { w, h, dpr } = this;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const shake = state.reduced ? 0 : state.trauma * state.trauma * state.feel.shake;
    const ox = shake ? (noise(state.now * 41) - 0.5) * 8 * shake : 0;
    const oy = shake ? (noise(state.now * 53 + 2) - 0.5) * 6 * shake : 0;
    const punch = state.reduced ? 0 : state.bloom * 0.012 * state.feel.punch;
    ctx.save();
    ctx.translate(w * 0.5 + ox, h * 0.5 + oy);
    ctx.scale(1 + punch, 1 + punch);
    ctx.translate(-w * 0.5, -h * 0.5);

    this.paintHouse(state);
    this.paintSpots(state);
    this.paintCrowd(state);
    this.paintTruss(state);
    const geom = this.paintHighways(state);
    this.paintParticles(state, geom);
    this.paintBand(state);
    this.paintCallouts(state, geom);
    this.paintVignette(state);

    ctx.restore();
  }

  private paintHouse(state: DrawState) {
    const { ctx, w, h } = this;
    const e = state.energy;
    const lights = state.feel.lights;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0c0a10");
    g.addColorStop(0.28, `rgb(${10 + e * 8 * lights},${8 + e * 6 * lights},${14 + e * 6 * lights})`);
    g.addColorStop(0.62, "#09080c");
    g.addColorStop(1, "#050407");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 14; i++) {
      const x = (i / 13) * w;
      const fold = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
      fold.addColorStop(0, "rgba(0,0,0,0)");
      fold.addColorStop(0.5, "rgba(18,10,14,0.35)");
      fold.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fold;
      ctx.fillRect(x - 40, 0, 80, h * 0.42);
    }

    const haze = ctx.createRadialGradient(w * 0.5, h * 0.16, 8, w * 0.5, h * 0.16, w * 0.62);
    haze.addColorStop(0, hexA("#c4a882", (0.2 + e * 0.22 + state.bloom * 0.18) * lights));
    haze.addColorStop(0.35, hexA("#8fd4c4", (0.08 + e * 0.1 + state.bloom * 0.1) * lights));
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    if (!state.reduced && lights > 0.04) {
      for (const m of this.motes) {
        const y = ((m.y + state.now * 0.012 * m.s) % 1) * h;
        const x = m.x * w + Math.sin(state.now * 0.4 + m.p) * 12;
        ctx.globalAlpha = (0.08 + e * 0.12 + state.bloom * 0.08) * lights;
        ctx.fillStyle = "#efe8dc";
        ctx.fillRect(x, y, m.s, m.s);
      }
      ctx.globalAlpha = 1;
    }
  }

  private paintSpots(state: DrawState) {
    const { ctx, w, h } = this;
    const e = state.energy;
    const t = state.now;
    const lights = state.feel.lights;
    const cans = [
      { x: w * 0.18, sway: Math.sin(t * 0.35) * 0.08, tint: "#c4a882" },
      { x: w * 0.5, sway: Math.sin(t * 0.28 + 1.2) * 0.05, tint: "#8fd4c4" },
      { x: w * 0.82, sway: Math.sin(t * 0.32 + 2.1) * 0.08, tint: "#8aa4c4" },
    ];
    for (const c of cans) {
      const tipX = w * 0.5 + c.sway * w;
      const grd = ctx.createLinearGradient(c.x, 18, tipX, h * 0.92);
      grd.addColorStop(0, hexA(c.tint, (0.28 + e * 0.22 + state.bloom * 0.2) * lights));
      grd.addColorStop(0.55, hexA(c.tint, (0.08 + e * 0.08) * lights));
      grd.addColorStop(1, hexA(c.tint, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(c.x - 10, 22);
      ctx.lineTo(c.x + 10, 22);
      ctx.lineTo(tipX + w * 0.22, h);
      ctx.lineTo(tipX - w * 0.22, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  private paintCrowd(state: DrawState) {
    const { ctx, w, h } = this;
    const crowd = state.feel.crowd;
    if (crowd < 0.03) return;
    const e = state.energy;
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(state.now * (state.song.bpm / 60) * Math.PI));
    const lift = 1 + state.bloom * 0.8;
    for (const c of this.crowd) {
      const twinkle = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(state.now * 2.4 + c.phase));
      ctx.globalAlpha = (0.08 + e * 0.35) * twinkle * pulse * lift * crowd;
      ctx.fillStyle = c.phase % 2 > 1 ? "#efe8dc" : "#8fd4c4";
      ctx.beginPath();
      ctx.arc(c.x * w, c.y * h - state.bloom * 6, c.s * (1 + state.bloom * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private paintTruss(state: DrawState) {
    const { ctx, w } = this;
    ctx.fillStyle = "rgba(239,232,220,0.08)";
    ctx.fillRect(0, 14, w, 3);
    ctx.fillRect(0, 28, w, 2);
    const cans = 9;
    for (let i = 0; i < cans; i++) {
      const x = w * ((i + 0.5) / cans);
      const lit = 0.35 + 0.65 * Math.abs(Math.sin(state.now * 1.6 + i * 0.7));
      ctx.fillStyle = "rgba(20,18,24,0.9)";
      ctx.fillRect(x - 7, 8, 14, 12);
      ctx.fillStyle = hexA(i % 2 ? "#c4a882" : "#8fd4c4", 0.25 + lit * 0.45 * (0.4 + state.energy + state.bloom * 0.5) * state.feel.lights);
      ctx.beginPath();
      ctx.ellipse(x, 28, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private paintBand(state: DrawState) {
    const { ctx, w, h } = this;
    const y = h * 0.145;
    const cx = w * 0.5;
    const figures: { id: Instrument; dx: number }[] = [
      { id: "drums", dx: -46 },
      { id: "keys", dx: -16 },
      { id: "guitar", dx: 16 },
      { id: "bass", dx: 46 },
    ];
    const bob = Math.sin(state.now * (state.song.bpm / 60) * Math.PI) * 1.6;
    for (const f of figures) {
      const on = state.players.find((p) => p.id === f.id)?.enabled;
      const struck = state.flashes.some((fl) => fl.player === f.id && fl.until > state.now);
      const jump = struck ? 5 : 0;
      const x = cx + f.dx;
      ctx.globalAlpha = on ? 0.85 : 0.28;
      ctx.fillStyle = on ? (struck ? "#3a3228" : "#2a241c") : "#16141a";
      ctx.beginPath();
      ctx.ellipse(x, y + 20 + (on ? bob : 0) - jump, 12 + (struck ? 1.4 : 0), 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + (on ? bob : 0) - jump, 7, 0, Math.PI * 2);
      ctx.fill();
      if (on) {
        ctx.strokeStyle = hexA(struck ? "#8fd4c4" : "#c4a882", struck ? 0.9 : 0.5);
        ctx.lineWidth = struck ? 1.8 : 1;
        ctx.beginPath();
        ctx.ellipse(x, y + 18 + bob - jump, 11, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(239,232,220,0.35)";
    ctx.font = "600 9px 'IBM Plex Sans', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.demo ? "WATCHING THE HOUSE" : "THE BAND", cx, y - 16);
  }

  private paintHighways(state: DrawState) {
    const { ctx, w, h } = this;
    const active = state.players.filter((p) => p.enabled);
    const pw = w / Math.max(1, active.length);
    const hit = h * 0.78;
    const far = h * 0.2;
    const look = 2.7 * state.speed;
    const geom = new Map<Instrument, Geom>();
    const t = state.t;
    this.active = active;

    active.forEach((p, pi) => {
      const judge = state.judges.get(p.id);
      if (!judge) return;
      const lanes = judge.lanes;
      const laneCount = lanes.length;
      const cx = pw * (pi + 0.5);
      const bw = Math.min(active.length === 1 ? w * 0.72 : pw * 0.9, active.length === 1 ? 720 : 520);
      const tw = bw * 0.28;
      const point = (lane: number, progress: number) => {
        const f = clamp(progress, -0.08, 1.18);
        const depth = Math.pow(Math.max(0, f), 1.72);
        const railW = tw + (bw - tw) * depth;
        const gutter = Math.max(12, railW * 0.06);
        const width = Math.max(railW * 0.8, railW - gutter * 2);
        return {
          x: cx + (lane / laneCount - 0.5) * width,
          y: far + (hit - far) * depth,
          width,
          railW,
          scale: 0.22 + 0.78 * depth,
        };
      };
      const rail = (side: number, progress: number) => {
        const p = point(0, progress);
        return { x: cx + (side - 0.5) * p.railW, y: p.y };
      };
      const progress = (nt: number) => 1 - (nt - t) / look;
      geom.set(p.id, { point, n: laneCount, hit, cx, bw });

      const tl = rail(0, 0);
      const tr = rail(1, 0);
      const bl = rail(0, 1.14);
      const br = rail(1, 1.14);

      const hot = state.combo >= 20;
      const track = ctx.createLinearGradient(0, far, 0, hit);
      track.addColorStop(0, "rgba(36,32,40,0.55)");
      track.addColorStop(0.45, "rgba(22,24,30,0.82)");
      track.addColorStop(1, "rgba(12,14,18,0.96)");
      this.poly(
        [
          [tl.x, tl.y],
          [tr.x, tr.y],
          [br.x, br.y],
          [bl.x, bl.y],
        ],
        track,
        hexA(hot ? "#c4a882" : "#8fd4c4", 0.38 + state.bloom * 0.25),
        1.6,
      );

      ctx.strokeStyle = hexA(hot ? "#c4a882" : "#8fd4c4", 0.55 + state.bloom * 0.3);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.moveTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.stroke();

      const nextAt = Array.from({ length: laneCount }, () => Infinity);
      for (const n of judge.notes) {
        if (n.state === 0 && n.time >= t - 0.08 && n.time < nextAt[n.lane]!) nextAt[n.lane] = n.time;
      }
      const heldLanes = new Set<number>();
      for (const n of judge.activeHolds) heldLanes.add(n.lane);

      for (let i = 0; i < laneCount; i++) {
        const a = point(i, 0);
        const b = point(i + 1, 0);
        const c = point(i + 1, 1.1);
        const d = point(i, 1.1);
        this.poly(
          [
            [a.x, a.y],
            [b.x, b.y],
            [c.x, c.y],
            [d.x, d.y],
          ],
          i % 2 ? "rgba(143,212,196,0.07)" : "rgba(0,0,0,0.18)",
        );

        const flash = state.flashes.find((f) => f.player === p.id && f.lane === i && f.until > state.now);
        const pressing = (state.pressed.get(`${p.id}:${i}`) || 0) > state.now || heldLanes.has(i);
        const soon = Number.isFinite(nextAt[i]) ? progress(nextAt[i]!) : -1;
        if (soon > 0.55 && soon < 1.08) {
          const k = clamp((soon - 0.55) / 0.45, 0, 1) * state.feel.trails;
          const aa = point(i, 0.62);
          const bb = point(i + 1, 0.62);
          this.poly(
            [
              [aa.x, aa.y],
              [bb.x, bb.y],
              [c.x, c.y],
              [d.x, d.y],
            ],
            hexA(lanes[i]!.color, 0.08 + k * 0.22),
          );
        }
        if (flash || pressing) {
          const aa = point(i, 0.7);
          const bb = point(i + 1, 0.7);
          const tint = flash?.kind === "miss" ? "#d36a6a" : lanes[i]!.color;
          this.poly(
            [
              [aa.x, aa.y],
              [bb.x, bb.y],
              [c.x, c.y],
              [d.x, d.y],
            ],
            hexA(tint, flash ? 0.32 : 0.16),
          );
        }
      }

      for (let i = 0; i <= laneCount; i++) {
        const a = point(i, 0);
        const b = point(i, 1.14);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = i === 0 || i === laneCount ? "rgba(239,232,220,0.32)" : "rgba(239,232,220,0.1)";
        ctx.lineWidth = i === 0 || i === laneCount ? 1.8 : 0.9;
        ctx.stroke();
      }

      const first = Math.max(0, state.song.beats.findIndex((b) => b.time >= t - 0.2));
      for (let bi = first; bi < state.song.beats.length && state.song.beats[bi]!.time < t + look; bi++) {
        const beat = state.song.beats[bi]!;
        const pr = progress(beat.time);
        if (pr < 0 || pr > 1.14) continue;
        const a = rail(0, pr);
        const b = rail(1, pr);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = beat.bar ? "rgba(239,232,220,0.32)" : "rgba(239,232,220,0.12)";
        ctx.lineWidth = beat.bar ? 1.6 : 0.85;
        ctx.stroke();
      }

      const a = rail(0, 1);
      const b = rail(1, 1);
      ctx.save();
      ctx.shadowColor = hot ? "#c4a882" : "#8fd4c4";
      ctx.shadowBlur = (28 + state.energy * 22 + state.bloom * 36) * (0.25 + 0.75 * state.feel.trails);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(239,232,220,1)";
      ctx.lineWidth = 3.4 + state.bloom * 3.2 * state.feel.trails;
      ctx.stroke();
      ctx.restore();

      const beatPulse = 0.5 + 0.5 * Math.abs(Math.sin(t * (state.song.bpm / 60) * Math.PI));
      const strikeW = point(0, 1).width;
      for (let lane = 0; lane < laneCount; lane++) {
        const mid = point(lane + 0.5, 1);
        const lw = strikeW / laneCount;
        const rx = Math.min(lw * 0.34, 28);
        const flash = state.flashes.find((f) => f.player === p.id && f.lane === lane && f.until > state.now);
        const pressing = (state.pressed.get(`${p.id}:${lane}`) || 0) > state.now || heldLanes.has(lane);
        const soon = Number.isFinite(nextAt[lane]) ? progress(nextAt[lane]!) : -1;
        const live = Boolean(flash || pressing);
        const squash = live ? 1.28 : soon > 0.88 ? 1.1 : 1 + beatPulse * 0.04;
        const tint = flash?.kind === "miss" ? "#d36a6a" : lanes[lane]!.color;
        ctx.beginPath();
        ctx.ellipse(mid.x, hit, rx * squash, 8 / squash, 0, 0, Math.PI * 2);
        ctx.fillStyle = live ? hexA(tint, 0.62) : soon > 0.82 ? hexA(tint, 0.22) : "rgba(8,10,14,0.92)";
        ctx.fill();
        ctx.strokeStyle = hexA(tint, live ? 1 : soon > 0.7 ? 0.9 : 0.75);
        ctx.lineWidth = live ? 2.6 : 1.5;
        ctx.stroke();
        if (live && !state.reduced) {
          ctx.save();
          ctx.shadowColor = tint;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.ellipse(mid.x, hit, rx * 0.55, 4, 0, 0, Math.PI * 2);
          ctx.fillStyle = hexA("#efe8dc", 0.55);
          ctx.fill();
          ctx.restore();
        }
        this.text(lanes[lane]!.short, mid.x, hit + 22, active.length > 2 ? 8 : 10, lanes[lane]!.color, "700");
        if (active.length < 3) {
          const code = KEYS[p.id][lane];
          if (code) this.text(keyLabel(code), mid.x, hit + 36, 8, "rgba(239,232,220,0.45)", "500");
        }
      }

      ctx.font = "600 11px 'IBM Plex Sans', system-ui, sans-serif";
      ctx.fillStyle = "rgba(239,232,220,0.55)";
      ctx.textAlign = "center";
      ctx.fillText(
        `${active.length > 1 ? `P${pi + 1}  ·  ` : ""}${p.label.toUpperCase()}`,
        cx,
        far - 14,
      );
      if (state.status === "playing") {
        ctx.fillStyle = judge.stats.combo >= 10 ? "#c4a882" : "#8fd4c4";
        ctx.font = "600 9px 'IBM Plex Mono', ui-monospace, monospace";
        ctx.fillText(`${judge.stats.combo} STREAK  ·  ${judge.multiplier}×`, cx, far - 1);
      }

      const drawNote = (n: ChartNote) => {
        const isHeld = n.hold === "held";
        const isPop = n.state === 1 && !isHeld && n.hitAt != null && t - n.hitAt < 0.14;
        const popK = isPop && n.hitAt != null ? clamp((t - n.hitAt) / 0.14, 0, 1) : 0;
        const pr = isHeld || isPop ? 1 : progress(n.time);
        if (pr < -0.04 || pr > 1.2) return;
        if (n.state === 1 && !isHeld && !isPop) return;
        const color = lanes[n.lane]!.color;
        const pos = point(n.lane + 0.5, pr);
        const lw = pos.width / laneCount;
        if (p.type !== "drums" && n.duration / state.speed >= 0.35 && n.time + n.duration > t) {
          const tail = point(n.lane + 0.5, clamp(progress(n.time + n.duration), 0, 1));
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.strokeStyle = hexA(color, n.state === 2 ? 0.12 : isHeld ? 0.78 + 0.2 * Math.sin(state.now * 14) : 0.38);
          ctx.lineWidth = Math.max(3, lw * 0.16);
          ctx.lineCap = "round";
          ctx.stroke();
        }

        if (n.chord && n.lanes && n.lanes[0] === n.lane) {
          const mates = n.lanes.map((l) => point(l + 0.5, pr));
          if (mates.length > 1) {
            ctx.beginPath();
            ctx.moveTo(mates[0]!.x, mates[0]!.y);
            for (const m of mates.slice(1)) ctx.lineTo(m.x, m.y);
            ctx.strokeStyle = hexA("#efe8dc", n.state === 2 ? 0.12 : 0.55);
            ctx.lineWidth = Math.max(2, pos.scale * 3);
            ctx.stroke();
          }
          if (pr > 0.42 && n.name) {
            const center = mates.reduce((s, m) => s + m.x, 0) / mates.length;
            this.text(
              `${n.roman ? n.roman + "  " : ""}${n.name}`,
              center,
              mates[0]!.y - 16,
              active.length > 2 ? 11 : 14,
              n.state === 2 ? "rgba(211,106,106,0.55)" : "#efe8dc",
              "700",
            );
          }
        }

        const alpha = n.state === 2 ? 0.22 : isPop ? 0.95 * (1 - popK) : 0.95;
        const grow = isPop ? 1 + popK * 0.55 : pr > 0.82 && n.state === 0 ? 1.06 : 1;
        const rw = Math.min(lw * 0.42, Math.max(4.5, lw * 0.3)) * pos.scale * grow;
        const rh = Math.max(4, 7.5 * pos.scale + pr * 3.2) * grow;
        ctx.save();
        if (n.state !== 2 && !state.reduced) {
          ctx.shadowColor = color;
          ctx.shadowBlur = (6 + (pr > 0.8 ? 6 : 0)) * pos.scale * state.feel.trails;
        }
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y, rw, rh, 0, 0, Math.PI * 2);
        ctx.fillStyle = hexA(color, alpha);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = hexA("#efe8dc", n.state === 2 ? 0.15 : isPop ? 0.9 * (1 - popK) : 0.55);
        ctx.lineWidth = isPop ? 2 : 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(pos.x - rw * 0.28, pos.y - rh * 0.35, rw * 0.35, rh * 0.28, -0.4, 0, Math.PI * 2);
        ctx.fillStyle = hexA("#efe8dc", n.state === 2 ? 0.08 : 0.35);
        ctx.fill();
        ctx.restore();
      };

      const notes = judge.notes;
      const lo = Math.max(0, notes.findIndex((n) => n.time >= t - 0.5 * state.speed));
      const hi = notes.length;
      let drawn = 0;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.clip();
      for (let i = Math.min(hi, lo + 900) - 1; i >= Math.max(0, lo - 8); i--) {
        drawNote(notes[i]!);
        if (++drawn > 900) break;
      }
      for (const n of judge.activeHolds) if (n.time < t - 0.5 * state.speed) drawNote(n);
      ctx.restore();
    });

    this.geom = geom;

    const harm = currentHarmony(state.song, Math.max(0, t));
    if (harm && t > 0) {
      ctx.font = "700 13px Syne, sans-serif";
      ctx.fillStyle = "rgba(239,232,220,0.7)";
      ctx.textAlign = "left";
      ctx.fillText(`${harm.roman}   ${harm.name}`, 22, h * 0.18);
    }

    return geom;
  }

  private paintParticles(state: DrawState, geom: Map<Instrument, Geom>) {
    const { ctx } = this;
    if (state.reduced) return;
    for (const p of state.particles) {
      const life = p.life / p.max;
      const fade = Math.max(0, 1 - life);
      ctx.globalAlpha = fade;
      if (p.kind === "ring" || p.kind === "shock" || p.kind === "burst" || p.kind === "float") {
        const g = p.player ? geom.get(p.player) : undefined;
        const origin = g ? g.point((p.lane ?? 0) + 0.5, 1) : { x: p.x, y: p.y };
        const hx = origin.x;
        const hy = g ? g.hit : p.y;
        if (p.kind === "float") {
          ctx.globalAlpha = fade;
          this.text(p.text || "", hx, hy - 28 - life * 36, p.size, p.color, "800");
        } else if (p.kind === "burst") {
          ctx.fillStyle = hexA(p.color, 0.28 * fade);
          ctx.beginPath();
          ctx.ellipse(hx, hy, 8 + life * 42, 5 + life * 16, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.kind === "shock" ? 3.2 * (1 - life) : 2;
          ctx.beginPath();
          const grow = p.kind === "shock" ? 18 + life * 54 : 10 + life * 28;
          ctx.ellipse(hx, hy, grow, grow * 0.38, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - life * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private paintCallouts(state: DrawState, geom: Map<Instrument, Geom>) {
    const { ctx, h } = this;
    if (!state.feel.callouts) return;
    for (const c of state.callouts) {
      if (c.until < state.now) continue;
      const g = geom.get(c.player);
      if (!g) continue;
      const k = clamp((c.until - state.now) / 0.7, 0, 1);
      const pop = 0.92 + 0.08 * (1 - (1 - k) * (1 - k));
      ctx.globalAlpha = k;
      const y = h * 0.42 - (1 - k) * 14;
      const label = c.text && c.text !== c.grade ? c.text : GRADE_LABEL[c.grade];
      ctx.save();
      ctx.translate(g.cx, y);
      ctx.scale(pop, pop);
      this.text(label, 0, 0, c.text && c.text !== c.grade ? 18 : 22, GRADE_COLOR[c.grade], "800");
      ctx.restore();
      if (c.grade === "perfect" || c.grade === "great" || c.grade === "good") {
        const late = Math.abs(c.delta) < 5 ? "RIGHT ON TIME" : `${Math.abs(Math.round(c.delta))} ms ${c.delta < 0 ? "early" : "late"}`;
        this.text(late, g.cx, y + 20, 10, "rgba(239,232,220,0.55)", "500");
      }
    }
    ctx.globalAlpha = 1;
  }

  private paintVignette(state: DrawState) {
    const { ctx, w, h } = this;
    const v = ctx.createRadialGradient(w * 0.5, h * 0.48, h * 0.2, w * 0.5, h * 0.5, h * 0.78);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(5,4,7,${0.28 + 0.27 * (1 - state.feel.lights * 0.35)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    const bottom = ctx.createLinearGradient(0, h * 0.72, 0, h);
    bottom.addColorStop(0, "rgba(5,4,7,0)");
    bottom.addColorStop(1, "rgba(5,4,7,0.72)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 0, w, h);

    const miss = state.callouts.find((c) => (c.grade === "miss" || c.grade === "extra") && c.until > state.now);
    if (miss) {
      const k = clamp((miss.until - state.now) / 0.7, 0, 1);
      ctx.fillStyle = `rgba(211,106,106,${0.1 * k})`;
      ctx.fillRect(0, 0, w, h);
    } else if (state.bloom > 0.15 && !state.reduced) {
      ctx.fillStyle = `rgba(239,232,220,${state.bloom * 0.06})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private poly(points: number[][], fill?: string | CanvasGradient, stroke?: string, width = 1) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0]![0]!, points[0]![1]!);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0]!, points[i]![1]!);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = width;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  private text(s: string, x: number, y: number, size: number, color: string, weight = "600") {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px 'IBM Plex Sans', system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
  }
}

export function spawnHitJuice(
  particles: Particle[],
  grade: Grade,
  x: number,
  y: number,
  color: string,
  reduced: boolean,
  player?: Instrument,
  lane?: number,
  score?: number,
  juice = 1,
  floaters = true,
) {
  if (reduced) return;
  const amp = Math.max(0, juice);
  const count = Math.round((grade === "perfect" ? 22 : grade === "great" ? 14 : grade === "good" ? 8 : grade === "miss" || grade === "extra" ? 6 : 0) * amp);
  if (count <= 0 && amp < 0.08) return;
  const sparkColor = grade === "miss" || grade === "extra" ? "#d36a6a" : color;
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const sp = 50 + Math.random() * 110;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 50,
      life: 0,
      max: 0.35 + Math.random() * 0.28,
      color: sparkColor,
      size: 1.6 + Math.random() * 2.4,
      kind: "spark",
    });
  }
  if (amp < 0.08) return;
  if (grade === "perfect" || grade === "great" || grade === "good") {
    if (player != null && lane != null) {
      particles.push({
        x: lane,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 0.38,
        color,
        size: 1,
        kind: "ring",
        player,
        lane,
      });
      if (amp > 0.35) {
        particles.push({
          x: lane,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0,
          max: 0.22,
          color,
          size: 1,
          kind: "burst",
          player,
          lane,
        });
      }
      if (grade === "perfect" && amp > 0.55) {
        particles.push({
          x: lane,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0,
          max: 0.5,
          color: "#efe8dc",
          size: 1,
          kind: "shock",
          player,
          lane,
        });
      }
      if (score && floaters) {
        particles.push({
          x: lane,
          y: 0,
          vx: 0,
          vy: -40,
          life: 0,
          max: 0.7,
          color,
          size: 16,
          kind: "float",
          player,
          lane,
          text: `+${score}`,
        });
      }
    }
    if (grade === "perfect" && amp > 0.45) {
      const embers = Math.round(6 * amp);
      for (let i = 0; i < embers; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 30,
          y,
          vx: (Math.random() - 0.5) * 24,
          vy: -40 - Math.random() * 50,
          life: 0,
          max: 0.55 + Math.random() * 0.25,
          color: i % 2 ? "#efe8dc" : color,
          size: 1.4 + Math.random() * 1.6,
          kind: "ember",
        });
      }
    }
  }
}
