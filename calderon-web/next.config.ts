import type { NextConfig } from 'next';
import { DETALLES_VIEJOS, FICHAS } from './src/modules/core/fichas/tipos';
import { RUTAS_MOVIDAS } from './src/modules/core/navigation/rutas';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  /**
   * Sprint 1 · S1-06: las páginas de detalle viejas (/flota/camiones/12) abren su lista con la
   * ficha en el panel (/flota/camiones?ficha=camion:12). Solo números: /nuevo y /12/editar no
   * se tocan. Temporales hasta el Sprint 8, cuando pasan a permanentes y se borran las páginas.
   */
  async redirects() {
    return [
      ...DETALLES_VIEJOS.map(({ ruta, tipo }) => ({
        source: `${ruta}/:id(\\d+)`,
        destination: `${FICHAS[tipo].lista}?ficha=${tipo}::id`,
        permanent: false,
      })),
      // Sprint 5: rutas que se mudaron (por ejemplo, la Pizarra a /pizarra)
      ...RUTAS_MOVIDAS.map(({ desde, hasta }) => ({ source: desde, destination: hasta, permanent: false })),
    ];
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
