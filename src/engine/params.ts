/**
 * Vocabulario de parámetros CAUCE. El nombre visible es el léxico de marca;
 * el comentario dice qué controla técnicamente. Ver spec §3.
 */

export type Mode = 'patron' | 'retrato' | 'forma';

export type Colorway = 'tinta/papel' | 'agua/papel' | 'papel/agua';

export interface TornoParams {
  // --- núcleo de flujo (compartido por los 3 modos) ---
  curso: number;      // Dirección/ángulo global del campo de flujo · 0–360°
  caudal: number;     // Densidad: nº de líneas de la trama · 20–400
  cauce: number;      // Fuerza del canal: compresión/desvío de la geometría · 0–100
  corriente: number;  // Turbulencia/velocidad del campo · 0–100
  calado: number;     // Grosor de línea (y contraste duotono en RETRATO) · 0.25–4 px
  marea: number;      // Amplitud de la ondulación de cada línea · 0–100
  orillas: number;    // Márgenes / zona de calma en los bordes · 0–20%
  deriva: number;     // Rotación de la 2ª trama para moiré · 0–15° (0 = sin moiré)
  semilla: number;    // Seed del PRNG · entero

  // --- presentación ---
  colorway: Colorway;
  vivo: boolean;      // CORRIENTE VIVA — animación (el campo se desplaza)

  // --- modo FORMA ---
  forma: ShapeKind;
  formaPath: string;  // path SVG pegado por el usuario (si forma === 'custom')

  // --- modo RETRATO ---
  retratoTrazo: TrazoKind;   // forma de la línea de grabado
  retratoRelieve: number;    // 0–100, warp por volumen: las líneas se abomban
  retratoCruzada: boolean;   // 2ª trama cruzada en sombras profundas
  retratoExposicion: number; // -100..100, brillo global de la foto
  retratoContraste: number;  // 0–100, refuerza la lectura de grabado
  retratoInvert: boolean;    // invierte oscuro/claro
}

export type TrazoKind = 'onda' | 'zigzag' | 'recta';

export type ShapeKind = 'circulo' | 'pildora' | 'o-cauce' | 'custom';

export const DEFAULTS: TornoParams = {
  curso: 0,
  caudal: 120,
  cauce: 55,
  corriente: 28,
  calado: 1.4,
  marea: 34,
  orillas: 6,
  deriva: 0,
  semilla: 2049,
  colorway: 'tinta/papel',
  vivo: false,
  forma: 'o-cauce',
  formaPath: '',
  retratoTrazo: 'onda',
  retratoRelieve: 40,
  retratoCruzada: false,
  retratoExposicion: 0,
  retratoContraste: 50,
  retratoInvert: false,
};

/** Los 5 presets de fábrica (spec §5). El modo va aparte en cada receta. */
export interface Preset {
  nombre: string;
  descripcion: string;
  mode: Mode;
  params: Partial<TornoParams>;
}

export const PRESETS: Preset[] = [
  {
    nombre: 'Corredor',
    descripcion: 'Canal diagonal denso',
    mode: 'patron',
    params: { curso: 28, caudal: 200, cauce: 82, corriente: 22, calado: 1.1, marea: 26, deriva: 0, orillas: 5, semilla: 7731 },
  },
  {
    nombre: 'Dos orillas',
    descripcion: 'Moiré suave, dos tramas que se encuentran',
    mode: 'patron',
    params: { curso: 0, caudal: 140, cauce: 40, corriente: 18, calado: 1, marea: 30, deriva: 6, orillas: 8, semilla: 4820 },
  },
  {
    nombre: 'Estiaje',
    descripcion: 'Trama abierta, mínima',
    mode: 'patron',
    params: { curso: 4, caudal: 40, cauce: 24, corriente: 12, calado: 1.6, marea: 18, deriva: 0, orillas: 12, semilla: 1180 },
  },
  {
    nombre: 'Crecida',
    descripcion: 'Caudal máximo, marea alta',
    mode: 'patron',
    params: { curso: 12, caudal: 360, cauce: 70, corriente: 62, calado: 0.75, marea: 78, deriva: 3, orillas: 3, semilla: 9051 },
  },
  {
    nombre: 'Sello',
    descripcion: 'Modo FORMA · círculo denso direccional',
    mode: 'forma',
    params: { curso: 20, caudal: 240, cauce: 60, corriente: 20, calado: 1, marea: 30, deriva: 0, orillas: 0, semilla: 3312, forma: 'o-cauce' },
  },
];

/** Rango declarativo para construir la UI y validar JSON pegado. */
export interface Range { min: number; max: number; step: number; unit?: string; }

export const RANGES: Record<string, Range> = {
  curso:     { min: 0,    max: 360, step: 1,    unit: '°' },
  caudal:    { min: 20,   max: 400, step: 1,    unit: '' },
  cauce:     { min: 0,    max: 100, step: 1,    unit: '' },
  corriente: { min: 0,    max: 100, step: 1,    unit: '' },
  calado:    { min: 0.25, max: 4,   step: 0.05, unit: 'px' },
  marea:     { min: 0,    max: 100, step: 1,    unit: '' },
  orillas:   { min: 0,    max: 20,  step: 0.5,  unit: '%' },
  deriva:    { min: 0,    max: 15,  step: 0.5,  unit: '°' },
  retratoRelieve:    { min: 0,    max: 100, step: 1, unit: '' },
  retratoExposicion: { min: -100, max: 100, step: 1, unit: '' },
  retratoContraste:  { min: 0,   max: 100, step: 1, unit: '' },
};

/** Colores de tinta/fondo según colorway. */
export function inkPaper(cw: Colorway): { ink: string; paper: string } {
  switch (cw) {
    case 'agua/papel': return { ink: '#177E70', paper: '#F6F4EF' };
    case 'papel/agua': return { ink: '#F6F4EF', paper: '#177E70' };
    case 'tinta/papel':
    default: return { ink: '#101012', paper: '#F6F4EF' };
  }
}

/** Sanea un objeto arbitrario (JSON pegado) a TornoParams válidos. */
export function coerceParams(input: unknown): TornoParams {
  const p = { ...DEFAULTS };
  if (!input || typeof input !== 'object') return p;
  const o = input as Record<string, unknown>;
  const num = (k: keyof TornoParams, r?: Range) => {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (p as any)[k] = r ? Math.min(r.max, Math.max(r.min, v)) : v;
    }
  };
  num('curso', RANGES.curso);
  num('caudal', RANGES.caudal);
  num('cauce', RANGES.cauce);
  num('corriente', RANGES.corriente);
  num('calado', RANGES.calado);
  num('marea', RANGES.marea);
  num('orillas', RANGES.orillas);
  num('deriva', RANGES.deriva);
  num('retratoRelieve', RANGES.retratoRelieve);
  num('retratoExposicion', RANGES.retratoExposicion);
  num('retratoContraste', RANGES.retratoContraste);
  if (typeof o.semilla === 'number' && Number.isFinite(o.semilla)) p.semilla = Math.floor(o.semilla) >>> 0;
  if (o.colorway === 'tinta/papel' || o.colorway === 'agua/papel' || o.colorway === 'papel/agua') p.colorway = o.colorway;
  if (o.forma === 'circulo' || o.forma === 'pildora' || o.forma === 'o-cauce' || o.forma === 'custom') p.forma = o.forma;
  if (typeof o.formaPath === 'string') p.formaPath = o.formaPath;
  if (typeof o.vivo === 'boolean') p.vivo = o.vivo;
  if (o.retratoTrazo === 'onda' || o.retratoTrazo === 'zigzag' || o.retratoTrazo === 'recta') p.retratoTrazo = o.retratoTrazo;
  if (typeof o.retratoCruzada === 'boolean') p.retratoCruzada = o.retratoCruzada;
  if (typeof o.retratoInvert === 'boolean') p.retratoInvert = o.retratoInvert;
  return p;
}
