import { WIDTH, HEIGHT } from './field';
import { inkPaper, type Mode, type TornoParams } from './params';

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
