import type { Callout, ChartNote, Flash, Grade, Instrument, Particle, Player, Song } from "./types";
import { Judge, clamp, currentHarmony, keyLabel, KEYS } from "./engine";
import type { Feel, GoboMotion, GoboPattern, HeadCue } from "./feel";
import { createClubArt, createNoteArt, createPerformerArt } from "./concert-art";
import { suggestedStrum } from "./strum-guide";
import { concertCue, type ConcertCue, type MusicEnergy } from "./concert-cues";

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
  point: (
    lane: number,
    progress: number,
  ) => { x: number; y: number; width: number; scale: number; railW: number };
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
  strumGuide?: boolean;
  music?: MusicEnergy;
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

const MOVING_HEADS = [
  { i: 1, tint: "#c4a882", park: 0.21, spread: 0.12 },
  { i: 2, tint: "#d4b08a", park: 0.35, spread: 0.09 },
  { i: 4, tint: "#8fd4c4", park: 0.5, spread: 0.14 },
  { i: 6, tint: "#8aa4c4", park: 0.65, spread: 0.09 },
  { i: 7, tint: "#c4a882", park: 0.79, spread: 0.12 },
] as const;

function aimHead(
  cue: HeadCue,
  reduced: boolean,
  t: number,
  w: number,
  h: number,
  c: (typeof MOVING_HEADS)[number],
) {
  const originX = w * ((c.i + 0.5) / 9);
  const parkX = c.park * w;
  const parkY = h * 0.845;
  const minX = w * 0.1;
  const maxX = w * 0.9;
  const minY = h * 0.78;
  const maxY = h * 0.9;
  let aimX = parkX;
  let landY = parkY;
  if (!reduced && cue !== "park") {
    if (cue === "fan") {
      const k = 0.5 + 0.5 * Math.sin(t * 0.38);
      const open = 0.55 + 1.05 * k;
      aimX = w * 0.5 + (c.park - 0.5) * w * open;
      landY = parkY + Math.sin(t * 0.38) * 6;
    } else if (cue === "circle") {
      const ang = t * 0.52 + (c.i / 9) * Math.PI * 2;
      aimX = w * (0.5 + Math.cos(ang) * 0.34);
      landY = parkY + Math.sin(ang) * h * 0.032;
    } else if (cue === "cross") {
      const k = 0.5 + 0.5 * Math.sin(t * 0.48);
      const from = c.park;
      const to = 1 - c.park;
      aimX = w * (from + (to - from) * k);
      landY = parkY - Math.abs(Math.sin(t * 0.48)) * 10;
    } else if (cue === "chase") {
      const u = t * 0.42 + c.i * 0.22;
      aimX = w * (0.16 + 0.68 * (0.5 + 0.5 * Math.sin(u)));
      landY = parkY + Math.sin(u * 2) * 8;
    }
  } else if (!reduced) {
    aimX = parkX + Math.sin(t * 0.16 + c.i) * w * 0.008;
  }
  return {
    originX,
    aimX: Math.min(maxX, Math.max(minX, aimX)),
    landY: Math.min(maxY, Math.max(minY, landY)),
  };
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
  private cue: ConcertCue = { clock: 0, beatPosition: 0, pulse: 0, drive: 0, primary: "#8fd4c4", secondary: "#c4a882" };
  private clubArt: HTMLCanvasElement | null = null;
  private noteArt = new Map<string, HTMLCanvasElement>();
  private performerArt = new Map<Instrument, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    for (let i = 0; i < 96; i++) {
      this.motes.push({
        x: 0.08 + Math.random() * 0.84,
        y: Math.random(),
        s: 0.5 + Math.random() * 1.7,
        p: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 88; i++) {
      const side = Math.random() < 0.72;
      const left = Math.random() < 0.5;
      this.crowd.push({
        x: side
          ? left
            ? Math.random() * 0.2
            : 0.8 + Math.random() * 0.2
          : 0.18 + Math.random() * 0.64,
        y: side ? 0.78 + Math.random() * 0.2 : 0.88 + Math.random() * 0.1,
        s: 0.55 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 44; i++) {
      const left = Math.random() < 0.5;
      this.crowd.push({
        x: left ? Math.random() * 0.12 : 0.88 + Math.random() * 0.12,
        y: 0.26 + Math.random() * 0.22,
        s: 0.45 + Math.random() * 1.05,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.w === rect.width && this.h === rect.height && this.dpr === dpr) return;
    this.w = rect.width;
    this.h = rect.height;
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.clubArt = this.w > 0 && this.h > 0 ? createClubArt(this.w, this.h, this.dpr) : null;
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

    this.cue = concertCue(state.song, state.t, state.reduced || state.feel.preset === "calm", state.music);
    this.paintHouse(state);
    this.paintSpots(state);
    this.paintCrowd(state);
    this.paintTruss(state);
    this.paintBand(state);
    const geom = this.paintHighways(state);
    this.paintParticles(state, geom);
    this.paintCallouts(state, geom);
    this.paintVignette(state);

    ctx.restore();
  }

  private paintHouse(state: DrawState) {
    const { ctx, w, h } = this;
    const e = Math.min(1, state.energy * 0.8 + this.cue.drive * 0.4);
    const lights = state.feel.lights;
    const bloom = state.bloom;
    const hot = state.combo >= 20;

    const loft = ctx.createLinearGradient(0, 0, 0, h);
    loft.addColorStop(0, "#07050a");
    loft.addColorStop(
      0.16,
      `rgb(${10 + e * 8 * lights},${7 + e * 4 * lights},${14 + e * 7 * lights})`,
    );
    loft.addColorStop(0.5, "#09080c");
    loft.addColorStop(1, "#050407");
    ctx.fillStyle = loft;
    ctx.fillRect(0, 0, w, h);

    if (this.clubArt) {
      ctx.globalAlpha = 0.38 + lights * 0.48;
      ctx.drawImage(this.clubArt, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = "rgba(239,232,220,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = h * (0.09 + i * 0.04);
      ctx.beginPath();
      ctx.moveTo(w * 0.2, y);
      ctx.lineTo(w * 0.8, y);
      ctx.stroke();
    }

    const cycX = w * 0.5;
    const cycY = h * 0.175;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cycX, cycY, w * 0.36, h * 0.155, 0, 0, Math.PI * 2);
    ctx.clip();
    const cyc = ctx.createRadialGradient(cycX, cycY, 4, cycX, cycY, w * 0.38);
    cyc.addColorStop(
      0,
      hexA(hot ? "#efe8dc" : this.cue.secondary, (0.26 + e * 0.18 + bloom * 0.3) * lights),
    );
    cyc.addColorStop(
      0.32,
      hexA(hot ? "#c4a882" : this.cue.primary, (0.14 + e * 0.12 + bloom * 0.16) * lights),
    );
    cyc.addColorStop(0.7, hexA("#6a7a8a", (0.05 + e * 0.05) * lights));
    cyc.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cyc;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.strokeStyle = hexA("#c4a882", 0.12 + lights * 0.1);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.3);
    ctx.lineTo(w * 0.2, h * 0.09);
    ctx.quadraticCurveTo(w * 0.5, h * 0.03, w * 0.8, h * 0.09);
    ctx.lineTo(w * 0.8, h * 0.3);
    ctx.stroke();

    const boards = ctx.createLinearGradient(0, h * 0.38, 0, h);
    boards.addColorStop(0, "rgba(16,12,14,0)");
    boards.addColorStop(0.2, `rgba(30,20,18,${0.16 + lights * 0.1})`);
    boards.addColorStop(1, "rgba(8,6,8,0.74)");
    ctx.fillStyle = boards;
    ctx.fillRect(0, h * 0.38, w, h * 0.62);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * 0.42, w, h * 0.58);
    ctx.clip();
    ctx.strokeStyle = "rgba(58,42,34,0.7)";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.07 + lights * 0.06;
    for (let k = 0; k < 11; k++) {
      const t = k / 10;
      const y = h * 0.42 + h * 0.58 * t * t;
      const inset = (1 - t) * w * 0.2;
      ctx.beginPath();
      ctx.moveTo(inset, y);
      ctx.lineTo(w - inset, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(90,68,52,0.55)";
    const vpX = w * 0.5;
    const vpY = h * 0.18;
    for (let i = -12; i <= 12; i++) {
      if (Math.abs(i) < 5) continue;
      ctx.beginPath();
      ctx.moveTo(vpX + i * 9, vpY);
      ctx.lineTo(vpX + i * w * 0.072, h);
      ctx.stroke();
    }
    ctx.restore();

    const bounce = ctx.createLinearGradient(0, h * 0.72, 0, h);
    bounce.addColorStop(0, "rgba(0,0,0,0)");
    bounce.addColorStop(1, hexA("#c4a882", (0.045 + bloom * 0.05) * lights));
    ctx.fillStyle = bounce;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);

    ctx.fillStyle = "rgba(4,3,6,0.4)";
    ctx.fillRect(0, h * 0.935, w, h * 0.065);
    ctx.fillStyle = hexA("#c4a882", 0.1 + lights * 0.08);
    ctx.fillRect(0, h * 0.933, w, 1.5);

    this.paintDrapes(state);

    const haze = ctx.createRadialGradient(w * 0.5, h * 0.2, 12, w * 0.5, h * 0.34, w * 0.68);
    haze.addColorStop(0, hexA("#c4a882", (0.06 + e * 0.08 + bloom * 0.1) * lights));
    haze.addColorStop(0.45, hexA("#8fd4c4", (0.03 + e * 0.05 + bloom * 0.06) * lights));
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    if (!state.reduced && lights > 0.04) {
      for (const m of this.motes) {
        const y = ((m.y + this.cue.clock * 0.008 * m.s) % 1) * h;
        const x = m.x * w + Math.sin(this.cue.clock * 0.32 + m.p) * 8;
        ctx.globalAlpha = (0.05 + e * 0.08 + bloom * 0.07) * lights;
        ctx.fillStyle = m.p > 3 ? "#c4a882" : "#efe8dc";
        ctx.fillRect(x, y, m.s, m.s);
      }
      ctx.globalAlpha = 1;
    }
  }

  private paintDrapes(state: DrawState) {
    const { ctx, w, h } = this;
    const lights = state.feel.lights;
    const paintSide = (side: number) => {
      ctx.save();
      if (side > 0) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      const dw = Math.min(w * 0.145, 128);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dw * 0.88, 0);
      ctx.quadraticCurveTo(dw * 1.06, h * 0.22, dw * 0.7, h * 0.5);
      ctx.quadraticCurveTo(dw * 0.48, h * 0.78, dw * 0.6, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const vel = ctx.createLinearGradient(0, 0, dw, 0);
      vel.addColorStop(0, "#10080c");
      vel.addColorStop(0.38, "#1a0e14");
      vel.addColorStop(0.72, "#140a10");
      vel.addColorStop(1, "#0a0608");
      ctx.fillStyle = vel;
      ctx.fill();

      ctx.save();
      ctx.clip();
      for (let i = 0; i < 7; i++) {
        const x = ((i + 0.2 + (i % 2) * 0.12) / 7) * dw * 0.86;
        const fold = ctx.createLinearGradient(x - 11, 0, x + 18, 0);
        fold.addColorStop(0, "rgba(0,0,0,0)");
        fold.addColorStop(0.4, "rgba(5,2,4,0.58)");
        fold.addColorStop(0.68, hexA("#7a444c", 0.07 + lights * 0.09));
        fold.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = fold;
        ctx.fillRect(x - 12, 0, 30, h);
      }
      const kiss = ctx.createLinearGradient(dw * 0.45, 0, dw * 1.02, 0);
      kiss.addColorStop(0, "rgba(0,0,0,0)");
      kiss.addColorStop(0.72, hexA("#c4a882", 0.03 + lights * 0.07));
      kiss.addColorStop(1, hexA("#efe8dc", 0.05 + lights * 0.1));
      ctx.fillStyle = kiss;
      ctx.fillRect(0, 0, dw * 1.05, h);
      ctx.restore();
      ctx.restore();
    };
    paintSide(-1);
    paintSide(1);

    ctx.fillStyle = "#10080c";
    ctx.fillRect(0, 0, w, 22);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x0 = (i / n) * w - 28;
      const x1 = ((i + 1) / n) * w + 28;
      const xm = (x0 + x1) / 2;
      ctx.beginPath();
      ctx.moveTo(x0, 20);
      ctx.quadraticCurveTo(xm, 48, x1, 20);
      ctx.lineTo(x1, 0);
      ctx.lineTo(x0, 0);
      ctx.closePath();
      const cloth = ctx.createLinearGradient(x0, 20, x1, 20);
      cloth.addColorStop(0, "#0a0608");
      cloth.addColorStop(0.5, "#1c1218");
      cloth.addColorStop(1, "#0a0608");
      ctx.fillStyle = cloth;
      ctx.fill();
    }
    const rail = ctx.createLinearGradient(0, 16, 0, 22);
    rail.addColorStop(0, hexA("#efe8dc", 0.3 + lights * 0.14));
    rail.addColorStop(0.45, hexA("#c4a882", 0.58));
    rail.addColorStop(1, hexA("#6a4a32", 0.45));
    ctx.fillStyle = rail;
    ctx.fillRect(0, 18, w, 3);
  }

  private paintSpots(state: DrawState) {
    const { ctx, w, h } = this;
    const lights = state.feel.lights;
    if (lights < 0.03) return;
    const e = Math.min(1, state.energy * 0.8 + this.cue.drive * 0.4);
    const t = state.reduced ? 0 : this.cue.clock;
    const beat = Math.PI;
    const cue = state.feel.heads ?? "fan";
    const cone = (
      ox: number,
      ax: number,
      ly: number,
      half: number,
      alpha: number,
      tint: string,
    ) => {
      const grd = ctx.createLinearGradient(ox, 28, ax, ly);
      grd.addColorStop(0, hexA(tint, alpha * 0.85));
      grd.addColorStop(0.38, hexA(tint, alpha * 0.28));
      grd.addColorStop(1, hexA(tint, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(ox - 3, 28);
      ctx.lineTo(ox + 3, 28);
      ctx.lineTo(ax + half, ly);
      ctx.lineTo(ax - half, ly);
      ctx.closePath();
      ctx.fill();
    };

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const c of MOVING_HEADS) {
      const { originX, aimX, landY } = aimHead(cue, state.reduced, t, w, h, c);
      const pulse = 0.68 + this.cue.pulse * 0.22 + this.cue.drive * 0.1;
      const tint = c.i % 2 ? this.cue.secondary : this.cue.primary;
      const a = (0.12 + e * 0.1 + state.bloom * 0.16) * lights * pulse;
      const half = w * c.spread * (0.9 + state.bloom * 0.1);
      cone(originX, aimX, landY, half * 1.32, a * 0.28, tint);
      cone(originX, aimX, landY, half, a * 0.55, tint);
      cone(originX, aimX, landY, half * 0.32, a * 0.7, tint);

      const gobo = state.feel.gobo ?? "breakup";
      const motion = state.feel.goboMotion ?? "drift";
      const phase = this.cue.beatPosition;
      this.paintGobo(
        ctx,
        gobo,
        motion,
        aimX,
        landY,
        half * 0.82,
        13 + state.bloom * 7,
        tint,
        a,
        phase,
        beat,
        state.reduced,
        1,
      );
      if (gobo !== "open") {
        this.paintGobo(
          ctx,
          gobo,
          motion,
          originX + (aimX - originX) * 0.55,
          28 + (landY - 28) * 0.55,
          half * 0.34,
          6,
          tint,
          a * 0.45,
          phase,
          beat,
          state.reduced,
          -1,
        );
        this.paintGobo(
          ctx,
          gobo,
          motion,
          originX + (aimX - originX) * 0.78,
          28 + (landY - 28) * 0.78,
          half * 0.55,
          9,
          tint,
          a * 0.55,
          phase,
          beat,
          state.reduced,
          1,
        );
      }
      if (c.i === 4 && gobo !== "open") {
        this.paintGobo(
          ctx,
          gobo,
          motion,
          w * 0.5,
          h * 0.175,
          w * 0.15,
          h * 0.07,
          tint,
          a * 0.32,
          t * 0.45,
          beat,
          state.reduced,
          1,
        );
      }

      if (!state.reduced) {
        for (let d = 0; d < 6; d++) {
          const u = (d + 0.35) / 6;
          const px = originX + (aimX - originX) * u + Math.sin(t * 0.7 + c.i + d) * 4;
          const py = 28 + (landY - 28) * u;
          ctx.globalAlpha = a * 0.45 * (1 - u);
          ctx.fillStyle = tint;
          ctx.fillRect(px, py, 1.2, 1.2);
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  private paintGobo(
    ctx: CanvasRenderingContext2D,
    pattern: GoboPattern,
    motion: GoboMotion,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    tint: string,
    alpha: number,
    t: number,
    beat: number,
    reduced: boolean,
    dir: number,
  ) {
    if (alpha < 0.02 || rx < 3 || ry < 2) return;
    const live = !reduced && motion !== "still";
    let a = alpha;
    ctx.save();
    ctx.translate(cx, cy);
    if (live && motion === "pulse") {
      const k = 0.5 + 0.5 * Math.abs(Math.sin(t * beat));
      const s = 0.84 + 0.2 * k;
      ctx.scale(s, s);
      a *= 0.68 + 0.32 * k;
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    if (live && motion !== "pulse") {
      if (motion === "drift") {
        ctx.rotate(t * 0.05 * dir);
        ctx.translate(Math.sin(t * 0.31) * rx * 0.07, Math.cos(t * 0.23) * ry * 0.05);
      } else if (motion === "spin") {
        ctx.rotate(t * 0.62 * dir);
      } else if (motion === "sweep") {
        ctx.rotate(t * 0.14 * dir);
        ctx.translate(Math.sin(t * 0.85) * rx * 0.32, Math.sin(t * 0.52 + 1.1) * ry * 0.2);
      }
    }

    if (pattern === "open") {
      const ox = live && motion === "sweep" ? Math.sin(t * 0.7) * rx * 0.18 : 0;
      const oy = live && motion === "spin" ? Math.cos(t * 0.5) * ry * 0.12 : 0;
      const g = ctx.createRadialGradient(ox, oy, 1, 0, 0, rx);
      g.addColorStop(0, hexA(tint, a * 0.62));
      g.addColorStop(0.5, hexA(tint, a * 0.22));
      g.addColorStop(1, hexA(tint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      ctx.restore();
      return;
    }

    ctx.fillStyle = hexA(tint, a * 0.16);
    ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    ctx.fillStyle = hexA(tint, a * 0.72);

    if (pattern === "breakup") {
      for (let i = 0; i < 18; i++) {
        const wobble = live && motion === "drift" ? Math.sin(t * 1.1 + i) * rx * 0.04 : 0;
        const px = (noise(i * 3.17 + 1.4) - 0.5) * rx * 1.85 + wobble;
        const py = (noise(i * 5.91 + 2.2) - 0.5) * ry * 1.85;
        const s = 0.1 + noise(i * 2.4) * 0.24;
        ctx.beginPath();
        ctx.ellipse(px, py, rx * s, ry * s * 0.7, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pattern === "window") {
      const cols = 3;
      const rows = 2;
      const m = Math.min(rx, ry) * 0.1;
      const pw = (rx * 2 - m * (cols + 1)) / cols;
      const ph = (ry * 2 - m * (rows + 1)) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -rx + m + c * (pw + m);
          const y = -ry + m + r * (ph + m);
          ctx.beginPath();
          ctx.roundRect(x, y, pw, ph, Math.min(3, m));
          ctx.fill();
        }
      }
    } else if (pattern === "blinds") {
      const slats = 8;
      const gap = (ry * 2) / slats;
      const open = live && motion === "pulse" ? 0.28 + 0.4 * Math.abs(Math.sin(t * beat)) : 0.52;
      const tilt = live && motion === "sweep" ? Math.sin(t * 0.9) * 0.18 : -0.08;
      ctx.rotate(tilt);
      for (let i = 0; i < slats; i++) {
        if (i % 2) continue;
        ctx.fillRect(-rx, -ry + i * gap + gap * 0.12, rx * 2, gap * open);
      }
    } else if (pattern === "dots") {
      const twinkle = live && motion === "pulse";
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const ox = x * rx * 0.36;
          const oy = y * ry * 0.36;
          if ((ox * ox) / (rx * rx) + (oy * oy) / (ry * ry) > 0.92) continue;
          const k = twinkle ? 0.65 + 0.35 * Math.abs(Math.sin(t * beat + x + y)) : 1;
          ctx.globalAlpha = k;
          ctx.beginPath();
          ctx.arc(ox, oy, Math.min(rx, ry) * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private paintCrowd(state: DrawState) {
    const { ctx, w, h } = this;
    const crowd = state.feel.crowd;
    if (crowd < 0.03) return;
    const e = Math.min(1, state.energy * 0.8 + this.cue.drive * 0.4);
    const pulse = 0.7 + this.cue.pulse * 0.3;
    const lift = 1 + state.bloom * 0.65;
    for (const c of this.crowd) {
      const gallery = c.y < 0.55;
      const twinkle = state.reduced
        ? 0.7
        : 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(this.cue.clock * (gallery ? 1.7 : 2.4) + c.phase));
      // Foreground silhouettes stay in the wings, behind the opaque highway.
      if (!gallery && (c.x < 0.19 || c.x > 0.81)) {
        const sway =
          state.reduced || state.feel.preset === "calm"
            ? 0
            : Math.sin(this.cue.clock * 1.4 + c.phase) * 2;
        const x = c.x * w + sway;
        const y = c.y * h;
        const s = c.s * Math.min(1, w / 600);
        ctx.globalAlpha = crowd * 0.8;
        ctx.fillStyle = "#080c12";
        ctx.strokeStyle = hexA(c.phase > 3 ? "#c4a882" : "#8fd4c4", 0.18 + e * 0.2);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y - s * 14, s * 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - s * 8, y + s * 10);
        ctx.quadraticCurveTo(x - s * 9, y - s * 10, x, y - s * 9);
        ctx.quadraticCurveTo(x + s * 9, y - s * 10, x + s * 8, y + s * 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = (0.06 + e * 0.3) * twinkle * pulse * lift * crowd * (gallery ? 0.7 : 1);
      ctx.fillStyle = c.phase > 3.2 ? "#efe8dc" : c.phase > 1.6 ? "#c4a882" : "#8fd4c4";
      ctx.beginPath();
      ctx.arc(
        c.x * w,
        c.y * h - state.bloom * (gallery ? 2 : 4),
        c.s * (1 + state.bloom * 0.24),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private paintTruss(state: DrawState) {
    const { ctx, w, h } = this;
    const lights = state.feel.lights;
    const metal = ctx.createLinearGradient(0, 12, 0, 24);
    metal.addColorStop(0, "rgba(239,232,220,0.22)");
    metal.addColorStop(0.4, "rgba(70,64,72,0.95)");
    metal.addColorStop(1, "rgba(20,18,24,0.9)");
    ctx.fillStyle = metal;
    ctx.fillRect(0, 14, w, 6);
    ctx.fillStyle = "rgba(8,6,10,0.7)";
    ctx.fillRect(0, 20, w, 1.5);

    const cue = state.feel.heads ?? "fan";
    const movers = new Map<number, (typeof MOVING_HEADS)[number]>(
      MOVING_HEADS.map((c) => [c.i, c]),
    );
    for (let i = 0; i < 9; i++) {
      const x = w * ((i + 0.5) / 9);
      const lit = 0.4 + this.cue.pulse * 0.35 + this.cue.drive * 0.25;
      const mover = movers.get(i);
      const tint = i % 2 ? this.cue.secondary : this.cue.primary;
      const glow = (0.22 + lit * 0.55) * (0.32 + state.energy * 0.4 + state.bloom * 0.45) * lights;
      ctx.fillStyle = "rgba(36,32,38,0.96)";
      ctx.fillRect(x - 5, 10, 10, 8);
      if (mover) {
        const { aimX, landY } = aimHead(cue, state.reduced, this.cue.clock, w, h, mover);
        const ang = Math.atan2(landY - 22, aimX - x);
        ctx.save();
        ctx.translate(x, 22);
        ctx.rotate(ang - Math.PI / 2);
        ctx.fillStyle = "rgba(28,24,30,0.96)";
        ctx.fillRect(-10, -3, 4, 11);
        ctx.fillRect(6, -3, 4, 11);
        ctx.fillStyle = "rgba(12,10,14,0.96)";
        ctx.beginPath();
        ctx.roundRect(-5.5, 2, 11, 18, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(239,232,220,0.12)";
        ctx.fillRect(-4.5, 5, 9, 1);
        ctx.fillStyle = hexA(tint, glow);
        ctx.beginPath();
        ctx.ellipse(0, 20.5, 5.6, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexA("#efe8dc", glow * 0.5);
        ctx.beginPath();
        ctx.ellipse(0, 19.6, 2.4, 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(12,10,14,0.96)";
        ctx.beginPath();
        ctx.roundRect(x - 8, 18, 16, 15, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(239,232,220,0.12)";
        ctx.fillRect(x - 7, 20, 14, 1);
        ctx.fillStyle = hexA(tint, glow * 0.7);
        ctx.beginPath();
        ctx.ellipse(x, 34, 7, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexA("#efe8dc", glow * 0.35);
        ctx.beginPath();
        ctx.ellipse(x, 33.2, 3.2, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(239,232,220,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 9, 22);
        ctx.lineTo(x - 12, 15);
        ctx.moveTo(x + 9, 22);
        ctx.lineTo(x + 12, 15);
        ctx.stroke();
      }
    }
  }

  private paintBand(state: DrawState) {
    const { ctx, w, h } = this;
    const size = Math.min(76, w * 0.14, h * 0.17);
    const figures: { id: Instrument; x: number }[] = [
      { id: "keys", x: 0.35 },
      { id: "drums", x: 0.45 },
      { id: "guitar", x: 0.58 },
      { id: "bass", x: 0.68 },
    ];
    const animated = !state.reduced && state.feel.preset !== "calm";
    for (const f of figures) {
      let art = this.performerArt.get(f.id);
      if (!art) {
        art = createPerformerArt(f.id);
        this.performerArt.set(f.id, art);
      }
      const on = state.players.some((p) => p.id === f.id && p.enabled);
      const struck = on && state.flashes.some((fl) => fl.player === f.id && fl.until > state.now);
      const bob = animated && on ? Math.sin(((state.t * state.song.bpm) / 60) * Math.PI) * 1.2 : 0;
      ctx.globalAlpha = on ? 0.95 : 0.55;
      ctx.drawImage(
        art,
        w * f.x - size / 2,
        h * 0.065 + bob - (animated && struck ? 2 : 0),
        size,
        size,
      );
    }
    ctx.globalAlpha = 1;
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
      const bw = Math.min(
        active.length === 1 ? w * 0.72 : pw * 0.9,
        active.length === 1 ? 720 : 520,
      );
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
      track.addColorStop(0, "#24343d");
      track.addColorStop(0.3, "#101c26");
      track.addColorStop(1, "#070d16");
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

      // Machined rail edges have physical width without moving the hit line.
      for (const side of [0, 1]) {
        const near = rail(side, 1.14);
        const distant = rail(side, 0);
        const out = side === 0 ? -1 : 1;
        const metal = ctx.createLinearGradient(distant.x, distant.y, near.x, near.y);
        metal.addColorStop(0, "#53696d");
        metal.addColorStop(0.5, "#1c303c");
        metal.addColorStop(0.85, "#8aafa9");
        metal.addColorStop(1, "#243943");
        this.poly(
          [
            [distant.x, distant.y],
            [distant.x + out * 3, distant.y],
            [near.x + out * 9, near.y + 4],
            [near.x, near.y],
          ],
          metal,
        );
      }

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
        if (n.state === 0 && n.time >= t - 0.08 && n.time < nextAt[n.lane]!)
          nextAt[n.lane] = n.time;
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

        const flash = state.flashes.find(
          (f) => f.player === p.id && f.lane === i && f.until > state.now,
        );
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
        ctx.strokeStyle =
          i === 0 || i === laneCount ? "rgba(239,232,220,0.32)" : "rgba(239,232,220,0.1)";
        ctx.lineWidth = i === 0 || i === laneCount ? 1.8 : 0.9;
        ctx.stroke();
      }

      const first = Math.max(
        0,
        state.song.beats.findIndex((b) => b.time >= t - 0.2),
      );
      for (
        let bi = first;
        bi < state.song.beats.length && state.song.beats[bi]!.time < t + look;
        bi++
      ) {
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
      ctx.shadowBlur =
        (28 + state.energy * 22 + state.bloom * 36) * (0.25 + 0.75 * state.feel.trails);
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
        const rx = Math.min(lw * 0.36, laneCount === 1 ? 64 : 32);
        const flash = state.flashes.find(
          (f) => f.player === p.id && f.lane === lane && f.until > state.now,
        );
        const pressing =
          (state.pressed.get(`${p.id}:${lane}`) || 0) > state.now || heldLanes.has(lane);
        const soon = Number.isFinite(nextAt[lane]) ? progress(nextAt[lane]!) : -1;
        const live = Boolean(flash || pressing);
        const squash = live ? 1.28 : soon > 0.88 ? 1.1 : 1 + beatPulse * 0.04;
        const tint = flash?.kind === "miss" ? "#d36a6a" : lanes[lane]!.color;
        ctx.beginPath();
        ctx.ellipse(mid.x, hit + 4, rx + 5, 12, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#05090e";
        ctx.fill();
        ctx.strokeStyle = "#647777";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(mid.x, hit, rx * squash, 8 / squash, 0, 0, Math.PI * 2);
        ctx.fillStyle = live
          ? hexA(tint, 0.62)
          : soon > 0.82
            ? hexA(tint, 0.22)
            : "rgba(8,10,14,0.92)";
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
        this.text(
          lanes[lane]!.short,
          mid.x,
          hit + 22,
          active.length > 2 ? 8 : 10,
          lanes[lane]!.color,
          "700",
        );
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
          ctx.strokeStyle = hexA(
            color,
            n.state === 2
              ? 0.12
              : isHeld
                ? state.reduced
                  ? 0.88
                  : 0.78 + 0.2 * Math.sin(state.now * 14)
                : 0.38,
          );
          ctx.lineWidth = Math.max(3, lw * 0.16);
          ctx.lineCap = "round";
          ctx.stroke();
          // A bright core gives the sustain a readable ribbon at every distance.
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.strokeStyle = hexA("#e8fff4", n.state === 2 ? 0.06 : isHeld ? 0.9 : 0.52);
          ctx.lineWidth = Math.max(1, lw * 0.035);
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
        const rw = Math.min(laneCount === 1 ? 70 : 42, Math.max(4.5, lw * 0.37)) * pos.scale * grow;
        const strum =
          state.strumGuide && (p.type === "guitar" || state.song.matching === "rhythm")
            ? suggestedStrum(state.song, n.time)
            : undefined;
        const rh = Math.max(4, (strum ? 15 : 10) * pos.scale + pr * 3.2) * grow;
        ctx.save();
        const artKey = `${color}:${p.type === "drums"}:${strum ?? "none"}`;
        let art = this.noteArt.get(artKey);
        if (!art) {
          art = createNoteArt(color, p.type === "drums", strum);
          this.noteArt.set(artKey, art);
        }
        ctx.globalAlpha = alpha;
        ctx.drawImage(art, pos.x - rw * 1.2, pos.y - rh * 1.4, rw * 2.4, rh * 2.8);
        ctx.restore();
      };

      const notes = judge.notes;
      const lo = Math.max(
        0,
        notes.findIndex((n) => n.time >= t - 0.5 * state.speed),
      );
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
      // Song-level harmony sits top-center where the eye rests between
      // phrases, not orphaned in the corner away from the play action.
      ctx.font = "700 14px Syne, sans-serif";
      ctx.fillStyle = "rgba(239,232,220,0.85)";
      ctx.textAlign = "center";
      ctx.fillText(`${harm.roman}   ${harm.name}`, w / 2, h * 0.045);
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
          ctx.fillStyle = hexA(p.color, 0.2 * fade);
          ctx.beginPath();
          ctx.ellipse(hx, hy, 8 + life * 42, 5 + life * 16, 0, 0, Math.PI * 2);
          ctx.fill();
          // Compact white impact core disappears before the spreading ring.
          if (life < 0.35) {
            ctx.fillStyle = hexA("#f4fff5", (1 - life / 0.35) * 0.9);
            ctx.fillRect(hx - 15, hy - 2, 30, 4);
          }
        } else {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.kind === "shock" ? 3.2 * (1 - life) : 2;
          ctx.beginPath();
          const grow = p.kind === "shock" ? 18 + life * 54 : 10 + life * 28;
          ctx.ellipse(hx, hy, grow, grow * 0.38, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.7, p.size * (1 - life) * 0.65);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private paintCallouts(state: DrawState, geom: Map<Instrument, Geom>) {
    const { ctx, h } = this;
    if (!state.feel.callouts) return;
    // Chords can emit several judgments in one frame. Keep one grade and one
    // milestone per player instead of stacking labels over incoming notes.
    const latest = new Map<Instrument, Callout>();
    const milestones = new Map<Instrument, Callout>();
    for (const c of state.callouts) {
      if (c.until <= state.now) continue;
      (c.text && c.text !== c.grade ? milestones : latest).set(c.player, c);
    }
    for (const [player, c] of latest) {
      const g = geom.get(c.player);
      if (!g) continue;
      const k = clamp((c.until - state.now) / 0.7, 0, 1);
      const pop = state.reduced ? 1 : 0.92 + 0.08 * (1 - (1 - k) * (1 - k));
      ctx.globalAlpha = k;
      const y = h * 0.42;
      const size = Math.min(22, Math.max(10, this.w / Math.max(1, geom.size) / 9));
      ctx.save();
      ctx.translate(g.cx, y);
      ctx.scale(pop, pop);
      this.text(GRADE_LABEL[c.grade], 0, 0, size, GRADE_COLOR[c.grade], "800");
      ctx.restore();
      if (c.grade === "perfect" || c.grade === "great" || c.grade === "good") {
        const late =
          Math.abs(c.delta) < 5
            ? "RIGHT ON TIME"
            : `${Math.abs(Math.round(c.delta))} ms ${c.delta < 0 ? "early" : "late"}`;
        this.text(late, g.cx, y + 18, Math.min(10, size * 0.48), "rgba(239,232,220,0.7)", "500");
      }
      const milestone = milestones.get(player);
      if (milestone) {
        ctx.globalAlpha = clamp((milestone.until - state.now) / 0.3, 0, 1);
        this.text(milestone.text!, g.cx, y - 24, size * 0.66, "#e0b27a", "700");
        milestones.delete(player);
      }
    }
    for (const [player, c] of milestones) {
      const g = geom.get(player);
      if (!g) continue;
      ctx.globalAlpha = clamp((c.until - state.now) / 0.3, 0, 1);
      this.text(
        c.text!,
        g.cx,
        h * 0.42 - 24,
        Math.min(14, this.w / Math.max(1, geom.size) / 13),
        "#e0b27a",
        "700",
      );
    }
    ctx.globalAlpha = 1;
  }

  private paintVignette(state: DrawState) {
    const { ctx, w, h } = this;
    const lights = state.feel.lights;
    const v = ctx.createRadialGradient(w * 0.5, h * 0.42, h * 0.18, w * 0.5, h * 0.48, h * 0.84);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(5,4,7,${0.34 + 0.24 * (1 - lights * 0.4)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);

    const valance = ctx.createLinearGradient(0, 0, 0, h * 0.12);
    valance.addColorStop(0, "rgba(5,3,6,0.4)");
    valance.addColorStop(1, "rgba(5,3,6,0)");
    ctx.fillStyle = valance;
    ctx.fillRect(0, 0, w, h * 0.12);

    const sides = ctx.createLinearGradient(0, 0, w, 0);
    sides.addColorStop(0, "rgba(5,4,7,0.32)");
    sides.addColorStop(0.12, "rgba(5,4,7,0)");
    sides.addColorStop(0.88, "rgba(5,4,7,0)");
    sides.addColorStop(1, "rgba(5,4,7,0.32)");
    ctx.fillStyle = sides;
    ctx.fillRect(0, 0, w, h);

    const bottom = ctx.createLinearGradient(0, h * 0.82, 0, h);
    bottom.addColorStop(0, "rgba(5,4,7,0)");
    bottom.addColorStop(1, "rgba(5,4,7,0.5)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 0, w, h);

    const miss = state.callouts.find(
      (c) => (c.grade === "miss" || c.grade === "extra") && c.until > state.now,
    );
    if (miss) {
      const k = clamp((miss.until - state.now) / 0.7, 0, 1);
      ctx.fillStyle = `rgba(211,106,106,${0.1 * k})`;
      ctx.fillRect(0, 0, w, h);
    } else if (state.bloom > 0.15 && !state.reduced) {
      const flash = ctx.createRadialGradient(w * 0.5, h * 0.18, 8, w * 0.5, h * 0.22, w * 0.4);
      flash.addColorStop(0, hexA("#efe8dc", state.bloom * 0.1));
      flash.addColorStop(0.45, hexA("#c4a882", state.bloom * 0.05));
      flash.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = flash;
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
  const count = Math.round(
    (grade === "perfect"
      ? 22
      : grade === "great"
        ? 14
        : grade === "good"
          ? 8
          : grade === "miss" || grade === "extra"
            ? 6
            : 0) * amp,
  );
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
