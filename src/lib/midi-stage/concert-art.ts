// Static concert art is rasterized once per viewport, and note materials once
// per palette/shape. The animation loop only composites these small surfaces.
import type { Instrument } from "./types";
import type { StrumDirection } from "./strum-guide";

export function createPerformerArt(instrument: Instrument): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const c = canvas.getContext("2d")!;
  c.scale(2, 2);
  c.translate(40, 0);
  const polygon = (points: number[][], fill: string, stroke = "#74837b") => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = stroke;
    c.lineWidth = 0.7;
    c.stroke();
  };
  // Filled tailored silhouettes, rim-lit shoulders, separate instrument props.
  polygon(
    [
      [-10, 40],
      [9, 40],
      [13, 68],
      [5, 68],
      [0, 49],
      [-4, 68],
      [-13, 68],
    ],
    "#11151c",
  );
  const jacket = c.createLinearGradient(-14, 0, 14, 0);
  jacket.addColorStop(0, "#526362");
  jacket.addColorStop(0.22, "#1d2a32");
  jacket.addColorStop(1, "#080f18");
  c.fillStyle = jacket;
  c.strokeStyle = "#708c85";
  c.beginPath();
  c.moveTo(-5, 22);
  c.quadraticCurveTo(-16, 21, -15, 34);
  c.lineTo(-10, 46);
  c.quadraticCurveTo(0, 49, 11, 45);
  c.lineTo(14, 28);
  c.quadraticCurveTo(9, 23, 5, 22);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = "#343d3b";
  c.beginPath();
  c.ellipse(0, 14, 6.5, 8, -0.12, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#b49b7c";
  c.beginPath();
  c.ellipse(0, 14, 6.5, 8, -0.12, -2.6, -0.4);
  c.stroke();
  c.fillStyle = "#080d15";
  c.beginPath();
  c.ellipse(-1, 9, 7, 4, -0.15, 0, Math.PI * 2);
  c.fill();

  if (instrument === "keys") {
    polygon(
      [
        [-25, 39],
        [24, 39],
        [27, 47],
        [-27, 47],
      ],
      "#16232b",
    );
    c.fillStyle = "#d4daca";
    c.fillRect(-23, 40, 46, 4);
    c.fillStyle = "#07121b";
    for (let i = 0; i < 14; i++) c.fillRect(-21 + i * 3.1, 40, 1.5, 2.5);
    c.strokeStyle = "#84938d";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-20, 48);
    c.lineTo(17, 69);
    c.moveTo(20, 48);
    c.lineTo(-17, 69);
    c.stroke();
    polygon(
      [
        [-13, 29],
        [-9, 29],
        [-4, 38],
        [-9, 39],
      ],
      "#263b40",
    );
    polygon(
      [
        [10, 28],
        [14, 29],
        [16, 38],
        [10, 39],
      ],
      "#263b40",
    );
  } else if (instrument === "drums") {
    c.strokeStyle = "#93a198";
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 25, 36);
      c.lineTo(side * 25, 68);
      c.moveTo(side * 25, 65);
      c.lineTo(side * 32, 70);
      c.stroke();
      c.beginPath();
      c.ellipse(side * 25, 35, 12, 2.5, side * 0.1, 0, Math.PI * 2);
      c.fillStyle = "#b2986e";
      c.fill();
      polygon(
        [
          [side * 4, 30],
          [side * 11, 28],
          [side * 22, 34],
          [side * 18, 36],
        ],
        "#2c3c40",
      );
      c.fillStyle = "#7c5940";
      c.fillRect(side * 11 - 6, 43, 12, 9);
      c.strokeRect(side * 11 - 6, 43, 12, 9);
    }
    c.beginPath();
    c.arc(0, 59, 14, 0, Math.PI * 2);
    c.fillStyle = "#0b1721";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "#a49272";
    c.stroke();
    c.beginPath();
    c.arc(0, 59, 10, 0, Math.PI * 2);
    c.lineWidth = 0.7;
    c.stroke();
  } else {
    // Guitar and bass bodies, neck, bridge and shoulder strap.
    c.strokeStyle = "#b49b7c";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-7, 24);
    c.lineTo(8, 47);
    c.stroke();
    c.save();
    c.translate(6, 43);
    c.rotate(-0.62);
    c.fillStyle = instrument === "bass" ? "#587c76" : "#a17d52";
    c.beginPath();
    c.ellipse(-4, 2, 9, 8, 0, 0, Math.PI * 2);
    c.ellipse(4, 0, 7, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#aaad91";
    c.fillRect(4, -2, instrument === "bass" ? 29 : 23, 3);
    c.fillStyle = "#101c26";
    c.fillRect(-6, -3, 4, 8);
    c.restore();
    polygon(
      [
        [-13, 28],
        [-9, 30],
        [-6, 42],
        [4, 44],
        [3, 48],
        [-11, 45],
      ],
      "#263b40",
    );
  }
  return canvas;
}

export function createClubArt(w: number, h: number, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);

  // Acoustic slats, inset brass frames and a recessed stage wall.
  const wall = c.createLinearGradient(0, h * 0.06, 0, h * 0.4);
  wall.addColorStop(0, "#20282a");
  wall.addColorStop(1, "#090d13");
  c.fillStyle = wall;
  c.fillRect(w * 0.19, h * 0.065, w * 0.62, h * 0.31);
  for (let i = 0; i < 35; i++) {
    const x = w * (0.2 + i * 0.0174);
    c.fillStyle = i % 2 ? "#10171c" : "#293136";
    c.fillRect(x, h * 0.075, Math.max(1, w * 0.003), h * 0.26);
  }
  c.strokeStyle = "#64776e";
  c.lineWidth = 1;
  c.strokeRect(w * 0.2, h * 0.067, w * 0.6, h * 0.285);
  c.strokeStyle = "#ad8b58";
  c.strokeRect(w * 0.218, h * 0.08, w * 0.564, h * 0.258);

  // Repeating sconces have a baked glow, with no frame-time shadow blur.
  for (const x of [0.235, 0.29, 0.71, 0.765]) {
    const glow = c.createRadialGradient(w * x, h * 0.19, 1, w * x, h * 0.19, h * 0.12);
    glow.addColorStop(0, "rgba(235,184,110,0.24)");
    glow.addColorStop(1, "rgba(235,184,110,0)");
    c.fillStyle = glow;
    c.fillRect(w * x - h * 0.12, h * 0.07, h * 0.24, h * 0.24);
    c.fillStyle = "#d9b784";
    c.fillRect(w * x, h * 0.115, 2, h * 0.105);
  }

  // Wing stacks and monitor wedges establish scale beside the play surface.
  for (const side of [-1, 1]) {
    const x = w * (side < 0 ? 0.15 : 0.85);
    const sw = Math.min(50, w * 0.055);
    for (let row = 0; row < 3; row++) {
      const y = h * (0.25 + row * 0.075);
      const sh = h * 0.066;
      const metal = c.createLinearGradient(x - sw / 2, y, x + sw / 2, y + sh);
      metal.addColorStop(0, "#3b4143");
      metal.addColorStop(0.1, "#11171d");
      metal.addColorStop(1, "#07090e");
      c.fillStyle = metal;
      c.fillRect(x - sw / 2, y, sw, sh);
      c.strokeStyle = "#586263";
      c.strokeRect(x - sw / 2, y, sw, sh);
      c.beginPath();
      c.ellipse(x, y + sh / 2, sw * 0.3, sh * 0.34, 0, 0, Math.PI * 2);
      c.strokeStyle = "#303e46";
      c.stroke();
      c.beginPath();
      c.ellipse(x, y + sh / 2, sw * 0.12, sh * 0.14, 0, 0, Math.PI * 2);
      c.fillStyle = "#1e292f";
      c.fill();
    }
    c.beginPath();
    c.moveTo(x - sw, h * 0.64);
    c.lineTo(x - sw * 0.75, h * 0.6);
    c.lineTo(x + sw * 0.55, h * 0.6);
    c.lineTo(x + sw, h * 0.66);
    c.closePath();
    c.fillStyle = "#111920";
    c.fill();
    c.strokeStyle = "#3c4c52";
    c.stroke();
  }
  // Recessed stage lip and warm footlights, seen through the outer wings.
  c.fillStyle = "#111820";
  c.fillRect(w * 0.16, h * 0.37, w * 0.68, h * 0.025);
  c.fillStyle = "#778174";
  c.fillRect(w * 0.16, h * 0.37, w * 0.68, 1);
  for (let i = 0; i < 15; i++) {
    c.fillStyle = "#c3a57b";
    c.fillRect(w * (0.18 + i * 0.045), h * 0.384, Math.max(2, w * 0.007), 2);
  }
  return canvas;
}

export function createNoteArt(
  color: string,
  drum: boolean,
  strum?: StrumDirection,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 80;
  const c = canvas.getContext("2d")!;
  const face = (y: number, inset: number) => {
    c.beginPath();
    if (drum) c.ellipse(96, y, 80 - inset, 25 - inset * 0.2, 0, 0, Math.PI * 2);
    else {
      c.moveTo(30 + inset, y - 23);
      c.lineTo(162 - inset, y - 23);
      c.lineTo(178 - inset, y);
      c.lineTo(161 - inset, y + 23);
      c.lineTo(31 + inset, y + 23);
      c.lineTo(14 + inset, y);
      c.closePath();
    }
  };
  face(47, 0);
  c.fillStyle = "#03070d";
  c.fill();
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.stroke();
  const bevel = c.createLinearGradient(0, 13, 0, 65);
  bevel.addColorStop(0, "#f6f3e7");
  bevel.addColorStop(0.2, color);
  bevel.addColorStop(0.7, color);
  bevel.addColorStop(1, "#18262d");
  face(37, 0);
  c.fillStyle = bevel;
  c.fill();
  c.strokeStyle = "rgba(245,246,236,0.85)";
  c.lineWidth = 1.5;
  c.stroke();
  face(36, 8);
  c.fillStyle = "rgba(6,17,26,0.28)";
  c.fill();
  if (strum) {
    // Explicit hand-motion arrow, separate from the note's travel direction.
    const tip = strum === "down" ? 50 : 23;
    const tail = strum === "down" ? 23 : 50;
    const wing = strum === "down" ? 39 : 34;
    c.strokeStyle = "#f4fff5";
    c.lineWidth = 5;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(96, tail);
    c.lineTo(96, tip);
    c.moveTo(80, wing);
    c.lineTo(96, tip);
    c.lineTo(112, wing);
    c.stroke();
  } else {
    c.fillStyle = "#f4fff5";
    c.beginPath();
    c.roundRect(50, 29, 92, 8, 4);
    c.fill();
  }
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.fillRect(40, 18, 112, 2);
  return canvas;
}
