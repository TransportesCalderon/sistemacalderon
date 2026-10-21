import type { ReactNode } from 'react';
import { ETIQUETA_ESTADO, ETIQUETA_RESOLUCION, etiquetaUnidad } from '@/modules/anomalias/domain/alerta.types';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conSigno, formatearNumero } from '@/shared/lib/numeros';
import type { ActaExtra } from '../../domain/acta.types';
import type { CierreViaje } from '../../domain/cierre.types';
import { BotonImprimir } from './boton-imprimir';

/**
 * Acta del cierre de viaje para imprimir o guardar como PDF (desde el navegador). Migración 56: le cuenta al
 * chofer su viaje — con cuánto salió, qué cargó, cuántos km hizo, cuánto consumió el motor y en ralentí, la
 * diferencia, por qué puede existir (alertas del viaje) y lo que se descuenta. Todo lo calcula la base (lo
 * congelado al aprobar); no incluye datos sensibles (test de alcohol).
 */
export interface DatosActa {
  cierre: CierreViaje;
  camion: string;
  chofer: string | null;
  aprobador: string | null;
  extra: ActaExtra;
  zonaHoraria: string;
}

const L = (v: number | null | undefined, dec = 1) => (v === null || v === undefined ? '—' : `${formatearNumero(v, dec)} L`);
const FUENTE: Record<string, string> = {
  telemetria: 'telemetría',
  agregado_diario: 'resumen diario de la telemetría, aproximado',
  resumen_diario: 'resumen diario de la telemetría, aproximado',
  manual: 'cargado a mano',
  cargas: 'odómetro de las cargas',
  tramos: 'tramos operativos',
};
const fuente = (f: string | null) => (f ? ` (${FUENTE[f] ?? f})` : '');
const MOVIMIENTO: Record<string, string> = {
  descarga_base: 'Descarga a la base',
  descarga_camion: 'Pasó a otro camión',
  salida_motivo: 'Salida con motivo',
  recepcion_camion: 'Recibió de otro camión',
  entrada_motivo: 'Entrada con motivo',
};
const ENTRADA = new Set(['recepcion_camion', 'entrada_motivo']);

export function ActaCierre({ cierre, camion, chofer, aprobador, extra: x, zonaHoraria }: DatosActa) {
  const r = cierre.congelado;
  const anulado = cierre.estado === 'anulado';
  const fecha = (v: string | null) => formatearFechaHora(v, zonaHoraria);
  const dif = x.diferenciaL;

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-8 text-[12px] leading-snug text-black print:p-0">
      <style>{'@page { size: A4; margin: 12mm; } @media print { body { background: white; } }'}</style>

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
          Cierre anulado el {fecha(cierre.anuladoEn)}
          {cierre.motivoAnulacion ? ` · ${cierre.motivoAnulacion}` : ''}
        </p>
      )}

      {/* Resumen en una línea, lo primero que lee el chofer */}
      <section className="mt-4 grid grid-cols-4 gap-2 break-inside-avoid">
        <Cifra etiqueta="Km recorridos" valor={x.km === null ? '—' : `${formatearNumero(x.km, 0)} km`} />
        <Cifra etiqueta="Consumió el motor" valor={L(x.consumoMotorL, 0)} />
        <Cifra etiqueta="En ralentí" valor={x.ralenti.litros === null ? '—' : `${L(x.ralenti.litros, 0)}`} />
        <Cifra etiqueta="A descontar" valor={L(x.aDescontarL, 1)} fuerte />
      </section>

      <Bloque titulo="Viaje">
        <Fila etiqueta="Camión">{camion}</Fila>
        <Fila etiqueta="Chofer">{chofer ?? 'Sin asignar'}</Fila>
        <Fila etiqueta="Salida">
          {fecha(x.salida.fecha ?? cierre.salidaTs)}
          {x.salida.estacion && ` · ${x.salida.estacion}`}
        </Fila>
        <Fila etiqueta="Llegada">
          {fecha(x.llegada.fecha ?? cierre.llegadaTs)}
          {x.llegada.estacion && ` · ${x.llegada.estacion}`}
        </Fila>
        {r?.lineaViaje && <Fila etiqueta="Línea">{r.lineaViaje}</Fila>}
        <Fila etiqueta="Km recorridos">
          {x.km === null ? '—' : `${formatearNumero(x.km, 0)} km`}
          <span className="text-neutral-600">{fuente(x.fuenteKm)}</span>
        </Fila>
        <Fila etiqueta="Programador de velocidad">{x.programadorPct === null ? '—' : `${formatearNumero(x.programadorPct, 0)} % de los km`}</Fila>
      </Bloque>

      <Bloque titulo="Combustible al salir">
        <p>
          {x.salida.inicioL === null ? (
            'Salió con los tanques llenos (el camión no tiene tanques cargados en su ficha).'
          ) : x.salida.faltanteL > 0 ? (
            <>
              Salió con <b>{L(x.salida.inicioL, 0)}</b>: los tanques son de {L(x.capacidadL, 0)} y faltaron {L(x.salida.faltanteL)} para llenarlos
              {x.salida.faltanteObs ? ` (${x.salida.faltanteObs})` : ''}.
            </>
          ) : (
            <>
              Salió con los tanques llenos: <b>{L(x.salida.inicioL, 0)}</b>.
            </>
          )}
          {x.salida.litros !== null && <span className="text-neutral-600"> En el llenado de salida se cargaron {L(x.salida.litros)}.</span>}
          {x.capacidadActual && (
            <span className="text-neutral-600"> (Capacidad de los tanques que figuran hoy en la ficha del camión.)</span>
          )}
        </p>
      </Bloque>

      <Bloque titulo="Cargas durante el viaje">
        {x.cargas.length === 0 ? (
          <p>Sin cargas.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-400 text-left text-[11px] text-neutral-600">
                <th className="py-1 font-normal">Fecha y hora</th>
                <th className="py-1 font-normal">Estación</th>
                <th className="py-1 font-normal" />
                <th className="py-1 text-right font-normal">Litros</th>
              </tr>
            </thead>
            <tbody>
              {x.cargas.map((k, i) => (
                <tr key={i} className="border-b border-neutral-200">
                  <td className="py-0.5">{fecha(k.fecha)}</td>
                  <td className="py-0.5">{k.estacion ?? '—'}</td>
                  <td className="py-0.5 text-neutral-600">{k.corte ? 'Llenado de llegada' : k.lleno ? 'Tanque lleno' : ''}</td>
                  <td className="py-0.5 text-right tabular-nums">{formatearNumero(k.litros, 1)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-1" colSpan={3}>
                  Total cargado
                </td>
                <td className="py-1 text-right tabular-nums">{formatearNumero(x.cargasL, 1)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {x.movimientos.length > 0 && (
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-400 text-left text-[11px] text-neutral-600">
                <th className="py-1 font-normal">Otros movimientos</th>
                <th className="py-1 font-normal">Motivo</th>
                <th className="py-1 text-right font-normal">Litros</th>
              </tr>
            </thead>
            <tbody>
              {x.movimientos.map((m, i) => (
                <tr key={i} className="border-b border-neutral-200">
                  <td className="py-0.5">
                    {MOVIMIENTO[m.tipo] ?? m.tipo} · {fecha(m.fecha)}
                  </td>
                  <td className="py-0.5">{m.motivo ?? '—'}</td>
                  <td className="py-0.5 text-right tabular-nums">
                    {ENTRADA.has(m.tipo) ? '+' : '−'}
                    {formatearNumero(Math.abs(m.litros), 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloque>

      <Bloque titulo="La cuenta del combustible">
        <Fila etiqueta="Cargado en el viaje">{L(x.cargasL)}</Fila>
        {(x.entradasL ?? 0) > 0 && <Fila etiqueta="+ Entradas">{L(x.entradasL)}</Fila>}
        {(x.salidasL ?? 0) > 0 && <Fila etiqueta="− Salidas">{L(x.salidasL)}</Fila>}
        {(x.faltanteLlegadaL ?? 0) > 0 && <Fila etiqueta="+ Faltó llenar al llegar">{L(x.faltanteLlegadaL)}</Fila>}
        {(x.faltanteSalidaL ?? 0) > 0 && <Fila etiqueta="− Faltó llenar al salir">{L(x.faltanteSalidaL)}</Fila>}
        <Fila etiqueta="= Debió consumir" fuerte>
          {L(x.libroL)} <span className="font-normal text-neutral-600">(lo que hay que reponer para volver a llenar)</span>
        </Fila>
        <Fila etiqueta="Consumió el motor" fuerte>
          {L(x.consumoMotorL)}
          <span className="font-normal text-neutral-600">{fuente(x.fuenteConsumo)}</span>
        </Fila>
        <Fila etiqueta="Rendimiento">
          {x.l100km === null ? '—' : `${formatearNumero(x.l100km, 1)} L cada 100 km`}
          {x.horasMotor !== null && <span className="text-neutral-600"> · {formatearNumero(x.horasMotor, 1)} h de motor</span>}
        </Fila>
        <Fila etiqueta="Ralentí (parado con motor)">
          {x.ralenti.litros === null && x.ralenti.horas === null
            ? 'Sin dato de la telemetría'
            : `${L(x.ralenti.litros)}${x.ralenti.horas !== null ? ` en ${formatearNumero(x.ralenti.horas, 1)} h` : ''}`}
          <span className="text-neutral-600">{fuente(x.ralenti.fuente)}</span>
        </Fila>
        {x.ajusteManual && <p className="mt-1 text-[11px] text-neutral-600">Datos corregidos a mano: {x.ajusteManual}</p>}
      </Bloque>

      <Bloque titulo="Diferencia">
        <p className="font-bold">
          {dif === null
            ? 'No se pudo comparar: falta el consumo del motor.'
            : dif > 0
              ? `Se cargaron ${L(dif)} más de lo que consumió el motor: ese combustible no aparece.`
              : dif < 0
                ? `El motor consumió ${L(-dif)} más de lo que se cargó.`
                : 'Lo cargado coincide con lo que consumió el motor.'}
        </p>
        <Fila etiqueta="Diferencia">{dif === null ? '—' : `${conSigno(dif)} L`}</Fila>
        <Fila etiqueta="Tolerancia">± {L(x.toleranciaL)} (hasta acá no se descuenta)</Fila>
        {(x.justificadosL ?? 0) > 0 && (
          <Fila etiqueta="Litros justificados">
            {L(x.justificadosL)}
            {x.motivoJustificados && <span className="text-neutral-600"> · {x.motivoJustificados}</span>}
          </Fila>
        )}
        <Fila etiqueta="A descontar al chofer" fuerte>
          {L(x.aDescontarL)}
        </Fila>
        {x.comentario && (
          <Fila etiqueta="Explicación">
            <span className="whitespace-pre-line">{x.comentario}</span>
          </Fila>
        )}
        <div className="mt-2">
          <p className="text-[11px] font-bold text-neutral-700">Lo que vio la telemetría en el viaje</p>
          {x.alertas.length === 0 ? (
            <p className="text-neutral-600">Sin alertas en el viaje.</p>
          ) : (
            <ul className="list-disc pl-5">
              {x.alertas.map((a, i) => (
                <li key={i}>
                  {a.tipo} · {fecha(a.cuando)}
                  {a.valor !== null && ` · ${formatearNumero(a.valor, 0)} ${etiquetaUnidad(a.unidad)}`}
                  <span className="text-neutral-600"> · {a.resolucion ? (ETIQUETA_RESOLUCION[a.resolucion] ?? a.resolucion) : (ETIQUETA_ESTADO[a.estado] ?? a.estado)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Bloque>

      {x.observaciones && (
        <Bloque titulo="Observaciones">
          <p className="whitespace-pre-line">{x.observaciones}</p>
        </Bloque>
      )}

      <Bloque titulo="Aprobación">
        <Fila etiqueta="Aprobó">{aprobador ?? '—'}</Fila>
        <Fila etiqueta="Fecha">{fecha(cierre.aprobadoEn)}</Fila>
      </Bloque>

      <section className="mt-6 grid grid-cols-2 gap-12 break-inside-avoid">
        <Firma titulo="Firma chofer" />
        <Firma titulo="Firma supervisor" />
      </section>

      <footer className="mt-4 border-t border-neutral-400 pt-2 text-[10px] text-neutral-600">
        <p>
          «Debió consumir» sale de los litros cargados con los tanques llenos al salir y al llegar. «Consumió el motor» es lo que mide la
          computadora del camión. Valores congelados al aprobar el cierre, con la tolerancia vigente en ese momento.
        </p>
        {cierre.huella && <p className="mt-1 font-mono break-all">Huella: {cierre.huella}</p>}
      </footer>
    </div>
  );
}

function Cifra({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={fuerte ? 'border-2 border-black p-2' : 'border border-neutral-400 p-2'}>
      <p className="text-[10px] tracking-wide text-neutral-600 uppercase">{etiqueta}</p>
      <p className="text-base font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-3 break-inside-avoid">
      <h2 className="mb-1 border-b border-neutral-400 pb-0.5 text-xs font-bold tracking-wide uppercase">{titulo}</h2>
      {children}
    </section>
  );
}

function Fila({ etiqueta, children, fuerte }: { etiqueta: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div className="grid grid-cols-[50mm_1fr] gap-3 py-0.5">
      <span className="text-neutral-600">{etiqueta}</span>
      <span className={fuerte ? 'font-bold' : undefined}>{children}</span>
    </div>
  );
}

function Firma({ titulo }: { titulo: string }) {
  return (
    <div>
      <div className="h-10 border-b border-black" />
      <p className="mt-1 font-bold">{titulo}</p>
      <p className="mt-2 text-neutral-600">Aclaración: ______________________</p>
      <p className="mt-2 text-neutral-600">Fecha: ____ / ____ / ________</p>
    </div>
  );
}
