import { splitmix32 } from '../prng';
import type { TornoParams, View } from './params';

/**
 * SÍMBOLO — la síntesis total del guilloché: pocas líneas, trazo grueso,
 * dirección clara. Cinco arquetipos parametrizados y sembrados, en la
 * tradición de la marca de línea (Cruz Novillo, Rand, Wyman, Bass):
 *
 *  - ONDA     marca de bandera: líneas paralelas onduladas en bloque compacto
 *  - ABANICO  arcos concéntricos que giran y se acortan (creciente/swoosh)
 *  - ALA      haz radial de líneas finas que se abren desde un foco
 *  - ARCOS    arcos anidados (puerta, árbol, fuente)
 *  - CRUCE    dos familias onduladas tejidas con calado de papel
 *
 * Misma semilla + mismos parámetros = mismo símbolo. `phase` ∈ [0,1) anima
 * en bucle sin costura (la onda viaja; los demás respiran).
 */

export interface SymbolStroke {
  d: string;
  width: number;
  /** Rebaje: se traza antes con el color del fondo (tejido/calado). */
  casing?: boolean;
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

export function buildSymbol(p: TornoParams, view: View, phase = 0): SymbolStroke[] {
  const S = Math.min(view.w, view.h) * (p.symEscala / 100);
  const cx = view.w / 2;
  const cy = view.h / 2;
  const giro = (p.symGiro * Math.PI) / 180;
  const cosG = Math.cos(giro), sinG = Math.sin(giro);
  const rnd = splitmix32(p.semilla);
  const n = Math.max(2, Math.round(p.symLineas));
  const A = p.symCurva / 100;
  const G = p.symGrosor / 100;

  // coord local → lienzo (rotación GIRO + centrado)
  const pt = (x: number, y: number): [number, number] => [
    cx + x * cosG - y * sinG,
    cy + x * sinG + y * cosG,
  ];

  const strokes: SymbolStroke[] = [];

  switch (p.symTipo) {
    // ---------------- ONDA: la bandera de caudal ----------------
    case 'onda': {
      const blockW = S;
      const blockH = S * 0.55;
      const pitch = n > 1 ? blockH / (n - 1) : blockH;
      const lambda = blockW / (1.2 + rnd() * 0.9);
      const phi0 = rnd() * TAU;
      // canal blanco garantizado: ondas paralelas EN FASE (como la bandera)
      const width = Math.min(pitch * 0.74, pitch * G * 1.25);
      const amp = A * pitch * 0.95;
      // un leve corrimiento de fase por línea (sembrado) da vida sin fundirlas
      const phiStep = (rnd() - 0.5) * 0.35;
      for (let i = 0; i < n; i++) {
        const y0 = -blockH / 2 + i * pitch;
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

    // ---------------- ALA: haz radial desde un foco ----------------
    case 'ala': {
      const oy = S * 0.42;
      const spreadDeg = 50 + A * 100;
      const spread = ((spreadDeg * Math.PI) / 180) * (1 + Math.sin(TAU * phase) * 0.05);
      const width = Math.max(S * 0.006, S * 0.028 * G);
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const ang = -Math.PI / 2 + (t - 0.5) * spread;
        const len = S * 0.86 * (0.84 + rnd() * 0.22);
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

    // ---------------- CRUCE: dos caudales tejidos ----------------
    case 'cruce':
    default: {
      const block = S * 0.74;
      const nH = Math.ceil(n / 2);
      const nV = Math.max(1, Math.floor(n / 2));
      const pitchH = nH > 1 ? block / (nH - 1) : block;
      const pitchV = nV > 1 ? block / (nV - 1) : block;
      const pitchMin = Math.min(pitchH, pitchV);
      // trazo contenido: el tejido necesita aire entre cruces
      const width = Math.min(pitchMin * 0.42, pitchMin * G * 0.72);
      const lambda = block / (1.1 + rnd() * 0.5);
      const phi0 = rnd() * TAU;
      // ondas EN FASE y amplitud uniforme: el cruce se lee, no se enreda
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

      // horizontales debajo, verticales tejen por encima con rebaje de papel
      for (let i = 0; i < nH; i++) strokes.push({ ...mkLine(i, nH, pitchH, false), casing: false });
      for (let i = 0; i < nV; i++) strokes.push(mkLine(i, nV, pitchV, true));
      break;
    }
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
    if (st.casing) {
      ctx.strokeStyle = p.colorFondo;
      ctx.lineWidth = st.width * 1.6;
      ctx.stroke(path);
    }
    ctx.strokeStyle = p.colorTinta;
    ctx.lineWidth = st.width;
    ctx.stroke(path);
  }
  ctx.restore();
}
