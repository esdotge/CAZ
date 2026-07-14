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
  billete): las líneas nunca se funden. Controles: TRAZO (onda / zigzag / recta /
  **bucle** — trocoide que riza sobre sí misma en las sombras, el rizo de buril del
  grabador), **CAPAS DE TRAMA** (1–3: cruzada ondulada en medios tonos — malla de
  pasaporte — y tejido diagonal en sombras profundas), **CONTORNO** (campo de
  tangentes: las líneas giran siguiendo las isofotas — envuelven la mejilla en
  vez de sólo abombarse),
  **DETALLE** (realce de detalle fino — claridad de grabado), RELIEVE (las líneas
  se abomban siguiendo el volumen), EXPOSICIÓN y CONTRASTE. ENCUADRE escala la
  foto y arrastrando el lienzo la recolocas. Para grano de billete: CAUDAL 250–350.
  MOVIMIENTO también anima el grabado y permite exportarlo a WebM/GIF.
- **FORMA** — el patrón recortado dentro de un contenedor: círculo, «O de cauce»,
  píldora, arco, rombo, **LETRA** (hasta 4 caracteres — monogramas, «CAZ»…) o un
  `path` SVG pegado por ti. Toggle **BORDE** para contornear el contenedor con la
  tinta (sellos, insignias). Para iconos y assets de sistema.
- **SÍMBOLO** — la síntesis total del guilloché: pocas líneas, trazo grueso,
  dirección clara, para logos e iconos. Cinco arquetipos parametrizados y
  sembrados: **ONDA** (marca de bandera), **ABANICO** (creciente de arcos),
  **ALA** (haz radial), **ARCOS** (puerta anidada) y **CRUCE** (tejido con calado
  de papel). Controles: LÍNEAS, GROSOR, CURVA, ESCALA, GIRO y REMATE (romo/recto).
  El dado 🎲 explora variaciones de la misma plantilla; MOVIMIENTO anima la onda.

## Vocabulario de parámetros

| Control | Qué hace |
|---|---|
| **CURSO** | Dirección del campo de flujo |
| **CAUDAL** | Densidad — nº de líneas |
| **CAUCE** | Fuerza del canal: comprime y desvía |
| **CORRIENTE** | Turbulencia y velocidad del campo |
| **TORSIÓN** | Cizalla de fase entre líneas — la trama gira como tela en 3D |
| **CALADO** | Grosor de línea (y contraste del duotono en RETRATO) |
| **MAREA** | Amplitud de la ondulación |
| **ORILLAS** | Zona de calma en los bordes |
| **DERIVA** | Rotación de la 2ª trama para moiré, 0–360° (0 = sin moiré), con color propio |
| **SEMILLA** | Seed del PRNG (determinista, reproducible) |

## Reproducibilidad

Misma semilla + mismos parámetros = misma pieza, siempre (PRNG `splitmix32` +
simplex sembrado). Copia la **receta JSON** del panel para versionar recetas en el
brandbook; pégala y pulsa APLICAR para reconstruir la pieza exacta.

## Color

Tres tintas libres en hex — **FONDO** (papel), **TINTA** (trama principal y
grabado) y **DERIVA** (2ª trama del moiré) — cada una con recuadro de color y
campo hexadecimal sincronizados. Seis **gamas predefinidas** como punto de
partida (Tinta, Agua, Inverso, Noche, Señal, Arena). En v0 la elección es
libre; la restricción de paleta de marca llegará después. Los colores viajan
en la receta JSON.

## Lienzo

Cuatro formatos: **1080×1080**, **1920×1080**, **1080×1920** y **1080×1440**.
El formato va en la receta JSON; los presets no lo tocan.

## Export

- **SVG** vectorial limpio (paths, sin imagen embebida) — PATRÓN y FORMA.
- **PNG** al tamaño del lienzo elegido, a **×1, ×2 o ×4** — los tres modos
  (hasta 7680 px de lado en 16:9 ×4).
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
