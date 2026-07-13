# TORNO · Motor generativo de la identidad CAUCE

Herramienta interna de FLOC* para generar el sistema visual de la marca CAUCE.
Guilloché reinterpretado como **línea de canal**: familias de líneas paralelas que
fluyen, se comprimen y se encauzan. La máquina original era un torno; esta es el
torno reconstruido en código.

Web app de una sola pantalla — canvas grande, panel de controles, presets y export.
Sin backend, sin login, sin analytics.

## Arrancar

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Modos

- **PATRÓN** — generador de patrones vectoriales de línea (SVG). Trama de líneas
  paralelas deformadas por un campo de flujo, comprimidas por la geometría del canal
  (compresión dentro / apertura fuera es la firma del sistema) y con moiré opcional
  de una 2ª trama.
- **RETRATO** — foto → grabado de línea duotono (canvas 2D). Arrastra una imagen al
  lienzo; se procesa **en tu navegador, nada sube a servidor**.
- **FORMA** — el patrón recortado dentro de un contenedor (círculo, píldora, «O de
  cauce» o un `path` SVG pegado por ti). Para iconos, sellos y assets de sistema.

## Vocabulario de parámetros

| Control | Qué hace |
|---|---|
| **CURSO** | Dirección del campo de flujo |
| **CAUDAL** | Densidad — nº de líneas |
| **CAUCE** | Fuerza del canal: comprime y desvía |
| **CORRIENTE** | Turbulencia y velocidad del campo |
| **CALADO** | Grosor de línea (y contraste del duotono en RETRATO) |
| **MAREA** | Amplitud de la ondulación |
| **ORILLAS** | Zona de calma en los bordes |
| **DERIVA** | Rotación de la 2ª trama para moiré (0 = sin moiré) |
| **SEMILLA** | Seed del PRNG (determinista, reproducible) |

## Reproducibilidad

Misma semilla + mismos parámetros = misma pieza, siempre (PRNG `splitmix32` +
simplex sembrado). Copia la **receta JSON** del panel para versionar recetas en el
brandbook; pégala y pulsa APLICAR para reconstruir la pieza exacta.

## Export

- **SVG** vectorial limpio (paths, sin imagen embebida) — PATRÓN y FORMA.
- **PNG @2x** — los tres modos.
- **Receta JSON** — todos los parámetros + semilla + modo.

## Stack

Vite + TypeScript vanilla. SVG para PATRÓN/FORMA (export vectorial nativo),
canvas 2D para RETRATO (rendimiento). Ver [`docs/TODO.md`](docs/TODO.md) para el
alcance futuro.

---

*FLOC\* · CAUCE · TORNO v0 — la línea manda, y todo fluye hacia algún sitio.*
