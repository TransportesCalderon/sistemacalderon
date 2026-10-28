/** El intérprete de rutas que trae Next (sin tipos propios); lo usa tests/redirecciones.test.ts. */
declare module 'next/dist/compiled/path-to-regexp' {
  export function pathToRegexp(ruta: string): RegExp;
}
