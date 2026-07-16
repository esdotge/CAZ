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
  lienzo; se procesa **en tu navegador, nada sube a servidor**. La pluma es casi constante (guilloché
  de torno): el tono lo dibujan la geometría (amplitud de onda) y la densidad
  (interlíneas en sombra), con canal blanco garantizado — las líneas nunca se funden. Controles: TRAZO (onda / zigzag / recta /
  **bucle** — trocoide que riza sobre sí misma en las sombras, el rizo de buril del
  grabador — / **guiones** — el tono es el ritmo de interrupción: continuo en
  sombra, punteado en luz, a tresbolillo entre líneas), **GEOMETRÍA** (paralela
  o **espiral** de Arquímedes desde el centro — una vuelta por paso de trama;
  arrastrando la foto colocas el ojo del remolino), **CAPAS DE TRAMA** (1–3: interlíneas paralelas a medio y cuarto de
  paso que densifican las sombras — misma dirección y misma fase, nunca tejido:
  el torno densifica, no cruza), **CONTORNO** (campo de
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
| **ORILLAS** | Zona de calma en los bordes (funde el grosor) |
| **RIBERA** | Repulsión del borde: las líneas se doblan hacia dentro y dejan calas de papel |
| **DERIVA** | Rotación de la 2ª trama para moiré, 0–360° (0 = sin moiré), con color propio |
| **SEMILLA** | Seed del PRNG (determinista, reproducible) |

## Flujo de trabajo

- **Deshacer / rehacer**: Ctrl+Z y Ctrl+Shift+Z (o Ctrl+Y). Cada gesto —un
  slider, un preset, un cambio de modo— es un paso de historial (50 niveles).
- **Mis recetas**: guarda el estado completo (modo, parámetros, colores,
  lienzo) con un nombre propio; persiste en el navegador (localStorage).
  Mismo nombre = sobrescribe; × borra. Un clic la aplica desde cualquier modo.

## Reproducibilidad

Misma semilla + mismos parámetros = misma pieza, siempre (PRNG `splitmix32` +
simplex sembrado). Copia la **receta JSON** del panel para versionar recetas en el
brandbook; pégala y pulsa APLICAR para reconstruir la pieza exacta.

## Color

Paleta de marca CAUCE:

| Token | Hex |
|---|---|
| Tinta | `#262929` |
| Papel | `#F0F6F5` |
| Lima (acento) | `#FBFD9D` |
| Bruma (secundario) | `#C2CFCF` |

Tres tintas en hex — **FONDO** (papel), **TINTA** (trama principal y grabado)
y **DERIVA** (2ª trama del moiré) — cada una con recuadro de color y campo
hexadecimal sincronizados. Catorce **gamas predefinidas** construidas sólo
con los cuatro colores de marca, agrupadas por fondo — sobre papel: **Tinta**
(base), **Señal** (moiré lima), **Vado** (moiré bruma, quieto) y **Niebla**
(tonal suave, para fondos); sobre tinta: **Noche**, **Espuma** (chispa lima),
**Lima**, **Faro** (lima + bruma) y **Poza** (agua honda); sobre bruma:
**Bruma** y **Marea** (acento lima); sobre lima: **Contraluz**, **Cal**
(velado) y **Junco** (el papel talla). El campo hex sigue admitiendo
cualquier color para explorar; los colores viajan en la receta JSON.

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

*FLOC\* · CAUCE · CAZ v1.1 — la línea manda, y todo fluye hacia algún sitio.*
