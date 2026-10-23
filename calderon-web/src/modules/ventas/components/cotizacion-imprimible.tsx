import Link from 'next/link';
import { BotonImprimir } from '@/modules/combustible/components/cierres/boton-imprimir';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { usd, type Cotizacion } from '../domain/ventas.types';

const OPERACION: Record<string, string> = { exportacion: 'Exportación', importacion: 'Importación', nacional: 'Nacional', round_trip: 'Round trip' };
const celda = 'border border-black px-2 py-1 align-top';
const UNIDAD: Record<string, string> = { viaje: 'viaje', tonelada: 'tonelada', kilo: 'kilo', por_dia: 'día', por_hora: 'hora' };
const unidadTexto = (u: string, n: number) => (UNIDAD[u] ? `${UNIDAD[u]}${n === 1 ? '' : 's'}` : '');

/** La cotización para mandar al cliente (PDF desde «Imprimir»). No muestra costos ni márgenes. */
export function CotizacionImprimible({ c }: { c: Cotizacion }) {
  const e = c.empresaDatos;
  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-[12px] text-black print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/ventas/cotizaciones/${c.id}`} className="text-sm text-marca hover:underline">
          Volver
        </Link>
        <BotonImprimir />
      </div>
      {c.estado === 'borrador' && (
        <p className="rounded-md border border-alerta px-3 py-2 text-sm text-alerta print:hidden">Borrador: guardala y marcala como enviada cuando la mandes.</p>
      )}

      <header className="flex items-start justify-between gap-4 border-b border-black pb-3">
        <div className="leading-snug">
          <p className="text-base font-bold uppercase">{e.razonSocial ?? 'Transportes Calderón'}</p>
          {e.direccion && <p>{e.direccion}</p>}
          {e.comuna && <p>{e.comuna}</p>}
          {e.rut && <p>RUT: {e.rut}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">Cotización</h1>
          <p className="text-sm font-semibold">{c.numero}</p>
          <p>Fecha: {formatearFechaDia(c.fecha)}</p>
          <p>Válida hasta: {formatearFechaDia(c.vence)}</p>
        </div>
      </header>

      <section>
        <p>
          <b>Para:</b> {c.empresa}
        </p>
        {c.contacto && (
          <p>
            <b>Atención:</b> {c.contacto}
            {c.contactoEmail && ` · ${c.contactoEmail}`}
          </p>
        )}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100 text-left">
            <th className={celda}>Servicio</th>
            <th className={`${celda} text-right`}>Cantidad</th>
            <th className={`${celda} text-right`}>Precio (USD)</th>
            <th className={`${celda} text-right`}>Importe (USD)</th>
          </tr>
        </thead>
        <tbody>
          {c.renglones.map((r) => (
            <tr key={r.id}>
              <td className={celda}>
                <p className="font-medium">{r.tipo === 'flete' ? (r.linea ?? r.descripcion) : r.descripcion}</p>
                {r.tipo === 'flete' && (
                  <p className="text-neutral-600">
                    {[r.tipoOperacion && OPERACION[r.tipoOperacion], r.tipoContenedor && `Contenedor ${r.tipoContenedor}`, r.descripcion !== `Flete ${r.linea}` && r.descripcion]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </td>
              <td className={`${celda} text-right tabular-nums whitespace-nowrap`}>
                {r.cantidad.toLocaleString('es-AR')} {unidadTexto(r.unidad, r.cantidad)}
              </td>
              <td className={`${celda} text-right tabular-nums whitespace-nowrap`}>
                {r.unidad === 'porcentaje' ? `${r.precioUsd.toLocaleString('es-AR')} % del flete` : usd(r.precioUsd, false)}
              </td>
              <td className={`${celda} text-right tabular-nums`}>{usd(r.importeUsd, false)}</td>
            </tr>
          ))}
          <tr className="bg-neutral-100 text-sm font-bold">
            <td className={celda} colSpan={3}>
              Total
            </td>
            <td className={`${celda} text-right tabular-nums whitespace-nowrap`}>{usd(c.totalUsd)}</td>
          </tr>
        </tbody>
      </table>

      {c.condiciones && (
        <section className="space-y-1">
          <p className="font-semibold">Condiciones</p>
          <p className="whitespace-pre-line">{c.condiciones}</p>
        </section>
      )}
      <footer className="pt-6 text-neutral-600">
        <p>Precios en dólares estadounidenses (USD).{c.creadoPor && ` Cotizó: ${c.creadoPor}.`}</p>
      </footer>
    </main>
  );
}
