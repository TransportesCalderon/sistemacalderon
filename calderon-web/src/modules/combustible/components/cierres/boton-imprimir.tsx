'use client';

import { Printer } from 'lucide-react';
import { BOTON_PRIMARIO } from '@/shared/ui/clases';

/** Abre la ventana de impresión del navegador (desde ahí también se guarda como PDF). */
export function BotonImprimir() {
  return (
    <button type="button" className={BOTON_PRIMARIO} onClick={() => window.print()}>
      <Printer className="size-4" /> Imprimir o guardar PDF
    </button>
  );
}
