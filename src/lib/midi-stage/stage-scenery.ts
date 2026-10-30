import type { Venue } from "./career";

export type StageSceneryState = {
  activeVenue?: Venue;
  energy: number;
  reduced: boolean;
  feel: { lights: number };
};

export type StageSceneryCue = {
  clock: number;
  drive: number;
};

function hexA(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function noise(value: number) {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Dynamic venue identity, composited over the cached architectural shell. */
export function paintVenueScenery(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: StageSceneryState,
  cue: StageSceneryCue,
) {
  const venue = state.activeVenue;
  const id = venue?.id ?? "garage";
  const primary = venue?.primaryColor ?? "#8fd4c4";
  const accent = venue?.accentColor ?? "#c4a882";
  const lights = state.feel.lights;
  const energy = Math.min(1, state.energy * 0.8 + cue.drive * 0.35);
  const left = w * 0.195;
  const right = w * 0.805;
  const top = h * 0.075;
  const bottom = h * 0.35;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();

  if (id === "neon-club") {
    const glow = ctx.createLinearGradient(left, top, right, bottom);
    glow.addColorStop(0, hexA(primary, 0.1 + energy * 0.07));
    glow.addColorStop(0.5, "rgba(4,8,16,0.08)");
    glow.addColorStop(1, hexA(accent, 0.12 + energy * 0.08));
    ctx.fillStyle = glow;
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = left + (right - left) * i / 12;
      ctx.strokeStyle = hexA(i % 2 ? primary : accent, 0.14 + energy * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(w * 0.5 + (x - w * 0.5) * 1.28, bottom);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const y = top + (bottom - top) * Math.pow(i / 6, 1.65);
      ctx.strokeStyle = hexA(i % 2 ? accent : primary, 0.12 + energy * 0.12);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    for (const side of [-1, 1]) {
      const x = w * (0.5 + side * 0.255);
      ctx.fillStyle = hexA(side < 0 ? primary : accent, 0.5 + energy * 0.3);
      ctx.fillRect(x - 1.5, top + h * 0.02, 3, bottom - top - h * 0.04);
      ctx.fillStyle = hexA("#efe8dc", 0.4);
      ctx.fillRect(x - 0.5, top + h * 0.02, 1, bottom - top - h * 0.04);
    }
  } else if (id === "music-hall") {
    const cx = w * 0.5;
    const cy = bottom + h * 0.015;
    for (let ring = 0; ring < 5; ring++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * (0.1 + ring * 0.052), h * (0.07 + ring * 0.037), 0, Math.PI, Math.PI * 2);
      ctx.strokeStyle = hexA(ring % 2 ? primary : accent, 0.2 + energy * 0.13);
      ctx.lineWidth = ring === 4 ? 2 : 1;
      ctx.stroke();
    }
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + i * w * 0.047, top - h * 0.02);
      ctx.strokeStyle = hexA(accent, 0.08 + energy * 0.07);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const x of [0.245, 0.755]) {
      const column = ctx.createLinearGradient(w * x - 8, 0, w * x + 8, 0);
      column.addColorStop(0, "rgba(8,12,18,0.5)");
      column.addColorStop(0.5, hexA(accent, 0.22 + energy * 0.1));
      column.addColorStop(1, "rgba(8,12,18,0.5)");
      ctx.fillStyle = column;
      ctx.fillRect(w * x - 8, top, 16, bottom - top);
    }
  } else if (id === "amphitheater") {
    const sky = ctx.createLinearGradient(0, top, 0, bottom);
    sky.addColorStop(0, "rgba(7,10,29,0.88)");
    sky.addColorStop(0.55, hexA(primary, 0.12 + energy * 0.06));
    sky.addColorStop(1, hexA(accent, 0.2 + energy * 0.08));
    ctx.fillStyle = sky;
    ctx.fillRect(left, top, right - left, bottom - top);
    for (let i = 0; i < 42; i++) {
      const x = left + noise(i * 4.17 + 2) * (right - left);
      const y = top + noise(i * 7.31 + 8) * (bottom - top) * 0.68;
      const twinkle = state.reduced ? 0.65 : 0.45 + 0.55 * Math.sin(cue.clock * 0.7 + i) ** 2;
      ctx.fillStyle = hexA("#efe8dc", (0.18 + energy * 0.24) * twinkle);
      ctx.fillRect(x, y, i % 7 === 0 ? 1.6 : 1, i % 7 === 0 ? 1.6 : 1);
    }
    const sun = ctx.createRadialGradient(w * 0.5, bottom, 2, w * 0.5, bottom, w * 0.19);
    sun.addColorStop(0, hexA("#efe8dc", 0.32 + energy * 0.16));
    sun.addColorStop(0.28, hexA(primary, 0.28 + energy * 0.16));
    sun.addColorStop(0.68, hexA(accent, 0.1 + energy * 0.08));
    sun.addColorStop(1, hexA(accent, 0));
    ctx.fillStyle = sun;
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = hexA("#efe8dc", 0.18);
    for (let i = 0; i < 5; i++) {
      const y = bottom - h * (0.018 + i * 0.018);
      ctx.beginPath();
      ctx.moveTo(w * 0.36, y);
      ctx.lineTo(w * 0.64, y);
      ctx.stroke();
    }
  } else if (id === "world-arena") {
    const cols = 9;
    const rows = 4;
    const gap = Math.max(2, w * 0.003);
    const cellW = (right - left - gap * (cols - 1)) / cols;
    const cellH = (bottom - top - gap * (rows - 1)) / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = left + col * (cellW + gap);
        const y = top + row * (cellH + gap);
        const wave = state.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(cue.clock * 1.4 + col * 0.7 - row * 0.9);
        const tint = (row + col) % 2 ? primary : accent;
        ctx.fillStyle = hexA(tint, 0.035 + wave * (0.07 + energy * 0.09));
        ctx.fillRect(x, y, cellW, cellH);
        ctx.strokeStyle = hexA(tint, 0.14 + wave * 0.16);
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = w * 0.5 + side * w * (0.06 + i * 0.055);
        ctx.beginPath();
        ctx.moveTo(x - side * w * 0.025, top + h * 0.015);
        ctx.lineTo(x, h * 0.21);
        ctx.lineTo(x - side * w * 0.025, bottom - h * 0.015);
        ctx.strokeStyle = hexA(side < 0 ? primary : accent, 0.18 + energy * 0.18);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  } else {
    // Raw concrete, practical work lights and taped set lists belong only to
    // the garage; larger venues get their own visual identity above.
    ctx.strokeStyle = "rgba(190,205,198,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = top + (bottom - top) * i / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y + (i % 2 ? 2 : -1));
      ctx.stroke();
    }
    for (const x of [0.265, 0.735]) {
      ctx.save();
      ctx.translate(w * x, h * 0.19);
      ctx.rotate(x < 0.5 ? -0.045 : 0.04);
      ctx.fillStyle = "rgba(211,205,179,0.09)";
      ctx.fillRect(-w * 0.025, -h * 0.047, w * 0.05, h * 0.094);
      ctx.fillStyle = hexA(accent, 0.36);
      ctx.fillRect(-w * 0.012, -h * 0.052, w * 0.024, h * 0.009);
      ctx.fillStyle = "rgba(230,225,203,0.18)";
      for (let line = 0; line < 4; line++) {
        ctx.fillRect(-w * 0.017, -h * 0.025 + line * h * 0.014, w * (0.025 + (line % 2) * 0.008), 1);
      }
      ctx.restore();
    }
  }
  ctx.restore();

  // Wing-only floor pools create depth without washing the note highways.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const side of [-1, 1]) {
    const x = w * (0.5 + side * 0.355);
    const y = h * 0.51;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.34);
    const pool = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.12);
    pool.addColorStop(0, hexA(side < 0 ? primary : accent, (0.1 + energy * 0.09) * lights));
    pool.addColorStop(0.55, hexA(side < 0 ? primary : accent, 0.035 * lights));
    pool.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(-w * 0.12, -w * 0.12, w * 0.24, w * 0.24);
    ctx.restore();
  }
  ctx.restore();

  for (const side of [-1, 1]) {
    const x = w * (side < 0 ? 0.178 : 0.822);
    const strip = ctx.createLinearGradient(0, top, 0, bottom);
    strip.addColorStop(0, hexA(side < 0 ? primary : accent, 0));
    strip.addColorStop(0.45, hexA(side < 0 ? primary : accent, (0.28 + energy * 0.22) * lights));
    strip.addColorStop(1, hexA(side < 0 ? primary : accent, 0));
    ctx.fillStyle = strip;
    ctx.fillRect(x - 1, top, 2, bottom - top);
  }
}

/** Risers, amplifiers and contact shadows ground the performers in the room. */
export function paintBackline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: StageSceneryState,
) {
  const baseline = h * 0.25;
  const primary = state.activeVenue?.primaryColor ?? "#8fd4c4";
  const accent = state.activeVenue?.accentColor ?? "#c4a882";

  const floorGlow = ctx.createRadialGradient(w * 0.5, baseline, 2, w * 0.5, baseline, w * 0.36);
  floorGlow.addColorStop(0, hexA(accent, 0.07 + state.energy * 0.04));
  floorGlow.addColorStop(0.6, hexA(primary, 0.025));
  floorGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = floorGlow;
  ctx.fillRect(w * 0.12, h * 0.12, w * 0.76, h * 0.2);

  // A shallow drum riser has a bright top edge and a darker vertical face.
  const riserX = w * 0.45;
  const riserW = Math.min(w * 0.17, 150);
  const riserH = Math.max(5, h * 0.018);
  ctx.beginPath();
  ctx.moveTo(riserX - riserW * 0.42, baseline - riserH);
  ctx.lineTo(riserX + riserW * 0.42, baseline - riserH);
  ctx.lineTo(riserX + riserW * 0.5, baseline);
  ctx.lineTo(riserX - riserW * 0.5, baseline);
  ctx.closePath();
  const riser = ctx.createLinearGradient(0, baseline - riserH, 0, baseline);
  riser.addColorStop(0, "#53605e");
  riser.addColorStop(0.18, "#202c31");
  riser.addColorStop(1, "#090f15");
  ctx.fillStyle = riser;
  ctx.fill();
  ctx.strokeStyle = hexA(accent, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  if (w > 520) {
    for (const [index, x] of [0.585, 0.705].entries()) {
      const ampW = Math.min(42, w * 0.042);
      const ampH = Math.min(36, h * 0.06);
      const left = w * x - ampW / 2;
      const top = baseline - ampH - 2;
      const cabinet = ctx.createLinearGradient(left, top, left + ampW, top + ampH);
      cabinet.addColorStop(0, "#364247");
      cabinet.addColorStop(0.12, "#111a20");
      cabinet.addColorStop(1, "#060b10");
      ctx.fillStyle = cabinet;
      ctx.fillRect(left, top, ampW, ampH);
      ctx.strokeStyle = "#526066";
      ctx.strokeRect(left + 0.5, top + 0.5, ampW - 1, ampH - 1);
      ctx.fillStyle = "#05090d";
      ctx.fillRect(left + 3, top + 6, ampW - 6, ampH - 9);
      ctx.strokeStyle = "rgba(158,174,170,0.16)";
      for (let y = top + 8; y < top + ampH - 3; y += 3) {
        ctx.beginPath();
        ctx.moveTo(left + 4, y);
        ctx.lineTo(left + ampW - 4, y);
        ctx.stroke();
      }
      ctx.fillStyle = hexA(index ? primary : accent, 0.65);
      ctx.fillRect(left + 4, top + 3, 3, 1.5);
    }
  }

  for (const [index, x] of [0.35, 0.45, 0.58, 0.68].entries()) {
    ctx.save();
    ctx.translate(w * x, baseline + 1);
    ctx.scale(1, 0.24);
    const shadow = ctx.createRadialGradient(0, 0, 1, 0, 0, w * 0.045);
    shadow.addColorStop(0, "rgba(0,0,0,0.8)");
    shadow.addColorStop(0.55, "rgba(0,0,0,0.42)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-w * 0.045, -w * 0.045, w * 0.09, w * 0.09);
    ctx.restore();
    ctx.strokeStyle = hexA(index % 2 ? accent : primary, 0.16);
    ctx.beginPath();
    ctx.moveTo(w * x - 8, baseline + 2);
    ctx.lineTo(w * x + 8, baseline + 2);
    ctx.stroke();
  }
}
