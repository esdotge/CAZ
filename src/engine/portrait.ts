import { SimplexNoise } from './noise';
import { inkPaper, type TornoParams } from './params';

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

/** Tinta/fondo efectivos del retrato (duotono agua/papel por defecto). */
export function portraitInk(p: TornoParams): { ink: string; paper: string } {
  const cw = p.colorway === 'tinta/papel' ? 'agua/papel' : p.colorway;
  return inkPaper(cw);
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
  const orillasBand = (p.orillas / 100) * Math.min(CW, CH);
  const pad = Math.max(orillasBand, CW * 0.02);
  const s = Math.min((CW - 2 * pad) / iw, (CH - 2 * pad) / ih) * p.retratoZoom;
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
  const tone = (L: number): number => {
    let v = L + exposure;
    v = 0.5 + (v - 0.5) * contrast;
    v = Math.min(1, Math.max(0, v));
    const dark = p.retratoInvert ? v : 1 - v;
    return Math.pow(dark, 1.3); // gamma: protege medios tonos, limpia luces
  };

  // --- geometría de trama ---
  const nLines = Math.round(Math.min(400, Math.max(20, p.caudal)));
  const spacing = (areaY1 - areaY0) / nLines; // la trama es del lienzo, la foto se encuadra dentro
  const caladoK = p.calado / 1.4; // 1.0 en el default
  const lambda = Math.max(4, spacing * 2.6); // longitud de onda fija (AM, no FM)
  const k = (2 * Math.PI) / lambda;
  const wavePhase = 2 * Math.PI * phase; // la onda viaja: bucle sin costura
  const maxAmp = spacing * 0.9 * (p.marea / 100);
  const reliefAmt = (p.retratoRelieve / 100) * spacing * 6;
  const tilt = Math.max(-1.2, Math.min(1.2, Math.tan((p.curso * Math.PI) / 180)));

  // --- campo de flujo: deriva circular (loop perfecto) o libre ---
  const flow = new SimplexNoise(p.semilla);
  const driftAmp = spacing * 2.2 * (p.corriente / 100);
  let tx: number, ty: number;
  if (p.motionLoop) {
    tx = Math.cos(2 * Math.PI * phase) * 0.34;
    ty = Math.sin(2 * Math.PI * phase) * 0.34;
  } else {
    tx = phase * 2.1;
    ty = phase * 0.7;
  }

  const stepX = Math.max(CW / 1400, spacing / 4);

  const wave = (x: number): number => {
    const t = k * x + wavePhase;
    switch (p.retratoTrazo) {
      case 'zigzag': return (2 / Math.PI) * Math.asin(Math.sin(t));
      case 'recta': return 0;
      case 'onda':
      default: return Math.sin(t);
    }
  };

  const taperAt = (x: number, y: number): number => {
    if (orillasBand <= 0.001) return 1;
    const de = Math.min(x, CW - x, y, CH - y);
    return smoothstep(0, orillasBand, de);
  };

  ctx.fillStyle = ink;

  // ---------- trama principal (horizontal) ----------
  for (let li = 0; li < nLines; li++) {
    const y0 = areaY0 + spacing * (li + 0.5);
    let top: Array<[number, number]> = [];
    let bot: Array<[number, number]> = [];

    const flush = (): void => {
      if (top.length > 1) {
        ctx.beginPath();
        ctx.moveTo(top[0][0], top[0][1]);
        for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
        for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
        ctx.closePath();
        ctx.fill();
      }
      top = [];
      bot = [];
    };

    for (let x = areaX0; x <= areaX1; x += stepX) {
      // coords normalizadas (independientes de la resolución de salida)
      const xN = (x / CW) * 1200;
      const yN = (y0 / CH) * 900;

      // relieve: warp vertical por luminancia difuminada — sigue el volumen
      const uB = (x - ox) / drawW;
      const vB = (y0 - oy) / drawH;
      const blurL = uB >= 0 && uB <= 1 && vB >= 0 && vB <= 1
        ? sampleBilinear(grid.blur, grid.sw, grid.sh, uB, vB)
        : 0.5; // fuera de la foto: sin relieve
      const relief = (blurL - 0.5) * -reliefAmt; // claro = arriba, oscuro = abajo

      // deriva del campo (corriente)
      const drift = driftAmp > 0.001
        ? flow.fbm(xN * 0.004 + tx, yN * 0.004 + ty, 2) * driftAmp
        : 0;

      const cyBase = y0 + (x - CW / 2) * tilt + relief + drift;

      // tono muestreado donde la línea realmente pasa
      const u = (x - ox) / drawW;
      const v = (cyBase - oy) / drawH;
      let dark = 0;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        dark = tone(sampleBilinear(grid.lum, grid.sw, grid.sh, u, v));
      }

      const taper = taperAt(x, cyBase);
      const amp = maxAmp * dark * taper;
      const cy = cyBase + wave(x - ox) * amp;

      // anchura AM: espaciado constante, grosor variable, canal blanco garantizado
      let half = caladoK * (0.10 + 0.90 * dark) * spacing * 0.48;
      half = Math.min(half, spacing * 0.44);
      half *= smoothstep(0.030, 0.10, dark) * (0.35 + 0.65 * taper); // dropout en luces

      if (half < 0.12) { flush(); continue; }
      top.push([x, cy - half]);
      bot.push([x, cy + half]);
    }
    flush();
  }

  // ---------- trama cruzada (vertical, sólo sombras profundas) ----------
  if (p.retratoCruzada) {
    const nCols = Math.round((areaX1 - areaX0) / spacing);
    const stepY = Math.max(CH / 1400, spacing / 4);
    for (let ci = 0; ci < nCols; ci++) {
      const x0 = areaX0 + spacing * (ci + 0.5);
      let left: Array<[number, number]> = [];
      let right: Array<[number, number]> = [];
      const flush = (): void => {
        if (left.length > 1) {
          ctx.beginPath();
          ctx.moveTo(left[0][0], left[0][1]);
          for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
          for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
          ctx.closePath();
          ctx.fill();
        }
        left = [];
        right = [];
      };

      for (let y = areaY0; y <= areaY1; y += stepY) {
        const xN = (x0 / CW) * 1200;
        const yN = (y / CH) * 900;
        const drift = driftAmp > 0.001
          ? flow.fbm(yN * 0.004 + 31.7 + tx, xN * 0.004 + ty, 2) * driftAmp * 0.7
          : 0;
        const cxBase = x0 + drift;

        const u = (cxBase - ox) / drawW;
        const v = (y - oy) / drawH;
        let dark = 0;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          dark = tone(sampleBilinear(grid.lum, grid.sw, grid.sh, u, v));
        }
        // sólo aparece en sombra profunda
        const shadow = smoothstep(0.55, 0.9, dark);
        const taper = taperAt(cxBase, y);
        let half = caladoK * spacing * 0.30 * shadow * taper;
        half = Math.min(half, spacing * 0.34);

        if (half < 0.12) { flush(); continue; }
        left.push([cxBase - half, y]);
        right.push([cxBase + half, y]);
      }
      flush();
    }
  }
}

/** Compat: dibuja sobre un canvas completo. */
export function renderPortrait(canvas: HTMLCanvasElement, img: HTMLImageElement, p: TornoParams, phase = 0): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  renderPortraitTo(ctx, canvas.width, canvas.height, img, p, phase);
}
