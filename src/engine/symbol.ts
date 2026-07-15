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
  /** Atenuación por profundidad (ESPIRA 3D): 0–1, por defecto 1. */
  opacity?: number;
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
  trenza: number;  // 0–100, los caminos se cruzan y tejen ojos (DELTA)
  punta: number;   // 0–100, unión del óvalo: redondeada ↔ vértice (ESPIRA)
  fade: number;    // 0–100, atenuación por profundidad (0 = una sola tinta)
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
  // GROSOR global: la misma pluma en todos los arquetipos (relativa al
  // lienzo, no a la capa) → las combinaciones de capas casan en peso.
  const wGlobal = minV * (0.006 + G * 0.042);

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
      const width = Math.min(pitch * 0.8, wGlobal);
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
      const width = n > 1 ? Math.min(rStep * 0.85, wGlobal) : wGlobal;
      for (let i = 0; i < n; i++) {
        const r = r0 + i * rStep;
        // la corriente recorre el abanico: cada arco oscila desfasado
        const a0 = base + i * rotStep + Math.sin(TAU * phase + i * 0.9) * 0.1;
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
      const width = wGlobal;
      const full = spreadDeg >= 355;
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (full ? n : n - 1) : 0.5;
        const ang = -Math.PI / 2 + (t - 0.5) * spread;
        const len = S * (0.86 - 0.38 * tOpen) * (0.84 + rnd() * 0.22);
        const bendMag = A * S * 0.13 * Math.abs(t - 0.5) * 2
          * (1 + 0.25 * Math.sin(TAU * phase + t * TAU)); // la comba viaja por el haz
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
      const width = n > 1 ? Math.min(rStep * 0.85, wGlobal) : wGlobal;
      for (let i = 0; i < n; i++) {
        // los arcos respiran en cascada, como olas que llegan
        const r = (r0 + i * rStep) * (1 + 0.035 * Math.sin(TAU * phase + i * 1.1));
        const off = (rnd() - 0.5) * 0.10 + Math.sin(TAU * phase + i * 0.7) * 0.05;
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
      const width = n > 1 ? Math.min(pitch * 0.6, wGlobal) : wGlobal;
      // la boca de la C orbita el anillo: vuelta completa por ciclo (sin costura)
      const orbita = TAU * phase;
      for (let i = 0; i < n; i++) {
        const r = n > 1 ? rMax - i * pitch : rMax * 0.92;
        const jit = (rnd() - 0.5) * 0.06;
        const a0 = gap / 2 + jit + orbita * (i % 2 === 0 ? 1 : -1);
        const a1 = TAU - gap / 2 + jit + orbita * (i % 2 === 0 ? 1 : -1);
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
      const width = wGlobal;
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
      const width = wGlobal;
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 1;
        const a = S * (0.2 + 0.36 * t);
        const b = a * (0.5 + rnd() * 0.06);
        // la marea recorre la concha: cada vuelta cabecea desfasada
        const phi = t * maxTilt + Math.sin(TAU * phase + t * 2.4) * 0.09 * t;
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
      strokes.push({ d: pathFrom([pt(ax - S * 0.3, ay), pt(ax + S * 0.52, ay)]), width });
      break;
    }

    // ---------------- CODO: franjas que doblan de vertical a horizontal ----------------
    case 'codo': {
      const px0 = -S * 0.11, py0 = S * 0.12;
      const r0 = S * 0.09;
      const rMax = S * 0.44;
      const pitch = n > 1 ? (rMax - r0) / (n - 1) : rMax - r0;
      const width = Math.min(pitch * 0.85, wGlobal);
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

    // ---------------- DELTA: de un tronco salen caminos que se trenzan ----------------
    // La forma base: tronco horizontal → los caminos se abren en sigmoide
    // (tangente horizontal al salir y al llegar) hasta carriles alineados a la
    // derecha. TRENZA es la variable nueva: los caminos ondulan en contrafase
    // sobre geometría circular — a poco no se tocan; al subir se cruzan y
    // tejen OJOS/HOJAS entre cruce y cruce (el río con afluentes visto desde
    // el aire, raíces superponiéndose). El rebaje de papel teje el sobre-bajo.
    case 'delta': {
      const spreadY = S * (0.5 + A * 0.34);           // CURVA abre el abanico
      const pitchLane = n > 1 ? spreadY / (n - 1) : 0;
      const width = Math.min(wGlobal, n > 1 ? pitchLane * 0.8 : wGlobal);
      const x0 = -S * 0.34;                            // fin del tronco
      const x1 = x0 + S * 0.3;                         // los carriles se alcanzan aquí
      const xEnd = S * 0.54;
      const T = cfg.trenza / 100;
      // una sola comba armónica por camino (media onda, sin zigzag): los
      // vecinos comban en contrafase → se separan y reconvergen dibujando
      // una HOJA/LENTE entre ellos (el boceto)
      const bowAmp = T * pitchLane * 1.5;
      const xB0 = x0 + S * 0.06;                       // zona de la comba
      const xB1 = xEnd - S * 0.05;

      // tronco
      strokes.push({ d: pathFrom([pt(-S * 0.55, 0), pt(x0 + width * 0.5, 0)]), width });

      // orden intercalado (centro, +1, -1, +2, -2…) → el tejido alterna
      const lanes: number[] = [];
      for (let i = 0; i < n; i++) lanes.push(i - (n - 1) / 2);
      lanes.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);

      const smooth01 = (v: number): number => {
        const c = Math.min(1, Math.max(0, v));
        return c * c * (3 - 2 * c);
      };

      const breathe = 1 + Math.sin(TAU * phase) * 0.12;
      for (let k = 0; k < lanes.length; k++) {
        const t = lanes[k];
        const yLane = t * pitchLane * (1 + (rnd() - 0.5) * 0.05);
        // contrafase por CARRIL ESPACIAL: vecinos comban opuestos
        const li = Math.round(t + (n - 1) / 2);
        const sign = li % 2 === 0 ? 1 : -1;
        const mag = bowAmp * (0.85 + rnd() * 0.3) * breathe;
        const xStart = x0 - Math.abs(t) * S * 0.045; // los exteriores nacen antes
        const pts: Array<[number, number]> = [];
        const steps = 72;
        for (let s = 0; s <= steps; s++) {
          const x = xStart + (s / steps) * (xEnd - xStart);
          // abanico sigmoide: sale y llega en horizontal
          const pF = smooth01((x - xStart) / (x1 - xStart));
          let y = yLane * pF;
          if (bowAmp > 0.01) {
            const vB = smooth01((x - xB0) / (xB1 - xB0));
            y += sign * mag * Math.sin(Math.PI * vB);
          }
          pts.push(pt(x, y));
        }
        // sin rebaje: los cruces son uniones sólidas, como ramas de árbol
        strokes.push({ d: pathFrom(pts), width });
      }
      break;
    }

    // ---------------- ESPIRA: óvalos unidos por sus extremos ----------------
    // Todas las vueltas comparten el punto de unión (el extremo derecho) y
    // cada una va rotada un paso alrededor de él — el ovillo. PUNTA decide la
    // unión: 0 = redondeada (elipse, cuerda enrollada); 100 = vértice
    // (lágrima con cúspide: ojo, gota, pétalo).
    case 'espira': {
      // MÖBIUS FLOW — superficie de Möbius paramétrica real, portada de
      // Cauce System 05. Corrientes a lo ancho de una banda no orientable:
      // la corriente central cierra en 1 revolución; las laterales necesitan
      // DOS (la no-orientabilidad: recorren ambas caras antes de cerrar).
      // Proyección 3D (inclinación + guiñada con precesión + perspectiva) y
      // profundidad por bins con atenuación. El bucle avanza MEDIA torsión
      // por ciclo: la banda sin orientación cae sobre sí misma — sin costura.
      const width = wGlobal;
      const halfTwists = 1 + 2 * Math.round((cfg.trenza / 100) * 2); // TRENZA → 1,3,5
      const cycle = TAU * (((phase % 1) + 1) % 1);
      const stripW = (0.16 + A * 0.56) * (1 + 0.07 * Math.sin(cycle)); // CURVA → anchura (respira)
      const mPhase = cycle * 0.5;                       // media torsión por ciclo
      const tilt = ((20 + (cfg.punta / 100) * 65) * Math.PI) / 180; // PUNTA → inclinación 3D
      const yawDeg = -16 + (rnd() - 0.5) * 28 + 4 * Math.sin(cycle); // precesión
      const yaw = (yawDeg * Math.PI) / 180;
      const persp = 0.48;
      const scale = S * 0.48;
      const depthRange = 1 + stripW;

      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const project = (x: number, y: number, z: number): [number, number, number] => {
        const ty = y * ct - z * st;
        const tz = y * st + z * ct;
        const tx = x * cyw + tz * syw;
        const tz2 = -x * syw + tz * cyw;
        const ps = 1 / (1 - (persp * tz2) / (2.4 * depthRange));
        return [tx * ps * scale, ty * ps * scale, tz2];
      };
      const sample = (u: number, v: number): [number, number, number] => {
        const cs = halfTwists * u * 0.5 + mPhase;
        const dist = 1 + v * Math.cos(cs);
        return project(dist * Math.cos(u), dist * Math.sin(u), v * Math.sin(cs));
      };

      const depthFade = cfg.fade / 100; // PROFUNDIDAD: 0 = una sola tinta plana
      const BINS = depthFade < 0.01 ? 1 : 10;
      const bins: string[] = Array(BINS).fill('');
      // tramos agrupados por RACHAS de bin: un remate sólo al cambiar de
      // profundidad — sin puntos oscuros por solape de alfas
      const addCurrent = (v: number, revs: number, samples: number): void => {
        let prev = sample(0, v);
        let run = '';
        let runBin = -1;
        const flushRun = (): void => {
          if (run && runBin >= 0) bins[runBin] += run;
          run = '';
        };
        for (let j = 1; j <= samples; j++) {
          const u = (TAU * revs * j) / samples;
          const cur = sample(u, v);
          const depth = (prev[2] + cur[2]) * 0.5;
          const nd = Math.min(0.999, Math.max(0, 0.5 + depth / (2 * depthRange)));
          const b = BINS === 1 ? 0 : Math.floor(nd * BINS);
          const p1 = pt(prev[0], prev[1]);
          const p2 = pt(cur[0], cur[1]);
          if (b !== runBin) {
            flushRun();
            runBin = b;
            run = `M${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
          }
          run += `L${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
          prev = cur;
        }
        flushRun();
      };

      // LÍNEAS = corrientes reales, 1:1. Cada corriente es UNA línea cerrada
      // que, por la topología de Möbius, envuelve la banda DOS veces (dos
      // óvalos por línea — el mínimo irreducible). Ninguna va en el eje
      // exacto (v = 0 sería un círculo inmóvil): todas fluyen con la torsión.
      for (let i = 0; i < n; i++) {
        const v = (stripW * (i + 0.5)) / n;
        addCurrent(v, 2, 288);
      }

      for (let b = 0; b < BINS; b++) {
        if (!bins[b]) continue;
        const op = BINS === 1 ? 1 : 1 - depthFade * (1 - b / (BINS - 1)) * 0.82;
        strokes.push({ d: bins[b], width, opacity: op });
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
      const width = Math.min(pitchMin * 0.45, wGlobal);
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
    trenza: p.symTrenza, punta: p.symPunta, fade: p.symFade, paper: false, seed: p.semilla,
  };
  const strokes = buildLayer(capaA, view, phase);
  if (p.symB) {
    const capaB: LayerCfg = {
      tipo: p.symBTipo, lineas: p.symBLineas, grosor: p.symBGrosor, curva: p.symBCurva,
      escala: p.symBEscala, giro: p.symBGiro, x: p.symBX, y: p.symBY,
      trenza: p.symBTrenza, punta: p.symBPunta, fade: p.symBFade, paper: p.symBModo === 'contraforma', seed: (p.semilla ^ 0x51ed2705) >>> 0,
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
    ctx.globalAlpha = st.paper ? 1 : (st.opacity ?? 1); // profundidad 3D
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
