# CAZ · Motor generativo de la identidad CAUCE

Herramienta interna de FLOC* para generar el sistema visual de la marca CAUCE.
Guilloché reinterpretado como **línea de canal**: familias de líneas paralelas que
fluyen, se comprimen y se encauzan. La máquina original del guilloché era un torno;
CAZ es ese torno reconstruido en código.

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
  lienzo; se procesa **en tu navegador, nada sube a servidor**. El tono se codifica
  en la anchura de línea a espaciado constante (halftoning AM, como el grabado de
  billete): las líneas nunca se funden. Controles: TRAZO (onda / zigzag / recta),
  RELIEVE (las líneas se abomban siguiendo el volumen de la imagen), TRAMA CRUZADA
  (2ª trama en sombras profundas), EXPOSICIÓN y CONTRASTE. CORRIENTE VIVA también
  anima el grabado y permite exportarlo a WebM/GIF.
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
- **Vídeo WebM y GIF** — con CORRIENTE VIVA activa, en los **tres modos** (también
  RETRATO). El bucle es **sin costura**: el campo traza un círculo en el espacio de
  ruido y la onda del grabado viaja una longitud de onda entera, así el último
  fotograma coincide con el primero. El GIF se codifica en cliente (encoder GIF89a
  propio, paleta duotono); el WebM se graba en tiempo real vía `MediaRecorder`.

## Stack

Vite + TypeScript vanilla. SVG para PATRÓN/FORMA (export vectorial nativo),
canvas 2D para RETRATO (rendimiento). Ver [`docs/TODO.md`](docs/TODO.md) para el
alcance futuro.

---

*FLOC\* · CAUCE · CAZ v0 — la línea manda, y todo fluye hacia algún sitio.*
