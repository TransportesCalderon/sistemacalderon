import type { ReactNode } from 'react';
import { ETIQUETA_DATO } from '@/modules/anomalias/domain/alerta.types';
import { BotonImprimir } from '@/modules/combustible/components/cierres/boton-imprimir';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { ETIQUETA_TIPO_ACTA, EVIDENCIA_OCULTA, type Acta } from '../domain/acta.types';

/** Documento del chofer para el acta: solo si el usuario puede verlo (el acceso queda registrado). */
export interface DocumentoActa {
  rut: string | null;
  documento: string | null;
}

/** Fecha larga en la zona: «21 de octubre de 2026». */
function fechaLarga(iso: string, zona: string) {
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: zona, day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Migración 122 · Acta de infracción con el formato de nota de la empresa (como el acta de daños de
 * PXCG46, 21/10/2026), sin título ni nombre de la empresa: fecha, «Referencia», el texto de constancia con la unidad y el conductor, qué pasó,
 * el monto o que se dará a conocer, las fotos, el descargo y las firmas. Una hoja A4 para imprimir o PDF.
 * El RUT y el documento salen solo si el usuario puede ver el documento del chofer; si no, quedan para
 * completar a mano.
 */
export function ActaImprimible({
  a,
  zonaHoraria,
  documento,
  fotos = [],
}: {
  a: Acta;
  zonaHoraria: string;
  documento?: DocumentoActa | null;
  fotos?: { url: string; nombre: string | null }[];
}) {
  const datos = Object.entries(a.evidencia).filter(([k, v]) => !EVIDENCIA_OCULTA.has(k) && v !== null && typeof v !== 'object');
  const importe = (v: number | null) => (v === null ? '—' : `${a.moneda ?? ''} ${formatearNumero(v, 0)}`.trim());
  const mes = a.periodoDescuento ? new Date(`${a.periodoDescuento}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : '';
  const linea = '____________________';
  const danos = a.tipo === 'danos_unidad';
  const hecho =
    a.tipo === 'danos_unidad'
      ? 'presenta los siguientes daños:'
      : a.tipo === 'consumo_excesivo'
        ? 'registró un consumo de combustible por encima del objetivo del viaje, según el siguiente detalle:'
        : 'circuló por encima de la velocidad permitida, según el siguiente detalle:';

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-6 text-[13px] leading-relaxed text-black print:max-w-none print:p-0">
      <style>{'@page { size: A4; margin: 16mm 18mm; } @media print { body { background: white; } }'}</style>
      <div className="mb-4 flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-neutral-600">Para el PDF, elegí «Guardar como PDF» en la ventana de impresión.</p>
        <BotonImprimir />
      </div>

      <div className="flex items-start justify-between">
        <p className="text-[11px] text-neutral-600">
          Acta N.º <span className="font-mono font-semibold text-black">{a.numero}</span>
        </p>
        <p>{fechaLarga(a.fecha, zonaHoraria)}</p>
      </div>

      {a.estado === 'anulada' && (
        <p className="mt-2 border-2 border-red-600 p-1 text-center font-bold text-red-700 uppercase">
          Anulada el {formatearFechaHora(a.anuladaEn, zonaHoraria)} · {a.motivoAnulacion}
        </p>
      )}

      <p className="mt-4 border-b-2 border-black pb-0.5">Referencia: {ETIQUETA_TIPO_ACTA[a.tipo]}</p>

      <p className="mt-4 indent-12">
        En el día de la fecha indicada, se deja constancia que la unidad PATENTE: <b>{a.patente ?? linea}</b>, a cargo del conductor{' '}
        <b className="uppercase">{a.chofer}</b>
        {a.legajo && <> (legajo {a.legajo})</>}, número de RUT / RUT provisorio: <b>{documento?.rut ?? linea}</b>
        {' '}DNI / documento: <b>{documento?.documento ?? linea}</b>
        {a.lugar && <>, en {a.lugar}</>}, {hecho}
      </p>
      <p className="mt-1 whitespace-pre-line">{a.descripcion}</p>

      {datos.length > 0 && (
        <dl className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1 rounded border border-neutral-300 p-2">
          {datos.map(([k, v]) => (
            <Dato key={k} etiqueta={ETIQUETA_DATO[k] ?? (k === 'valor_observado' ? 'Valor medido' : k === 'valor_esperado' ? 'Referencia' : k)}>
              {typeof v === 'number' ? formatearNumero(v, 1) : String(v)}
            </Dato>
          ))}
        </dl>
      )}

      {danos && a.monto === null ? (
        <p className="mt-4">
          Los motivos o causas que ocasionaron tal daño a la unidad son desconocidos hasta el momento en que se realiza esta acta, como así también el valor de
          la reparación, el cual se dará a conocer al momento de la inspección realizada por personal idóneo en la tarea.
        </p>
      ) : a.monto !== null ? (
        <p className="mt-4">
          El monto del {danos ? 'daño' : 'perjuicio'} es de <b>{importe(a.monto)}</b>.
        </p>
      ) : null}

      <p className="mt-3">
        {a.descontar
          ? `Se deja constancia expresa de que los costos correrán por cuenta del conductor: se descuentan ${importe(a.importeDescuento)} en la liquidación de ${mes}.`
          : danos && a.monto === null
            ? 'Se deja constancia expresa de que los costos correrán por cuenta del autor de los daños.'
            : 'Por el momento no se descuenta al conductor.'}
      </p>

      {fotos.length > 0 && (
        <section className="mt-5 grid grid-cols-2 gap-2 break-inside-avoid">
          {fotos.slice(0, 6).map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- foto firmada del bucket, temporal
            <img key={i} src={f.url} alt={f.nombre ?? `Foto ${i + 1}`} className="h-56 w-full border border-neutral-300 object-cover" />
          ))}
        </section>
      )}
      {a.fotos.length > fotos.length && (
        <p className="mt-1 text-[11px] text-neutral-600">Hay {a.fotos.length} foto(s) como prueba en el sistema.</p>
      )}

      <section className="mt-6 break-inside-avoid">
        <p className="font-semibold">Descargo del conductor:</p>
        {a.descargo ? <p className="mt-1">{a.descargo}</p> : <div className="mt-1 h-20 border border-neutral-400" />}
      </section>

      <section className="mt-14 grid grid-cols-2 gap-12 break-inside-avoid">
        <Firma texto={`Firma del conductor · ${a.chofer}`} />
        <Firma texto="Firma y aclaración por la empresa" />
      </section>
      <p className="mt-6 text-[10px] text-neutral-600">
        La firma del conductor deja constancia de que fue notificado del acta. Si se niega a firmar, se deja constancia con la firma de un testigo.
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
