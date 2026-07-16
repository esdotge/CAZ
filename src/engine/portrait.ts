import { SimplexNoise } from './noise';
import type { TornoParams } from './params';

const CAP = 2000; // cap interno de resolución de muestreo (spec §5)

/**
 * Fotografía → grabado de línea (line-engraving halftone) duotono.
 *
 * Principios tomados del grabado de billete y del halftoning AM por líneas:
 *  - El tono se codifica en la ANCHURA de la línea a espaciado constante
 *    (amplitude-modulated): las líneas nunca se funden, siempre queda canal
 *    blanco entre ellas.
 *  - RELIEVE: warp vertical por luminancia difuminada — las líneas se abomban
 *    siguiendo el volumen (el gesto que hace que se lea como retrato grabado).
 *  - La onda comparte fase entre líneas (ondas paralelas, como el torno).
 *  - Las luces se vacían (dropout) y las sombras profundas admiten una
 *    segunda trama cruzada, como en el grabado clásico.
 *
 * Todo en cliente; nada sube a servidor.
 */

interface Grid {
  sw: number;
  sh: number;
  lum: Float32Array;  // luminancia 0..1
  blur: Float32Array; // luminancia difuminada (para el relieve)
}

const gridCache = new WeakMap<HTMLImageElement, Grid>();

function boxBlurPass(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(w * h);
  // horizontal
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    const n = 2 * r + 1;
    for (let x = 0; x < w; x++) {
      out[row + x] = acc / n;
      const xAdd = Math.min(w - 1, x + r + 1);
      const xSub = Math.max(0, x - r);
      acc += src[row + xAdd] - src[row + xSub];
    }
  }
  // vertical
  const out2 = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += out[Math.min(h - 1, Math.max(0, y)) * w + x];
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      out2[y * w + x] = acc / n;
      const yAdd = Math.min(h - 1, y + r + 1);
      const ySub = Math.max(0, y - r);
      acc += out[yAdd * w + x] - out[ySub * w + x];
    }
  }
  return out2;
}

function getGrid(img: HTMLImageElement): Grid | null {
  const cached = gridCache.get(img);
  if (cached) return cached;

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  const sScale = Math.min(1, CAP / Math.max(iw, ih));
  const sw = Math.max(2, Math.round(iw * sScale));
  const sh = Math.max(2, Math.round(ih * sScale));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const cx = c.getContext('2d', { willReadFrequently: true });
  if (!cx) return null;
  cx.drawImage(img, 0, 0, sw, sh);
  const data = cx.getImageData(0, 0, sw, sh).data;

  const lum = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  }
  // Difuminado ancho: el relieve sigue el volumen, no el detalle fino.
  const r = Math.max(3, Math.round(Math.min(sw, sh) / 40));
  let blur = boxBlurPass(lum, sw, sh, r);
  blur = boxBlurPass(blur, sw, sh, r);

  const grid: Grid = { sw, sh, lum, blur };
  gridCache.set(img, grid);
  return grid;
}

/** Muestreo bilineal en coordenadas normalizadas [0,1]. */
function sampleBilinear(arr: Float32Array, sw: number, sh: number, u: number, v: number): number {
  const x = Math.min(sw - 1.001, Math.max(0, u * (sw - 1)));
  const y = Math.min(sh - 1.001, Math.max(0, v * (sh - 1)));
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * sw + x0;
  const a = arr[i], b = arr[i + 1], c = arr[i + sw], d = arr[i + sw + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Tinta/fondo del retrato — colores libres de la receta. */
export function portraitInk(p: TornoParams): { ink: string; paper: string } {
  return { ink: p.colorTinta, paper: p.colorFondo };
}

/**
 * Encuadre de la foto en el lienzo: contain × ZOOM, desplazado por los offsets
 * (fracción de media imagen). Compartido con la interacción de arrastre.
 */
export function portraitLayout(
  img: HTMLImageElement, p: TornoParams, CW: number, CH: number,
): { pad: number; drawW: number; drawH: number; ox: number; oy: number } {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  // Sin margen forzado: sólo ORILLAS. Con orillas 0 el grabado sangra al borde.
  const pad = (p.orillas / 100) * Math.min(CW, CH);
  const fitFn = p.retratoFit === 'entera' ? Math.min : Math.max;
  const s = fitFn((CW - 2 * pad) / iw, (CH - 2 * pad) / ih) * p.retratoZoom;
  const drawW = iw * s;
  const drawH = ih * s;
  const ox = (CW - drawW) / 2 + p.retratoOffX * drawW * 0.5;
  const oy = (CH - drawH) / 2 + p.retratoOffY * drawH * 0.5;
  return { pad, drawW, drawH, ox, oy };
}

/**
 * Dibuja el grabado en cualquier contexto/tamaño. `phase` ∈ [0,1) es la fase
 * del bucle de CORRIENTE VIVA (sin costura: la onda viaja una longitud de onda
 * entera y la deriva del campo traza un círculo en el espacio de ruido).
 * Coordenadas normalizadas → el mismo resultado a cualquier resolución.
 */
export function renderPortraitTo(
  ctx: CanvasRenderingContext2D,
  CW: number,
  CH: number,
  img: HTMLImageElement,
  p: TornoParams,
  phase = 0,
): void {
  const { ink, paper } = portraitInk(p);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, CW, CH);

  const grid = getGrid(img);
  if (!grid) return;

  const orillasBand = (p.orillas / 100) * Math.min(CW, CH);
  const { pad, drawW, drawH, ox, oy } = portraitLayout(img, p, CW, CH);
  // Área de barrido: el lienzo menos el margen — la imagen puede desbordarla
  // (recorte) o no llenarla (aire); las líneas sólo entintan donde hay foto.
  const areaX0 = pad, areaX1 = CW - pad;
  const areaY0 = pad, areaY1 = CH - pad;

  // --- tono ---
  const exposure = (p.retratoExposicion / 100) * 0.6;
  const contrast = 1 + p.retratoContraste / 50; // 1..3
  // DETALLE: máscara de enfoque de radio ancho (claridad) — realza aristas,
  // ojos y texturas finas, la definición del grabado de billete.
  const detalleK = (p.retratoDetalle / 100) * 2.2;
  const tone = (L: number, blurL: number): number => {
    let v = L + (L - blurL) * detalleK;
    v = v + exposure;
    v = 0.5 + (v - 0.5) * contrast;
    v = Math.min(1, Math.max(0, v));
    const dark = p.retratoInvert ? v : 1 - v;
    return Math.pow(dark, 1.3); // gamma: protege medios tonos, limpia luces
  };

  // --- geometría de trama ---
  const nLines = Math.round(Math.min(400, Math.max(20, p.caudal)));
  const spacing = (areaY1 - areaY0) / nLines; // la trama es del lienzo, la foto se encuadra dentro
  const caladoK = p.calado / 1.4; // 1.0 en el default
  // LONGITUD: onda corta y nerviosa ↔ larga y serena (5–100 → 1.5–7.2 pasos)
  const lambda = Math.max(4, spacing * (1.2 + (p.retratoLongitud / 100) * 6));
  const k = (2 * Math.PI) / lambda;
  const wavePhase = 2 * Math.PI * phase; // la onda viaja: bucle sin costura
  const maxAmp = spacing * 0.9 * (p.marea / 100);
  const reliefAmt = (p.retratoRelieve / 100) * spacing * 6;

  // --- CONTORNO: campo de tangentes — las líneas giran con las isofotas ---
  // (el gesto del retrato del billete: la línea envuelve la mejilla, no sólo
  // se abomba). Se integra la desviación lateral con amortiguación para que
  // las líneas sigan el contorno y vuelvan a su raíl sin colisionar.
  const contorno = p.retratoContorno / 100;
  const eGrad = Math.max(2, spacing * 0.6);
  const blurAtCanvas = (x: number, y: number): number => {
    const u = (x - ox) / drawW;
    const v = (y - oy) / drawH;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1
      ? sampleBilinear(grid.blur, grid.sw, grid.sh, u, v)
      : 0.5;
  };

  // --- CAUCE: compresión de trama + meandro del canal (la firma) ---
  // k>1 aprieta las líneas hacia el centro del barrido y las abre a los
  // bordes; el grosor se compensa con el paso local para conservar el tono.
  // En RETRATO el canal es un GESTO sutil, no la textura protagonista: la
  // foto manda. Magnitudes muy por debajo de las de PATRÓN.
  const kCauce = 1 + (p.cauce / 100) * 0.42;
  const chAmp = (p.cauce / 100) * Math.min(CW, CH) * 0.028;
  const chan = new SimplexNoise((p.semilla ^ 0x9e3779b9) >>> 0);

  // --- campo de flujo: deriva circular (loop perfecto) o libre ---
  const flow = new SimplexNoise(p.semilla);
  // RECTA = geometría pura: el raíl apenas se contamina de ruido
  // deriva larga y suave (no ruido nervioso): amplitud y frecuencia bajas
  const driftAmp = spacing * 0.55 * (p.corriente / 100) * (p.retratoTrazo === 'recta' ? 0.25 : 1);
  let tx: number, ty: number;
  if (p.motionLoop) {
    tx = Math.cos(2 * Math.PI * phase) * 0.34;
    ty = Math.sin(2 * Math.PI * phase) * 0.34;
  } else {
    tx = phase * 2.1;
    ty = phase * 0.7;
  }

  /**
   * Forma de onda como vector [a lo largo, perpendicular] — BUCLE necesita
   * las dos componentes: es una trocoide que riza sobre sí misma cuando la
   * amplitud (el tono) supera el avance, como el rizo de buril del grabador
   * (pelo y sombras del billete). `kk` es la frecuencia local: cada capa
   * puede ondular a su propia longitud (profundidades distintas).
   */
  const sesgo = Math.max(-1, Math.min(1, p.retratoSesgo / 100));
  const waveVec = (s: number, amp: number, kk: number): [number, number] => {
    const t = kk * s + wavePhase;
    switch (p.retratoTrazo) {
      case 'zigzag': {
        // diente pronunciado con INCLINACIÓN: subida y bajada asimétricas
        const d = 0.5 + sesgo * 0.35;
        const ph = ((t / (2 * Math.PI)) % 1 + 1) % 1;
        const tri = ph < d ? (ph / d) * 2 - 1 : 1 - ((ph - d) / (1 - d)) * 2;
        return [0, amp * 1.35 * tri];
      }
      case 'recta': return [0, 0];
      case 'bucle': {
        const tb = t * 1.6;
        return [-amp * 1.25 * Math.sin(tb), amp * Math.cos(tb)];
      }
      case 'onda':
      default: return [0, amp * Math.sin(t)];
    }
  };

  const taperAt = (x: number, y: number): number => {
    if (orillasBand <= 0.001) return 1;
    const de = Math.min(x, CW - x, y, CH - y);
    return smoothstep(0, orillasBand, de);
  };

  ctx.fillStyle = ink;

  /**
   * Barrido genérico de trama en la dirección `thetaRad`: líneas paralelas
   * separadas `spacing` que cubren TODO el lienzo a cualquier inclinación
   * (extensión = proyección del lienzo sobre la normal, como en PATRÓN).
   * `getHalf` decide la media-anchura del ribbon según tono y taper —
   * devolver <0.12 corta la línea (pen up).
   */
  const sweep = (
    thetaRad: number,
    noiseOff: number,
    withWave: boolean,
    kMul: number,
    getHalf: (dark: number, taper: number, pitch: number) => number,
    cShift = 0,     // desplaza la familia de raíles (0.5 = interlínea a medio paso)
    guardMul = 1,   // margen del canal blanco cuando hay interlíneas más cerca
  ): void => {
    const ux = Math.cos(thetaRad), uy = Math.sin(thetaRad);
    const nvx = -uy, nvy = ux; // normal a la línea
    const ccx = CW / 2, ccy = CH / 2;
    const halfLen = Math.hypot(CW, CH) / 2 + spacing;
    const halfExt = (Math.abs(CW * nvx) + Math.abs(CH * nvy)) / 2 + spacing;
    const nSweep = Math.ceil((2 * halfExt) / spacing);
    // el bucle necesita paso fino para dibujar el rizo completo
    const stepS = Math.max(CW / 1400, spacing / (p.retratoTrazo === 'bucle' ? 6 : 4));
    // suavizado del tono A LO LARGO de la línea: el grosor evoluciona fluido
    // (~1.4 pasos de trama de memoria), como la mano del grabador
    const smoothK = Math.min(0.5, Math.max(0.05, stepS / (spacing * 2.6)));
    // los segmentos más cortos que ~1.6 pasos de trama son motas: fuera
    const minPts = Math.max(4, Math.ceil((spacing * 3.2) / stepS));

    for (let li = 0; li < nSweep; li++) {
      const cRaw = -halfExt + spacing * (li + 0.5 + cShift);
      // CAUCE: warp de densidad — compresión al centro, apertura a los bordes
      let c0 = cRaw;
      let pitch = spacing;
      if (kCauce > 1.001) {
        const uu = Math.max(-1, Math.min(1, cRaw / halfExt));
        const au = Math.max(Math.abs(uu), 0.02);
        c0 = Math.sign(uu) * Math.pow(au, kCauce) * halfExt;
        pitch = Math.max(spacing * 0.35, spacing * kCauce * Math.pow(au, kCauce - 1));
      }
      const ampK = pitch / spacing; // la onda escala con el paso local
      let e1: Array<[number, number]> = [];
      let e2: Array<[number, number]> = [];
      let lat = 0;    // desviación lateral acumulada del seguimiento de contorno
      let darkS = -1; // tono suavizado a lo largo de la línea (-1 = sin iniciar)

      const flush = (): void => {
        darkS = -1;
        if (e1.length >= minPts) {
          ctx.beginPath();
          ctx.moveTo(e1[0][0], e1[0][1]);
          for (let i = 1; i < e1.length; i++) ctx.lineTo(e1[i][0], e1[i][1]);
          for (let i = e2.length - 1; i >= 0; i--) ctx.lineTo(e2[i][0], e2[i][1]);
          ctx.closePath();
          ctx.fill();
        }
        e1 = [];
        e2 = [];
      };

      for (let s = -halfLen; s <= halfLen; s += stepS) {
        // CAUCE: meandro del canal — toda la trama serpentea junta
        const cdef = chAmp > 0.001 ? chan.noise2D(s * 0.0012 + 50, 3.7) * chAmp : 0;
        const cLine = c0 + cdef;
        const bx = ccx + ux * s + nvx * cLine;
        const by = ccy + uy * s + nvy * cLine;

        // fuera del área de barrido: corta y sigue
        if (bx < areaX0 || bx > areaX1 || by < areaY0 || by > areaY1) { flush(); continue; }

        // coords normalizadas (independientes de la resolución de salida)
        const xN = (bx / CW) * 1200;
        const yN = (by / CH) * 900;

        // relieve: warp por luminancia difuminada — sigue el volumen
        const uB = (bx - ox) / drawW;
        const vB = (by - oy) / drawH;
        const blurL = uB >= 0 && uB <= 1 && vB >= 0 && vB <= 1
          ? sampleBilinear(grid.blur, grid.sw, grid.sh, uB, vB)
          : 0.5; // fuera de la foto: sin relieve
        const relief = (blurL - 0.5) * -reliefAmt;

        // deriva del campo (corriente)
        const drift = driftAmp > 0.001
          ? flow.fbm(xN * 0.0016 + noiseOff + tx, yN * 0.0016 + ty, 1) * driftAmp
          : 0;

        // CONTORNO: gradiente de la luminancia difuminada → tangente de
        // isofota; la línea acumula desviación hacia ella (con fuga al raíl)
        if (contorno > 0.01) {
          const gxc = blurAtCanvas(bx + eGrad, by) - blurAtCanvas(bx - eGrad, by);
          const gyc = blurAtCanvas(bx, by + eGrad) - blurAtCanvas(bx, by - eGrad);
          const gm = Math.hypot(gxc, gyc);
          if (gm > 1e-4) {
            let tgx = -gyc / gm, tgy = gxc / gm; // tangente (⊥ gradiente)
            let du_ = tgx * ux + tgy * uy;
            if (du_ < 0) { tgx = -tgx; tgy = -tgy; du_ = -du_; } // alinear con el avance
            const dn_ = tgx * nvx + tgy * nvy;
            const alpha = Math.max(-2, Math.min(2, dn_ / Math.max(0.35, du_)));
            const strength = Math.min(1, gm * 9) * contorno;
            lat = lat * 0.965 + alpha * strength * stepS * 0.9;
          } else {
            lat *= 0.965;
          }
          lat = Math.max(-pitch * 1.2, Math.min(pitch * 1.2, lat));
        }

        const off0 = relief + drift + lat;

        // tono muestreado donde la línea realmente pasa (desplazada por el warp)
        const sx = bx + nvx * off0;
        const sy = by + nvy * off0;
        const u = (sx - ox) / drawW;
        const v = (sy - oy) / drawH;
        let dark = 0;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          const blurAtSample = sampleBilinear(grid.blur, grid.sw, grid.sh, u, v);
          dark = tone(sampleBilinear(grid.lum, grid.sw, grid.sh, u, v), blurAtSample);
        }

        // suavizado direccional: el tono de la línea fluye, no tiembla
        if (darkS < 0) darkS = dark;
        else darkS += (dark - darkS) * smoothK;

        const taper = taperAt(sx, sy);
        const half = getHalf(darkS, taper, pitch);
        // CANAL BLANCO GARANTIZADO: la onda se acota para que nunca invada el
        // paso del vecino (onda + grosor ≤ medio paso). En sombras el trazo
        // engorda y la onda se aplana — como en el grabado real; sin este
        // tope las líneas gruesas ondulantes se tocaban y granulaban la trama.
        const ampCap = Math.max(0, pitch * 0.46 * guardMul - half);
        const amp = withWave ? Math.min(maxAmp * ampK * darkS * taper, ampCap) : 0;
        const [al, pe] = withWave ? waveVec(s + halfLen, amp, k * kMul) : [0, 0];
        const off = off0 + pe;
        const px = bx + nvx * off + ux * al;
        const py = by + nvy * off + uy * al;
        if (half < 0.12) { flush(); continue; }
        e1.push([px + nvx * half, py + nvy * half]);
        e2.push([px - nvx * half, py - nvy * half]);
      }
      flush();
    }
  };

  const theta = (p.curso * Math.PI) / 180;
  const capas = Math.min(3, Math.max(1, Math.round(p.retratoCapas)));

  // PLUMA DEL TORNO: grosor casi constante (respiro del 28%, no modulación AM).
  // El tono lo llevan la GEOMETRÍA (amplitud de onda ∝ tono) y la DENSIDAD
  // (interlíneas en sombra); CALADO fija la pluma y sigue siendo editable.
  const mainHalf = (dark: number, taper: number, pitch: number): number => {
    let half = caladoK * (0.72 + 0.28 * dark) * pitch * 0.26;
    half = Math.min(half, pitch * 0.34);
    half *= smoothstep(0.015, 0.14, dark) * (0.35 + 0.65 * taper); // sólo el blanco corta
    return half;
  };

  // ---------- capa 1: trama principal (dirección CURSO) ----------
  sweep(theta, 0, true, 1, mainHalf);

  // ---------- DERIVA: 2ª trama del grabado rotada — moiré de billete ----------
  if (p.deriva > 0.01) {
    ctx.fillStyle = p.colorDeriva;
    ctx.globalAlpha = 0.6;
    const derivaRad = (p.deriva * Math.PI) / 180;
    sweep(theta + derivaRad, 77.7, true, 1, (dark, taper, pitch) =>
      mainHalf(dark, taper, pitch) * 0.85);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
  }

  // ---------- capa 2: interlínea a MEDIO PASO — sombras ----------
  // Nada de cruces: la técnica del torno densifica, no teje. En sombra
  // emerge una línea intermedia de la misma familia (misma dirección, mismo
  // campo, misma fase de onda), y la trama sigue siendo 100% paralela.
  if (capas >= 2) {
    sweep(theta, 0, true, 1, (dark, taper, pitch) => {
      const presence = smoothstep(0.42, 0.72, dark);
      return Math.min(caladoK * pitch * 0.11 * presence * taper, pitch * 0.085);
    }, 0.5, 0.6);
  }

  // ---------- capa 3: interlíneas a CUARTO DE PASO — sombra profunda ----------
  // El negro casi pleno se construye con densidad 4×, siempre con canal.
  if (capas >= 3) {
    const deepHalf = (dark: number, taper: number, pitch: number): number => {
      const presence = smoothstep(0.68, 0.93, dark);
      return Math.min(caladoK * pitch * 0.07 * presence * taper, pitch * 0.045);
    };
    sweep(theta, 0, true, 1, deepHalf, 0.25, 0.32);
    sweep(theta, 0, true, 1, deepHalf, 0.75, 0.32);
  }
}

/** Compat: dibuja sobre un canvas completo. */
export function renderPortrait(canvas: HTMLCanvasElement, img: HTMLImageElement, p: TornoParams, phase = 0): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  renderPortraitTo(ctx, canvas.width, canvas.height, img, p, phase);
}
