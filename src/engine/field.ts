import { SimplexNoise } from './noise';
import type { TornoParams, View } from './params';

export interface Line {
  points: Array<[number, number]>;
  /** ORILLAS: factor de presencia por punto (0 = desaparece, 1 = pleno). */
  fade?: number[];
}

/** Niveles de grosor del fundido de orillas (0 = la línea desaparece). */
export const FADE_WIDTHS = [0, 0.3, 0.55, 0.78, 1] as const;

export function fadeLevel(e: number): number {
  if (e < 0.08) return 0;
  if (e >= 0.85) return 4;
  return 1 + Math.floor(((e - 0.08) / (0.85 - 0.08)) * 3);
}

/**
 * Trocea una línea en tramos de nivel de grosor constante (para render con
 * strokes). Los tramos comparten el punto frontera — sin huecos.
 */
export function segmentLine(l: Line): Array<{ lvl: number; pts: Array<[number, number]> }> {
  if (!l.fade || !l.fade.length) return [{ lvl: FADE_WIDTHS.length - 1, pts: l.points }];
  const out: Array<{ lvl: number; pts: Array<[number, number]> }> = [];
  let cur: Array<[number, number]> = [l.points[0]];
  let curLvl = fadeLevel(l.fade[0]);
  for (let i = 1; i < l.points.length; i++) {
    const lvl = fadeLevel(l.fade[i]);
    cur.push(l.points[i]);
    if (lvl !== curLvl) {
      if (curLvl > 0 && cur.length > 1) out.push({ lvl: curLvl, pts: cur });
      cur = [l.points[i]];
      curLvl = lvl;
    }
  }
  if (curLvl > 0 && cur.length > 1) out.push({ lvl: curLvl, pts: cur });
  return out;
}

/** smoothstep clásico. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * El motor de flujo compartido por PATRÓN y FORMA.
 * Devuelve familias de líneas paralelas deformadas por:
 *  - warp de densidad (CAUCE): compresión dentro del canal, apertura fuera. FIRMA.
 *  - deflexión de canal (CAUCE): la banda entera mea­ndrea como un cauce.
 *  - campo de flujo simplex (MAREA amplitud, CORRIENTE frecuencia/turbulencia).
 *  - zona de calma en bordes (ORILLAS).
 * Trabaja en las dimensiones lógicas del lienzo elegido (`view`).
 */
export class FlowEngine {
  private flow: SimplexNoise;
  private channel: SimplexNoise;

  constructor(seed: number) {
    this.flow = new SimplexNoise(seed);
    this.channel = new SimplexNoise((seed ^ 0x5f3759df) >>> 0);
  }

  /** Genera una familia de líneas rotada `rotDeg` grados extra (para moiré). */
  private family(p: TornoParams, rotDeg: number, time: number, W: number, H: number): Line[] {
    const lines: Line[] = [];
    const n = Math.max(2, Math.round(p.caudal));

    const CX = W / 2;
    const CY = H / 2;
    // Radio que cubre la diagonal para que la trama llene el lienzo tras rotar CURSO.
    const R = 0.5 * Math.hypot(W, H) * 1.06;

    const angle = ((p.curso + rotDeg) * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -Math.sin(angle); // eje perpendicular (v)
    const ny = Math.cos(angle);

    // Warp de densidad: k>1 empaqueta el centro y abre los bordes.
    const k = 1 + (p.cauce / 100) * 2.3;
    // Deflexión del canal.
    const chAmp = (p.cauce / 100) * R * 0.34;
    const chFreq = 0.0016;
    // Campo de flujo.
    const fieldAmp = (p.marea / 100) * R * 0.14;
    const ff = 0.0011 + (p.corriente / 100) * 0.0042;
    const octaves = p.corriente > 55 ? 3 : 2;
    // TORSIÓN: onda coherente cuya fase avanza línea a línea — cizalla
    // diagonal que lee como tela retorcida en 3D (compresión/apertura suave).
    const torAmp = (p.torsion / 100) * R * 0.12;
    const torK = (2 * Math.PI) / (R * 0.85);
    const torStep = (p.torsion / 100) * 0.42; // radianes por línea
    const torPhase = 2 * Math.PI * time;

    // Zona de calma.
    const band = (p.orillas / 100) * Math.min(W, H);

    // Paso de muestreo: más fino con más marea/corriente.
    const du = Math.max(3.5, 7 - (p.corriente / 100) * 3);

    // Animación: con LOOP PERFECTO la fase 0..1 traza un círculo en el espacio
    // de ruido → el fotograma final coincide con el inicial. Sin loop, la
    // corriente deriva libre (avance lineal, nunca vuelve al inicio).
    const driftR = 0.34;
    let tx: number, ty: number;
    if (p.motionLoop) {
      tx = Math.cos(2 * Math.PI * time) * driftR;
      ty = Math.sin(2 * Math.PI * time) * driftR;
    } else {
      tx = time * driftR * 2 * Math.PI;
      ty = time * driftR * 2;
    }

    for (let i = 0; i < n; i++) {
      const s = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // [-1, 1]
      const vBase = Math.sign(s) * Math.pow(Math.abs(s), k) * R;
      let pts: Array<[number, number]> = [];
      let fd: number[] = [];

      const push = (): void => {
        if (pts.length > 1) lines.push({ points: pts, fade: band > 0.001 ? fd : undefined });
        pts = [];
        fd = [];
      };

      for (let u = -R; u <= R; u += du) {
        const deflect = this.channel.noise2D(u * chFreq, 7.3) * chAmp;
        const v0 = vBase + deflect;

        const bx = CX + u * dx + v0 * nx;
        const by = CY + u * dy + v0 * ny;

        // Zona de calma (ORILLAS) en espacio de lienzo: amansa el campo…
        let taper = 1;
        if (band > 0.001) {
          const de = Math.min(bx, W - bx, by, H - by);
          taper = smoothstep(0, band, de);
        }

        const flowMag =
          fieldAmp *
          this.flow.fbm(u * ff + 11.1 + tx, v0 * ff * 0.6 + ty, octaves) *
          taper;
        const tor = torAmp > 0.001
          ? torAmp * Math.sin(u * torK + i * torStep + torPhase) * taper
          : 0;
        const v = v0 + flowMag + tor;

        const x = CX + u * dx + v * nx;
        const y = CY + u * dy + v * ny;

        // Recorte holgado: el viewBox/clip del SVG afina el borde.
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) {
          push();
          continue;
        }
        pts.push([x, y]);
        // …y funde el grosor: la línea adelgaza y desaparece en el borde.
        if (band > 0.001) {
          const de = Math.min(x, W - x, y, H - y);
          fd.push(smoothstep(0, band, de));
        }
      }
      push();
    }
    return lines;
  }

  /** Trama principal + (opcional) 2ª trama rotada DERIVA grados. */
  generate(p: TornoParams, time: number, view: View): { main: Line[]; moire: Line[] } {
    const main = this.family(p, 0, time, view.w, view.h);
    const moire = p.deriva > 0.01 ? this.family(p, p.deriva, time, view.w, view.h) : [];
    return { main, moire };
  }
}

/** Convierte una polilínea en un atributo `d` de SVG (con 2 decimales). */
export function lineToPath(line: Line): string {
  const p = line.points;
  if (p.length < 2) return '';
  let d = `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  for (let i = 1; i < p.length; i++) {
    d += `L${p[i][0].toFixed(2)} ${p[i][1].toFixed(2)}`;
  }
  return d;
}
