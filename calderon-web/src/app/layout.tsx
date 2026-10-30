import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/shared/query/provider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'IronTrack', template: '%s · IronTrack' },
  description: 'IronTrack · Gestión de flotas',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0f5fa8',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
