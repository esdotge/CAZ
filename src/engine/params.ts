/**
 * Vocabulario de parámetros CAUCE. El nombre visible es el léxico de marca;
 * el comentario dice qué controla técnicamente. Ver spec §3.
 */

export type Mode = 'patron' | 'retrato' | 'forma' | 'symbol';

export interface TornoParams {
  // --- núcleo de flujo (compartido por los 3 modos) ---
  curso: number;      // Dirección/ángulo global del campo de flujo · 0–360°
  caudal: number;     // Densidad: nº de líneas de la trama · 20–400
  cauce: number;      // Fuerza del canal: compresión/desvío de la geometría · 0–100
  corriente: number;  // Turbulencia/velocidad del campo · 0–100
  torsion: number;    // Cizalla de fase entre líneas: la trama gira en 3D · 0–100
  calado: number;     // Grosor de línea (y contraste duotono en RETRATO) · 0.25–4 px
  marea: number;      // Amplitud de la ondulación de cada línea · 0–100
  orillas: number;    // Márgenes / zona de calma en los bordes · 0–20%
  ribera: number;     // Repulsión del borde: las líneas se doblan y no lo tocan · 0–100
  deriva: number;     // Rotación de la 2ª trama para moiré · 0–360° (0 = sin moiré)
  semilla: number;    // Seed del PRNG · entero

  // --- presentación ---
  colorFondo: string;     // hex — papel / fondo del lienzo
  colorTinta: string;     // hex — tinta de la trama principal (y del grabado)
  colorDeriva: string;    // hex — tinta de la 2ª trama (moiré)
  vivo: boolean;          // MOVIMIENTO — animación (el campo se desplaza)
  motionSegundos: number; // duración del bucle exportado (s)
  motionLoop: boolean;    // loop perfecto: el vídeo/GIF empieza y acaba igual
  lienzo: LienzoKind;     // tamaño del lienzo (px lógicos)

  // --- modo FORMA ---
  forma: ShapeKind;
  formaPath: string;  // path SVG pegado por el usuario (si forma === 'custom')
  formaLetra: string; // texto del contenedor LETRA (1–4 caracteres)
  formaBorde: boolean; // contornea el contenedor con la tinta (sellos/insignias)

  // --- modo SÍMBOLO (capa A) ---
  symTipo: SymbolKind;   // arquetipo del símbolo
  symLineas: number;     // 1–12 líneas
  symGrosor: number;     // 5–100, grosor relativo al paso
  symCurva: number;      // 0–100, ondulación / apertura / barrido
  symEscala: number;     // 30–90, % del lado menor del lienzo
  symGiro: number;       // 0–360°, rotación del símbolo
  symX: number;          // -50..50, posición horizontal de la capa
  symY: number;          // -50..50, posición vertical de la capa
  symTrenza: number;     // 0–100, los caminos se cruzan y tejen ojos (DELTA)
  symPunta: number;      // 0–100, unión del óvalo: redondeada ↔ vértice (ESPIRA)
  symFade: number;       // 0–100, atenuación por profundidad (0 = una sola tinta)
  symRemate: RemateKind; // terminal del trazo (ambas capas)

  // --- modo SÍMBOLO (capa B, combinable) ---
  symB: boolean;         // activa la 2ª capa
  symBTipo: SymbolKind;
  symBLineas: number;
  symBGrosor: number;
  symBCurva: number;
  symBEscala: number;    // 15–90
  symBGiro: number;
  symBX: number;
  symBY: number;
  symBTrenza: number;
  symBPunta: number;
  symBFade: number;
  symBModo: CapaModo;    // tinta = suma; contraforma = talla espacio negativo

  // --- modo RETRATO ---
  retratoTrazo: TrazoKind;   // forma de la línea de grabado
  retratoLongitud: number;   // 5–100, longitud de onda del trazo (corta ↔ larga)
  retratoSesgo: number;      // -100..100, inclinación del diente del zigzag
  retratoCapas: number;      // 1–3 capas de trama: cruzadas progresivas en medios/sombras
  retratoContorno: number;   // 0–100, las líneas giran siguiendo los contornos (tangentes)
  retratoDetalle: number;    // 0–100, realce de detalle fino (claridad de grabado)
  retratoRelieve: number;    // 0–100, warp por volumen: las líneas se abomban
  retratoExposicion: number; // -100..100, brillo global de la foto
  retratoContraste: number;  // 0–100, refuerza la lectura de grabado
  retratoInvert: boolean;    // invierte oscuro/claro
  retratoFit: FitKind;       // cubrir = llenar el lienzo (recorta); entera = foto completa
  retratoZoom: number;       // 1–4, escala extra sobre el ajuste (recorte/encuadre)
  retratoOffX: number;       // -1..1, desplazamiento horizontal del encuadre
  retratoOffY: number;       // -1..1, desplazamiento vertical del encuadre
}

export type FitKind = 'cubrir' | 'entera';

export type SymbolKind = 'onda' | 'abanico' | 'ala' | 'arcos' | 'cruce' | 'orbita' | 'concha' | 'codo' | 'aro' | 'delta' | 'espira';

export type RemateKind = 'romo' | 'recto';

export type CapaModo = 'tinta' | 'contraforma';

export type TrazoKind = 'onda' | 'zigzag' | 'recta' | 'bucle';

export type LienzoKind = '1080x1080' | '1920x1080' | '1080x1920' | '1080x1440';

export interface View { w: number; h: number }

export function lienzoDims(l: LienzoKind): View {
  const [w, h] = l.split('x').map(Number);
  return { w, h };
}

export type ShapeKind = 'circulo' | 'o-cauce' | 'pildora' | 'arco' | 'rombo' | 'letra' | 'custom';

export const DEFAULTS: TornoParams = {
  curso: 0,
  caudal: 120,
  cauce: 55,
  corriente: 28,
  calado: 1.4,
  marea: 34,
  orillas: 6,
  ribera: 0,
  deriva: 0,
  torsion: 0,
  semilla: 2049,
  vivo: false,
  forma: 'o-cauce',
  formaPath: '',
  formaLetra: 'C',
  formaBorde: false,
  symTipo: 'onda',
  symLineas: 5,
  symGrosor: 55,
  symCurva: 55,
  symEscala: 62,
  symGiro: 0,
  symX: 0,
  symY: 0,
  symTrenza: 0,
  symPunta: 0,
  symFade: 46,
  symRemate: 'recto',
  symB: false,
  symBTipo: 'onda',
  symBLineas: 3,
  symBGrosor: 45,
  symBCurva: 50,
  symBEscala: 40,
  symBGiro: 0,
  symBX: 0,
  symBY: 0,
  symBTrenza: 0,
  symBPunta: 0,
  symBFade: 46,
  symBModo: 'tinta',
  colorFondo: '#F6F4EF',
  colorTinta: '#101012',
  colorDeriva: '#177E70',
  motionSegundos: 3,
  motionLoop: true,
  lienzo: '1080x1080',
  retratoTrazo: 'onda',
  retratoLongitud: 30,
  retratoSesgo: 0,
  retratoCapas: 2,
  retratoContorno: 40,
  retratoDetalle: 35,
  retratoRelieve: 40,
  retratoExposicion: 0,
  retratoContraste: 50,
  retratoInvert: false,
  retratoFit: 'cubrir',
  retratoZoom: 1,
  retratoOffX: 0,
  retratoOffY: 0,
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
    nombre: 'Telar',
    descripcion: 'Dos tramas cruzadas a 90° — tejido de corrientes',
    mode: 'patron',
    params: { curso: 0, caudal: 170, cauce: 45, corriente: 16, calado: 0.9, marea: 26, deriva: 90, orillas: 6, semilla: 5150 },
  },
  {
    nombre: 'Husada',
    descripcion: 'Torsión alta: columnas de tela retorcida en 3D',
    mode: 'patron',
    params: { curso: 90, caudal: 240, cauce: 18, corriente: 12, torsion: 78, calado: 0.8, marea: 12, deriva: 0, orillas: 6, semilla: 4114 },
  },
  {
    nombre: 'Niebla',
    descripcion: 'Orillas al máximo: el patrón se disuelve en el papel',
    mode: 'patron',
    params: { curso: 0, caudal: 200, cauce: 35, corriente: 30, torsion: 0, calado: 0.7, marea: 45, deriva: 0, orillas: 18, semilla: 6280 },
  },
  {
    nombre: 'Bitinta',
    descripcion: 'Dos planchas: la 2ª trama en agua, moiré de billete',
    mode: 'patron',
    params: { curso: 8, caudal: 220, cauce: 45, corriente: 14, torsion: 0, calado: 0.9, marea: 22, deriva: 24, colorDeriva: '#177E70', orillas: 4, semilla: 3777 },
  },
  {
    nombre: 'Remanso',
    descripcion: 'Aguas quietas: ondas largas, corriente mínima',
    mode: 'patron',
    params: { curso: 0, caudal: 90, cauce: 12, corriente: 4, torsion: 0, calado: 1.2, marea: 55, deriva: 0, orillas: 8, semilla: 8241 },
  },
  {
    nombre: 'Ribera',
    descripcion: 'Las líneas se doblan antes del borde — calas de papel',
    mode: 'patron',
    params: { curso: 0, caudal: 210, cauce: 55, corriente: 26, torsion: 0, calado: 0.8, marea: 42, deriva: 0, orillas: 0, ribera: 88, semilla: 5511 },
  },
  {
    nombre: 'Rápidos',
    descripcion: 'Turbulencia máxima con un punto de torsión — aguas bravas',
    mode: 'patron',
    params: { curso: 355, caudal: 280, cauce: 60, corriente: 92, torsion: 22, calado: 0.6, marea: 65, deriva: 0, orillas: 4, semilla: 1930 },
  },

  // --- RETRATO --- (corriente baja y cauce contenido = trazo limpio)
  {
    nombre: 'Billete',
    descripcion: 'Grabado de banco: 3 capas, detalle alto, grano fino',
    mode: 'retrato',
    params: { caudal: 300, calado: 1.1, marea: 24, corriente: 8, cauce: 25, deriva: 0, curso: 0, orillas: 4, retratoTrazo: 'onda', retratoLongitud: 30, retratoCapas: 3, retratoContorno: 55, retratoDetalle: 55, retratoRelieve: 45, retratoContraste: 55, semilla: 2049 },
  },
  {
    nombre: 'Buril',
    descripcion: 'Rizos de buril que crecen en la sombra (pelo del billete)',
    mode: 'retrato',
    params: { caudal: 210, calado: 1.2, marea: 48, corriente: 6, cauce: 15, deriva: 0, curso: 0, orillas: 4, retratoTrazo: 'bucle', retratoLongitud: 22, retratoCapas: 2, retratoContorno: 45, retratoDetalle: 55, retratoRelieve: 40, retratoContraste: 52, semilla: 2049 },
  },
  {
    nombre: 'Topográfico',
    descripcion: 'Línea recta con relieve fuerte — el volumen manda',
    mode: 'retrato',
    params: { caudal: 190, calado: 1.6, marea: 18, corriente: 6, cauce: 0, deriva: 0, curso: 0, orillas: 4, retratoTrazo: 'recta', retratoLongitud: 40, retratoCapas: 2, retratoContorno: 30, retratoDetalle: 40, retratoRelieve: 85, retratoContraste: 50, semilla: 2049 },
  },
  {
    nombre: 'Pasaporte',
    descripcion: 'Malla bicolor finísima: 2ª trama a 90° en agua',
    mode: 'retrato',
    params: { caudal: 340, calado: 0.75, marea: 16, corriente: 10, cauce: 20, deriva: 90, colorDeriva: '#177E70', curso: 0, orillas: 4, retratoTrazo: 'onda', retratoLongitud: 25, retratoCapas: 2, retratoContorno: 40, retratoDetalle: 45, retratoRelieve: 30, retratoContraste: 45, semilla: 2049 },
  },
  {
    nombre: 'Filatelia',
    descripcion: 'Sello postal: denso, contrastado, contorno marcado',
    mode: 'retrato',
    params: { caudal: 150, calado: 2, marea: 28, corriente: 8, cauce: 0, deriva: 0, curso: 0, orillas: 6, retratoTrazo: 'onda', retratoLongitud: 28, retratoCapas: 3, retratoContorno: 50, retratoDetalle: 70, retratoRelieve: 50, retratoContraste: 62, semilla: 2049 },
  },
  {
    nombre: 'Fluvial',
    descripcion: 'La corriente lleva el retrato — contorno y marea altos',
    mode: 'retrato',
    params: { caudal: 170, calado: 1.3, marea: 62, corriente: 40, cauce: 60, deriva: 0, curso: 0, orillas: 4, retratoTrazo: 'onda', retratoLongitud: 60, retratoCapas: 1, retratoContorno: 70, retratoDetalle: 45, retratoRelieve: 35, retratoContraste: 50, semilla: 2049 },
  },

  // --- SÍMBOLO ---
  {
    nombre: 'Caudal',
    descripcion: 'Marca de bandera: cinco ondas en fase',
    mode: 'symbol',
    params: { symTipo: 'onda', symLineas: 5, symGrosor: 100, symCurva: 50, symEscala: 62, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Creciente',
    descripcion: 'Abanico de arcos que giran y se acortan',
    mode: 'symbol',
    params: { symTipo: 'abanico', symLineas: 7, symGrosor: 55, symCurva: 60, symEscala: 64, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Vuelo',
    descripcion: 'Haz radial de líneas finas',
    mode: 'symbol',
    params: { symTipo: 'ala', symLineas: 11, symGrosor: 5, symCurva: 55, symEscala: 66, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Puerta',
    descripcion: 'Arcos anidados, trazo grueso',
    mode: 'symbol',
    params: { symTipo: 'arcos', symLineas: 4, symGrosor: 100, symCurva: 45, symEscala: 62, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Trenza',
    descripcion: 'Dos caudales tejidos con calado de papel',
    mode: 'symbol',
    params: { symTipo: 'cruce', symLineas: 6, symGrosor: 100, symCurva: 40, symEscala: 60, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Órbita',
    descripcion: 'Elipses que giran alrededor del centro — esfera de líneas',
    mode: 'symbol',
    params: { symTipo: 'orbita', symLineas: 6, symGrosor: 8, symCurva: 45, symEscala: 66, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Concha',
    descripcion: 'Elipses ancladas a la base que crecen e inclinan',
    mode: 'symbol',
    params: { symTipo: 'concha', symLineas: 7, symGrosor: 8, symCurva: 55, symEscala: 64, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Cinta',
    descripcion: 'Franjas gruesas que doblan el codo — vertical a horizontal',
    mode: 'symbol',
    params: { symTipo: 'codo', symLineas: 4, symGrosor: 100, symCurva: 30, symEscala: 62, symGiro: 0, symRemate: 'recto', semilla: 2049 },
  },
  {
    nombre: 'Ojo',
    descripcion: 'Anillo + ondas que lo cruzan — la mirada del cauce',
    mode: 'symbol',
    params: { symTipo: 'aro', symLineas: 1, symGrosor: 24, symCurva: 0, symEscala: 62, symGiro: 0, symX: 0, symY: 0, symRemate: 'recto', symB: true, symBTipo: 'onda', symBLineas: 3, symBGrosor: 60, symBCurva: 50, symBEscala: 46, symBGiro: 0, symBX: 0, symBY: 0, symBModo: 'tinta', semilla: 2049 },
  },
  {
    nombre: 'Eco',
    descripcion: 'Aros en C + contraforma desplazada — interferencia',
    mode: 'symbol',
    params: { symTipo: 'aro', symLineas: 4, symGrosor: 85, symCurva: 14, symEscala: 62, symGiro: 0, symX: -6, symY: 0, symRemate: 'recto', symB: true, symBTipo: 'aro', symBLineas: 4, symBGrosor: 75, symBCurva: 0, symBEscala: 52, symBGiro: 0, symBX: 20, symBY: 0, symBModo: 'contraforma', semilla: 2049 },
  },
  {
    nombre: 'Delta',
    descripcion: 'El caudal se ramifica en canales y dibuja la C',
    mode: 'symbol',
    params: { symTipo: 'delta', symLineas: 7, symGrosor: 45, symCurva: 60, symEscala: 66, symGiro: 0, symX: 0, symY: 0, symTrenza: 70, symRemate: 'recto', symB: false, semilla: 2049 },
  },
  {
    nombre: 'Espira',
    descripcion: 'Banda de Möbius: corrientes sobre una superficie no orientable',
    mode: 'symbol',
    params: { symTipo: 'espira', symLineas: 7, symGrosor: 18, symCurva: 55, symEscala: 66, symGiro: -32, symX: 0, symY: 0, symTrenza: 0, symPunta: 58, symFade: 46, symRemate: 'recto', symB: false, semilla: 2049 },
  },
  {
    nombre: 'Nudo',
    descripcion: 'Möbius de tres medias torsiones — el nudo del caudal',
    mode: 'symbol',
    params: { symTipo: 'espira', symLineas: 5, symGrosor: 18, symCurva: 40, symEscala: 66, symGiro: 0, symX: 0, symY: 0, symTrenza: 55, symPunta: 45, symFade: 46, symRemate: 'recto', symB: false, semilla: 2049 },
  },
  {
    nombre: 'Mirada',
    descripcion: 'Dos arcos enfrentados — el párpado del canal',
    mode: 'symbol',
    params: { symTipo: 'arcos', symLineas: 3, symGrosor: 100, symCurva: 50, symEscala: 58, symGiro: 0, symX: 0, symY: -7, symRemate: 'recto', symB: true, symBTipo: 'arcos', symBLineas: 3, symBGrosor: 58, symBCurva: 50, symBEscala: 58, symBGiro: 180, symBX: 0, symBY: 7, symBModo: 'tinta', semilla: 2049 },
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
  ribera:    { min: 0,    max: 100, step: 1,    unit: '' },
  deriva:    { min: 0,    max: 360, step: 1,    unit: '°' },
  torsion:   { min: 0,    max: 100, step: 1,    unit: '' },
  retratoLongitud:   { min: 5,    max: 100, step: 1, unit: '' },
  retratoSesgo:      { min: -100, max: 100, step: 1, unit: '' },
  retratoContorno:   { min: 0,    max: 100, step: 1, unit: '' },
  retratoDetalle:    { min: 0,    max: 100, step: 1, unit: '' },
  retratoRelieve:    { min: 0,    max: 100, step: 1, unit: '' },
  retratoExposicion: { min: -100, max: 100, step: 1, unit: '' },
  retratoContraste:  { min: 0,   max: 100, step: 1, unit: '' },
  retratoZoom:       { min: 1,   max: 4,   step: 0.05, unit: '×' },
  symLineas: { min: 1,  max: 12,  step: 1, unit: '' },
  symGrosor: { min: 5,  max: 100, step: 1, unit: '' },
  symCurva:  { min: 0,  max: 100, step: 1, unit: '' },
  symEscala: { min: 30, max: 90,  step: 1, unit: '%' },
  symGiro:   { min: 0,  max: 360, step: 1, unit: '°' },
  symX:      { min: -50, max: 50, step: 1, unit: '' },
  symY:      { min: -50, max: 50, step: 1, unit: '' },
  symTrenza: { min: 0,   max: 100, step: 1, unit: '' },
  symPunta:  { min: 0,   max: 100, step: 1, unit: '' },
  symFade:   { min: 0,   max: 100, step: 1, unit: '' },
  symBLineas: { min: 1,  max: 12,  step: 1, unit: '' },
  symBGrosor: { min: 5,  max: 100, step: 1, unit: '' },
  symBCurva:  { min: 0,  max: 100, step: 1, unit: '' },
  symBEscala: { min: 15, max: 90,  step: 1, unit: '%' },
  symBGiro:   { min: 0,  max: 360, step: 1, unit: '°' },
  symBX:      { min: -50, max: 50, step: 1, unit: '' },
  symBY:      { min: -50, max: 50, step: 1, unit: '' },
  symBTrenza: { min: 0,   max: 100, step: 1, unit: '' },
  symBPunta:  { min: 0,   max: 100, step: 1, unit: '' },
  symBFade:   { min: 0,   max: 100, step: 1, unit: '' },
};

/** Gamas cromáticas predefinidas — puntos de partida, no límites (v0). */
export interface Gama {
  nombre: string;
  fondo: string;
  tinta: string;
  deriva: string;
}

export const GAMAS: Gama[] = [
  { nombre: 'Tinta',   fondo: '#F6F4EF', tinta: '#101012', deriva: '#101012' },
  { nombre: 'Agua',    fondo: '#F6F4EF', tinta: '#177E70', deriva: '#177E70' },
  { nombre: 'Inverso', fondo: '#177E70', tinta: '#F6F4EF', deriva: '#F6F4EF' },
  { nombre: 'Noche',   fondo: '#101012', tinta: '#F6F4EF', deriva: '#177E70' },
  { nombre: 'Señal',   fondo: '#F6F4EF', tinta: '#101012', deriva: '#E24E1B' },
  { nombre: 'Arena',   fondo: '#E9E2D6', tinta: '#101012', deriva: '#177E70' },
];

/** Valida un color hex #RRGGBB. */
export function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
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
  num('ribera', RANGES.ribera);
  num('deriva', RANGES.deriva);
  num('torsion', RANGES.torsion);
  num('retratoLongitud', RANGES.retratoLongitud);
  num('retratoSesgo', RANGES.retratoSesgo);
  num('retratoContorno', RANGES.retratoContorno);
  num('retratoRelieve', RANGES.retratoRelieve);
  num('retratoExposicion', RANGES.retratoExposicion);
  num('retratoContraste', RANGES.retratoContraste);
  num('retratoZoom', RANGES.retratoZoom);
  num('retratoOffX', { min: -1.5, max: 1.5, step: 0.01 });
  num('retratoOffY', { min: -1.5, max: 1.5, step: 0.01 });
  if (typeof o.semilla === 'number' && Number.isFinite(o.semilla)) p.semilla = Math.floor(o.semilla) >>> 0;
  if (isHex(o.colorFondo)) p.colorFondo = o.colorFondo.toUpperCase();
  if (isHex(o.colorTinta)) p.colorTinta = o.colorTinta.toUpperCase();
  if (isHex(o.colorDeriva)) p.colorDeriva = o.colorDeriva.toUpperCase();
  // Compat con recetas antiguas (colorway cerrado).
  if (o.colorway === 'agua/papel') { p.colorFondo = '#F6F4EF'; p.colorTinta = '#177E70'; p.colorDeriva = '#177E70'; }
  else if (o.colorway === 'papel/agua') { p.colorFondo = '#177E70'; p.colorTinta = '#F6F4EF'; p.colorDeriva = '#F6F4EF'; }
  else if (o.colorway === 'tinta/papel') { p.colorFondo = '#F6F4EF'; p.colorTinta = '#101012'; p.colorDeriva = '#101012'; }
  if (o.forma === 'circulo' || o.forma === 'pildora' || o.forma === 'o-cauce' || o.forma === 'arco'
    || o.forma === 'rombo' || o.forma === 'letra' || o.forma === 'custom') p.forma = o.forma;
  if (typeof o.formaPath === 'string') p.formaPath = o.formaPath;
  if (typeof o.formaLetra === 'string' && o.formaLetra.trim()) p.formaLetra = o.formaLetra.trim().slice(0, 4);
  if (typeof o.formaBorde === 'boolean') p.formaBorde = o.formaBorde;
  const symKind = (v: unknown): v is SymbolKind =>
    v === 'onda' || v === 'abanico' || v === 'ala' || v === 'arcos' || v === 'cruce'
    || v === 'orbita' || v === 'concha' || v === 'codo' || v === 'aro' || v === 'delta' || v === 'espira';
  if (symKind(o.symTipo)) p.symTipo = o.symTipo;
  if (o.symRemate === 'romo' || o.symRemate === 'recto') p.symRemate = o.symRemate;
  num('symLineas', RANGES.symLineas);
  num('symGrosor', RANGES.symGrosor);
  num('symCurva', RANGES.symCurva);
  num('symEscala', RANGES.symEscala);
  num('symGiro', RANGES.symGiro);
  num('symX', RANGES.symX);
  num('symY', RANGES.symY);
  num('symTrenza', RANGES.symTrenza);
  num('symPunta', RANGES.symPunta);
  num('symFade', RANGES.symFade);
  if (typeof o.symB === 'boolean') p.symB = o.symB;
  if (symKind(o.symBTipo)) p.symBTipo = o.symBTipo;
  if (o.symBModo === 'tinta' || o.symBModo === 'contraforma') p.symBModo = o.symBModo;
  num('symBLineas', RANGES.symBLineas);
  num('symBGrosor', RANGES.symBGrosor);
  num('symBCurva', RANGES.symBCurva);
  num('symBEscala', RANGES.symBEscala);
  num('symBGiro', RANGES.symBGiro);
  num('symBX', RANGES.symBX);
  num('symBY', RANGES.symBY);
  num('symBTrenza', RANGES.symBTrenza);
  num('symBPunta', RANGES.symBPunta);
  num('symBFade', RANGES.symBFade);
  if (typeof o.vivo === 'boolean') p.vivo = o.vivo;
  num('motionSegundos', { min: 1, max: 15, step: 1 });
  if (typeof o.motionLoop === 'boolean') p.motionLoop = o.motionLoop;
  if (o.lienzo === '1080x1080' || o.lienzo === '1920x1080' || o.lienzo === '1080x1920' || o.lienzo === '1080x1440') p.lienzo = o.lienzo;
  if (o.retratoTrazo === 'onda' || o.retratoTrazo === 'zigzag' || o.retratoTrazo === 'recta' || o.retratoTrazo === 'bucle') p.retratoTrazo = o.retratoTrazo;
  else if (o.retratoTrazo === 'puntos') p.retratoTrazo = 'bucle'; // compat: puntos retirado
  if (o.retratoFit === 'cubrir' || o.retratoFit === 'entera') p.retratoFit = o.retratoFit;
  if (typeof o.retratoCapas === 'number' && Number.isFinite(o.retratoCapas)) p.retratoCapas = Math.min(3, Math.max(1, Math.round(o.retratoCapas)));
  // Compat: recetas antiguas con retratoCruzada (boolean).
  else if (typeof o.retratoCruzada === 'boolean') p.retratoCapas = o.retratoCruzada ? 2 : 1;
  num('retratoDetalle', RANGES.retratoDetalle);
  if (typeof o.retratoInvert === 'boolean') p.retratoInvert = o.retratoInvert;
  return p;
}
