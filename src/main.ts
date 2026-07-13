import './style.css';
import {
  DEFAULTS, PRESETS, RANGES, coerceParams, inkPaper,
  type Colorway, type Mode, type ShapeKind, type TornoParams,
} from './engine/params';
import { FlowEngine, WIDTH, HEIGHT, lineToPath, type Line } from './engine/field';
import { shapePath } from './engine/shape';
import { renderPortrait } from './engine/portrait';
import { exportSVG, exportPNG, presetJSON } from './engine/export';

// ---------------- estado ----------------
let mode: Mode = 'patron';
let params: TornoParams = { ...DEFAULTS };
let engine = new FlowEngine(params.semilla);
let portraitImg: HTMLImageElement | null = null;

const svg = document.getElementById('lienzo') as unknown as SVGSVGElement;
const canvas = document.getElementById('lienzo-canvas') as HTMLCanvasElement;
const panel = document.getElementById('panel')!;
const dropHint = document.getElementById('drop-hint')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

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

function fitTransform(customPath: string): string {
  // Ajusta un path pegado al centro del lienzo (80% del área).
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tmp.setAttribute('d', customPath);
  svg.appendChild(tmp);
  let bbox: DOMRect;
  try { bbox = tmp.getBBox(); } catch { svg.removeChild(tmp); return ''; }
  svg.removeChild(tmp);
  if (!bbox.width || !bbox.height) return '';
  const scale = Math.min((WIDTH * 0.8) / bbox.width, (HEIGHT * 0.8) / bbox.height);
  const tx = WIDTH / 2 - (bbox.x + bbox.width / 2) * scale;
  const ty = HEIGHT / 2 - (bbox.y + bbox.height / 2) * scale;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`;
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
    if (portraitImg) renderPortrait(canvas, portraitImg, params);
    else {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  const { main, moire } = engine.generate(params, animTime);

  if (mode === 'patron') {
    let inner = '';
    if (moire.length) inner += linesToSVG(moire, ink, params.calado, 0.5);
    inner += linesToSVG(main, ink, params.calado);
    svg.innerHTML = inner;
  } else {
    // FORMA: patrón recortado dentro del contenedor.
    const { d, fillRule } = shapePath(params.forma, params.formaPath);
    const transform = params.forma === 'custom' && params.formaPath ? fitTransform(params.formaPath) : '';
    const clip = `<defs><clipPath id="torno-clip" clip-rule="${fillRule}">` +
      `<path d="${d}" clip-rule="${fillRule}"${transform ? ` transform="${transform}"` : ''}/></clipPath></defs>`;
    let content = '';
    if (moire.length) content += linesToSVG(moire, ink, params.calado, 0.5);
    content += linesToSVG(main, ink, params.calado);
    svg.innerHTML = clip + `<g clip-path="url(#torno-clip)">${content}</g>`;
  }
}

// ---------------- animación (CORRIENTE VIVA) ----------------
function tickAnim(): void {
  animTime += 0.004 + (params.corriente / 100) * 0.02;
  render();
  animHandle = requestAnimationFrame(tickAnim);
}
function syncAnim(): void {
  const shouldRun = params.vivo && mode !== 'retrato';
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
  retratoContraste: { name: 'CONTRASTE', desc: 'Refuerza la lectura de grabado' },
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

  // COLOR + VIVO
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
  const vivoToggle = makeToggle('CORRIENTE VIVA', params.vivo, (on) => {
    params.vivo = on; refreshJSON(); syncAnim();
  });
  panel.appendChild(group('Color · animación', [cwWrap, vivoToggle]));

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
    const loadBtn = el('button', 'chip', 'CARGAR IMAGEN') as HTMLButtonElement;
    loadBtn.addEventListener('click', () => fileInput.click());
    const invToggle = makeToggle('INVERTIR TONO', params.retratoInvert, (on) => {
      params.retratoInvert = on; refreshJSON(); render();
    });
    panel.appendChild(group('Retrato (foto → grabado)', [
      slider('retratoContraste'), invToggle, loadBtn,
      el('div', 'hint-inline', 'Arrastra una foto al lienzo. Los controles de FLUJO y LÍNEA también afectan al grabado.'),
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
  t.innerHTML = `<span class="box"></span><span>${label}</span>`;
  t.addEventListener('click', () => {
    const now = !t.classList.contains('on');
    t.classList.toggle('on', now);
    onChange(now);
  });
  return t;
}

// ---------------- acciones ----------------
function applyPreset(nombre: string): void {
  const pr = PRESETS.find((x) => x.nombre === nombre);
  if (!pr) return;
  params = { ...DEFAULTS, ...pr.params };
  setMode(pr.mode, false);
  engine = new FlowEngine(params.semilla);
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
document.getElementById('btn-png')!.addEventListener('click', () => exportPNG(mode, params, svg, canvas));
document.getElementById('btn-file')!.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) loadImageFile(f);
});

function loadImageFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => { portraitImg = img; if (mode !== 'retrato') setMode('retrato'); else render(); };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}

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
buildPanel();
render();
