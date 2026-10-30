import type { ReactNode } from 'react';
import { LogoIronTrack } from '@/shared/ui/marca/marca';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-fondo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <LogoIronTrack />
        </div>
        <div className="rounded-xl border border-borde bg-panel p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
