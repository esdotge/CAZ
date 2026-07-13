import './style.css';
import {
  DEFAULTS, PRESETS, RANGES, coerceParams, inkPaper, lienzoDims,
  type Colorway, type LienzoKind, type Mode, type ShapeKind, type TornoParams, type TrazoKind, type View,
} from './engine/params';
import { FlowEngine, lineToPath, type Line } from './engine/field';
import { shapePath } from './engine/shape';
import { renderPortrait, renderPortraitTo, portraitInk, portraitLayout } from './engine/portrait';
import { drawPatternFrame, type FrameShape } from './engine/render-canvas';
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
  let s = '';
  const op = opacity < 1 ? ` stroke-opacity="${opacity}"` : '';
  for (const l of lines) {
    const d = lineToPath(l);
    if (d) s += `<path d="${d}"/>`;
  }
  return `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${op}>${s}</g>`;
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

/** Info de forma para el render a canvas (export de vídeo/GIF). */
function currentShape(): FrameShape | undefined {
  if (mode !== 'forma') return undefined;
  const { d, fillRule } = shapePath(params.forma, params.formaPath, view);
  const fit = params.forma === 'custom' && params.formaPath ? fitBBox(params.formaPath) : null;
  return { d, fillRule, fit };
}

let animTime = 0;
let animHandle = 0;

function render(): void {
  const { ink, paper } = inkPaper(params.colorway);
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

  const { main, moire } = engine.generate(params, animTime, view);

  if (mode === 'patron') {
    let inner = '';
    if (moire.length) inner += linesToSVG(moire, ink, params.calado, 0.5);
    inner += linesToSVG(main, ink, params.calado);
    svg.innerHTML = inner;
  } else {
    // FORMA: patrón recortado dentro del contenedor.
    const { d, fillRule } = shapePath(params.forma, params.formaPath, view);
    const transform = params.forma === 'custom' && params.formaPath ? fitTransform(params.formaPath) : '';
    const clip = `<defs><clipPath id="caz-clip" clip-rule="${fillRule}">` +
      `<path d="${d}" clip-rule="${fillRule}"${transform ? ` transform="${transform}"` : ''}/></clipPath></defs>`;
    let content = '';
    if (moire.length) content += linesToSVG(moire, ink, params.calado, 0.5);
    content += linesToSVG(main, ink, params.calado);
    svg.innerHTML = clip + `<g clip-path="url(#caz-clip)">${content}</g>`;
  }
}

// ---------------- animación (CORRIENTE VIVA) ----------------
function tickAnim(): void {
  const inc = 0.0015 + (params.corriente / 100) * 0.006;
  // Con LOOP PERFECTO la fase envuelve en [0,1) (círculo en el ruido);
  // sin loop crece libre — la corriente nunca vuelve sobre sí misma.
  animTime = params.motionLoop ? (animTime + inc) % 1 : animTime + inc;
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
    animTime = 0;
    render();
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
  deriva: { name: 'DERIVA', desc: '2ª trama para moiré (0 = sin moiré)' },
  retratoRelieve: { name: 'RELIEVE', desc: 'Las líneas se abomban con el volumen' },
  retratoExposicion: { name: 'EXPOSICIÓN', desc: 'Brillo global de la foto' },
  retratoContraste: { name: 'CONTRASTE', desc: 'Refuerza la lectura de grabado' },
  retratoZoom: { name: 'ENCUADRE', desc: 'Escala de la foto — arrastra el lienzo para recolocarla' },
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

  // PRESETS
  const presetWrap = el('div', 'presets');
  PRESETS.forEach((pr) => {
    const b = el('button', 'preset-btn', pr.nombre) as HTMLButtonElement;
    b.title = pr.descripcion;
    b.addEventListener('click', () => applyPreset(pr.nombre));
    presetWrap.appendChild(b);
  });
  panel.appendChild(group('Presets de fábrica', [presetWrap]));

  // FLUJO
  panel.appendChild(group('Flujo', [slider('curso'), slider('caudal'), slider('cauce'), slider('corriente')]));

  // LÍNEA
  panel.appendChild(group('Línea', [slider('calado'), slider('marea'), slider('orillas'), slider('deriva')]));

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

  // COLOR
  const cwWrap = el('div', 'seg');
  const cws: Colorway[] = ['tinta/papel', 'agua/papel', 'papel/agua'];
  cws.forEach((cw) => {
    const b = el('button', params.colorway === cw ? 'active' : '', cw) as HTMLButtonElement;
    b.addEventListener('click', () => {
      params.colorway = cw;
      cwWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      refreshJSON(); render();
    });
    cwWrap.appendChild(b);
  });
  panel.appendChild(group('Color', [cwWrap]));

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
  updateMotion();
  panel.appendChild(group('Movimiento', [vivoToggle, durCtrl, loopToggle, motionRow, motionMsg]));

  // FORMA (solo modo forma)
  if (mode === 'forma') {
    const shapeWrap = el('div', 'seg');
    const shapes: [ShapeKind, string][] = [['circulo', 'CÍRCULO'], ['pildora', 'PÍLDORA'], ['o-cauce', 'O DE CAUCE'], ['custom', 'PATH']];
    shapes.forEach(([k, label]) => {
      const b = el('button', params.forma === k ? 'active' : '', label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        params.forma = k;
        shapeWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        refreshJSON(); render();
      });
      shapeWrap.appendChild(b);
    });
    const pathArea = document.createElement('textarea');
    pathArea.className = 'json';
    pathArea.placeholder = 'Pega aquí un path SVG (atributo d) — se ajusta y centra solo';
    pathArea.value = params.formaPath;
    pathArea.addEventListener('input', () => {
      params.formaPath = pathArea.value.trim();
      if (params.formaPath) {
        params.forma = 'custom';
        shapeWrap.querySelectorAll('button').forEach((x, i) => x.classList.toggle('active', shapes[i][0] === 'custom'));
      }
      refreshJSON(); scheduleRender();
    });
    panel.appendChild(group('Forma (contenedor)', [shapeWrap, pathArea]));
  }

  // RETRATO (solo modo retrato)
  if (mode === 'retrato') {
    const trazoWrap = el('div', 'seg');
    const trazos: [TrazoKind, string][] = [['onda', 'ONDA'], ['zigzag', 'ZIGZAG'], ['recta', 'RECTA']];
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

    const cruzToggle = makeToggle('TRAMA CRUZADA (SOMBRAS)', params.retratoCruzada, (on) => {
      params.retratoCruzada = on; refreshJSON(); render();
    });
    const invToggle = makeToggle('INVERTIR TONO', params.retratoInvert, (on) => {
      params.retratoInvert = on; refreshJSON(); render();
    });
    panel.appendChild(group('Retrato (foto → grabado)', [
      trazoWrap,
      fitCtrl,
      slider('retratoZoom'),
      slider('retratoRelieve'), slider('retratoExposicion'), slider('retratoContraste'),
      cruzToggle, invToggle, loadBtn,
      el('div', 'hint-inline', 'Arrastra una foto al lienzo y muévela arrastrando sobre él (ENCUADRE la escala). CURSO inclina la trama — cubre todo el lienzo a cualquier ángulo. ORILLAS a 0 sangra hasta el borde.'),
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
    src = {
      draw: (ctx, W, H, phase) => renderPortraitTo(ctx, W, H, img, params, phase),
      ...portraitInk(params),
    };
  } else {
    const shape = currentShape();
    src = {
      draw: (ctx, W, H, phase) => drawPatternFrame(ctx, W, H, params, engine, phase, view, shape),
      ...inkPaper(params.colorway),
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
  if (m === 'patron' || m === 'retrato' || m === 'forma') setMode(m, false);
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

// ---------------- arranque ----------------
applyCanvasSize();
canvas.style.cursor = 'grab';
buildPanel();
render();
