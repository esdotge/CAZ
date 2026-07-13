import { WIDTH, HEIGHT } from './field';
import type { ShapeKind } from './params';

const CX = WIDTH / 2;
const CY = HEIGHT / 2;

/** Path de un círculo (dos arcos). */
function circlePath(cx: number, cy: number, r: number, sweep = 1): string {
  return (
    `M${cx - r} ${cy}` +
    `A${r} ${r} 0 1 ${sweep} ${cx + r} ${cy}` +
    `A${r} ${r} 0 1 ${sweep} ${cx - r} ${cy}Z`
  );
}

/** Path de una píldora (stadium) horizontal. */
function stadiumPath(cx: number, cy: number, w: number, h: number): string {
  const r = h / 2;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - r;
  const y1 = cy + r;
  return (
    `M${x0} ${y0}` +
    `L${x1} ${y0}` +
    `A${r} ${r} 0 0 1 ${x1} ${y1}` +
    `L${x0} ${y1}` +
    `A${r} ${r} 0 0 1 ${x0} ${y0}Z`
  );
}

/**
 * Devuelve el atributo `d` del contenedor de FORMA. La "O de cauce" es un
 * anillo (letterform), no un mandala: el patrón lo rellena manteniendo dirección.
 */
export function shapePath(kind: ShapeKind, customPath: string): { d: string; fillRule: 'nonzero' | 'evenodd' } {
  const R = Math.min(WIDTH, HEIGHT) * 0.42;
  switch (kind) {
    case 'circulo':
      return { d: circlePath(CX, CY, R), fillRule: 'nonzero' };
    case 'pildora':
      return { d: stadiumPath(CX, CY, WIDTH * 0.72, HEIGHT * 0.44), fillRule: 'nonzero' };
    case 'o-cauce':
      // Anillo: círculo exterior + interior, relleno evenodd.
      return { d: circlePath(CX, CY, R, 1) + circlePath(CX, CY, R * 0.52, 0), fillRule: 'evenodd' };
    case 'custom':
      return { d: customPath || circlePath(CX, CY, R), fillRule: 'nonzero' };
  }
}
