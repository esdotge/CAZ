# TODO — fuera de alcance v0

Documentado, no construido (spec §7). Candidatos para v1+:

- **Cimática / Chladni** — placas vibrantes, patrones de nodos.
- **Plugin de Figma** — llevar el motor al lienzo de diseño.
- **Shaders WebGL** — para RETRATO de alta resolución sin cap y patrones densos
  a 60fps.
- **API** — generación headless de piezas desde receta JSON.
- **Modo batch** — generar familias/variaciones a partir de una receta base.

## Hecho después de v0

- **Export de vídeo (WebM) y GIF** de CORRIENTE VIVA, con bucle sin costura.
  El GIF usa un encoder GIF89a propio (paleta duotono); el WebM graba en tiempo
  real con `MediaRecorder` + `captureStream`.
- **EXPOSICIÓN y CONTRASTE** de la foto en RETRATO.

## Notas de implementación pendientes

- RETRATO cap interno a 2000px de muestreo (ya aplicado). WebGL levantaría el cap.
- El WebM se graba en tiempo real: si la pestaña pasa a segundo plano durante la
  grabación, el reloj se ralentiza y el vídeo se alarga. En primer plano es exacto.
- CORRIENTE VIVA regenera la trama por frame; con CAUDAL alto y GIF conviene bajar
  densidad o tamaño para no inflar el archivo.
