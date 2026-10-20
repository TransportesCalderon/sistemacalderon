/** Grupos de pestañas: pantallas que comparten una sola entrada del menú. */
export const PESTANAS_REVISAR = [
  { href: '/combustible/observadas', etiqueta: 'Por validar' },
  { href: '/combustible/sin-documento', etiqueta: 'Sin ticket' },
] as const;

export const PESTANAS_VIAJES = [
  { href: '/combustible/viajes', etiqueta: 'Viajes' },
  { href: '/combustible/cierres', etiqueta: 'Cierres' },
] as const;

export const PESTANAS_CONSUMO = [
  { href: '/combustible/costo-medio', etiqueta: 'Por camión' },
  { href: '/combustible/conciliacion', etiqueta: 'Cargado vs. motor' },
] as const;
