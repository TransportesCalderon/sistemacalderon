import type { ReactNode } from 'react';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conSigno, formatearNumero } from '@/shared/lib/numeros';
import type { CierreViaje } from '../../domain/cierre.types';
import { BotonImprimir } from './boton-imprimir';

/**
 * Acta del cierre de viaje para imprimir o guardar como PDF (desde el navegador).
 * Muestra lo que la base congeló al aprobar: no calcula nada. No incluye datos sensibles
 * (test de alcohol). La tolerancia es la que se usó al aprobar, aunque después cambie el parámetro.
 */
export interface DatosActa {
  cierre: CierreViaje;
  camion: string;
  chofer: string | null;
  aprobador: string | null;
  zonaHoraria: string;
}

const litros = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${formatearNumero(v)} L`);

export function ActaCierre({ cierre, camion, chofer, aprobador, zonaHoraria }: DatosActa) {
  const r = cierre.congelado;
  const c = r?.camion;
  const anulado = cierre.estado === 'anulado';

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-8 text-[13px] leading-snug text-black print:p-0">
      <style>{'@page { size: A4; margin: 15mm; } @media print { body { background: white; } }'}</style>

      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-neutral-600">Vista para imprimir. Para el PDF, elegí «Guardar como PDF» en la ventana de impresión.</p>
        <BotonImprimir />
      </div>

      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-xs tracking-wide text-neutral-600 uppercase">Transportes Calderón · Combustible</p>
          <h1 className="text-xl font-bold">Acta de cierre de viaje</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-600">N.º de cierre</p>
          <p className="font-mono text-lg font-bold">{cierre.numero}</p>
        </div>
      </header>

      {anulado && (
        <p className="mt-4 border-2 border-black p-2 text-center font-bold tracking-wide uppercase">
          Cierre anulado el {formatearFechaHora(cierre.anuladoEn, zonaHoraria)}
          {cierre.motivoAnulacion ? ` · ${cierre.motivoAnulacion}` : ''}
        </p>
      )}

      <Bloque titulo="Viaje">
        <Fila etiqueta="Camión">{camion}</Fila>
        <Fila etiqueta="Chofer responsable">{chofer ?? 'Sin asignar'}</Fila>
        <Fila etiqueta="Período">
          {formatearFechaHora(cierre.salidaTs, zonaHoraria)} → {formatearFechaHora(cierre.llegadaTs, zonaHoraria)}
        </Fila>
        {r?.lineaViaje && <Fila etiqueta="Línea">{r.lineaViaje}</Fila>}
      </Bloque>

      <Bloque titulo="Combustible del camión">
        {r?.versionCalculo === 1 && r.anterior ? (
          <>
            <Fila etiqueta="Cálculo">Anterior a la unificación (tractor y mochila por separado)</Fila>
            <Fila etiqueta="Diferencia tractor">{r.anterior.tractorDiferenciaL === null ? '—' : `${conSigno(r.anterior.tractorDiferenciaL)} L`}</Fila>
            <Fila etiqueta="Diferencia mochila">{r.anterior.mochilaDiferenciaL === null ? '—' : `${conSigno(r.anterior.mochilaDiferenciaL)} L`}</Fila>
          </>
        ) : (
          <>
            <Fila etiqueta="Libro">{litros(c?.libroL)}</Fila>
            <Fila etiqueta="Medido">
              {litros(c?.consumoPlataformaL)}
              {c?.fuenteConsumo && <span className="text-neutral-600"> · fuente: {c.fuenteConsumo}</span>}
            </Fila>
            <Fila etiqueta="Diferencia" fuerte>
              {c?.diferenciaL === null || c?.diferenciaL === undefined ? '—' : `${conSigno(c.diferenciaL)} L`}
            </Fila>
            <Fila etiqueta="Tolerancia">± {litros(c?.toleranciaL)}</Fila>
          </>
        )}
        {c && c.noImputableL !== null && c.noImputableL > 0 && (
          <Fila etiqueta="Litros justificados">
            {litros(c.noImputableL)}
            {cierre.datos.noImputableMotivo && <span className="text-neutral-600"> · {cierre.datos.noImputableMotivo}</span>}
          </Fila>
        )}
        <Fila etiqueta="A descontar al chofer" fuerte>
          {litros(r?.imputableTotalL)}
        </Fila>
      </Bloque>

      <Bloque titulo="Justificación">
        <p className="min-h-[3em] whitespace-pre-line">{cierre.datos.justificacion ?? '—'}</p>
      </Bloque>

      {cierre.datos.observaciones && (
        <Bloque titulo="Observaciones">
          <p className="whitespace-pre-line">{cierre.datos.observaciones}</p>
        </Bloque>
      )}

      <Bloque titulo="Aprobación">
        <Fila etiqueta="Aprobador">{aprobador ?? '—'}</Fila>
        <Fila etiqueta="Fecha">{formatearFechaHora(cierre.aprobadoEn, zonaHoraria)}</Fila>
      </Bloque>

      <section className="mt-16 grid grid-cols-2 gap-12 break-inside-avoid">
        <Firma titulo="Firma chofer" />
        <Firma titulo="Firma supervisor" />
      </section>

      <footer className="mt-10 border-t border-neutral-400 pt-2 text-[10px] text-neutral-600">
        <p>
          Valores congelados por el sistema al aprobar el cierre. La tolerancia es la vigente en ese momento: la empresa puede modificar
          el parámetro, pero este cierre conserva la que usó.
        </p>
        {cierre.huella && <p className="mt-1 font-mono break-all">Huella: {cierre.huella}</p>}
      </footer>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-1 border-b border-neutral-400 pb-0.5 text-xs font-bold tracking-wide uppercase">{titulo}</h2>
      {children}
    </section>
  );
}

function Fila({ etiqueta, children, fuerte }: { etiqueta: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div className="grid grid-cols-[45mm_1fr] gap-3 py-0.5">
      <span className="text-neutral-600">{etiqueta}</span>
      <span className={fuerte ? 'font-bold' : undefined}>{children}</span>
    </div>
  );
}

function Firma({ titulo }: { titulo: string }) {
  return (
    <div>
      <div className="h-14 border-b border-black" />
      <p className="mt-1 font-bold">{titulo}</p>
      <p className="mt-3 text-neutral-600">Aclaración: ______________________</p>
      <p className="mt-2 text-neutral-600">Fecha: ____ / ____ / ________</p>
    </div>
  );
}
