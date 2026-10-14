/**
 * Clases de botones y superficies reutilizables (Tailwind), sobre los tokens de globals.css.
 * Se usan con <button>, <Link> o <a> indistintamente.
 */
export const BOTON_PRIMARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-marca px-4 text-sm font-medium text-white hover:bg-marca/90 disabled:cursor-not-allowed disabled:opacity-70';

export const BOTON_SECUNDARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-borde bg-panel px-4 text-sm font-medium text-tinta hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60';

export const BOTON_ICONO =
  'inline-flex size-9 items-center justify-center rounded-md border border-borde bg-panel text-tinta hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40';

export const TARJETA = 'rounded-xl border border-borde bg-panel';

/** Control compacto para barras de filtros (los formularios usan <Campo>). */
export const CONTROL_FILTRO =
  'h-9 rounded-md border border-borde bg-panel px-2.5 text-sm text-tinta outline-none focus:border-marca focus:ring-2 focus:ring-marca/20';
