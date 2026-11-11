import type { MetadataRoute } from 'next';

/** Migración 238: se puede instalar en el teléfono («Agregar a pantalla de inicio») para recibir alertas. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IronTrack',
    short_name: 'IronTrack',
    description: 'IronTrack · Gestión de flotas',
    start_url: '/hoy',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f5fa8',
    lang: 'es-AR',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
