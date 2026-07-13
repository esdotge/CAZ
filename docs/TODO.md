# TODO — fuera de alcance v0

Documentado, no construido (spec §7). Candidatos para v1+:

- **Cimática / Chladni** — placas vibrantes, patrones de nodos.
- **Export de vídeo** — CORRIENTE VIVA a WebM / secuencia de frames. Hoy la
  animación es sólo en pantalla (toggle CORRIENTE VIVA).
- **Plugin de Figma** — llevar el motor al lienzo de diseño.
- **Shaders WebGL** — para RETRATO de alta resolución sin cap y patrones densos
  a 60fps.
- **API** — generación headless de piezas desde receta JSON.
- **Modo batch** — generar familias/variaciones a partir de una receta base.

## Notas de implementación pendientes

- RETRATO cap interno a 2000px de muestreo (ya aplicado). WebGL levantaría el cap.
- CORRIENTE VIVA regenera la trama por frame en SVG; con CAUDAL alto conviene bajar
  densidad o migrar a canvas/WebGL antes de exportar vídeo.
