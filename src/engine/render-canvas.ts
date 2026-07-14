import { FlowEngine, FADE_WIDTHS, segmentLine, type Line } from './field';
import type { TornoParams, View } from './params';

export const FORMA_FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const FORMA_FONT_BASE = 100; // px de referencia para medir la letra

export interface FrameShape {
  /** Contenedor por path (todas las formas salvo LETRA). */
  d?: string;
  fillRule?: CanvasFillRule;
  /** Contenedor por texto (LETRA): se enmascara por composición. */
  text?: string;
  /** Ajuste al lienzo: traslación + escala (para path pegado y letra). */
  fit?: { tx: number; ty: number; s: number } | null;
  /** BORDE: contornea el contenedor con la tinta. Grosor en px de lienzo. */
  strokeWidth?: number;
}

/** Traza líneas agrupadas por nivel de grosor (fundido de ORILLAS). */
function strokeLines(ctx: CanvasRenderingContext2D, lines: Line[], baseWidth: number): void {
  const byLevel: Array<Path2D | null> = [null, null, null, null, null];
  for (const l of lines) {
    for (const seg of segmentLine(l)) {
      if (seg.pts.length < 2) continue;
      const path = (byLevel[seg.lvl] ??= new Path2D());
      path.moveTo(seg.pts[0][0], seg.pts[0][1]);
      for (let i = 1; i < seg.pts.length; i++) path.lineTo(seg.pts[i][0], seg.pts[i][1]);
    }
  }
  for (let lvl = 1; lvl < FADE_WIDTHS.length; lvl++) {
    const path = byLevel[lvl];
    if (!path) continue;
    ctx.lineWidth = baseWidth * FADE_WIDTHS[lvl];
    ctx.stroke(path);
  }
}

function drawTramas(
  ctx: CanvasRenderingContext2D,
  params: TornoParams,
  engine: FlowEngine,
  phase: number,
  view: View,
): void {
  const { main, moire } = engine.generate(params, phase, view);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (moire.length) {
    ctx.strokeStyle = params.colorDeriva;
    ctx.globalAlpha = 0.6;
    strokeLines(ctx, moire, params.calado * 0.85);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = params.colorTinta;
  strokeLines(ctx, main, params.calado);
}

function shapePath2D(shape: FrameShape): Path2D {
  const base = new Path2D(shape.d);
  if (!shape.fit) return base;
  const m = new DOMMatrix([shape.fit.s, 0, 0, shape.fit.s, shape.fit.tx, shape.fit.ty]);
  const path = new Path2D();
  path.addPath(base, m);
  return path;
}

/**
 * Dibuja un fotograma del patrón (PATRÓN o FORMA) en un canvas 2D.
 * `view` son las dimensiones lógicas del lienzo; `outW/outH` las del canvas
 * de salida (misma proporción, cualquier escala). `phase` ∈ [0,1).
 */
export function drawPatternFrame(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  params: TornoParams,
  engine: FlowEngine,
  phase: number,
  view: View,
  shape?: FrameShape,
): void {
  const sx = outW / view.w;
  const sy = outH / view.h;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = params.colorFondo;
  ctx.fillRect(0, 0, outW, outH);

  // ---- LETRA: patrón en canvas aparte enmascarado por el texto ----
  if (shape?.text && shape.fit) {
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const octx = off.getContext('2d')!;
    octx.scale(sx, sy);
    drawTramas(octx, params, engine, phase, view);
    // máscara: sólo queda el patrón dentro de la letra
    octx.globalCompositeOperation = 'destination-in';
    octx.fillStyle = '#000';
    octx.font = `800 ${FORMA_FONT_BASE * shape.fit.s}px ${FORMA_FONT}`;
    octx.fillText(shape.text, shape.fit.tx, shape.fit.ty);
    ctx.drawImage(off, 0, 0);

    if (shape.strokeWidth) {
      ctx.save();
      ctx.scale(sx, sy);
      ctx.strokeStyle = params.colorTinta;
      ctx.lineWidth = shape.strokeWidth;
      ctx.font = `800 ${FORMA_FONT_BASE * shape.fit.s}px ${FORMA_FONT}`;
      ctx.strokeText(shape.text, shape.fit.tx, shape.fit.ty);
      ctx.restore();
    }
    return;
  }

  ctx.save();
  ctx.scale(sx, sy); // trabajar en coordenadas lógicas del lienzo

  let path: Path2D | null = null;
  if (shape?.d) {
    path = shapePath2D(shape);
    ctx.save();
    ctx.clip(path, shape.fillRule ?? 'nonzero');
  }

  drawTramas(ctx, params, engine, phase, view);

  if (path) {
    ctx.restore(); // levanta el clip
    if (shape?.strokeWidth) {
      ctx.strokeStyle = params.colorTinta;
      ctx.lineWidth = shape.strokeWidth;
      ctx.stroke(path);
    }
  }

  ctx.restore();
}
