import { splitmix32 } from '../prng';
import type { SymbolKind, TornoParams, View } from './params';

/**
 * SÍMBOLO — la síntesis total del guilloché: pocas líneas, trazo claro,
 * dirección. Arquetipos parametrizados y sembrados, componibles en DOS CAPAS
 * (A + B): cada capa con su arquetipo, posición, giro y escala; la capa B
 * puede pintar en tinta o en CONTRAFORMA (talla espacio negativo con el
 * color del papel — forma y contraforma).
 *
 * Misma semilla + mismos parámetros = mismo símbolo. `phase` ∈ [0,1) anima
 * en bucle sin costura.
 */

export interface SymbolStroke {
  d: string;
  width: number;
  /** Rebaje: se traza antes con el color del fondo (tejido/calado). */
  casing?: boolean;
  /** CONTRAFORMA: el trazo pinta con el color del papel (espacio negativo). */
  paper?: boolean;
}

interface LayerCfg {
  tipo: SymbolKind;
  lineas: number;
  grosor: number;  // 5–100
  curva: number;   // 0–100
  escala: number;  // % del lado menor
  giro: number;    // grados
  x: number;       // -50..50 (% del medio lienzo)
  y: number;
  paper: boolean;  // contraforma
  seed: number;
}

const TAU = Math.PI * 2;

function pathFrom(points: Array<[number, number]>): string {
  if (points.length < 2) return '';
  let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  return d;
}

function buildLayer(cfg: LayerCfg, view: View, phase: number): SymbolStroke[] {
  const minV = Math.min(view.w, view.h);
  const S = minV * (cfg.escala / 100);
  const cx = view.w / 2 + (cfg.x / 100) * (minV / 2);
  const cy = view.h / 2 + (cfg.y / 100) * (minV / 2);
  const giro = (cfg.giro * Math.PI) / 180;
  const cosG = Math.cos(giro), sinG = Math.sin(giro);
  const rnd = splitmix32(cfg.seed >>> 0);
  const n = Math.max(1, Math.round(cfg.lineas));
  const A = cfg.curva / 100;
  const G = cfg.grosor / 100;

  // coord local → lienzo (rotación GIRO + posición de la capa)
  const pt = (x: number, y: number): [number, number] => [
    cx + x * cosG - y * sinG,
    cy + x * sinG + y * cosG,
  ];

  const strokes: SymbolStroke[] = [];

  switch (cfg.tipo) {
    // ---------------- ONDA: la bandera de caudal ----------------
    case 'onda': {
      const blockW = S;
      const blockH = S * 0.55;
      const pitch = n > 1 ? blockH / (n - 1) : blockH;
      const lambda = blockW / (1.2 + rnd() * 0.9);
      const phi0 = rnd() * TAU;
      const width = Math.min(pitch * 0.74, pitch * G * 1.25);
      const amp = A * pitch * 0.95;
      const phiStep = (rnd() - 0.5) * 0.35;
      for (let i = 0; i < n; i++) {
        const y0 = n > 1 ? -blockH / 2 + i * pitch : 0;
        const phi = phi0 + i * phiStep;
        const pts: Array<[number, number]> = [];
        const steps = 64;
        for (let s = 0; s <= steps; s++) {
          const x = -blockW / 2 + (s / steps) * blockW;
          const y = y0 + amp * Math.sin((TAU * x) / lambda + phi + TAU * phase);
          pts.push(pt(x, y));
        }
        strokes.push({ d: pathFrom(pts), width });
      }
      break;
    }

    // ---------------- ABANICO: creciente de arcos ----------------
    case 'abanico': {
      const r0 = S * 0.16;
      const rStep = n > 1 ? (S * 0.5 - r0) / (n - 1) : 0;
      const sweep = ((120 + A * 140) * Math.PI) / 180;
      const rotStep = ((6 + rnd() * 12) * Math.PI) / 180;
      const base = rnd() * TAU;
      const width = Math.min(Math.max(rStep * 0.9, 2), Math.max(rStep, 3) * G * 1.4);
      const sway = Math.sin(TAU * phase) * 0.06;
      for (let i = 0; i < n; i++) {
        const r = r0 + i * rStep;
        const a0 = base + i * rotStep + sway * (i / n);
        const sw = sweep * (1 - i * 0.045);
        const pts: Array<[number, number]> = [];
        const steps = 56;
        for (let s = 0; s <= steps; s++) {
          const a = a0 + (s / steps) * sw;
          pts.push(pt(Math.cos(a) * r, Math.sin(a) * r));
        }
        strokes.push({ d: pathFrom(pts), width });
      }
      break;
    }

    // ---------------- ALA: haz radial — de abanico a asterisco ----------------
    case 'ala': {
      // CURVA abre el haz: 50° (ala) hasta 360° (asterisco radial completo);
      // el foco migra al centro al abrirse.
      const spreadDeg = 50 + A * 310;
      const tOpen = (spreadDeg - 50) / 310;
      const oy = S * 0.42 * (1 - tOpen);
      const spread = ((spreadDeg * Math.PI) / 180) * (1 + Math.sin(TAU * phase) * 0.05);
      const width = Math.max(S * 0.006, S * 0.028 * G);
      const full = spreadDeg >= 355;
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (full ? n : n - 1) : 0.5;
        const ang = -Math.PI / 2 + (t - 0.5) * spread;
        const len = S * (0.86 - 0.38 * tOpen) * (0.84 + rnd() * 0.22);
        const bendMag = A * S * 0.13 * Math.abs(t - 0.5) * 2;
        const bendSign = t < 0.5 ? -1 : 1;
        const dirX = Math.cos(ang), dirY = Math.sin(ang);
        const perX = -dirY * bendSign, perY = dirX * bendSign;
        const pts: Array<[number, number]> = [];
        const steps = 40;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const bow = Math.sin(u * Math.PI) * bendMag;
          pts.push(pt(dirX * u * len + perX * bow, oy + dirY * u * len + perY * bow));
        }
        strokes.push({ d: pathFrom(pts), width });
      }
      break;
    }

    // ---------------- ARCOS: puerta / fuente anidada ----------------
    case 'arcos': {
      const oy = S * 0.26;
      const r0 = S * 0.14;
      const rStep = n > 1 ? (S * 0.52 - r0) / (n - 1) : 0;
      const sweep = ((110 + A * 80) * Math.PI) / 180;
      const width = Math.min(Math.max(rStep * 0.88, 2), Math.max(rStep, 3) * G * 1.35);
      const sway = Math.sin(TAU * phase) * 0.03;
      for (let i = 0; i < n; i++) {
        const r = r0 + i * rStep;
        const off = (rnd() - 0.5) * 0.10 + sway * (i / n);
        const a0 = -Math.PI / 2 - sweep / 2 + off;
        const pts: Array<[number, number]> = [];
        const steps = 48;
        for (let s = 0; s <= steps; s++) {
          const a = a0 + (s / steps) * sweep;
          pts.push(pt(Math.cos(a) * r, oy + Math.sin(a) * r));
        }
        strokes.push({ d: pathFrom(pts), width });
      }
      break;
    }

    // ---------------- ARO: anillos / C — apertura ajustable ----------------
    case 'aro': {
      const rMax = S * 0.48;
      const r0 = S * 0.14;
      const pitch = n > 1 ? (rMax - r0) / (n - 1) : 0;
      // CURVA abre la boca de la C: 0 = anillo completo, 100 ≈ 150° de apertura
      const gap = A * 0.85 * Math.PI;
      const width = n > 1
        ? Math.min(pitch * 0.6, Math.max(pitch, 3) * G * 1.1)
        : Math.max(S * 0.015, S * 0.1 * G);
      const sway = Math.sin(TAU * phase) * 0.04;
      for (let i = 0; i < n; i++) {
        const r = n > 1 ? rMax - i * pitch : rMax * 0.92;
        const jit = (rnd() - 0.5) * 0.06;
        const a0 = gap / 2 + jit + sway * (i / Math.max(1, n));
        const a1 = TAU - gap / 2 + jit;
        const pts: Array<[number, number]> = [];
        const steps = 72;
        for (let s = 0; s <= steps; s++) {
          const a = a0 + (s / steps) * (a1 - a0);
          pts.push(pt(Math.cos(a) * r, Math.sin(a) * r));
        }
        const d = pathFrom(pts) + (gap < 0.01 ? 'Z' : '');
        strokes.push({ d, width });
      }
      break;
    }

    // ---------------- ÓRBITA: elipses que giran — esfera de líneas ----------------
    case 'orbita': {
      const a = S * 0.48;
      const b = a * (0.22 + A * 0.4);
      const base = rnd() * Math.PI;
      const width = Math.max(S * 0.006, S * 0.024 * G);
      const step = Math.PI / n;
      for (let i = 0; i < n; i++) {
        const phi = base + i * step + phase * step;
        const cosP = Math.cos(phi), sinP = Math.sin(phi);
        const pts: Array<[number, number]> = [];
        const steps = 84;
        for (let j = 0; j <= steps; j++) {
          const t = (j / steps) * TAU;
          const ex = a * Math.cos(t), ey = b * Math.sin(t);
          pts.push(pt(ex * cosP - ey * sinP, ex * sinP + ey * cosP));
        }
        strokes.push({ d: pathFrom(pts) + 'Z', width });
      }
      break;
    }

    // ---------------- CONCHA: elipses ancladas que crecen e inclinan ----------------
    case 'concha': {
      const ax = -S * 0.05, ay = S * 0.36;
      const maxTilt = ((20 + A * 45) * Math.PI) / 180;
      const width = Math.max(S * 0.006, S * 0.022 * G);
      const sway = Math.sin(TAU * phase) * 0.05;
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 1;
        const a = S * (0.2 + 0.36 * t);
        const b = a * (0.5 + rnd() * 0.06);
        const phi = t * maxTilt + sway * t;
        const cosP = Math.cos(phi), sinP = Math.sin(phi);
        const cx0 = ax + sinP * b;
        const cy0 = ay - cosP * b;
        const pts: Array<[number, number]> = [];
        const steps = 80;
        for (let j = 0; j <= steps; j++) {
          const tt = (j / steps) * TAU;
          const ex = a * Math.cos(tt), ey = b * Math.sin(tt);
          pts.push(pt(cx0 + ex * cosP - ey * sinP, cy0 + ex * sinP + ey * cosP));
        }
        strokes.push({ d: pathFrom(pts) + 'Z', width });
      }
      strokes.push({ d: pathFrom([pt(ax - S * 0.3, ay), pt(ax + S * 0.52, ay)]), width: Math.max(S * 0.006, S * 0.022 * G) });
      break;
    }

    // ---------------- CODO: franjas que doblan de vertical a horizontal ----------------
    case 'codo': {
      const px0 = -S * 0.11, py0 = S * 0.12;
      const r0 = S * 0.09;
      const rMax = S * 0.44;
      const pitch = n > 1 ? (rMax - r0) / (n - 1) : rMax - r0;
      const width = Math.min(pitch * 0.9, Math.max(pitch, 3) * G * 1.3);
      const xR = S * 0.55;
      const legDown = S * (0.06 + A * 0.2);
      const sway = Math.sin(TAU * phase) * 0.02;
      for (let i = 0; i < n; i++) {
        const r = r0 + i * pitch;
        const pts: Array<[number, number]> = [];
        pts.push(pt(px0 - r, py0 + legDown));
        const steps = 28;
        for (let j = 0; j <= steps; j++) {
          const th = Math.PI + (j / steps) * (Math.PI / 2) + sway;
          pts.push(pt(px0 + r * Math.cos(th), py0 + r * Math.sin(th)));
        }
        pts.push(pt(xR, py0 - r));
        strokes.push({ d: pathFrom(pts), width });
      }
      break;
    }

    // ---------------- CRUCE: dos caudales tejidos ----------------
    case 'cruce':
    default: {
      const block = S * 0.74;
      const nH = Math.ceil(n / 2);
      const nV = Math.max(1, Math.floor(n / 2));
      const pitchH = nH > 1 ? block / (nH - 1) : block;
      const pitchV = nV > 1 ? block / (nV - 1) : block;
      const pitchMin = Math.min(pitchH, pitchV);
      const width = Math.min(pitchMin * 0.42, pitchMin * G * 0.72);
      const lambda = block / (1.1 + rnd() * 0.5);
      const phi0 = rnd() * TAU;
      const amp = A * pitchMin * 0.3;

      const mkLine = (idx: number, count: number, pitch: number, vertical: boolean): SymbolStroke => {
        const c0 = count > 1 ? -block / 2 + idx * pitch : 0;
        const phi = phi0 + idx * 0.15;
        const pts: Array<[number, number]> = [];
        const steps = 56;
        for (let s = 0; s <= steps; s++) {
          const u = -block / 2 + (s / steps) * block;
          const w = amp * Math.sin((TAU * u) / lambda + phi + TAU * phase);
          pts.push(vertical ? pt(c0 + w, u) : pt(u, c0 + w));
        }
        return { d: pathFrom(pts), width, casing: true };
      };

      for (let i = 0; i < nH; i++) strokes.push({ ...mkLine(i, nH, pitchH, false), casing: false });
      for (let i = 0; i < nV; i++) strokes.push(mkLine(i, nV, pitchV, true));
      break;
    }
  }

  if (cfg.paper) {
    for (const st of strokes) {
      st.paper = true;
      st.casing = false;
    }
  }
  return strokes;
}

export function buildSymbol(p: TornoParams, view: View, phase = 0): SymbolStroke[] {
  const capaA: LayerCfg = {
    tipo: p.symTipo, lineas: p.symLineas, grosor: p.symGrosor, curva: p.symCurva,
    escala: p.symEscala, giro: p.symGiro, x: p.symX, y: p.symY,
    paper: false, seed: p.semilla,
  };
  const strokes = buildLayer(capaA, view, phase);
  if (p.symB) {
    const capaB: LayerCfg = {
      tipo: p.symBTipo, lineas: p.symBLineas, grosor: p.symBGrosor, curva: p.symBCurva,
      escala: p.symBEscala, giro: p.symBGiro, x: p.symBX, y: p.symBY,
      paper: p.symBModo === 'contraforma', seed: (p.semilla ^ 0x51ed2705) >>> 0,
    };
    strokes.push(...buildLayer(capaB, view, phase));
  }
  return strokes;
}

/** Fotograma del símbolo en canvas (export de vídeo/GIF). */
export function drawSymbolFrame(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  p: TornoParams,
  view: View,
  phase: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.colorFondo;
  ctx.fillRect(0, 0, outW, outH);
  ctx.save();
  ctx.scale(outW / view.w, outH / view.h);
  ctx.lineJoin = 'round';
  ctx.lineCap = p.symRemate === 'recto' ? 'butt' : 'round';
  const strokes = buildSymbol(p, view, phase);
  for (const st of strokes) {
    const path = new Path2D(st.d);
    if (st.casing && !st.paper) {
      ctx.strokeStyle = p.colorFondo;
      ctx.lineWidth = st.width * 1.6;
      ctx.stroke(path);
    }
    ctx.strokeStyle = st.paper ? p.colorFondo : p.colorTinta;
    ctx.lineWidth = st.width;
    ctx.stroke(path);
  }
  ctx.restore();
}
