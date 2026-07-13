/**
 * Encoder GIF89a mínimo, sin dependencias. LZW + tabla de color global +
 * bucle Netscape. Pensado para arte de línea duotono: la paleta es un rampeo
 * papel→tinta, así que el quantizado es casi sin pérdida y comprime muy bien.
 */

class BitWriter {
  bytes: number[] = [];
  private cur = 0;
  private n = 0;
  writeBits(value: number, len: number): void {
    for (let i = 0; i < len; i++) {
      if (value & (1 << i)) this.cur |= 1 << this.n;
      this.n++;
      if (this.n === 8) { this.bytes.push(this.cur); this.cur = 0; this.n = 0; }
    }
  }
  flush(): void {
    if (this.n > 0) { this.bytes.push(this.cur); this.cur = 0; this.n = 0; }
  }
}

/** Compresión LZW de un flujo de índices (algoritmo GIF). */
function lzwCompress(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const bw = new BitWriter();

  let dict = new Map<string, number>();
  let next = eoiCode + 1;
  let codeSize = minCodeSize + 1;

  const reset = () => {
    dict = new Map<string, number>();
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
    next = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };

  reset();
  bw.writeBits(clearCode, codeSize);

  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const combined = prefix + ',' + c;
    if (dict.has(combined)) {
      prefix = combined;
    } else {
      bw.writeBits(dict.get(prefix)!, codeSize);
      dict.set(combined, next);
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      next++;
      if (next > 4095) {
        bw.writeBits(clearCode, codeSize);
        reset();
      }
      prefix = String(c);
    }
  }
  bw.writeBits(dict.get(prefix)!, codeSize);
  bw.writeBits(eoiCode, codeSize);
  bw.flush();
  return bw.bytes;
}

export interface GifFrame {
  /** Índices de paleta, longitud w*h. */
  indices: Uint8Array;
  /** Retardo en centésimas de segundo. */
  delayCs: number;
}

/**
 * Ensambla un GIF89a animado en bucle infinito. Asíncrono: cede el hilo entre
 * fotogramas para no congelar la UI durante el LZW.
 * `palette`: array de [r,g,b], longitud potencia de 2 (2..256).
 */
export async function encodeGIF(w: number, h: number, palette: number[][], frames: GifFrame[]): Promise<Blob> {
  const out: number[] = [];
  const push = (...b: number[]) => out.push(...b);
  const pushStr = (s: string) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
  const u16 = (v: number) => { out.push(v & 0xff, (v >> 8) & 0xff); };

  // tamaño de tabla de color (potencia de 2)
  let bits = 1;
  while ((1 << bits) < palette.length) bits++;
  const tableSize = 1 << bits;
  const minCodeSize = Math.max(2, bits);

  // Header + Logical Screen Descriptor
  pushStr('GIF89a');
  u16(w); u16(h);
  push(0x80 | ((bits - 1) & 0x07)); // GCT presente, resolución de color, tamaño GCT
  push(0); // índice de fondo
  push(0); // aspect ratio

  // Global Color Table
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0];
    push(c[0] & 0xff, c[1] & 0xff, c[2] & 0xff);
  }

  // Netscape 2.0 — bucle infinito
  push(0x21, 0xff, 0x0b);
  pushStr('NETSCAPE2.0');
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (const f of frames) {
    // Graphic Control Extension
    push(0x21, 0xf9, 0x04, 0x00);
    u16(f.delayCs);
    push(0x00, 0x00);

    // Image Descriptor
    push(0x2c);
    u16(0); u16(0); u16(w); u16(h);
    push(0x00); // sin tabla local, sin entrelazado

    // datos LZW en sub-bloques de <=255 bytes
    push(minCodeSize);
    const data = lzwCompress(f.indices, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00); // fin de datos de imagen
    await new Promise((r) => setTimeout(r, 0)); // cede el hilo
  }

  push(0x3b); // trailer
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

/**
 * Construye rampas fondo→tinta para una o varias tintas y una función que
 * quantiza un píxel al color de rampa más cercano (proyección sobre cada
 * segmento fondo→tinta y distancia al punto proyectado). Exacta para line-art
 * plano; con varias tintas cada trazo cae en su propia rampa.
 */
export function multiRamp(paper: string, inks: string[], stepsPerInk = 12): {
  palette: number[][];
  quantize: (r: number, g: number, b: number) => number;
} {
  const hex = (s: string): [number, number, number] => {
    const v = s.replace('#', '');
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  };
  const p0 = hex(paper);
  const uniqueInks = [...new Set(inks)];
  const n = stepsPerInk;

  const palette: number[][] = [];
  const segs = uniqueInks.map((inkHex) => {
    const p1 = hex(inkHex);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      palette.push([
        Math.round(p0[0] + (p1[0] - p0[0]) * t),
        Math.round(p0[1] + (p1[1] - p0[1]) * t),
        Math.round(p0[2] + (p1[2] - p0[2]) * t),
      ]);
    }
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    return { dx, dy, dz, denom: dx * dx + dy * dy + dz * dz || 1 };
  });

  const quantize = (r: number, g: number, b: number): number => {
    let best = 0;
    let bestDist = Infinity;
    const rr = r - p0[0], gg = g - p0[1], bb = b - p0[2];
    for (let si = 0; si < segs.length; si++) {
      const s = segs[si];
      let t = (rr * s.dx + gg * s.dy + bb * s.dz) / s.denom;
      t = Math.max(0, Math.min(1, t));
      const px = s.dx * t - rr, py = s.dy * t - gg, pz = s.dz * t - bb;
      const dist = px * px + py * py + pz * pz;
      if (dist < bestDist) {
        bestDist = dist;
        best = si * n + Math.round(t * (n - 1));
      }
    }
    return best;
  };
  return { palette, quantize };
}
