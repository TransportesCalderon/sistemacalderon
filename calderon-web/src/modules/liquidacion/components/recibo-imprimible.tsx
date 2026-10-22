import Link from 'next/link';
import { BotonImprimir } from '@/modules/combustible/components/cierres/boton-imprimir';
import type { Liquidacion } from '../domain/liquidacion.types';
import { Recibo } from './recibo';

/** Hoja del recibo: borrador solo como vista previa (no se entrega). */
export function ReciboImprimible({ l, volver }: { l: Liquidacion; volver: string }) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 bg-white p-8 text-black">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={volver} className="text-sm text-marca hover:underline">
          Volver
        </Link>
        <BotonImprimir />
      </div>
      {l.estado === 'borrador' && (
        <p className="rounded-md border border-alerta px-3 py-2 text-sm text-alerta">Borrador: todavía no está aprobada. No la entregues.</p>
      )}
      {l.estado === 'anulada' && <p className="rounded-md border border-error px-3 py-2 text-sm text-error">Anulada: {l.motivo}</p>}
      <Recibo l={l} />
    </main>
  );
}
