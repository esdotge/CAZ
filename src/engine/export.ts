import { WIDTH, HEIGHT, type FlowEngine } from './field';
import { inkPaper, type Mode, type TornoParams } from './params';
import { drawPatternFrame, type FrameShape } from './render-canvas';
import { encodeGIF, duotoneRamp, type GifFrame } from './gif';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(): string {
  // Sin Date.now determinista-friendly no importa aquí; sólo para el nombre.
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
}

/** Devuelve el SVG standalone limpio (paths, no imagen embebida). */
export function svgString(svgEl: SVGSVGElement, p: TornoParams): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(WIDTH));
  clone.setAttribute('height', String(HEIGHT));
  clone.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  // Fondo papel como primer rect (para que el SVG no sea transparente).
  const { paper } = inkPaper(p.colorway);
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(WIDTH));
  bg.setAttribute('height', String(HEIGHT));
  bg.setAttribute('fill', paper);
  clone.insertBefore(bg, clone.firstChild);
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  return head + new XMLSerializer().serializeToString(clone);
}

export function exportSVG(svgEl: SVGSVGElement, p: TornoParams, mode: Mode): void {
  const str = svgString(svgEl, p);
  download(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), `torno-${mode}-${p.semilla}-${stamp()}.svg`);
}

/** PNG @2x. Para patrón/forma rasteriza el SVG; para retrato usa el canvas. */
export async function exportPNG(
  mode: Mode,
  p: TornoParams,
  svgEl: SVGSVGElement,
  canvasEl: HTMLCanvasElement,
): Promise<void> {
  const W2 = WIDTH * 2;
  const H2 = HEIGHT * 2;

  if (mode === 'retrato') {
    canvasEl.toBlob((blob) => {
      if (blob) download(blob, `torno-retrato-${p.semilla}-${stamp()}.png`);
    }, 'image/png');
    return;
  }

  const str = svgString(svgEl, p);
  const svgBlob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = W2;
    c.height = H2;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, W2, H2);
    await new Promise<void>((resolve) => {
      c.toBlob((blob) => {
        if (blob) download(blob, `torno-${mode}-${p.semilla}-${stamp()}.png`);
        resolve();
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Receta versionable: todos los parámetros + semilla + modo. */
export function presetJSON(p: TornoParams, mode: Mode): string {
  return JSON.stringify({ _torno: 'v0', mode, ...p }, null, 2);
}

// ------------------- export de CORRIENTE VIVA -------------------

export interface MotionOpts {
  segundos?: number;
  fps?: number;
  ancho?: number;
  frames?: number; // sólo GIF; si se da, ignora fps para el nº de fotogramas
  onProgress?: (p: number) => void;
}

function pickWebmMime(): string {
  const cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

export function webmSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/** Graba un bucle sin costura de CORRIENTE VIVA a WebM (en tiempo real). */
export async function exportWebM(
  p: TornoParams, mode: Mode, engine: FlowEngine, shape: FrameShape | undefined, opts: MotionOpts = {},
): Promise<void> {
  const W = opts.ancho ?? WIDTH;
  const H = Math.round((W * HEIGHT) / WIDTH);
  const fps = opts.fps ?? 30;
  const durMs = (opts.segundos ?? 3) * 1000;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  // Adjunto (oculto pero componible) para que captureStream produzca fotogramas.
  canvas.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  drawPatternFrame(ctx, W, H, p, engine, 0, shape);

  // captureStream(0) = manual: cada fotograma se empuja con requestFrame(),
  // sin depender del reloj del compositor (rAF puede pararse en segundo plano).
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const mime = pickWebmMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
  rec.start();

  const frameMs = 1000 / fps;
  const total = Math.max(2, Math.round(durMs / frameMs));
  try {
    for (let i = 0; i < total; i++) {
      const phase = i / total; // un bucle completo a lo largo de la duración
      drawPatternFrame(ctx, W, H, p, engine, phase, shape);
      if (typeof track.requestFrame === 'function') track.requestFrame();
      opts.onProgress?.((i + 1) / total);
      await new Promise((r) => setTimeout(r, frameMs));
    }
  } finally {
    rec.stop();
    await stopped;
    canvas.remove();
  }
  download(new Blob(chunks, { type: mime }), `torno-${mode}-vivo-${p.semilla}-${stamp()}.webm`);
}

/** Renderiza un bucle sin costura de CORRIENTE VIVA a GIF animado. */
export async function exportGIF(
  p: TornoParams, mode: Mode, engine: FlowEngine, shape: FrameShape | undefined, opts: MotionOpts = {},
): Promise<void> {
  const W = opts.ancho ?? 560;
  const H = Math.round((W * HEIGHT) / WIDTH);
  const fps = opts.fps ?? 16;
  const nFrames = opts.frames ?? Math.round((opts.segundos ?? 2.5) * fps);
  const delayCs = Math.max(2, Math.round(100 / fps));

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const { ink, paper } = inkPaper(p.colorway);
  const { palette, quantize } = duotoneRamp(ink, paper, 16);

  const frames: GifFrame[] = [];
  for (let i = 0; i < nFrames; i++) {
    const phase = i / nFrames;
    drawPatternFrame(ctx, W, H, p, engine, phase, shape);
    const img = ctx.getImageData(0, 0, W, H).data;
    const idx = new Uint8Array(W * H);
    for (let src = 0, j = 0; src < img.length; src += 4, j++) {
      idx[j] = quantize(img[src], img[src + 1], img[src + 2]);
    }
    frames.push({ indices: idx, delayCs });
    opts.onProgress?.((i + 1) / nFrames);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // cede el hilo
  }

  const blob = encodeGIF(W, H, palette, frames);
  download(blob, `torno-${mode}-vivo-${p.semilla}-${stamp()}.gif`);
}
