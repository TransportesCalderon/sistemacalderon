import Link from 'next/link';
import { BotonImprimir } from '@/modules/combustible/components/cierres/boton-imprimir';
import type { Liquidacion } from '../domain/liquidacion.types';
import { PapelesSueldo } from './papeles-sueldo';

/**
 * Los papeles que firma el chofer, uno por hoja: liquidación de sueldo, planilla y comprobante de egreso.
 * Un borrador se ve solo como vista previa (no se entrega).
 */
export function ReciboImprimible({ l, volver }: { l: Liquidacion; volver: string }) {
  const faltan = l.legal?.faltan ?? [];
  const tieneLegal = !!l.legal && (l.legal.totalHaberes > 0 || l.legal.congelado);
  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-black print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={volver} className="text-sm text-marca hover:underline">
          Volver
        </Link>
        <BotonImprimir />
      </div>
      {l.estado === 'borrador' && (
        <div className="space-y-1 rounded-md border border-alerta px-3 py-2 text-sm text-alerta print:hidden">
          <p className="font-medium">Borrador: todavía no está aprobada. No la entregues.</p>
          {faltan.map((f) => (
            <p key={f}>• {f}</p>
          ))}
        </div>
      )}
      {l.estado === 'borrador' && <p className="hidden text-center text-lg font-bold print:block">BORRADOR — NO VÁLIDO</p>}
      {l.estado === 'anulada' && <p className="rounded-md border border-error px-3 py-2 text-sm text-error">Anulada: {l.motivo}</p>}
      <PapelesSueldo l={l} legal={tieneLegal ? l.legal : null} />
    </main>
  );
}
