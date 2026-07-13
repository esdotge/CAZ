import { splitmix32 } from '../prng';
import { SimplexNoise } from './noise';
import { inkPaper, type TornoParams } from './params';

const CAP = 2000; // cap interno de resolución de muestreo (spec §5)

/**
 * Fotografía → grabado de línea (line-engraving halftone) duotono.
 * Barrido de líneas continuas cuya amplitud de onda y grosor se modulan por el
 * brillo local: oscuro = línea gruesa/onda densa; claro = línea fina/recta.
 * Las líneas siguen opcionalmente el campo de flujo (la foto "fluye").
 * Todo en cliente; nada sube a servidor.
 */
export function renderPortrait(canvas: HTMLCanvasElement, img: HTMLImageElement, p: TornoParams): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const CW = canvas.width;
  const CH = canvas.height;
  const { ink, paper } = inkPaper(p.colorway === 'tinta/papel' ? 'agua/papel' : p.colorway);

  // Fondo papel.
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, CW, CH);

  // --- muestreo de la imagen (contain, con cap) ---
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const scale = Math.min(CW / iw, CH / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const ox = (CW - drawW) / 2;
  const oy = (CH - drawH) / 2;

  // Canvas de muestreo reducido.
  const sScale = Math.min(1, CAP / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * sScale));
  const sh = Math.max(1, Math.round(ih * sScale));
  const sample = document.createElement('canvas');
  sample.width = sw;
  sample.height = sh;
  const sctx = sample.getContext('2d', { willReadFrequently: true });
  if (!sctx) return;
  sctx.drawImage(img, 0, 0, sw, sh);
  const data = sctx.getImageData(0, 0, sw, sh).data;

  const orillasBand = (p.orillas / 100) * Math.min(CW, CH);
  const contrastFactor = 1 + p.retratoContraste / 50; // 1..3
  const exposure = p.retratoExposicion / 100 * 0.6;    // -0.6..0.6 sobre la luminancia

  const lumAt = (cx: number, cy: number): number => {
    // cx,cy en coords de lienzo → coords de imagen dibujada → muestreo.
    const u = (cx - ox) / drawW;
    const v = (cy - oy) / drawH;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 1; // fuera de la foto = claro (papel)
    const sx = Math.min(sw - 1, Math.max(0, Math.floor(u * sw)));
    const sy = Math.min(sh - 1, Math.max(0, Math.floor(v * sh)));
    const idx = (sy * sw + sx) * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    let L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    L += exposure;                          // exposición: sube/baja el brillo global
    L = 0.5 + (L - 0.5) * contrastFactor;   // contraste alrededor del gris medio
    return Math.min(1, Math.max(0, L));
  };

  // --- parámetros de grabado ---
  const nLines = Math.round(Math.min(400, Math.max(20, p.caudal)));
  const spacing = CH / nLines;
  const rnd = splitmix32(p.semilla);
  const flow = new SimplexNoise(p.semilla);

  const waveFreq = (0.06 + (p.corriente / 100) * 0.16) / Math.max(0.4, spacing / 8);
  const baseAmp = spacing * (0.35 + (p.marea / 100) * 0.9);
  const baseAngle = (p.curso * Math.PI) / 180;
  const ff = 0.0011 + (p.corriente / 100) * 0.0042;
  // Inclinación del barrido según CURSO (acotada para que no degenere en vertical).
  const tilt = Math.max(-1.2, Math.min(1.2, Math.tan(baseAngle)));

  ctx.fillStyle = ink;
  const stepX = Math.max(2, 4 - (p.corriente / 100) * 2);

  for (let li = 0; li < nLines; li++) {
    const baseY = spacing * (li + 0.5);
    const phase = rnd() * Math.PI * 2;

    const top: Array<[number, number]> = [];
    const bot: Array<[number, number]> = [];

    for (let x = 0; x <= CW; x += stepX) {
      // seguimiento del campo de flujo (la foto fluye)
      const drift =
        flow.fbm(x * ff, baseY * ff, 2) * spacing * 1.6 * (p.marea / 100);
      // inclinación del barrido según CURSO
      const cy = baseY + (x - CW / 2) * tilt + drift;

      const L = lumAt(x, cy);
      let dark = p.retratoInvert ? L : 1 - L;
      dark = Math.max(0, Math.min(1, dark));

      // amplitud de onda y grosor modulados por oscuridad
      const amp = baseAmp * dark;
      const wave = Math.sin(x * waveFreq + phase) * amp;
      const half = (p.calado * (0.35 + dark * 2.4)) * 0.5 + dark * spacing * 0.34;

      // taper de orillas
      let taper = 1;
      if (orillasBand > 0.001) {
        const de = Math.min(x, CW - x, cy, CH - cy);
        taper = Math.min(1, Math.max(0, de / orillasBand));
      }
      const cYY = cy + wave * taper;
      const h = Math.max(0.15, half * (0.5 + 0.5 * taper));

      top.push([x, cYY - h]);
      bot.push([x, cYY + h]);
    }

    // ribbon: grosor variable → en zonas oscuras las líneas engordan y se funden
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    ctx.fill();
  }
}
