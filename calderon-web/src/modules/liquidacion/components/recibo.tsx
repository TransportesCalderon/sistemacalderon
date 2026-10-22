import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { nombrePeriodo } from '@/modules/chofer/domain/chofer.types';
import { pesos, TIPOS_RENGLON, TITULO_TIPO, type Liquidacion } from '../domain/liquidacion.types';

/**
 * Detalle de la liquidación como recibo: datos del chofer, renglones agrupados por tipo y neto.
 * Sirve en pantalla y para imprimir (sin estado ni interacción).
 */
export function Recibo({ l, compacto = false }: { l: Liquidacion; compacto?: boolean }) {
  const subtotal = { remunerativo: l.remunerativo, no_remunerativo: l.noRemunerativo, descuento: l.descuentos } as const;
  const legal = l.legal && l.legal.totalHaberes > 0 ? l.legal : null;
  return (
    <div className={cn('space-y-4 text-sm text-tinta', !compacto && 'print:text-black')}>
      {!compacto && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde pb-3">
          <div>
            <p className="text-xs text-tinta-suave uppercase">Transportes Calderón</p>
            <h1 className="text-xl font-semibold">Liquidación {l.numero}</h1>
            <p className="text-tinta-suave">
              Período {nombrePeriodo(l.periodo)} · del {formatearFechaDia(l.desde)} al {formatearFechaDia(l.hasta)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{l.chofer}</p>
            {l.legajo && <p className="text-tinta-suave">Legajo {l.legajo}</p>}
            {l.documento && <p className="text-tinta-suave">{l.documento}</p>}
          </div>
        </header>
      )}
      {TIPOS_RENGLON.map((t) => {
        const rs = l.renglones.filter((r) => r.tipo === t);
        if (rs.length === 0) return null;
        return (
          <section key={t}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-tinta-suave uppercase">{TITULO_TIPO[t]}</h3>
            <table className="w-full">
              <tbody className="divide-y divide-borde">
                {rs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3">{r.descripcion}</td>
                    <td className={cn('py-1.5 text-right tabular-nums whitespace-nowrap', t === 'descuento' && 'text-error')}>
                      {t === 'descuento' ? '− ' : ''}
                      {pesos(r.importe)}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-1.5 pr-3 text-tinta-suave">Subtotal</td>
                  <td className="py-1.5 text-right tabular-nums">{pesos(subtotal[t])}</td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
      {legal ? (
        <>
          <div className="flex items-center justify-between px-4 text-sm">
            <span>Neto de la planilla</span>
            <span className="tabular-nums">{pesos(l.neto, l.moneda)}</span>
          </div>
          <div className="flex items-center justify-between px-4 text-sm text-error">
            <span>Descuentos legales (AFP, salud, cesantía, impuesto)</span>
            <span className="tabular-nums">− {pesos(legal.totalDescuentos)}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-marca-suave px-4 py-3 text-base font-semibold text-marca print:bg-transparent print:px-0">
            <span>A cobrar</span>
            <span className="tabular-nums">{pesos(legal.aPagar, l.moneda)}</span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-marca-suave px-4 py-3 text-base font-semibold text-marca print:bg-transparent print:px-0">
          <span>Neto a cobrar</span>
          <span className="tabular-nums">{pesos(l.neto, l.moneda)}</span>
        </div>
      )}
      {!compacto && (
        <footer className="space-y-1 text-xs text-tinta-suave">
          {l.aprobadaEn && <p>Aprobada el {formatearFechaDia(l.aprobadaEn.slice(0, 10))}{l.aprobadaPor && ` por ${l.aprobadaPor}`}.</p>}
          {l.pagadaEn && <p>Pagada el {formatearFechaDia(l.pagadaEn)}{l.formaPago && ` · ${l.formaPago}`}.</p>}
          <div className="grid grid-cols-2 gap-10 pt-12">
            <p className="border-t border-tinta-suave pt-1 text-center">Firma del chofer</p>
            <p className="border-t border-tinta-suave pt-1 text-center">Por la empresa</p>
          </div>
        </footer>
      )}
    </div>
  );
}
