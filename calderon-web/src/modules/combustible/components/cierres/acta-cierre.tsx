import type { ReactNode } from 'react';
import { ETIQUETA_ESTADO, ETIQUETA_RESOLUCION, etiquetaUnidad } from '@/modules/anomalias/domain/alerta.types';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conSigno, formatearNumero } from '@/shared/lib/numeros';
import { GRUPOS_ECO, type ActaExtra, type EcoScore, type Nivel, type PuntajeCalderon } from '../../domain/acta.types';
import type { CierreViaje } from '../../domain/cierre.types';
import { BotonImprimir } from './boton-imprimir';

/**
 * Acta del cierre de viaje en una hoja A4 (imprimir o guardar como PDF desde el navegador). Lo crucial
 * arriba, en recuadros; después la cuenta del combustible, la conducción y el Eco Score, las alertas y
 * las firmas. Todo lo calcula la base, colores incluidos (lo congelado al aprobar); no incluye datos
 * sensibles (test de alcohol).
 */
export interface DatosActa {
  cierre: CierreViaje;
  camion: string;
  chofer: string | null;
  aprobador: string | null;
  extra: ActaExtra;
  zonaHoraria: string;
}

const L = (v: number | null | undefined, dec = 0) => (v === null || v === undefined ? '—' : `${formatearNumero(v, dec)} L`);
const MOVIMIENTO: Record<string, string> = {
  descarga_base: 'Descarga a la base',
  descarga_camion: 'Pasó a otro camión',
  salida_motivo: 'Salida con motivo',
  recepcion_camion: 'Recibió de otro camión',
  entrada_motivo: 'Entrada con motivo',
};
const ENTRADA = new Set(['recepcion_camion', 'entrada_motivo']);
const MARCA_ECO: Record<string, string> = { volvo: 'Volvo Connect', renault: 'Renault Optifleet', tablero: 'Tablero del camión (foto)' };

// Colores (los decide la base: migraciones 85 y 87)
const TEXTO: Record<Nivel, string> = { verde: 'text-green-700', naranja: 'text-yellow-600', rojo: 'text-red-600' };
const FONDO: Record<Nivel, string> = { verde: 'border-green-600 bg-green-50', naranja: 'border-yellow-500 bg-yellow-50', rojo: 'border-red-600 bg-red-50' };
const BARRA: Record<Nivel, string> = { verde: 'bg-green-600', naranja: 'bg-yellow-500', rojo: 'bg-red-600' };

export function ActaCierre({ cierre, camion, chofer, aprobador, extra: x, zonaHoraria }: DatosActa) {
  const anulado = cierre.estado === 'anulado';
  const fecha = (v: string | null) => formatearFechaHora(v, zonaHoraria);
  const obj = x.objetivo;
  const c = x.colores;
  const eco = x.ecoScore;
  const descuento = x.aDescontarL ?? 0;
  const tramos = obj
    ? [
        ...obj.tramos.map(
          (k) =>
            `${k.vacio ? 'Vacío' : k.contenedorVacio ? 'Contenedor vacío' : (k.linea ?? 'Línea')}${(k.vacio || k.contenedorVacio) && k.linea ? ` ${k.linea}` : ''} ${
              k.km === null ? '' : `${formatearNumero(k.km, 0)} km`
            } a ${k.objetivo === null ? '—' : formatearNumero(k.objetivo, 1)}`,
        ),
        ...(obj.kmVacioSinRegistrar > 0 ? [`Vacío sin registrar ${formatearNumero(obj.kmVacioSinRegistrar, 0)} km a ${formatearNumero(obj.vacioL100km ?? 0, 1)}`] : []),
      ]
    : [];

  return (
    <div className="mx-auto max-w-[190mm] bg-white p-6 text-[10.5px] leading-tight text-black print:max-w-none print:p-0">
      <style>
        {'@page { size: A4; margin: 10mm; } @media print { body { background: white; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }'}
      </style>

      <div className="mb-4 flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-neutral-600">Para el PDF, elegí «Guardar como PDF» en la ventana de impresión.</p>
        <BotonImprimir />
      </div>

      {/* Encabezado */}
      <header className="flex items-end justify-between border-b-2 border-black pb-1.5">
        <div>
          <p className="text-[9px] tracking-wide text-neutral-600 uppercase">Transportes Calderón</p>
          <h1 className="text-lg leading-none font-bold">Acta de cierre de viaje</h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-base leading-none font-bold">{cierre.numero}</p>
          <p className="text-[9px] text-neutral-600">
            Aprobado {fecha(cierre.aprobadoEn)}
            {aprobador ? ` · ${aprobador}` : ''}
          </p>
        </div>
      </header>

      {anulado && (
        <p className="mt-2 border-2 border-red-600 bg-red-50 p-1 text-center font-bold text-red-700 uppercase">
          Anulado el {fecha(cierre.anuladoEn)}
          {cierre.motivoAnulacion ? ` · ${cierre.motivoAnulacion}` : ''}
        </p>
      )}

      <section className="mt-2 grid grid-cols-4 gap-x-3">
        <Dato etiqueta="Camión">{camion}</Dato>
        <Dato etiqueta="Chofer">{chofer ?? 'Sin asignar'}</Dato>
        <Dato etiqueta="Salida">
          {fecha(x.salida.fecha ?? cierre.salidaTs)}
          {x.salida.estacion && <span className="block font-normal text-neutral-600">{x.salida.estacion}</span>}
        </Dato>
        <Dato etiqueta="Llegada">
          {fecha(x.llegada.fecha ?? cierre.llegadaTs)}
          {x.llegada.estacion && <span className="block font-normal text-neutral-600">{x.llegada.estacion}</span>}
        </Dato>
      </section>

      {/* Lo crucial */}
      <section className="mt-2 grid grid-cols-5 gap-1.5 break-inside-avoid">
        <Cifra etiqueta="Km recorridos" valor={x.km === null ? '—' : formatearNumero(x.km, 0)} unidad="km" />
        <Cifra
          etiqueta="Consumió el motor"
          valor={x.consumoMotorL === null ? '—' : formatearNumero(x.consumoMotorL, 0)}
          unidad="L"
          nivel={c.objetivo}
          nota={x.vsObjetivo ? `${conSigno(x.vsObjetivo.pct, 1)} % vs. objetivo` : undefined}
        />
        <Cifra
          etiqueta="Objetivo"
          valor={obj?.debioL == null ? '—' : formatearNumero(obj.debioL, 0)}
          unidad="L"
          nota={obj?.l100km == null ? 'Sin objetivo en las líneas' : `${formatearNumero(obj.l100km, 1)} L/100 km`}
        />
        <Cifra
          etiqueta="Rendimiento"
          valor={x.l100kmMotor === null ? '—' : formatearNumero(x.l100kmMotor, 1)}
          unidad="L/100 km"
          nivel={c.objetivo}
        />
        <Cifra
          etiqueta="A descontar"
          valor={formatearNumero(descuento, 1)}
          unidad="L"
          nivel={descuento > 0 ? 'rojo' : 'verde'}
          nota={descuento > 0 ? 'Cargó de más' : 'Sin descuento'}
        />
      </section>

      <div className="mt-1 grid grid-cols-2 gap-4">
        {/* Combustible */}
        <Bloque titulo="Combustible">
          <table className="w-full border-collapse tabular-nums">
            <tbody>
              <Renglon etiqueta="Salió con">
                {x.salida.inicioL === null ? 'Lleno' : L(x.salida.inicioL)}
                {x.salida.faltanteL > 0 && <span className="text-neutral-600"> (faltaron {L(x.salida.faltanteL, 1)})</span>}
              </Renglon>
              {x.cargas.map((k, i) => (
                <Renglon key={i} etiqueta={`${fecha(k.fecha)}${k.estacion ? ` · ${k.estacion}` : ''}`} suave>
                  + {formatearNumero(k.litros, 1)}
                  {k.corte && <span className="text-neutral-500"> (llegada)</span>}
                </Renglon>
              ))}
              {x.movimientos.map((m, i) => (
                <Renglon key={`m${i}`} etiqueta={`${MOVIMIENTO[m.tipo] ?? m.tipo}${m.motivo ? ` · ${m.motivo}` : ''}`} suave>
                  {ENTRADA.has(m.tipo) ? '+' : '−'} {formatearNumero(Math.abs(m.litros), 1)}
                </Renglon>
              ))}
              {(x.faltanteLlegadaL ?? 0) > 0 && (
                <Renglon etiqueta="Faltó llenar al llegar" suave>
                  + {formatearNumero(x.faltanteLlegadaL ?? 0, 1)}
                </Renglon>
              )}
              {(x.faltanteSalidaL ?? 0) > 0 && (
                <Renglon etiqueta="Faltó llenar al salir" suave>
                  − {formatearNumero(x.faltanteSalidaL ?? 0, 1)}
                </Renglon>
              )}
              <Renglon etiqueta="Total cargado" fuerte>
                {L(x.libroL ?? x.cargasL, 1)}
              </Renglon>
              <Renglon etiqueta="Consumió el motor" fuerte>
                {L(x.consumoMotorL, 1)}
              </Renglon>
              <Renglon etiqueta="Diferencia">{x.diferenciaL === null ? '—' : `${conSigno(x.diferenciaL, 1)} L`}</Renglon>
              {(x.justificadosL ?? 0) > 0 && (
                <Renglon etiqueta={`Justificados${x.motivoJustificados ? ` · ${x.motivoJustificados}` : ''}`}>− {formatearNumero(x.justificadosL ?? 0, 1)}</Renglon>
              )}
              {(x.toleranciaL ?? 0) > 0 && <Renglon etiqueta="Tolerancia">± {formatearNumero(x.toleranciaL ?? 0, 1)}</Renglon>}
              <Renglon etiqueta="A descontar" fuerte nivel={descuento > 0 ? 'rojo' : 'verde'}>
                {L(descuento, 1)}
              </Renglon>
            </tbody>
          </table>
          {tramos.length > 0 && <p className="mt-1 text-[9px] text-neutral-600">Objetivo por tramo (L/100 km): {tramos.join(' · ')}</p>}
          {obj && obj.sinObjetivo.length > 0 && <p className="text-[9px] text-orange-600">Sin objetivo cargado: {obj.sinObjetivo.join(', ')}</p>}
          {x.ajusteManual && <p className="text-[9px] text-neutral-600">Corregido a mano: {x.ajusteManual}</p>}
        </Bloque>

        {/* Conducción */}
        <Bloque titulo="Conducción">
          <table className="w-full border-collapse tabular-nums">
            <tbody>
              <Renglon etiqueta="Programador de velocidad" nivel={c.programador ?? undefined} fuerte={c.programador !== null}>
                {x.programadorPct === null ? '—' : `${formatearNumero(x.programadorPct, 0)} % de los km`}
              </Renglon>
              <Renglon etiqueta="Ralentí">
                {x.ralenti.litros === null && x.ralenti.horas === null
                  ? '—'
                  : `${L(x.ralenti.litros)}${x.ralenti.horas !== null ? ` · ${formatearNumero(x.ralenti.horas, 1)} h` : ''}`}
              </Renglon>
              <Renglon etiqueta="Horas de motor">{x.horasMotor === null ? '—' : `${formatearNumero(x.horasMotor, 1)} h`}</Renglon>
            </tbody>
          </table>
          <BloqueCalderon p={x.puntajeCalderon} />
          <EcoResumen eco={eco} nivel={c.ecoTotal} />
        </Bloque>
      </div>

      <EcoPartes eco={eco} niveles={c.ecoPartes} />

      {/* Alertas y comentarios */}
      <Bloque titulo={`Alertas del viaje (${x.alertas.length})`}>
        {x.alertas.length === 0 ? (
          <p className="text-neutral-600">Sin alertas.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4">
            {x.alertas.slice(0, 8).map((a, i) => (
              <li key={i} className="truncate">
                <b>{a.tipo}</b> · {fecha(a.cuando)}
                {a.valor !== null && ` · ${formatearNumero(a.valor, 0)} ${etiquetaUnidad(a.unidad)}`}
                <span className="text-neutral-600"> · {a.resolucion ? (ETIQUETA_RESOLUCION[a.resolucion] ?? a.resolucion) : (ETIQUETA_ESTADO[a.estado] ?? a.estado)}</span>
              </li>
            ))}
            {x.alertas.length > 8 && <li className="text-neutral-600">y {x.alertas.length - 8} más (ver el cierre)</li>}
          </ul>
        )}
        {x.comentario && (
          <p className="mt-1 line-clamp-3 whitespace-pre-line">
            <b>Explicación:</b> {x.comentario}
          </p>
        )}
        {x.observaciones && (
          <p className="mt-1 line-clamp-3 whitespace-pre-line">
            <b>Observaciones:</b> {x.observaciones}
          </p>
        )}
      </Bloque>

      {/* Firmas */}
      <section className="mt-6 grid grid-cols-2 gap-10 break-inside-avoid">
        <Firma titulo="Firma del chofer" />
        <Firma titulo="Firma del supervisor" />
      </section>

      <footer className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-400 pt-1 text-[8.5px] text-neutral-600">
        <p className="flex flex-wrap items-center gap-x-1.5">
          <Punto nivel="verde" /> Bien <Punto nivel="naranja" /> A mejorar <Punto nivel="rojo" /> Fuera de lo esperado
          <span>
            · Consumo: naranja desde +{formatearNumero(x.vsObjetivo?.naranjaPct ?? 5, 0)} % y rojo desde +{formatearNumero(x.vsObjetivo?.rojoPct ?? 10, 0)} % del
            objetivo · Se descuenta lo cargado que el motor no consumió
          </span>
        </p>
        {cierre.huella && <p className="shrink-0 font-mono">Huella {cierre.huella.slice(0, 12)}</p>}
      </footer>
    </div>
  );
}

/** Migración 90: Puntaje Calderón (0-100, igual para toda la flota) y de dónde salen sus puntos. */
function BloqueCalderon({ p }: { p: PuntajeCalderon | null }) {
  if (!p || p.total === null) {
    return (
      <p className="mt-2 text-neutral-600">
        <b className="text-black">Puntaje Calderón:</b> faltan datos del viaje para calcularlo.
      </p>
    );
  }
  return (
    <div className={cn('mt-2 flex items-center gap-3 rounded border-l-4 py-1 pl-2', p.nivel ? FONDO[p.nivel] : 'border-neutral-400')}>
      <div className="w-[22mm] shrink-0 text-center">
        <p className="text-[9px] leading-tight tracking-wide text-neutral-600 uppercase">Puntaje Calderón</p>
        <p className={cn('text-2xl leading-none font-bold tabular-nums', p.nivel && TEXTO[p.nivel])}>{formatearNumero(p.total, 0)}</p>
        <p className="text-[9px] text-neutral-600">de 100</p>
      </div>
      <ul className="flex-1 text-[9.5px]">
        {p.partes.map((q) => (
          <li key={q.codigo} className="flex justify-between gap-2">
            <span>
              {q.nombre} <span className="text-neutral-500">({formatearNumero(q.valor, 1)} {q.unidad})</span>
            </span>
            <span className={cn('font-medium tabular-nums', q.nivel && TEXTO[q.nivel])}>
              {formatearNumero(q.puntos, 0)}/{formatearNumero(q.peso, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Eco Score: puntaje total, de dónde sale y los datos del período. */
function EcoResumen({ eco, nivel }: { eco: EcoScore | null; nivel: Nivel | null }) {
  if (!eco || eco.total === null) {
    return (
      <p className="mt-2 text-neutral-600">
        <b className="text-black">Eco Score:</b> {eco?.motivo ?? 'sin dato'}
      </p>
    );
  }
  const d = eco.datos;
  const datos = [
    d.km !== null && `${formatearNumero(d.km, 0)} km`,
    d.consumoL100km !== null && `${formatearNumero(d.consumoL100km, 1)} L/100 km`,
    d.velocidadMediaKmh !== null && `${formatearNumero(d.velocidadMediaKmh, 0)} km/h prom.`,
    d.horas !== null && `${formatearNumero(d.horas, 0)} h en uso`,
    d.co2T !== null && `${formatearNumero(d.co2T, 1)} t CO₂`,
  ].filter(Boolean);
  return (
    <div className={cn('mt-2 flex items-center gap-3 rounded border-l-4 py-1 pl-2', nivel ? FONDO[nivel] : 'border-neutral-400')}>
      <div className="shrink-0 text-center">
        <p className="text-[9px] tracking-wide text-neutral-600 uppercase">Eco Score</p>
        <p className={cn('text-2xl leading-none font-bold tabular-nums', nivel && TEXTO[nivel])}>{formatearNumero(eco.total, 1)}</p>
        <p className="text-[9px] text-neutral-600">de {eco.escala ?? '—'}</p>
      </div>
      <div className="text-[9.5px]">
        <p className="font-medium">{eco.marca ? (MARCA_ECO[eco.marca] ?? eco.marca) : ''}</p>
        {eco.desde && eco.hasta && (
          <p className="text-neutral-600">
            Del {eco.desde.split('-').reverse().join('/')} al {eco.hasta.split('-').reverse().join('/')} (días completos)
          </p>
        )}
        {datos.length > 0 && <p className="text-neutral-700">{datos.join(' · ')}</p>}
      </div>
    </div>
  );
}

/** Cada parte del Eco Score con una barra de color: de un vistazo, qué hace bien y qué no. */
function EcoPartes({ eco, niveles }: { eco: EcoScore | null; niveles: Record<string, Nivel> }) {
  if (!eco || eco.total === null || Object.keys(eco.componentes).length === 0) return null;
  const escala = eco.escala ?? 100;
  const conocidas = new Set(GRUPOS_ECO.flatMap((g) => Object.keys(g.partes)));
  const grupos = [
    ...GRUPOS_ECO.map((g) => ({
      titulo: g.titulo,
      partes: Object.entries(g.partes).flatMap(([k, nombre]) => {
        const v = eco.componentes[k];
        return v === undefined ? [] : [{ k, nombre, v }];
      }),
    })),
    { titulo: 'Otros', partes: Object.entries(eco.componentes).flatMap(([k, v]) => (conocidas.has(k) ? [] : [{ k, nombre: k, v }])) },
  ].filter((g) => g.partes.length > 0);
  // Tablero de otras marcas: sus partes no tienen grupo
  if (grupos.length === 1 && grupos[0]?.titulo === 'Otros') grupos[0].titulo = 'Partes';
  // Dos columnas parejas: «Motor y caja» (la más larga) a la derecha; el resto a la izquierda
  const derecha = grupos.filter((g) => g.titulo === 'Motor y caja');
  const izquierda = grupos.filter((g) => g.titulo !== 'Motor y caja');

  const columna = (gs: typeof grupos) => (
    <div className="space-y-1">
      {gs.map((g) => (
        <div key={g.titulo}>
          <p className="text-[9px] font-bold tracking-wide text-neutral-600 uppercase">{g.titulo}</p>
          {g.partes.map((p) => {
            const n = niveles[p.k];
            return (
              <div key={p.k} className="grid grid-cols-[1fr_28mm_9mm] items-center gap-2 py-[1px]">
                <span className="truncate">{p.nombre}</span>
                <span className="h-1.5 w-full rounded-full bg-neutral-200">
                  <span
                    className={cn('block h-1.5 rounded-full', n ? BARRA[n] : 'bg-neutral-500')}
                    style={{ width: `${Math.max(0, Math.min(100, (100 * p.v) / escala))}%` }}
                  />
                </span>
                <span className={cn('text-right font-medium tabular-nums', n && TEXTO[n])}>{formatearNumero(p.v, 1)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <Bloque titulo={`Partes del Eco Score (de 0 a ${escala})`}>
      <div className="grid grid-cols-2 gap-6">
        {columna(izquierda)}
        {columna(derecha)}
      </div>
    </Bloque>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] tracking-wide text-neutral-600 uppercase">{etiqueta}</p>
      <p className="font-medium">{children}</p>
    </div>
  );
}

function Cifra({ etiqueta, valor, unidad, nivel, nota }: { etiqueta: string; valor: string; unidad: string; nivel?: Nivel | null; nota?: string }) {
  return (
    <div className={cn('rounded p-1.5', nivel ? cn('border-2', FONDO[nivel]) : 'border border-neutral-400')}>
      <p className="text-[9px] tracking-wide text-neutral-600 uppercase">{etiqueta}</p>
      <p className={cn('text-lg leading-tight font-bold tabular-nums', nivel && TEXTO[nivel])}>
        {valor} <span className="text-[10px] font-medium">{unidad}</span>
      </p>
      {nota && <p className={cn('text-[9px]', nivel ? TEXTO[nivel] : 'text-neutral-600')}>{nota}</p>}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-2.5 break-inside-avoid">
      <h2 className="mb-1 border-b border-neutral-400 text-[10px] font-bold tracking-wide uppercase">{titulo}</h2>
      {children}
    </section>
  );
}

function Renglon({ etiqueta, children, fuerte, suave, nivel }: { etiqueta: string; children: ReactNode; fuerte?: boolean; suave?: boolean; nivel?: Nivel }) {
  return (
    <tr className={cn('border-b border-neutral-200', fuerte && 'font-bold')}>
      <td className={cn('py-[2px] pr-2', suave && 'pl-2 text-neutral-600')}>{etiqueta}</td>
      <td className={cn('py-[2px] text-right whitespace-nowrap', nivel && TEXTO[nivel])}>{children}</td>
    </tr>
  );
}

function Punto({ nivel }: { nivel: Nivel }) {
  return <span className={cn('inline-block size-2 rounded-full', BARRA[nivel])} />;
}

function Firma({ titulo }: { titulo: string }) {
  return (
    <div>
      <div className="h-8 border-b border-black" />
      <p className="mt-0.5 font-bold">{titulo}</p>
      <p className="mt-1 text-neutral-600">Aclaración: ____________________ Fecha: ___ / ___ / _____</p>
    </div>
  );
}
