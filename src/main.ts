import './style.css';
import {
  DEFAULTS, GAMAS, PRESETS, RANGES, coerceParams, isHex, lienzoDims,
  type LienzoKind, type Mode, type RemateKind, type ShapeKind, type SymbolKind,
  type TornoParams, type TrazoKind, type View,
} from './engine/params';
import { FlowEngine, FADE_WIDTHS, lineToPath, segmentLine, type Line } from './engine/field';
import { shapePath } from './engine/shape';
import { renderPortrait, renderPortraitTo, portraitLayout } from './engine/portrait';
import { buildSymbol, drawSymbolFrame } from './engine/symbol';
import { drawPatternFrame, FORMA_FONT, FORMA_FONT_BASE, type FrameShape } from './engine/render-canvas';
import {
  exportSVG, exportPNG, presetJSON, exportWebM, exportGIF, webmSupported,
  type MotionSource,
} from './engine/export';

// ---------------- estado ----------------
let mode: Mode = 'patron';
let params: TornoParams = { ...DEFAULTS };
let engine = new FlowEngine(params.semilla);
let portraitImg: HTMLImageElement | null = null;
let view: View = lienzoDims(params.lienzo);
let exportScale = 2; // ×1 / ×2 / ×4 para PNG

const svg = document.getElementById('lienzo') as unknown as SVGSVGElement;
const canvas = document.getElementById('lienzo-canvas') as HTMLCanvasElement;
const panel = document.getElementById('panel')!;
const dropHint = document.getElementById('drop-hint')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

/** Aplica el tamaño de lienzo elegido al SVG y al canvas (2× interno). */
function applyCanvasSize(): void {
  view = lienzoDims(params.lienzo);
  svg.setAttribute('viewBox', `0 0 ${view.w} ${view.h}`);
  (svg as unknown as SVGElement).style.aspectRatio = `${view.w} / ${view.h}`;
  canvas.width = view.w * 2;
  canvas.height = view.h * 2;
  canvas.style.aspectRatio = `${view.w} / ${view.h}`;
}

// ---------------- render ----------------
let rafPending = false;
function scheduleRender(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; render(); });
}

function linesToSVG(lines: Line[], stroke: string, width: number, opacity = 1): string {
  const op = opacity < 1 ? ` stroke-opacity="${opacity}"` : '';
  // ORILLAS: cada línea se trocea en tramos por nivel de grosor; el nivel 0
  // desaparece — el patrón se funde hacia los bordes manteniendo SVG de trazos.
  const byLevel: string[] = ['', '', '', '', ''];
  for (const l of lines) {
    for (const seg of segmentLine(l)) {
      if (seg.pts.length < 2) continue;
      byLevel[seg.lvl] += lineToPath({ points: seg.pts });
    }
  }
  let s = '';
  for (let lvl = 1; lvl < FADE_WIDTHS.length; lvl++) {
    if (!byLevel[lvl]) continue;
    s += `<path d="${byLevel[lvl]}" stroke-width="${(width * FADE_WIDTHS[lvl]).toFixed(3)}"/>`;
  }
  return `<g fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round"${op}>${s}</g>`;
}

function fitBBox(customPath: string): { tx: number; ty: number; s: number } | null {
  // Ajusta un path pegado al centro del lienzo (80% del área).
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tmp.setAttribute('d', customPath);
  svg.appendChild(tmp);
  let bbox: DOMRect;
  try { bbox = tmp.getBBox(); } catch { svg.removeChild(tmp); return null; }
  svg.removeChild(tmp);
  if (!bbox.width || !bbox.height) return null;
  const s = Math.min((view.w * 0.8) / bbox.width, (view.h * 0.8) / bbox.height);
  const tx = view.w / 2 - (bbox.x + bbox.width / 2) * s;
  const ty = view.h / 2 - (bbox.y + bbox.height / 2) * s;
  return { tx, ty, s };
}

function fitTransform(customPath: string): string {
  const f = fitBBox(customPath);
  if (!f) return '';
  return `translate(${f.tx.toFixed(2)} ${f.ty.toFixed(2)}) scale(${f.s.toFixed(4)})`;
}

/** Mide la letra a tamaño base y devuelve el ajuste al 80% del lienzo. */
function fitTextBBox(content: string): { tx: number; ty: number; s: number } | null {
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tmp.setAttribute('font-family', FORMA_FONT);
  tmp.setAttribute('font-weight', '800');
  tmp.setAttribute('font-size', String(FORMA_FONT_BASE));
  tmp.textContent = content;
  svg.appendChild(tmp);
  let bbox: DOMRect;
  try { bbox = tmp.getBBox(); } catch { svg.removeChild(tmp); return null; }
  svg.removeChild(tmp);
  if (!bbox.width || !bbox.height) return null;
  const s = Math.min((view.w * 0.8) / bbox.width, (view.h * 0.8) / bbox.height);
  const tx = view.w / 2 - (bbox.x + bbox.width / 2) * s;
  const ty = view.h / 2 - (bbox.y + bbox.height / 2) * s;
  return { tx, ty, s };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Info de forma para el render a canvas (export de vídeo/GIF). */
function currentShape(): FrameShape | undefined {
  if (mode !== 'forma') return undefined;
  const strokeWidth = params.formaBorde ? params.calado * 2.5 : undefined;
  if (params.forma === 'letra') {
    const content = (params.formaLetra || 'C').slice(0, 4);
    const fit = fitTextBBox(content);
    if (!fit) return undefined;
    return { text: content, fit, strokeWidth };
  }
  const { d, fillRule } = shapePath(params.forma, params.formaPath, view);
  const fit = params.forma === 'custom' && params.formaPath ? fitBBox(params.formaPath) : null;
  return { d, fillRule, fit, strokeWidth };
}

let animTime = 0;
let animHandle = 0;
// referencias vivas del timeline (se rehacen en buildPanel)
let frameUI: { input: HTMLInputElement; val: HTMLElement; vivoToggle: HTMLElement } | null = null;

function frameLabel(): string {
  const pct = ((animTime % 1) + 1) % 1;
  return `${Math.round(pct * 100)}% · ${(pct * params.motionSegundos).toFixed(2)}s`;
}

// ---------------- historial (deshacer / rehacer) ----------------
const HIST_MAX = 50;
let histStack: string[] = [];
let redoStack: string[] = [];
let lastPush = 0;

function snapshot(): string {
  return JSON.stringify({ mode, params });
}

/** Captura el estado ANTES de un gesto (coalescido: una ráfaga = un paso). */
function pushHistory(): void {
  const snap = snapshot();
  if (histStack[histStack.length - 1] === snap) return;
  const now = performance.now();
  if (now - lastPush < 350 && histStack.length) { lastPush = now; return; }
  histStack.push(snap);
  if (histStack.length > HIST_MAX) histStack.shift();
  redoStack = [];
  lastPush = now;
}

function applyState(snap: string): void {
  let o: { mode?: string; params?: unknown };
  try { o = JSON.parse(snap); } catch { return; }
  params = coerceParams(o.params);
  if (o.mode === 'patron' || o.mode === 'retrato' || o.mode === 'forma' || o.mode === 'symbol') mode = o.mode;
  engine = new FlowEngine(params.semilla);
  document.querySelectorAll('#modes button').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode);
  });
  applyCanvasSize();
  buildPanel();
  syncAnim();
  render();
}

// ---------------- recetas guardadas (localStorage) ----------------
interface UserPreset { nombre: string; receta: Record<string, unknown> }
const LS_RECETAS = 'caz-recetas';

function loadUserPresets(): UserPreset[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_RECETAS) || '[]');
    return Array.isArray(v) ? v.filter((p) => p && typeof p.nombre === 'string') : [];
  } catch { return []; }
}

function saveUserPreset(nombre: string, receta: Record<string, unknown>): void {
  const list = loadUserPresets().filter((p) => p.nombre !== nombre);
  list.push({ nombre, receta });
  localStorage.setItem(LS_RECETAS, JSON.stringify(list));
}

function deleteUserPreset(nombre: string): void {
  localStorage.setItem(LS_RECETAS, JSON.stringify(loadUserPresets().filter((p) => p.nombre !== nombre)));
}

function render(): void {
  const ink = params.colorTinta;
  const paper = params.colorFondo;
  svg.style.background = paper;
  canvas.style.background = paper;

  const showCanvas = mode === 'retrato';
  (svg as unknown as SVGElement).style.display = showCanvas ? 'none' : 'block';
  canvas.style.display = showCanvas ? 'block' : 'none';
  dropHint.classList.toggle('show', mode === 'retrato' && !portraitImg);

  if (mode === 'retrato') {
    if (portraitImg) renderPortrait(canvas, portraitImg, params, animTime);
    else {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  if (mode === 'symbol') {
    const strokes = buildSymbol(params, view, animTime);
    const cap = params.symRemate === 'recto' ? 'butt' : 'round';
    let s = '';
    for (const st of strokes) {
      if (st.casing && !st.paper) {
        s += `<path d="${st.d}" fill="none" stroke="${paper}" stroke-width="${(st.width * 1.6).toFixed(2)}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
      }
      const color = st.paper ? paper : ink;
      const op = !st.paper && st.opacity !== undefined && st.opacity < 1
        ? ` stroke-opacity="${st.opacity.toFixed(3)}"` : '';
      s += `<path d="${st.d}" fill="none" stroke="${color}" stroke-width="${st.width.toFixed(2)}" stroke-linecap="${cap}" stroke-linejoin="round"${op}/>`;
    }
    svg.innerHTML = s;
    return;
  }

  const { main, moire } = engine.generate(params, animTime, view);

  if (mode === 'patron') {
    let inner = '';
    if (moire.length) inner += linesToSVG(moire, params.colorDeriva, params.calado * 0.85, 0.6);
    inner += linesToSVG(main, ink, params.calado);
    svg.innerHTML = inner;
  } else {
    // FORMA: patrón recortado dentro del contenedor.
    let content = '';
    if (moire.length) content += linesToSVG(moire, params.colorDeriva, params.calado * 0.85, 0.6);
    content += linesToSVG(main, ink, params.calado);

    const borderW = params.calado * 2.5;
    let clipInner = '';
    let outline = '';

    if (params.forma === 'letra') {
      const text = escapeXml((params.formaLetra || 'C').slice(0, 4));
      const fit = fitTextBBox(params.formaLetra || 'C');
      if (fit) {
        const tAttr = `transform="translate(${fit.tx.toFixed(2)} ${fit.ty.toFixed(2)}) scale(${fit.s.toFixed(4)})"`;
        const fontAttr = `font-family="${FORMA_FONT}" font-weight="800" font-size="${FORMA_FONT_BASE}"`;
        clipInner = `<text x="0" y="0" ${fontAttr} ${tAttr}>${text}</text>`;
        if (params.formaBorde) {
          outline = `<text x="0" y="0" ${fontAttr} ${tAttr} fill="none" stroke="${ink}" stroke-width="${(borderW / fit.s).toFixed(3)}">${text}</text>`;
        }
      }
    } else {
      const { d, fillRule } = shapePath(params.forma, params.formaPath, view);
      const transform = params.forma === 'custom' && params.formaPath ? fitTransform(params.formaPath) : '';
      const tAttr = transform ? ` transform="${transform}"` : '';
      clipInner = `<path d="${d}" clip-rule="${fillRule}"${tAttr}/>`;
      if (params.formaBorde) {
        const f = params.forma === 'custom' && params.formaPath ? fitBBox(params.formaPath) : null;
        const sw = f ? borderW / f.s : borderW;
        outline = `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${sw.toFixed(3)}"${tAttr}/>`;
      }
    }

    const clip = `<defs><clipPath id="caz-clip">${clipInner}</clipPath></defs>`;
    svg.innerHTML = clip + `<g clip-path="url(#caz-clip)">${content}</g>` + outline;
  }
}

// ---------------- animación (CORRIENTE VIVA) ----------------
function tickAnim(): void {
  const inc = 0.0015 + (params.corriente / 100) * 0.006;
  // Con LOOP PERFECTO la fase envuelve en [0,1) (círculo en el ruido);
  // sin loop crece libre — la corriente nunca vuelve sobre sí misma.
  animTime = params.motionLoop ? (animTime + inc) % 1 : animTime + inc;
  if (frameUI) {
    frameUI.input.value = String((((animTime % 1) + 1) % 1) * 100);
    frameUI.val.textContent = frameLabel();
  }
  render();
  animHandle = requestAnimationFrame(tickAnim);
}
function syncAnim(): void {
  const shouldRun = params.vivo && (mode !== 'retrato' || !!portraitImg);
  if (shouldRun && !animHandle) {
    animHandle = requestAnimationFrame(tickAnim);
  } else if (!shouldRun && animHandle) {
    cancelAnimationFrame(animHandle);
    animHandle = 0;
    render(); // el fotograma elegido se conserva (línea de tiempo)
  }
}

// ---------------- panel ----------------
function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const SLIDER_META: Record<string, { name: string; desc: string }> = {
  curso: { name: 'CURSO', desc: 'Dirección del campo de flujo' },
  caudal: { name: 'CAUDAL', desc: 'Densidad — nº de líneas' },
  cauce: { name: 'CAUCE', desc: 'Fuerza del canal: comprime y desvía' },
  corriente: { name: 'CORRIENTE', desc: 'Turbulencia y velocidad del campo' },
  calado: { name: 'CALADO', desc: 'Grosor de línea' },
  marea: { name: 'MAREA', desc: 'Amplitud de la ondulación' },
  orillas: { name: 'ORILLAS', desc: 'Zona de calma en los bordes' },
  ribera: { name: 'RIBERA', desc: 'Las líneas se doblan antes del borde — calas de papel (0 = nada)' },
  deriva: { name: 'DERIVA', desc: 'Rotación de la 2ª trama, 0–360° (0 = sin moiré)' },
  torsion: { name: 'TORSIÓN', desc: 'Cizalla de fase entre líneas — la trama gira en 3D' },
  retratoLongitud: { name: 'LONGITUD', desc: 'Longitud de onda del trazo — corta y nerviosa ↔ larga y serena' },
  retratoSesgo: { name: 'INCLINACIÓN', desc: 'Asimetría del diente del zigzag (0 = simétrico)' },
  retratoContorno: { name: 'CONTORNO', desc: 'Las líneas giran siguiendo los contornos de la imagen' },
  retratoDetalle: { name: 'DETALLE', desc: 'Realce del detalle fino — claridad de grabado' },
  retratoRelieve: { name: 'RELIEVE', desc: 'Las líneas se abomban con el volumen' },
  retratoExposicion: { name: 'EXPOSICIÓN', desc: 'Brillo global de la foto' },
  retratoContraste: { name: 'CONTRASTE', desc: 'Refuerza la lectura de grabado' },
  retratoZoom: { name: 'ENCUADRE', desc: 'Escala de la foto — arrastra el lienzo para recolocarla' },
  symLineas: { name: 'LÍNEAS', desc: 'Cuántos trazos componen la capa' },
  symGrosor: { name: 'GROSOR', desc: 'Peso del trazo respecto al paso' },
  symCurva: { name: 'CURVA', desc: 'Ondulación / apertura / barrido del arquetipo' },
  symEscala: { name: 'ESCALA', desc: 'Tamaño de la capa en el lienzo' },
  symGiro: { name: 'GIRO', desc: 'Rotación de la capa' },
  symX: { name: 'POSICIÓN X', desc: 'Desplaza la capa en horizontal' },
  symY: { name: 'POSICIÓN Y', desc: 'Desplaza la capa en vertical' },
  symTrenza: { name: 'TRENZA', desc: 'DELTA: cruces y hojas · ESPIRA: medias torsiones de la banda' },
  symBTrenza: { name: 'TRENZA B', desc: 'Trenzado de la capa B (DELTA)' },
  symPunta: { name: 'PUNTA', desc: 'ESPIRA: inclinación 3D de la banda (vista plana ↔ frontal)' },
  symFade: { name: 'PROFUNDIDAD', desc: 'Atenúa los trazos traseros — 0 = una sola tinta plana (ESPIRA)' },
  symGiro3d: { name: 'GIRO 3D', desc: 'Guiñada: rotación en el otro plano — la vista 3D (ESPIRA)' },
  symBGiro3d: { name: 'GIRO 3D B', desc: 'Guiñada de la capa B (ESPIRA)' },
  symBFade: { name: 'PROFUNDIDAD B', desc: 'Atenuación 3D de la capa B (ESPIRA)' },
  symBPunta: { name: 'PUNTA B', desc: 'Vértice de la capa B (ESPIRA)' },
  symBLineas: { name: 'LÍNEAS B', desc: 'Trazos de la capa B' },
  symBGrosor: { name: 'GROSOR B', desc: 'Peso del trazo de la capa B' },
  symBCurva: { name: 'CURVA B', desc: 'Ondulación / apertura de la capa B' },
  symBEscala: { name: 'ESCALA B', desc: 'Tamaño de la capa B' },
  symBGiro: { name: 'GIRO B', desc: 'Rotación de la capa B' },
  symBX: { name: 'POSICIÓN X B', desc: 'Desplaza la capa B en horizontal' },
  symBY: { name: 'POSICIÓN Y B', desc: 'Desplaza la capa B en vertical' },
};

function slider(key: keyof TornoParams): HTMLElement {
  const r = RANGES[key as string];
  const meta = SLIDER_META[key as string];
  const wrap = el('div', 'ctrl');
  const val = () => {
    const v = params[key] as number;
    return r.step < 1 ? v.toFixed(2) : String(Math.round(v));
  };
  wrap.appendChild(el('div', 'ctrl-head',
    `<span class="ctrl-name">${meta.name}</span><span class="ctrl-val">${val()}${r.unit ?? ''}</span>`));
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(r.min); input.max = String(r.max); input.step = String(r.step);
  input.value = String(params[key]);
  const valEl = wrap.querySelector('.ctrl-val') as HTMLElement;
  input.addEventListener('input', () => {
    (params[key] as number) = parseFloat(input.value);
    valEl.textContent = val() + (r.unit ?? '');
    refreshJSON();
    scheduleRender();
  });
  wrap.appendChild(input);
  wrap.appendChild(el('div', 'ctrl-desc', meta.desc));
  return wrap;
}

function group(title: string, children: HTMLElement[]): HTMLElement {
  const g = el('div', 'group');
  g.appendChild(el('div', 'group-title', title));
  children.forEach((c) => g.appendChild(c));
  return g;
}

let jsonArea: HTMLTextAreaElement;
function refreshJSON(): void {
  if (jsonArea) jsonArea.value = presetJSON(params, mode);
}

function buildPanel(): void {
  panel.innerHTML = '';

  // LIENZO (tamaño)
  const lienzoWrap = el('div', 'seg');
  const lienzos: [LienzoKind, string][] = [
    ['1080x1080', '1:1 · 1080'],
    ['1920x1080', '16:9 · 1920'],
    ['1080x1920', '9:16 · 1080'],
    ['1080x1440', '3:4 · 1080'],
  ];
  lienzos.forEach(([k, label]) => {
    const b = el('button', params.lienzo === k ? 'active' : '', label) as HTMLButtonElement;
    b.addEventListener('click', () => {
      params.lienzo = k;
      lienzoWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      applyCanvasSize();
      refreshJSON(); render();
    });
    lienzoWrap.appendChild(b);
  });
  panel.appendChild(group('Lienzo', [lienzoWrap]));

  // PRESETS — sólo las recetas del modo activo (no te sacan de sección)
  const modePresets = PRESETS.filter((pr) => pr.mode === mode);
  if (modePresets.length) {
    const presetWrap = el('div', 'presets');
    modePresets.forEach((pr) => {
      const b = el('button', 'preset-btn', pr.nombre) as HTMLButtonElement;
      b.title = pr.descripcion;
      b.addEventListener('click', () => applyPreset(pr.nombre));
      presetWrap.appendChild(b);
    });
    panel.appendChild(group('Presets de fábrica', [presetWrap]));
  }

  // MIS RECETAS — configuraciones guardadas con nombre (persisten en el navegador)
  {
    const children: HTMLElement[] = [];
    const saved = loadUserPresets();
    if (saved.length) {
      const misWrap = el('div', 'presets');
      saved.forEach((up) => {
        const row = el('span', 'user-preset');
        const b = el('button', 'preset-btn', up.nombre) as HTMLButtonElement;
        b.title = 'Aplicar esta receta guardada';
        b.addEventListener('click', () => {
          pushHistory();
          applyState(JSON.stringify({ mode: up.receta.mode ?? mode, params: up.receta }));
        });
        const del = el('button', 'preset-del', '×') as HTMLButtonElement;
        del.title = `Borrar «${up.nombre}»`;
        del.addEventListener('click', () => { deleteUserPreset(up.nombre); buildPanel(); });
        row.appendChild(b);
        row.appendChild(del);
        misWrap.appendChild(row);
      });
      children.push(misWrap);
    }
    const saveRow = el('div', 'row');
    const nameInput = document.createElement('input');
    nameInput.className = 'seed-input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Nombre de la receta…';
    nameInput.maxLength = 32;
    const saveBtn = el('button', 'chip', 'GUARDAR') as HTMLButtonElement;
    const doSave = (): void => {
      const nombre = nameInput.value.trim() || `Receta ${loadUserPresets().length + 1}`;
      saveUserPreset(nombre, { mode, ...params });
      nameInput.value = '';
      buildPanel();
    };
    saveBtn.addEventListener('click', doSave);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);
    children.push(saveRow);
    children.push(el('div', 'hint-inline', 'Guarda el estado completo (modo, parámetros, colores, lienzo) con tu nombre. Mismo nombre = sobrescribe. Ctrl+Z deshace, Ctrl+Shift+Z rehace.'));
    panel.appendChild(group('Mis recetas', children));
  }

  // FLUJO
  // SÍMBOLO tiene su propio vocabulario; FLUJO y LÍNEA no aplican.
  if (mode === 'symbol') {
    const TIPOS: [SymbolKind, string][] = [
      ['onda', 'ONDA'], ['abanico', 'ABANICO'], ['ala', 'ALA'], ['arcos', 'ARCOS'],
      ['cruce', 'CRUCE'], ['orbita', 'ÓRBITA'], ['concha', 'CONCHA'], ['codo', 'CODO'],
      ['aro', 'ARO / C'], ['delta', 'DELTA'], ['espira', 'ESPIRA'],
    ];
    const tipoSeg = (key: 'symTipo' | 'symBTipo'): HTMLElement => {
      const wrap = el('div', 'seg');
      TIPOS.forEach(([k, label]) => {
        const b = el('button', params[key] === k ? 'active' : '', label) as HTMLButtonElement;
        b.addEventListener('click', () => {
          params[key] = k;
          wrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          refreshJSON(); render();
        });
        wrap.appendChild(b);
      });
      return wrap;
    };

    const remateWrap = el('div', 'seg');
    ([['romo', 'REMATE ROMO'], ['recto', 'REMATE RECTO']] as [RemateKind, string][]).forEach(([k, label]) => {
      const b = el('button', params.symRemate === k ? 'active' : '', label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        params.symRemate = k;
        remateWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        refreshJSON(); render();
      });
      remateWrap.appendChild(b);
    });

    panel.appendChild(group('Símbolo · capa A', [
      tipoSeg('symTipo'),
      slider('symLineas'), slider('symGrosor'), slider('symCurva'), slider('symTrenza'), slider('symPunta'), slider('symFade'), slider('symGiro3d'),
      slider('symEscala'), slider('symGiro'), slider('symX'), slider('symY'),
      remateWrap,
      el('div', 'hint-inline', 'Pocas líneas, trazo claro: la síntesis del guilloché. El dado 🎲 explora variaciones.'),
    ]));

    // CAPA B — combinar arquetipos; contraforma = espacio negativo
    const capaBToggle = makeToggle('CAPA B (COMBINAR)', params.symB, (on) => {
      params.symB = on; refreshJSON(); buildPanel(); render();
    });
    const capaBChildren: HTMLElement[] = [capaBToggle];
    if (params.symB) {
      const modoWrap = el('div', 'seg');
      ([['tinta', 'TINTA'], ['contraforma', 'CONTRAFORMA']] as ['tinta' | 'contraforma', string][]).forEach(([k, label]) => {
        const b = el('button', params.symBModo === k ? 'active' : '', label) as HTMLButtonElement;
        b.addEventListener('click', () => {
          params.symBModo = k;
          modoWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          refreshJSON(); render();
        });
        modoWrap.appendChild(b);
      });
      capaBChildren.push(
        tipoSeg('symBTipo'),
        modoWrap,
        slider('symBLineas'), slider('symBGrosor'), slider('symBCurva'), slider('symBTrenza'), slider('symBPunta'), slider('symBFade'), slider('symBGiro3d'),
        slider('symBEscala'), slider('symBGiro'), slider('symBX'), slider('symBY'),
        el('div', 'hint-inline', 'CONTRAFORMA pinta con el color del papel: talla espacio negativo sobre la capa A (forma y contraforma).'),
      );
    }
    panel.appendChild(group('Símbolo · capa B', capaBChildren));
  }

  if (mode !== 'symbol') {
  // TORSIÓN y RIBERA sólo operan en PATRÓN/FORMA: en RETRATO serían mandos
  // muertos (el motor de grabado no los lee) — fuera del panel.
  const flujoCtrls = [slider('curso'), slider('caudal'), slider('cauce'), slider('corriente')];
  if (mode !== 'retrato') flujoCtrls.push(slider('torsion'));
  panel.appendChild(group('Flujo', flujoCtrls));

  // LÍNEA
  const lineaCtrls = [slider('calado'), slider('marea'), slider('orillas')];
  if (mode !== 'retrato') lineaCtrls.push(slider('ribera'));
  lineaCtrls.push(slider('deriva'));
  panel.appendChild(group('Línea', lineaCtrls));
  }

  // SEMILLA
  const seedRow = el('div', 'row');
  const seedInput = document.createElement('input');
  seedInput.className = 'seed-input';
  seedInput.type = 'number';
  seedInput.value = String(params.semilla);
  seedInput.addEventListener('change', () => {
    const v = Math.floor(Number(seedInput.value)) >>> 0;
    params.semilla = v; seedInput.value = String(v);
    engine = new FlowEngine(v); refreshJSON(); render();
  });
  const dice = el('button', 'icon-btn', '🎲') as HTMLButtonElement;
  dice.title = 'Semilla aleatoria';
  dice.addEventListener('click', () => {
    const v = Math.floor(Math.random() * 0xffffffff) >>> 0;
    params.semilla = v; seedInput.value = String(v);
    engine = new FlowEngine(v); refreshJSON(); render();
  });
  seedRow.appendChild(seedInput); seedRow.appendChild(dice);
  panel.appendChild(group('Semilla', [seedRow]));

  // COLOR — gamas predefinidas + colores libres (fondo / tinta / deriva)
  const colorSyncs: Array<() => void> = [];

  const colorRow = (label: string, key: 'colorFondo' | 'colorTinta' | 'colorDeriva', desc: string): HTMLElement => {
    const row = el('div', 'color-row');
    row.innerHTML = `<div><span class="ctrl-name">${label}</span><div class="ctrl-desc">${desc}</div></div>`;
    const ctl = el('div', 'color-ctl');
    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = params[key];
    const hexIn = document.createElement('input');
    hexIn.className = 'hex-input';
    hexIn.type = 'text';
    hexIn.value = params[key].toUpperCase();
    hexIn.maxLength = 7;
    hexIn.spellcheck = false;

    const apply = (v: string): void => {
      params[key] = v.toUpperCase();
      swatch.value = params[key];
      hexIn.value = params[key];
      hexIn.classList.remove('bad');
      refreshJSON(); scheduleRender();
    };
    swatch.addEventListener('input', () => apply(swatch.value));
    hexIn.addEventListener('input', () => {
      let v = hexIn.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (isHex(v)) apply(v);
      else hexIn.classList.add('bad');
    });
    hexIn.addEventListener('blur', () => { hexIn.value = params[key]; hexIn.classList.remove('bad'); });

    colorSyncs.push(() => { swatch.value = params[key]; hexIn.value = params[key].toUpperCase(); });
    ctl.appendChild(swatch);
    ctl.appendChild(hexIn);
    row.appendChild(ctl);
    return row;
  };

  const gamaWrap = el('div', 'gamas');
  GAMAS.forEach((g) => {
    const chip = el('button', 'gama') as HTMLButtonElement;
    chip.title = `${g.nombre} · ${g.tinta} sobre ${g.fondo}`;
    chip.innerHTML =
      `<span class="gama-swatch" style="background:linear-gradient(135deg, ${g.tinta} 0 46%, ${g.deriva} 46% 54%, ${g.fondo} 54% 100%)"></span>` +
      `<span class="gama-name">${g.nombre}</span>`;
    chip.addEventListener('click', () => {
      params.colorFondo = g.fondo.toUpperCase();
      params.colorTinta = g.tinta.toUpperCase();
      params.colorDeriva = g.deriva.toUpperCase();
      colorSyncs.forEach((f) => f());
      refreshJSON(); render();
    });
    gamaWrap.appendChild(chip);
  });

  panel.appendChild(group('Color', [
    gamaWrap,
    colorRow('FONDO', 'colorFondo', 'Papel del lienzo'),
    colorRow('TINTA', 'colorTinta', 'Trama principal y grabado'),
    colorRow('DERIVA', 'colorDeriva', '2ª trama (moiré)'),
  ]));

  // MOVIMIENTO — animación en vivo + export de bucle
  const motionRow = el('div', 'seg');
  const webmBtn = el('button', '', 'VÍDEO WEBM') as HTMLButtonElement;
  const gifBtn = el('button', '', 'GIF') as HTMLButtonElement;
  const motionMsg = el('div', 'hint-inline', '');

  // DURACIÓN del bucle exportado
  const durCtrl = el('div', 'ctrl');
  durCtrl.appendChild(el('div', 'ctrl-head',
    `<span class="ctrl-name">DURACIÓN</span><span class="ctrl-val">${params.motionSegundos}s</span>`));
  const durWrap = el('div', 'seg');
  const durVal = durCtrl.querySelector('.ctrl-val') as HTMLElement;
  [2, 3, 5, 10].forEach((s) => {
    const b = el('button', params.motionSegundos === s ? 'active' : '', `${s}s`) as HTMLButtonElement;
    b.addEventListener('click', () => {
      params.motionSegundos = s;
      durVal.textContent = `${s}s`;
      durWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      refreshJSON(); updateMotion();
    });
    durWrap.appendChild(b);
  });
  durCtrl.appendChild(durWrap);
  durCtrl.appendChild(el('div', 'ctrl-desc', 'Duración del vídeo o GIF exportado'));

  const updateMotion = (): void => {
    const ok = params.vivo && (mode !== 'retrato' || !!portraitImg);
    webmBtn.disabled = !ok || !webmSupported();
    gifBtn.disabled = !ok;
    motionMsg.textContent = ok
      ? `Bucle de ${params.motionSegundos} s · ${params.motionLoop ? 'empieza y acaba igual (loop perfecto)' : 'deriva libre, sin cierre de bucle'}.`
      : mode === 'retrato' && !portraitImg
        ? 'Carga una imagen y activa MOVIMIENTO para exportar vídeo o GIF.'
        : 'Activa MOVIMIENTO para exportar vídeo o GIF.';
  };
  webmBtn.addEventListener('click', () => runMotionExport('webm', webmBtn, updateMotion));
  gifBtn.addEventListener('click', () => runMotionExport('gif', gifBtn, updateMotion));
  motionRow.appendChild(webmBtn); motionRow.appendChild(gifBtn);

  const vivoToggle = makeToggle('MOVIMIENTO', params.vivo, (on) => {
    params.vivo = on; refreshJSON(); syncAnim(); updateMotion();
  });
  const loopToggle = makeToggle('LOOP PERFECTO', params.motionLoop, (on) => {
    params.motionLoop = on; refreshJSON(); updateMotion(); render();
  });

  // FOTOGRAMA — línea de tiempo del bucle: arrastra para pausar y buscar
  // el instante exacto; los exports SVG/PNG capturan ese fotograma
  const frameCtrl = el('div', 'ctrl');
  frameCtrl.appendChild(el('div', 'ctrl-head',
    '<span class="ctrl-name">FOTOGRAMA</span><span class="ctrl-val"></span>'));
  const frameInput = document.createElement('input');
  frameInput.type = 'range';
  frameInput.min = '0';
  frameInput.max = '100';
  frameInput.step = '0.1';
  frameInput.value = String((((animTime % 1) + 1) % 1) * 100);
  const frameVal = frameCtrl.querySelector('.ctrl-val') as HTMLElement;
  frameVal.textContent = frameLabel();
  frameInput.addEventListener('input', () => {
    if (animHandle) { // arrastrar el timeline pausa la reproducción
      cancelAnimationFrame(animHandle);
      animHandle = 0;
      params.vivo = false;
      vivoToggle.classList.remove('on');
      refreshJSON();
      updateMotion();
    }
    animTime = parseFloat(frameInput.value) / 100;
    frameVal.textContent = frameLabel();
    scheduleRender();
  });
  frameCtrl.appendChild(frameInput);
  frameCtrl.appendChild(el('div', 'ctrl-desc', 'Pausa y busca el instante exacto — la captura sale de este fotograma'));
  frameUI = { input: frameInput, val: frameVal, vivoToggle };

  updateMotion();
  panel.appendChild(group('Movimiento', [vivoToggle, durCtrl, loopToggle, frameCtrl, motionRow, motionMsg]));

  // FORMA (solo modo forma)
  if (mode === 'forma') {
    const shapes: [ShapeKind, string][] = [
      ['circulo', 'CÍRCULO'], ['o-cauce', 'O DE CAUCE'], ['pildora', 'PÍLDORA'],
      ['arco', 'ARCO'], ['rombo', 'ROMBO'], ['letra', 'LETRA'], ['custom', 'PATH'],
    ];
    const shapeWrap = el('div', 'seg');

    // LETRA: monograma / texto corto
    const letraRow = el('div', 'row');
    const letraInput = document.createElement('input');
    letraInput.className = 'seed-input';
    letraInput.type = 'text';
    letraInput.maxLength = 4;
    letraInput.value = params.formaLetra;
    letraInput.placeholder = 'C';
    letraInput.addEventListener('input', () => {
      params.formaLetra = letraInput.value.trim().slice(0, 4) || 'C';
      if (params.forma !== 'letra') selectShape('letra');
      refreshJSON(); scheduleRender();
    });
    letraRow.appendChild(letraInput);

    const pathArea = document.createElement('textarea');
    pathArea.className = 'json';
    pathArea.placeholder = 'Pega aquí un path SVG (atributo d) — se ajusta y centra solo';
    pathArea.value = params.formaPath;
    pathArea.addEventListener('input', () => {
      params.formaPath = pathArea.value.trim();
      if (params.formaPath && params.forma !== 'custom') selectShape('custom');
      refreshJSON(); scheduleRender();
    });

    const syncFormaVisibility = (): void => {
      letraRow.classList.toggle('hidden', params.forma !== 'letra');
      pathArea.classList.toggle('hidden', params.forma !== 'custom');
    };

    const selectShape = (k: ShapeKind): void => {
      params.forma = k;
      shapeWrap.querySelectorAll('button').forEach((x, i) => x.classList.toggle('active', shapes[i][0] === k));
      syncFormaVisibility();
      refreshJSON(); render();
    };

    shapes.forEach(([k, label]) => {
      const b = el('button', params.forma === k ? 'active' : '', label) as HTMLButtonElement;
      b.addEventListener('click', () => selectShape(k));
      shapeWrap.appendChild(b);
    });

    const bordeToggle = makeToggle('BORDE (CONTORNO DE TINTA)', params.formaBorde, (on) => {
      params.formaBorde = on; refreshJSON(); render();
    });

    syncFormaVisibility();
    panel.appendChild(group('Forma (contenedor)', [
      shapeWrap, letraRow, pathArea, bordeToggle,
      el('div', 'hint-inline', 'El patrón rellena el contenedor manteniendo dirección. LETRA acepta hasta 4 caracteres (monogramas, «CAZ»…). BORDE lo contornea para sellos e insignias.'),
    ]));
  }

  // RETRATO (solo modo retrato)
  if (mode === 'retrato') {
    const trazoWrap = el('div', 'seg');
    const trazos: [TrazoKind, string][] = [['onda', 'ONDA'], ['zigzag', 'ZIGZAG'], ['recta', 'RECTA'], ['bucle', 'BUCLE']];
    trazos.forEach(([k, label]) => {
      const b = el('button', params.retratoTrazo === k ? 'active' : '', label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        params.retratoTrazo = k;
        trazoWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        refreshJSON(); render();
      });
      trazoWrap.appendChild(b);
    });

    const loadBtn = el('button', 'chip', 'CARGAR IMAGEN') as HTMLButtonElement;
    loadBtn.addEventListener('click', () => fileInput.click());

    // AJUSTE: cubrir el lienzo (recorta) o foto entera (deja aire)
    const fitCtrl = el('div', 'ctrl');
    fitCtrl.appendChild(el('div', 'ctrl-head', '<span class="ctrl-name">AJUSTE</span>'));
    const fitWrap = el('div', 'seg');
    ([['cubrir', 'CUBRIR LIENZO'], ['entera', 'FOTO ENTERA']] as ['cubrir' | 'entera', string][]).forEach(([kind, label]) => {
      const b = el('button', params.retratoFit === kind ? 'active' : '', label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        params.retratoFit = kind;
        fitWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        refreshJSON(); render();
      });
      fitWrap.appendChild(b);
    });
    fitCtrl.appendChild(fitWrap);
    fitCtrl.appendChild(el('div', 'ctrl-desc', 'CUBRIR llena el lienzo sin dejar aire (recorta la foto)'));

    // CAPAS: tramado progresivo (grabado clásico de billete)
    const capasCtrl = el('div', 'ctrl');
    capasCtrl.appendChild(el('div', 'ctrl-head', '<span class="ctrl-name">CAPAS DE TRAMA</span>'));
    const capasWrap = el('div', 'seg');
    [1, 2, 3].forEach((n) => {
      const b = el('button', params.retratoCapas === n ? 'active' : '', String(n)) as HTMLButtonElement;
      b.addEventListener('click', () => {
        params.retratoCapas = n;
        capasWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        refreshJSON(); render();
      });
      capasWrap.appendChild(b);
    });
    capasCtrl.appendChild(capasWrap);
    capasCtrl.appendChild(el('div', 'ctrl-desc', '1 línea · 2 interlínea a ½ paso en sombra · 3 densidad 4× en negro — todo paralelo'));

    const invToggle = makeToggle('INVERTIR TONO', params.retratoInvert, (on) => {
      params.retratoInvert = on; refreshJSON(); render();
    });
    panel.appendChild(group('Retrato (foto → grabado)', [
      trazoWrap,
      slider('retratoLongitud'), slider('retratoSesgo'),
      capasCtrl,
      fitCtrl,
      slider('retratoZoom'),
      slider('retratoContorno'), slider('retratoDetalle'), slider('retratoRelieve'),
      slider('retratoExposicion'), slider('retratoContraste'),
      invToggle, loadBtn,
      el('div', 'hint-inline', 'Arrastra una foto al lienzo y muévela arrastrando sobre él (ENCUADRE la escala). CURSO inclina la trama; CAUCE comprime la densidad y hace serpentear el canal; DERIVA añade una 2ª trama rotada con su color (moiré de billete). Sube CAUDAL (250–350) para grano fino.'),
    ]));
  }

  // RECETA JSON
  jsonArea = document.createElement('textarea');
  jsonArea.className = 'json';
  jsonArea.value = presetJSON(params, mode);
  const actions = el('div', 'mini-actions');
  const copyBtn = el('button', 'chip', 'COPIAR') as HTMLButtonElement;
  copyBtn.addEventListener('click', async () => {
    const txt = presetJSON(params, mode);
    jsonArea.value = txt;
    try { await navigator.clipboard.writeText(txt); copyBtn.textContent = 'COPIADO ✓'; }
    catch { jsonArea.select(); document.execCommand('copy'); copyBtn.textContent = 'COPIADO ✓'; }
    setTimeout(() => (copyBtn.textContent = 'COPIAR'), 1200);
  });
  const pasteBtn = el('button', 'chip', 'APLICAR JSON') as HTMLButtonElement;
  pasteBtn.addEventListener('click', () => applyJSON(jsonArea.value));
  actions.appendChild(copyBtn); actions.appendChild(pasteBtn);
  panel.appendChild(group('Receta (JSON versionable)', [
    jsonArea, actions,
    el('div', 'hint-inline', 'Copia la receta al brandbook. Pégala y pulsa APLICAR para reproducir la pieza exacta.'),
  ]));
}

function makeToggle(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const t = el('div', 'toggle' + (on ? ' on' : ''));
  t.innerHTML = `<span class="lbl">${label}</span><span class="tk"><span class="dot"></span></span>`;
  t.addEventListener('click', () => {
    const now = !t.classList.contains('on');
    t.classList.toggle('on', now);
    onChange(now);
  });
  return t;
}

// ---------------- acciones ----------------
let motionBusy = false;
async function runMotionExport(kind: 'webm' | 'gif', btn: HTMLButtonElement, done: () => void): Promise<void> {
  if (motionBusy || !params.vivo) return;
  if (mode === 'retrato' && !portraitImg) return;
  motionBusy = true;
  const label = btn.textContent ?? '';
  btn.disabled = true;
  const onProgress = (pr: number) => { btn.textContent = kind.toUpperCase() + ' ' + Math.round(pr * 100) + '%'; };

  let src: MotionSource;
  if (mode === 'retrato') {
    const img = portraitImg!;
    const inks = params.deriva > 0.01 && params.colorDeriva !== params.colorTinta
      ? [params.colorTinta, params.colorDeriva]
      : [params.colorTinta];
    src = {
      draw: (ctx, W, H, phase) => renderPortraitTo(ctx, W, H, img, params, phase),
      paper: params.colorFondo,
      inks,
    };
  } else if (mode === 'symbol') {
    src = {
      draw: (ctx, W, H, phase) => drawSymbolFrame(ctx, W, H, params, view, phase),
      paper: params.colorFondo,
      inks: [params.colorTinta],
    };
  } else {
    const shape = currentShape();
    const inks = params.deriva > 0.01 && params.colorDeriva !== params.colorTinta
      ? [params.colorTinta, params.colorDeriva]
      : [params.colorTinta];
    src = {
      draw: (ctx, W, H, phase) => drawPatternFrame(ctx, W, H, params, engine, phase, view, shape),
      paper: params.colorFondo,
      inks,
    };
  }

  try {
    if (kind === 'webm') await exportWebM(params, mode, src, { onProgress });
    else await exportGIF(params, mode, src, { onProgress });
  } catch (e) {
    alert('No se pudo exportar: ' + (e as Error).message);
  } finally {
    motionBusy = false;
    btn.textContent = label;
    done();
  }
}

function applyPreset(nombre: string): void {
  const pr = PRESETS.find((x) => x.nombre === nombre);
  if (!pr) return;
  // El lienzo es un ajuste de espacio de trabajo: los presets no lo tocan.
  params = { ...DEFAULTS, ...pr.params, lienzo: params.lienzo };
  setMode(pr.mode, false);
  engine = new FlowEngine(params.semilla);
  applyCanvasSize();
  buildPanel(); syncAnim(); render();
}

function applyJSON(text: string): void {
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { alert('JSON inválido'); return; }
  const next = coerceParams(obj);
  const m = (obj as any)?.mode;
  params = next;
  engine = new FlowEngine(params.semilla);
  if (m === 'patron' || m === 'retrato' || m === 'forma' || m === 'symbol') setMode(m, false);
  applyCanvasSize();
  buildPanel(); syncAnim(); render();
}

function setMode(m: Mode, rebuild = true): void {
  mode = m;
  document.querySelectorAll('#modes button').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.mode === m);
  });
  if (rebuild) { buildPanel(); syncAnim(); render(); }
}

// ---------------- eventos globales ----------------
document.querySelectorAll('#modes button').forEach((b) => {
  b.addEventListener('click', () => setMode((b as HTMLElement).dataset.mode as Mode));
});
document.getElementById('btn-svg')!.addEventListener('click', () => exportSVG(svg, params, mode));
document.getElementById('btn-png')!.addEventListener('click', () => {
  const drawRetrato = portraitImg
    ? (ctx: CanvasRenderingContext2D, W: number, H: number) => renderPortraitTo(ctx, W, H, portraitImg!, params, animTime)
    : undefined;
  exportPNG(mode, params, svg, exportScale, drawRetrato);
});
document.querySelectorAll('#png-scale button').forEach((b) => {
  b.addEventListener('click', () => {
    exportScale = Number((b as HTMLElement).dataset.scale) || 2;
    document.querySelectorAll('#png-scale button').forEach((x) => x.classList.toggle('active', x === b));
  });
});
document.getElementById('btn-file')!.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) loadImageFile(f);
});

function loadImageFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      portraitImg = img;
      if (mode !== 'retrato') setMode('retrato');
      else { buildPanel(); render(); }
      syncAnim();
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}

// ---------------- encuadre por arrastre (RETRATO) ----------------
let panActive = false;
let panStart = { x: 0, y: 0, offX: 0, offY: 0 };

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'retrato' || !portraitImg) return;
  panActive = true;
  panStart = { x: e.clientX, y: e.clientY, offX: params.retratoOffX, offY: params.retratoOffY };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  if (!panActive || !portraitImg) return;
  const CW = canvas.width;
  const CH = canvas.height;
  const { drawW, drawH } = portraitLayout(portraitImg, params, CW, CH);
  // px de pantalla → px lógicos del canvas → fracción de media imagen
  const kx = CW / canvas.clientWidth;
  const ky = CH / canvas.clientHeight;
  params.retratoOffX = Math.max(-1.5, Math.min(1.5, panStart.offX + ((e.clientX - panStart.x) * kx) / (drawW * 0.5)));
  params.retratoOffY = Math.max(-1.5, Math.min(1.5, panStart.offY + ((e.clientY - panStart.y) * ky) / (drawH * 0.5)));
  refreshJSON();
  scheduleRender();
});
const endPan = (): void => {
  if (!panActive) return;
  panActive = false;
  canvas.style.cursor = 'grab';
};
canvas.addEventListener('pointerup', endPan);
canvas.addEventListener('pointercancel', endPan);

// drag & drop sobre el escenario
const stage = document.getElementById('stage')!;
['dragenter', 'dragover'].forEach((ev) =>
  stage.addEventListener(ev, (e) => { e.preventDefault(); dropHint.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) =>
  stage.addEventListener(ev, (e) => { e.preventDefault(); dropHint.classList.remove('drag'); }));
stage.addEventListener('drop', (e) => {
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f && f.type.startsWith('image/')) { if (mode !== 'retrato') setMode('retrato'); loadImageFile(f); }
});

// ---------------- deshacer / rehacer ----------------
// Captura el estado justo antes de cada gesto (clic o tecleo en el panel,
// cabecera o lienzo) — un gesto = un paso de historial.
const captureState = (): void => pushHistory();
panel.addEventListener('pointerdown', captureState, true);
document.getElementById('topbar')!.addEventListener('pointerdown', captureState, true);
canvas.addEventListener('pointerdown', captureState, true);
panel.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) captureState();
}, true);

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return; // Cmd+Z en Mac, Ctrl+Z en el resto
  // sólo los campos de TEXTO conservan su deshacer nativo; en sliders,
  // botones o el lienzo manda el historial global
  const ae = document.activeElement as HTMLElement | null;
  const tag = (ae?.tagName || '').toLowerCase();
  const type = tag === 'input' ? ((ae as HTMLInputElement).type || 'text') : '';
  const editing = tag === 'textarea' || type === 'text' || type === 'number';
  if (editing) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (!histStack.length) return;
    const cur = snapshot();
    let prev = histStack.pop()!;
    if (prev === cur && histStack.length) prev = histStack.pop()!;
    if (prev === cur) return;
    redoStack.push(cur);
    applyState(prev);
  } else if ((k === 'z' && e.shiftKey) || k === 'y') {
    e.preventDefault();
    if (!redoStack.length) return;
    const cur = snapshot();
    const next = redoStack.pop()!;
    histStack.push(cur);
    applyState(next);
  }
}, true); // fase de captura: nos adelantamos al comportamiento del navegador

// ---------------- arranque ----------------
applyCanvasSize();
canvas.style.cursor = 'grab';
buildPanel();
render();
histStack.push(snapshot()); // el estado inicial es el primer paso del historial
