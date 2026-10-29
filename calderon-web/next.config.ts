import type { NextConfig } from 'next';
import { DETALLES_VIEJOS, FICHAS } from './src/modules/core/fichas/tipos';
import { RUTAS_MOVIDAS, RUTAS_NUEVAS } from './src/modules/core/navigation/rutas';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  /**
   * Sprint 1 · S1-06: las páginas de detalle viejas (/flota/camiones/12) abren su lista con la
   * ficha en el panel. Solo números: /nuevo y /12/editar no se tocan.
   * Sprint 8 (ítem 36): todas las redirecciones de rutas viejas son permanentes durante 6 meses
   * (hasta el 29/04/2027).
   */
  async redirects() {
    return [
      ...DETALLES_VIEJOS.map(({ ruta, tipo }) => ({
        source: `${ruta}/:id(\\d+)`,
        destination: `${FICHAS[tipo].lista}?ficha=${tipo}::id`,
        permanent: true,
      })),
      // Sprint 5 a 7: rutas que se mudaron (por ejemplo, la Pizarra a /pizarra)
      ...RUTAS_MOVIDAS.map(({ desde, hasta }) => ({ source: desde, destination: hasta, permanent: true })),
      // Sprint 8: Análisis y Ajustes (la dirección vieja exacta; /nuevo, /[id] y /editar siguen igual)
      ...RUTAS_NUEVAS.map(({ nueva, vieja }) => ({ source: vieja, destination: nueva, permanent: true })),
    ];
  },
  /** Sprint 8: la dirección nueva muestra por dentro la página de siempre (los permisos no cambian). */
  async rewrites() {
    return { beforeFiles: RUTAS_NUEVAS.map(({ nueva, vieja }) => ({ source: nueva, destination: vieja })), afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
