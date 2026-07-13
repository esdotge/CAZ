# TODO — fuera de alcance v0

Documentado, no construido (spec §7). Candidatos para v1+:

- **Cimática / Chladni** — placas vibrantes, patrones de nodos.
- **Plugin de Figma** — llevar el motor al lienzo de diseño.
- **Shaders WebGL** — para RETRATO de alta resolución sin cap y patrones densos
  a 60fps.
- **API** — generación headless de piezas desde receta JSON.
- **Modo batch** — generar familias/variaciones a partir de una receta base.

## Hecho después de v0

- **Export de vídeo (WebM) y GIF** de CORRIENTE VIVA, con bucle sin costura —
  en los tres modos, RETRATO incluido. El GIF usa un encoder GIF89a propio
  (paleta duotono); el WebM graba en tiempo real con `MediaRecorder`.
- **EXPOSICIÓN y CONTRASTE** de la foto en RETRATO.
- **Motor de RETRATO v2** (referencias: grabado de billete + halftoning AM por
  líneas): tono por anchura a espaciado constante con canal blanco garantizado,
  TRAZO onda/zigzag/recta, RELIEVE (warp de contorno por luminancia difuminada),
  TRAMA CRUZADA en sombras, dropout en luces, animación con fase sin costura.
- Renombrado TORNO → **CAZ**.
- **Lienzo seleccionable** (1:1, 16:9, 9:16, 3:4) con el motor consciente del
  tamaño; PNG a ×1/×2/×4 del lienzo.
- **Encuadre en RETRATO**: ENCUADRE (zoom 1–4×) + arrastre sobre el lienzo para
  recortar/recolocar la foto.
- **AJUSTE cubrir/entera** (cubrir por defecto: llena el lienzo sin aire, sin
  margen mínimo forzado; ORILLAS 0 = sangrado al borde) y **barrido rotado**:
  CURSO cubre todo el lienzo a cualquier ángulo (antes las diagonales dejaban
  esquinas vacías); la trama cruzada gira con él (perpendicular).

## Notas de implementación pendientes

- RETRATO cap interno a 2000px de muestreo (ya aplicado). WebGL levantaría el cap.
- El WebM se graba en tiempo real: si la pestaña pasa a segundo plano durante la
  grabación, el reloj se ralentiza y el vídeo se alarga. En primer plano es exacto.
- CORRIENTE VIVA regenera la trama por frame; con CAUDAL alto y GIF conviene bajar
  densidad o tamaño para no inflar el archivo.
