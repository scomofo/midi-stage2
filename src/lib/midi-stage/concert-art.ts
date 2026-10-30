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
  // The rim light is the only thing separating the band from the back wall,
  // so it runs brighter than a true silhouette would.
  // Backlight halo: baked stage backlight that lifts each performer off the wall.
  // Rocksmith-style amber wash, hot center falling off hard like a real spot.
  const halo = c.createRadialGradient(0, 32, 4, 0, 32, 44);
  halo.addColorStop(0, "rgba(232,168,76,0.28)");
  halo.addColorStop(0.5, "rgba(232,168,76,0.10)");
  halo.addColorStop(1, "rgba(232,168,76,0)");
  c.fillStyle = halo;
  c.fillRect(-44, -12, 88, 88);
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
    "#232c3a",
  );
  const jacket = c.createLinearGradient(-14, 0, 14, 0);
  jacket.addColorStop(0, "#7d8f8d");
  jacket.addColorStop(0.22, "#3d4f57");
  jacket.addColorStop(0.55, "#2a3540");
  jacket.addColorStop(1, "#141b26");
  c.fillStyle = jacket;
  c.strokeStyle = "#d8b988";
  c.lineWidth = 1.2;
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
  // Shirt visible under the open jacket, catches the front light.
  const shirt = c.createLinearGradient(-4, 24, 4, 46);
  shirt.addColorStop(0, "#8a8f8a");
  shirt.addColorStop(1, "#3a3f3d");
  c.fillStyle = shirt;
  c.beginPath();
  c.moveTo(-4, 24);
  c.lineTo(4, 24);
  c.lineTo(2, 46);
  c.lineTo(-2, 46);
  c.closePath();
  c.fill();
  c.fillStyle = "#343d3b";
  c.beginPath();
  c.ellipse(0, 14, 6.5, 8, -0.12, 0, Math.PI * 2);
  c.fill();
  // Face catches the spotlight: warm highlight on the lit side.
  // Rocksmith-style: hot amber key from stage right, falloff to shadow.
  const face = c.createLinearGradient(-6, 8, 6, 20);
  face.addColorStop(0, "#a08a64");
  face.addColorStop(0.4, "#6b5f4a");
  face.addColorStop(1, "#232a29");
  c.fillStyle = face;
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
  // Rock hair: messy, catches the amber backlight on top.
  c.fillStyle = "#1a1512";
  c.beginPath();
  c.moveTo(-7, 12);
  c.quadraticCurveTo(-8, 2, -2, 3);
  c.quadraticCurveTo(3, 1, 7, 6);
  c.quadraticCurveTo(8, 11, 6, 13);
  c.quadraticCurveTo(4, 8, 0, 9);
  c.quadraticCurveTo(-4, 8, -7, 12);
  c.closePath();
  c.fill();
  c.strokeStyle = "#d8a860";
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(-5, 6);
  c.quadraticCurveTo(-2, 3, 3, 4);
  c.stroke();

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
    c.fillStyle = "#e8ece0";
    c.fillRect(-23, 40, 46, 4);
    c.fillStyle = "#07121b";
    for (let i = 0; i < 14; i++) c.fillRect(-21 + i * 3.1, 40, 1.5, 2.5);
    // Key bed catches the stage wash.
    c.fillStyle = "rgba(232,236,224,0.16)";
    c.fillRect(-25, 37, 50, 3);
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
      c.fillStyle = "#c8ab7d";
      c.fill();
      // Cymbal catches the light.
      c.fillStyle = "rgba(240,220,170,0.35)";
      c.beginPath();
      c.ellipse(side * 25 - 3, 34.2, 6, 1.2, side * 0.1, 0, Math.PI * 2);
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
    // Sticks raised, mid-performance.
    c.strokeStyle = "#d8c49a";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-8, 32);
    c.lineTo(-18, 18);
    c.moveTo(8, 32);
    c.lineTo(16, 16);
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
    c.fillStyle = instrument === "bass" ? "#6a8f89" : "#b28e5e";
    c.beginPath();
    c.ellipse(-4, 2, 9, 8, 0, 0, Math.PI * 2);
    c.ellipse(4, 0, 7, 6, 0, 0, Math.PI * 2);
    c.fill();
    // Body highlight: stage wash across the curve.
    c.fillStyle = "rgba(240,230,200,0.22)";
    c.beginPath();
    c.ellipse(-5, 0, 5, 3.5, -0.3, 0, Math.PI * 2);
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
  // Front key light: warm spot washing the performer from the front,
  // hot on the instrument side, falling off to the edges. Rocksmith-style.
  const key = c.createLinearGradient(-20, 0, 20, 0);
  key.addColorStop(0, "rgba(232,168,76,0)");
  key.addColorStop(0.35, "rgba(232,168,76,0.14)");
  key.addColorStop(0.65, "rgba(232,168,76,0.14)");
  key.addColorStop(1, "rgba(232,168,76,0)");
  c.fillStyle = key;
  c.fillRect(-20, 0, 40, 72);
  return canvas;
}

export function createClubArt(w: number, h: number, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);

  const polygon = (points: number[][], fill: string | CanvasGradient, stroke?: string) => {
    c.beginPath();
    points.forEach(([x, y], index) => index ? c.lineTo(x!, y!) : c.moveTo(x!, y!));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  };

  // The room is built as a shallow perspective set: ceiling, side walls and a
  // recessed back wall all converge on the same central stage opening.
  const backLeft = w * 0.185;
  const backRight = w * 0.815;
  const backTop = h * 0.058;
  const backBottom = h * 0.37;
  const ceiling = c.createLinearGradient(0, 0, 0, backTop);
  ceiling.addColorStop(0, "#07090d");
  ceiling.addColorStop(1, "#20262a");
  polygon([[0, 0], [w, 0], [backRight, backTop], [backLeft, backTop]], ceiling);
  for (let i = 0; i < 9; i++) {
    const nearX = w * i / 8;
    const farX = backLeft + (backRight - backLeft) * i / 8;
    c.beginPath();
    c.moveTo(nearX, 0);
    c.lineTo(farX, backTop);
    c.strokeStyle = i % 2 ? "rgba(118,131,132,0.16)" : "rgba(0,0,0,0.38)";
    c.lineWidth = i % 2 ? 1 : 3;
    c.stroke();
  }

  const leftWall = c.createLinearGradient(0, 0, backLeft, 0);
  leftWall.addColorStop(0, "#07090d");
  leftWall.addColorStop(1, "#1b2225");
  polygon([[0, 0], [backLeft, backTop], [backLeft, backBottom], [0, h * 0.64]], leftWall);
  const rightWall = c.createLinearGradient(w, 0, backRight, 0);
  rightWall.addColorStop(0, "#07090d");
  rightWall.addColorStop(1, "#1b2225");
  polygon([[w, 0], [backRight, backTop], [backRight, backBottom], [w, h * 0.64]], rightWall);

  const wall = c.createLinearGradient(0, backTop, 0, backBottom);
  wall.addColorStop(0, "#283033");
  wall.addColorStop(0.52, "#141c21");
  wall.addColorStop(1, "#080d13");
  c.fillStyle = wall;
  c.fillRect(backLeft, backTop, backRight - backLeft, backBottom - backTop);

  // Individually shaded acoustic panels create a readable backline instead of
  // a single flat rectangle. The narrow brass reveals catch the stage wash.
  const panels = 13;
  const panelGap = w * 0.004;
  const panelW = (backRight - backLeft - panelGap * (panels + 1)) / panels;
  for (let i = 0; i < panels; i++) {
    const x = backLeft + panelGap + i * (panelW + panelGap);
    const panel = c.createLinearGradient(x, 0, x + panelW, 0);
    panel.addColorStop(0, i % 2 ? "#11191e" : "#1b2529");
    panel.addColorStop(0.42, i % 2 ? "#2a3335" : "#354043");
    panel.addColorStop(1, "#0b1218");
    c.fillStyle = panel;
    c.fillRect(x, backTop + h * 0.018, panelW, backBottom - backTop - h * 0.036);
    c.fillStyle = "rgba(188,157,105,0.2)";
    c.fillRect(x, backTop + h * 0.018, 1, backBottom - backTop - h * 0.036);
  }

  // Recessed frame and concentric architectural reveals.
  c.lineWidth = Math.max(1, w * 0.0012);
  c.strokeStyle = "#65736e";
  c.strokeRect(backLeft, backTop, backRight - backLeft, backBottom - backTop);
  c.strokeStyle = "rgba(197,160,103,0.68)";
  c.strokeRect(backLeft + w * 0.016, backTop + h * 0.015, backRight - backLeft - w * 0.032, backBottom - backTop - h * 0.03);
  c.strokeStyle = "rgba(225,210,173,0.12)";
  c.strokeRect(backLeft + w * 0.022, backTop + h * 0.022, backRight - backLeft - w * 0.044, backBottom - backTop - h * 0.044);

  // Practical sconces are baked into the scenery cache, including their glow.
  for (const x of [0.235, 0.29, 0.71, 0.765]) {
    const glow = c.createRadialGradient(w * x, h * 0.18, 1, w * x, h * 0.18, h * 0.13);
    glow.addColorStop(0, "rgba(244,194,119,0.34)");
    glow.addColorStop(0.35, "rgba(219,157,88,0.1)");
    glow.addColorStop(1, "rgba(235,184,110,0)");
    c.fillStyle = glow;
    c.fillRect(w * x - h * 0.13, h * 0.05, h * 0.26, h * 0.26);
    c.fillStyle = "#332a22";
    c.fillRect(w * x - 2, h * 0.108, 5, h * 0.12);
    const tube = c.createLinearGradient(w * x, 0, w * x + 3, 0);
    tube.addColorStop(0, "#8f6c42");
    tube.addColorStop(0.45, "#f0d09b");
    tube.addColorStop(1, "#80603d");
    c.fillStyle = tube;
    c.fillRect(w * x, h * 0.112, 2.5, h * 0.105);
  }

  // Wing stacks have cabinet depth, metal grilles, horns and dual cones.
  for (const side of [-1, 1]) {
    const x = w * (side < 0 ? 0.135 : 0.865);
    const sw = Math.min(58, w * 0.06);
    const depth = Math.max(3, sw * 0.12);
    for (let row = 0; row < 3; row++) {
      const y = h * (0.235 + row * 0.077);
      const sh = h * 0.069;
      const left = x - sw / 2;
      polygon(
        [[left, y], [left + depth * side, y - depth], [left + sw + depth * side, y - depth], [left + sw, y]],
        "#30383b",
        "#4f5b5c",
      );
      polygon(
        side < 0
          ? [[left, y], [left - depth, y - depth], [left - depth, y + sh - depth], [left, y + sh]]
          : [[left + sw, y], [left + sw + depth, y - depth], [left + sw + depth, y + sh - depth], [left + sw, y + sh]],
        "#080d12",
        "#354247",
      );
      const cabinet = c.createLinearGradient(left, y, left + sw, y + sh);
      cabinet.addColorStop(0, "#3b4548");
      cabinet.addColorStop(0.08, "#151d22");
      cabinet.addColorStop(0.6, "#090e14");
      cabinet.addColorStop(1, "#1b252a");
      c.fillStyle = cabinet;
      c.fillRect(left, y, sw, sh);
      c.strokeStyle = "#59676a";
      c.lineWidth = 1;
      c.strokeRect(left + 0.5, y + 0.5, sw - 1, sh - 1);
      c.strokeStyle = "rgba(138,154,153,0.12)";
      for (let gy = y + 4; gy < y + sh - 2; gy += 3) {
        c.beginPath();
        c.moveTo(left + 3, gy);
        c.lineTo(left + sw - 3, gy);
        c.stroke();
      }
      for (const coneY of [y + sh * 0.32, y + sh * 0.73]) {
        const radius = sw * 0.25;
        const cone = c.createRadialGradient(x - radius * 0.25, coneY - radius * 0.25, 1, x, coneY, radius);
        cone.addColorStop(0, "#25343b");
        cone.addColorStop(0.45, "#101a21");
        cone.addColorStop(0.78, "#05090e");
        cone.addColorStop(1, "#34434a");
        c.fillStyle = cone;
        c.beginPath();
        c.ellipse(x, coneY, radius, sh * 0.22, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#3e4c51";
        c.stroke();
        c.fillStyle = "#1d2a31";
        c.beginPath();
        c.ellipse(x, coneY, radius * 0.32, sh * 0.07, 0, 0, Math.PI * 2);
        c.fill();
      }
    }

    const monitorY = h * 0.635;
    polygon(
      [[x - sw, monitorY + h * 0.035], [x - sw * 0.72, monitorY - h * 0.015], [x + sw * 0.58, monitorY - h * 0.015], [x + sw, monitorY + h * 0.035]],
      "#131d24",
      "#536166",
    );
    polygon(
      [[x - sw * 0.72, monitorY - h * 0.015], [x + sw * 0.58, monitorY - h * 0.015], [x + sw * 0.42, monitorY + h * 0.004], [x - sw * 0.58, monitorY + h * 0.004]],
      "#263238",
      "#657476",
    );
  }

  // The raised backline and its illuminated lip give performers a solid floor.
  const stageTop = c.createLinearGradient(0, h * 0.345, 0, h * 0.4);
  stageTop.addColorStop(0, "#354043");
  stageTop.addColorStop(0.12, "#1b252a");
  stageTop.addColorStop(1, "#0b1117");
  polygon(
    [[backLeft, h * 0.345], [backRight, h * 0.345], [w * 0.87, h * 0.397], [w * 0.13, h * 0.397]],
    stageTop,
    "#5f6c6c",
  );
  c.fillStyle = "#0a1016";
  c.fillRect(w * 0.13, h * 0.397, w * 0.74, h * 0.018);
  c.fillStyle = "rgba(174,190,180,0.48)";
  c.fillRect(w * 0.13, h * 0.397, w * 0.74, 1);
  for (let i = 0; i < 17; i++) {
    const x = w * (0.16 + i * 0.0425);
    c.fillStyle = i % 2 ? "#9f8156" : "#d4b783";
    c.fillRect(x, h * 0.405, Math.max(2, w * 0.006), 2);
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
