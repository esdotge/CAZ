import { SimplexNoise } from './noise';
import type { TornoParams, View } from './params';

export interface Line {
  points: Array<[number, number]>;
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
      const pts: Array<[number, number]> = [];

      for (let u = -R; u <= R; u += du) {
        const deflect = this.channel.noise2D(u * chFreq, 7.3) * chAmp;
        const v0 = vBase + deflect;

        const bx = CX + u * dx + v0 * nx;
        const by = CY + u * dy + v0 * ny;

        // Taper de bordes (ORILLAS) en espacio de lienzo.
        let taper = 1;
        if (band > 0.001) {
          const de = Math.min(bx, W - bx, by, H - by);
          taper = smoothstep(0, band, de);
        }

        const flowMag =
          fieldAmp *
          this.flow.fbm(u * ff + 11.1 + tx, v0 * ff * 0.6 + ty, octaves) *
          taper;
        const v = v0 + flowMag;

        const x = CX + u * dx + v * nx;
        const y = CY + u * dy + v * ny;

        // Recorte holgado: el viewBox/clip del SVG afina el borde.
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) {
          if (pts.length > 1) { lines.push({ points: pts.slice() }); }
          pts.length = 0;
          continue;
        }
        pts.push([x, y]);
      }
      if (pts.length > 1) lines.push({ points: pts });
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
