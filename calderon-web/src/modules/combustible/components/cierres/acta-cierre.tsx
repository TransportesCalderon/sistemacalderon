import type { ReactNode } from 'react';
import { ETIQUETA_ESTADO, ETIQUETA_RESOLUCION, etiquetaUnidad } from '@/modules/anomalias/domain/alerta.types';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conSigno, formatearNumero } from '@/shared/lib/numeros';
import { GRUPOS_ECO, type ActaExtra, type EcoScore } from '../../domain/acta.types';
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
  agregado_diario: 'lecturas de la telemetría, aproximado',
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
// Migración 85: el color lo decide la base (naranja: más del 5 % sobre el objetivo; rojo: más del 10 %)
const COLOR = { normal: '', naranja: 'text-orange-600', rojo: 'text-red-600' } as const;
const RECUADRO = { normal: 'border border-neutral-400', naranja: 'border-2 border-orange-500 bg-orange-50', rojo: 'border-2 border-red-600 bg-red-50' } as const;
const MARCA_ECO: Record<string, string> = { volvo: 'Volvo Connect', renault: 'Renault Optifleet' };

export function ActaCierre({ cierre, camion, chofer, aprobador, extra: x, zonaHoraria }: DatosActa) {
  const r = cierre.congelado;
  const anulado = cierre.estado === 'anulado';
  const fecha = (v: string | null) => formatearFechaHora(v, zonaHoraria);
  const dif = x.diferenciaL;
  const obj = x.objetivo;
  // Lo consumido contra el objetivo (solo para comparar rendimiento; no se descuenta)
  const vsObjetivo = x.vsObjetivo?.litros ?? null;
  const nivel = x.vsObjetivo?.nivel ?? 'normal';
  const eco = x.ecoScore;
  const ajustes = (x.entradasL ?? 0) > 0 || (x.salidasL ?? 0) > 0 || (x.faltanteLlegadaL ?? 0) > 0 || (x.faltanteSalidaL ?? 0) > 0;

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-8 text-[12px] leading-snug text-black print:p-0">
      <style>{'@page { size: A4; margin: 12mm; } @media print { body { background: white; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }'}</style>

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
      <section className="mt-4 grid grid-cols-5 gap-2 break-inside-avoid">
        <Cifra etiqueta="Km recorridos" valor={x.km === null ? '—' : `${formatearNumero(x.km, 0)} km`} />
        <Cifra
          etiqueta="Consumió el motor"
          valor={L(x.consumoMotorL, 0)}
          nivel={nivel}
          nota={x.vsObjetivo ? `${x.vsObjetivo.pct > 0 ? '+' : ''}${formatearNumero(x.vsObjetivo.pct, 1)} % del objetivo` : undefined}
        />
        <Cifra etiqueta="Debió consumir (objetivo)" valor={L(obj?.debioL ?? null, 0)} />
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
        <Fila etiqueta="Programador de velocidad">
          {x.programadorPct === null ? '—' : `${formatearNumero(x.programadorPct, 0)} % de los km`}
          {eco?.componentes.cruiseControl !== undefined && eco.escala !== null && (
            <span className="text-neutral-600">
              {' '}
              · puntaje en el Eco Score: {formatearNumero(eco.componentes.cruiseControl, 1)} de {eco.escala}
            </span>
          )}
        </Fila>
      </Bloque>

      <BloqueEco eco={eco} />

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
        {ajustes && (
          <Fila etiqueta="= Total cargado" fuerte>
            {L(x.libroL)} <span className="font-normal text-neutral-600">(lo que hay que reponer para volver a llenar)</span>
          </Fila>
        )}
        <Fila etiqueta="Consumió el motor" fuerte>
          {L(x.consumoMotorL)}
          <span className="font-normal text-neutral-600">{fuente(x.fuenteConsumo)}</span>
        </Fila>
        <Fila etiqueta="Debió consumir (objetivo)" fuerte>
          {obj?.debioL == null ? (
            <span className="font-normal">Sin objetivo: cargá el consumo objetivo en las líneas</span>
          ) : (
            <>
              {L(obj.debioL)}{' '}
              <span className="font-normal text-neutral-600">
                ({formatearNumero(obj.l100km ?? 0, 1)} L cada 100 km × {formatearNumero(x.km ?? 0, 0)} km)
              </span>
            </>
          )}
        </Fila>
        {obj && obj.tramos.length + (obj.kmVacioSinRegistrar > 0 ? 1 : 0) > 0 && (
          <Fila etiqueta="Tramos del objetivo">
            <span className="text-neutral-700">
              {[
                ...obj.tramos.map(
                  (k) =>
                    `${k.vacio ? 'Vacío' : k.contenedorVacio ? 'Contenedor vacío' : (k.linea ?? 'Línea')}${(k.vacio || k.contenedorVacio) && k.linea ? ` ${k.linea}` : ''} ${k.km === null ? '' : `${formatearNumero(k.km, 0)} km`} a ${
                      k.objetivo === null ? 'sin objetivo' : formatearNumero(k.objetivo, 1)
                    }`,
                ),
                ...(obj.kmVacioSinRegistrar > 0
                  ? [`Vacío sin registrar ${formatearNumero(obj.kmVacioSinRegistrar, 0)} km a ${formatearNumero(obj.vacioL100km ?? 0, 1)}`]
                  : []),
              ].join(' · ')}
            </span>
            {obj.sinObjetivo.length > 0 && <span className="block text-neutral-600">Sin objetivo cargado (no cuentan): {obj.sinObjetivo.join(', ')}</span>}
          </Fila>
        )}
        <Fila etiqueta="Rendimiento real">
          <span className={cn('font-bold', COLOR[nivel])}>{x.l100kmMotor === null ? '—' : `${formatearNumero(x.l100kmMotor, 1)} L cada 100 km`}</span>
          {obj?.l100km != null && <span className="text-neutral-600"> · objetivo {formatearNumero(obj.l100km, 1)} L cada 100 km</span>}
          {x.horasMotor !== null && <span className="text-neutral-600"> · {formatearNumero(x.horasMotor, 1)} h de motor</span>}
        </Fila>
        {vsObjetivo !== null && (
          <Fila etiqueta="Contra el objetivo">
            <span className={cn('font-bold', COLOR[nivel])}>
              {vsObjetivo > 0
                ? `Consumió ${L(vsObjetivo)} más que el objetivo (+${formatearNumero(x.vsObjetivo?.pct ?? 0, 1)} %)`
                : vsObjetivo < 0
                  ? `Consumió ${L(-vsObjetivo)} menos que el objetivo (${formatearNumero(x.vsObjetivo?.pct ?? 0, 1)} %)`
                  : 'Consumió justo el objetivo'}
            </span>
            <span className="text-neutral-600"> (solo para comparar; no se descuenta)</span>
          </Fila>
        )}
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
              ? `Se cargaron ${L(dif)} más de lo que consumió el motor.`
              : dif < 0
                ? `El motor consumió ${L(-dif)} más de lo que se cargó.`
                : 'Lo cargado coincide con lo que consumió el motor.'}
        </p>
        <Fila etiqueta="Diferencia">{dif === null ? '—' : `${conSigno(dif)} L`}</Fila>
        {(x.toleranciaL ?? 0) > 0 && <Fila etiqueta="Tolerancia">± {L(x.toleranciaL)} (hasta acá no se descuenta)</Fila>}
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
          «Consumió el motor» es lo que mide la computadora del camión. «Debió consumir» es el consumo objetivo de cada tramo (promedio
          ponderado por km; con contenedor vacío {formatearNumero(obj?.contenedorVacioL100km ?? 28, 0)} y vacío, sin contenedor, {formatearNumero(obj?.vacioL100km ?? 26, 0)} L cada 100 km) por los km del viaje. En
          naranja si consumió más de un {formatearNumero(x.vsObjetivo?.naranjaPct ?? 5, 0)} % sobre el objetivo; en rojo, más de un {formatearNumero(x.vsObjetivo?.rojoPct ?? 10, 0)} %. Se descuenta lo
          cargado que el motor no consumió. Valores congelados al aprobar el cierre.
        </p>
        {cierre.huella && <p className="mt-1 font-mono break-all">Huella: {cierre.huella}</p>}
      </footer>
    </div>
  );
}

function Cifra({ etiqueta, valor, fuerte, nivel = 'normal', nota }: { etiqueta: string; valor: string; fuerte?: boolean; nivel?: keyof typeof COLOR; nota?: string }) {
  return (
    <div className={cn('p-2', fuerte ? 'border-2 border-black' : RECUADRO[nivel])}>
      <p className="text-[10px] tracking-wide text-neutral-600 uppercase">{etiqueta}</p>
      <p className={cn('text-base font-bold tabular-nums', COLOR[nivel])}>{valor}</p>
      {nota && <p className={cn('text-[10px] tabular-nums', COLOR[nivel] || 'text-neutral-600')}>{nota}</p>}
    </div>
  );
}

/** Migración 86: Eco Score completo (puntaje, datos del período y cada parte), tal como lo informa la API. */
function BloqueEco({ eco }: { eco: EcoScore | null }) {
  const titulo = `Eco Score${eco?.marca && MARCA_ECO[eco.marca] ? ` · ${MARCA_ECO[eco.marca]}` : ''}`;
  if (!eco || eco.total === null) {
    return (
      <Bloque titulo={titulo}>
        <p className="text-neutral-600">{eco?.motivo ?? 'Sin dato.'}</p>
      </Bloque>
    );
  }
  const d = eco.datos;
  const conocidas = new Set(GRUPOS_ECO.flatMap((g) => Object.keys(g.partes)));
  const grupos = [
    ...GRUPOS_ECO.map((g) => ({
      titulo: g.titulo,
      partes: Object.entries(g.partes).flatMap(([k, nombre]) => (eco.componentes[k] === undefined ? [] : [[nombre, eco.componentes[k]] as const])),
    })),
    { titulo: 'Otros', partes: Object.entries(eco.componentes).filter(([k]) => !conocidas.has(k)) },
  ].filter((g) => g.partes.length > 0);
  const datos = [
    d.km !== null && `${formatearNumero(d.km, 0)} km`,
    d.consumoL100km !== null && `${formatearNumero(d.consumoL100km, 1)} L cada 100 km`,
    d.velocidadMediaKmh !== null && `${formatearNumero(d.velocidadMediaKmh, 1)} km/h de velocidad media`,
    d.horas !== null && `${formatearNumero(d.horas, 1)} h en uso${d.utilizacionPct !== null ? ` (${formatearNumero(d.utilizacionPct, 1)} % del tiempo)` : ''}`,
    d.co2T !== null && `${formatearNumero(d.co2T, 2)} t de CO₂`,
    d.co2AhorradoT ? `${formatearNumero(d.co2AhorradoT, 2)} t de CO₂ ahorradas` : false,
  ].filter(Boolean);

  return (
    <Bloque titulo={titulo}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p>
          <span className="text-xl font-bold tabular-nums">{formatearNumero(eco.total, 1)}</span>
          <span className="text-neutral-600"> de {eco.escala ?? '—'}</span>
        </p>
        {datos.length > 0 && <p className="text-neutral-700">{datos.join(' · ')}</p>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2">
        {grupos.map((g) => (
          <div key={g.titulo} className="break-inside-avoid">
            <p className="text-[11px] font-bold text-neutral-700">{g.titulo}</p>
            {g.partes.map(([nombre, v]) => (
              <div key={nombre} className="flex justify-between border-b border-neutral-200 py-0.5">
                <span>{nombre}</span>
                <span className="tabular-nums">{formatearNumero(v, 1)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-neutral-600">
        Puntajes de 0 a {eco.escala ?? '—'} (más es mejor). Período por días completos
        {eco.desde && eco.hasta ? `, del ${eco.desde.split('-').reverse().join('/')} al ${eco.hasta.split('-').reverse().join('/')}` : ''}: los km pueden no
        coincidir con los del cierre.
      </p>
    </Bloque>
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
