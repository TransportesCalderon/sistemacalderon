import type { ReactNode } from 'react';
import { ETIQUETA_DATO } from '@/modules/anomalias/domain/alerta.types';
import { BotonImprimir } from '@/modules/combustible/components/cierres/boton-imprimir';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { ETIQUETA_TIPO_ACTA, EVIDENCIA_OCULTA, type Acta } from '../domain/acta.types';

/**
 * Migración 122 · Acta de infracción en una hoja A4 (imprimir o guardar como PDF), para que la firme el
 * chofer. Datos del hecho, lo que midió la telemetría, el monto y si se descuenta, lugar para el
 * descargo y las firmas. No lleva datos sensibles (ni RUT ni documento).
 */
export function ActaImprimible({ a, zonaHoraria }: { a: Acta; zonaHoraria: string }) {
  const fecha = (v: string | null) => formatearFechaHora(v, zonaHoraria);
  const datos = Object.entries(a.evidencia).filter(([k, v]) => !EVIDENCIA_OCULTA.has(k) && v !== null && typeof v !== 'object');
  const importe = (v: number | null) => (v === null ? '—' : `${a.moneda ?? ''} ${formatearNumero(v, 0)}`.trim());
  const mes = a.periodoDescuento ? new Date(`${a.periodoDescuento}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : '';

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-6 text-[12px] leading-snug text-black print:max-w-none print:p-0">
      <style>{'@page { size: A4; margin: 14mm; } @media print { body { background: white; } }'}</style>
      <div className="mb-4 flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-neutral-600">Para el PDF, elegí «Guardar como PDF» en la ventana de impresión.</p>
        <BotonImprimir />
      </div>

      <header className="flex items-end justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-[10px] tracking-wide text-neutral-600 uppercase">Transportes Calderón</p>
          <h1 className="text-xl leading-none font-bold">Acta de infracción</h1>
          <p className="mt-1 text-sm font-semibold">{ETIQUETA_TIPO_ACTA[a.tipo]}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg leading-none font-bold">{a.numero}</p>
          <p className="text-[10px] text-neutral-600">Emitida {fecha(a.creadoEn)}</p>
        </div>
      </header>

      {a.estado === 'anulada' && (
        <p className="mt-2 border-2 border-red-600 p-1 text-center font-bold text-red-700 uppercase">
          Anulada el {fecha(a.anuladaEn)} · {a.motivoAnulacion}
        </p>
      )}

      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
        <Dato etiqueta="Chofer">
          {a.chofer}
          {a.legajo && <span className="font-normal text-neutral-600"> · legajo {a.legajo}</span>}
        </Dato>
        <Dato etiqueta="Camión">{a.patente ?? '—'}</Dato>
        <Dato etiqueta="Fecha y hora del hecho">{fecha(a.fecha)}</Dato>
        <Dato etiqueta="Lugar">{a.lugar ?? '—'}</Dato>
      </section>

      <section className="mt-4">
        <h2 className="border-b border-black text-[11px] font-bold uppercase">Qué pasó</h2>
        <p className="mt-1 whitespace-pre-line">{a.descripcion}</p>
      </section>

      {datos.length > 0 && (
        <section className="mt-4">
          <h2 className="border-b border-black text-[11px] font-bold uppercase">Lo que registró la telemetría{a.alerta ? ` (${a.alerta})` : ''}</h2>
          <dl className="mt-1 grid grid-cols-3 gap-x-6 gap-y-1">
            {datos.map(([k, v]) => (
              <Dato key={k} etiqueta={ETIQUETA_DATO[k] ?? (k === 'valor_observado' ? 'Valor medido' : k === 'valor_esperado' ? 'Referencia' : k)}>
                {typeof v === 'number' ? formatearNumero(v, 1) : String(v)}
              </Dato>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-4">
        <h2 className="border-b border-black text-[11px] font-bold uppercase">Monto</h2>
        <p className="mt-1">
          {a.monto === null ? 'Sin monto.' : `Monto del ${a.tipo === 'danos_unidad' ? 'daño' : 'perjuicio'}: ${importe(a.monto)}.`}{' '}
          {a.descontar ? `Se descuentan ${importe(a.importeDescuento)} en la liquidación de ${mes}.` : 'No se descuenta al chofer.'}
        </p>
        {a.fotos.length > 0 && <p className="mt-1 text-neutral-600">Se adjuntan {a.fotos.length} foto(s) como prueba (en el sistema).</p>}
      </section>

      <section className="mt-4 break-inside-avoid">
        <h2 className="border-b border-black text-[11px] font-bold uppercase">Descargo del chofer</h2>
        {a.descargo ? <p className="mt-1">{a.descargo}</p> : <div className="mt-1 h-24 border border-neutral-400" />}
      </section>

      <section className="mt-12 grid grid-cols-2 gap-12 break-inside-avoid">
        <Firma texto={`Firma del chofer · ${a.chofer}`} />
        <Firma texto="Firma y aclaración por la empresa" />
      </section>
      <p className="mt-6 text-[10px] text-neutral-600">
        La firma del chofer deja constancia de que fue notificado del acta. Si se niega a firmar, se deja constancia con la firma de un testigo.
      </p>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] text-neutral-600 uppercase">{etiqueta}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

function Firma({ texto }: { texto: string }) {
  return (
    <div className="border-t border-black pt-1 text-center text-[11px]">
      {texto}
      <p className="mt-6 text-left text-[10px] text-neutral-600">Fecha: ____ / ____ / ________</p>
    </div>
  );
}
