import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-fondo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="grid size-10 place-items-center rounded-lg bg-marca font-bold text-white">IT</span>
          <span className="text-lg font-semibold text-tinta">IronTrack</span>
        </div>
        <div className="rounded-xl border border-borde bg-panel p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
