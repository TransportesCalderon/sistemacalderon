'use client';

import { Fragment, useState } from 'react';
import { Ban, Check, ChevronDown, ChevronRight, ClipboardList, LoaderCircle, MessageSquare, Play, Plus, RotateCcw, UserCheck, Wrench } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { BotonCopiar } from '@/modules/telemetria/components/boton-copiar';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Camion3D } from './camion-3d';
import { InsumosOt } from './insumos-ot';
import {
  ETIQUETA_ESTADO_OT,
  ETIQUETA_ORIGEN,
  ETIQUETA_PRIORIDAD,
  VERSION_MANTENIMIENTO,
  type EstadoOt,
  type OrdenTrabajo,
  type Prioridad,
  type Zona,
  ETIQUETA_EQUIPO,
  unidadDe,
  type Equipo,
} from '../../domain/mantenimiento.types';
import { fechaDia } from '../../domain/vencimientos.types';
import {
  useAnularOt,
  useAsignarOt,
  useCrearOt,
  useEquiposMant,
  useIniciarOt,
  useMecanicos,
  useNotaOt,
  useOrdenesTrabajo,
  useTerminarOt,
  useVerificarOt,
  useZonasEquipo,
} from '../../queries/hooks';

const TONO_ESTADO: Record<EstadoOt, Tono> = { pendiente: 'alerta', en_curso: 'marca', terminada: 'exito', verificada: 'neutro', anulada: 'neutro' };
const TONO_PRIORIDAD: Record<Prioridad, Tono> = { normal: 'neutro', alta: 'alerta', urgente: 'error' };
const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
type Filtro = 'abiertas' | 'mias' | 'atrasadas' | 'verificar' | 'cerradas';
const km = (v: number | null, u: 'km' | 'h' = 'km') => (v === null ? null : `${formatearNumero(v, 0)} ${u}`);
const decimal = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};

/**
 * Migración 199 · Mantenimiento › Órdenes de trabajo. Las del plan y de los vencimientos las genera la base;
 * las puntuales las pide la oficina. Qué puede hacer cada uno lo decide la base (acá solo se ocultan botones).
 */
export function OrdenesPantalla() {
  const hay = useBaseTiene(VERSION_MANTENIMIENTO);
  const { rolesApp } = useSesion();
  const pide = (['gerencia', 'operaciones', 'analista_control', 'mantenimiento_jefe', 'ti'] as const).some((r) => rolesApp.includes(r));
  const [filtro, setFiltro] = useState<Filtro>(rolesApp.includes('mecanico') ? 'mias' : 'abiertas');
  const [abierta, setAbierta] = useState<number | null>(null);
  const [nueva, setNueva] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [equipoSel, setEquipoSel] = useState('');
  const { data, isPending, isError, error, refetch, isFetching } = useOrdenesTrabajo(hay, 30);
  const zonas = useZonasEquipo(hay).data ?? [];
  const nombres = Object.fromEntries(zonas.map((z) => [z.codigo, z.nombre]));

  if (!hay) return <Vacio icono={<Wrench className="size-6" />} texto="Falta aplicar en la base el cambio de Mantenimiento (órdenes de trabajo)." />;
  if (isPending) return <Cargando texto="Leyendo las órdenes de trabajo…" />;
  if (isError) return <ErrorLectura texto="No se pudieron leer las órdenes de trabajo." error={error} onReintentar={() => void refetch()} />;

  const abiertas = (o: OrdenTrabajo) => o.estado === 'pendiente' || o.estado === 'en_curso';
  const FILTROS: Record<Filtro, (o: OrdenTrabajo) => boolean> = {
    abiertas,
    mias: (o) => abiertas(o) && (o.mia || o.asignadoA === null),
    atrasadas: (o) => abiertas(o) && o.atrasada,
    verificar: (o) => o.estado === 'terminada',
    cerradas: (o) => o.estado === 'verificada' || o.estado === 'anulada',
  };
  const b = buscar.trim().toLowerCase();
  const delEquipo = (o: OrdenTrabajo) => !equipoSel || `${o.equipo}:${o.equipoId}` === equipoSel;
  const lista = data.filter(
    (o) => FILTROS[filtro](o) && delEquipo(o) && (!b || [o.numero, o.patente, o.titulo, o.asignado].some((t) => t?.toLowerCase().includes(b))),
  );
  // Migración M4: equipos con órdenes abiertas, para verlos en 3D con todo lo que hay que revisar
  const conAbiertas = [...new Map(data.filter(abiertas).map((o) => [`${o.equipo}:${o.equipoId}`, o])).values()].sort((x, y) =>
    x.patente.localeCompare(y.patente, 'es', { numeric: true }),
  );
  const sel = conAbiertas.find((o) => `${o.equipo}:${o.equipoId}` === equipoSel) ?? null;
  const abiertasSel = sel ? data.filter((o) => abiertas(o) && delEquipo(o)) : [];
  const cuenta = (f: Filtro) => data.filter(FILTROS[f]).length;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Órdenes de trabajo" subtitulo="Mantenimiento">
        {pide && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNueva(true)}>
            <Plus className="size-4" /> Nueva orden de trabajo
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Las del plan y las de los vencimientos salen solas; las puntuales las pide la oficina. Mantenimiento las toma, las hace y las termina; el Jefe
        asigna y verifica.
      </p>

      {nueva && <NuevaOt zonas={zonas} onCerrar={() => setNueva(false)} />}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['mias', 'Mías y sin asignar'],
            ['abiertas', 'Abiertas'],
            ['atrasadas', 'Atrasadas'],
            ['verificar', 'Para verificar'],
            ['cerradas', 'Cerradas (30 días)'],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFiltro(k)}
            className={cn('rounded-full border px-3 py-1 text-sm', filtro === k ? 'border-marca bg-marca/10 text-marca' : 'border-borde text-tinta-suave hover:bg-hover')}
          >
            {t} ({cuenta(k)})
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Buscar"
          className={cn(CONTROL_FILTRO, 'h-10 w-full max-w-sm')}
          placeholder="Buscar OT, patente, tarea o mecánico…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
        <select aria-label="Equipo" className={cn(CONTROL_FILTRO, 'h-10')} value={equipoSel} onChange={(e) => setEquipoSel(e.target.value)}>
          <option value="">Todos los equipos</option>
          {conAbiertas.map((o) => (
            <option key={`${o.equipo}:${o.equipoId}`} value={`${o.equipo}:${o.equipoId}`}>
              {o.patente} ({ETIQUETA_EQUIPO[o.equipo].toLowerCase()}) · {data.filter((x) => abiertas(x) && x.equipo === o.equipo && x.equipoId === o.equipoId).length} abiertas
            </option>
          ))}
        </select>
      </div>

      {sel && (
        <div className={cn(TARJETA, 'max-w-4xl space-y-2 p-4')}>
          <p className="font-medium text-tinta">
            <span className="font-mono">{sel.patente}</span> · lo que hay que revisar ({abiertasSel.length} {abiertasSel.length === 1 ? 'orden abierta' : 'órdenes abiertas'})
          </p>
          {sel.equipo !== 'genset' && (
            <Camion3D
              equipo={sel.equipo}
              marca={sel.marca}
              modelo={sel.modelo}
              tipoSemi={sel.tipoSemi}
              zonas={[...new Set(abiertasSel.flatMap((o) => o.zonas))]}
              nombres={nombres}
            />
          )}
          <ul className="text-sm text-tinta">
            {abiertasSel.map((o) => (
              <li key={o.id}>
                <span className="font-mono">{o.numero}</span> · {o.titulo}
                {o.zonas.length > 0 && <span className="text-tinta-suave"> · {o.zonas.map((z) => nombres[z] ?? z).join(', ')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={cn(TARJETA, 'overflow-x-auto', isFetching && 'opacity-80')}>
        <table className="w-full min-w-[940px] text-sm">
          <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
            <tr>
              <th className={cn(TH, 'w-8')} />
              <th className={TH}>OT</th>
              <th className={TH}>Equipo</th>
              <th className={TH}>Tarea</th>
              <th className={TH}>Hacer antes de</th>
              <th className={TH}>Estado</th>
              <th className={TH}>Asignada a</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => {
              const ab = abierta === o.id;
              return (
                <Fragment key={o.id}>
                  <tr
                    className={cn('cursor-pointer border-b border-borde hover:bg-hover', ab && 'bg-[#e7f0fa] hover:bg-[#e7f0fa]')}
                    onClick={() => setAbierta(ab ? null : o.id)}
                    aria-expanded={ab}
                  >
                    <td className={cn(TD, 'text-tinta-suave')}>{ab ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className={TD}>
                      <button type="button" className="font-mono font-semibold text-tinta outline-none focus-visible:underline">
                        {o.numero}
                      </button>
                      <span className="block text-xs text-tinta-suave">{ETIQUETA_ORIGEN[o.origen]}</span>
                    </td>
                    <td className={TD}>
                      <span className="font-mono font-semibold">{o.patente}</span>
                      <span className="block text-xs text-tinta-suave">{o.equipo === 'semi' ? `Semi ${o.tipoSemi ?? ''}` : ETIQUETA_EQUIPO[o.equipo]}</span>
                    </td>
                    <td className={TD}>
                      <span className="text-tinta">{o.titulo}</span>
                      {o.prioridad !== 'normal' && (
                        <span className="ml-2">
                          <Chip tono={TONO_PRIORIDAD[o.prioridad]}>{ETIQUETA_PRIORIDAD[o.prioridad]}</Chip>
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, 'whitespace-nowrap', o.atrasada && 'font-semibold text-error')}>
                      {[o.fechaLimite ? fechaDia(o.fechaLimite) : null, km(o.kmLimite, unidadDe(o.equipo))].filter(Boolean).join(' o ') || '—'}
                      {o.kmActual !== null && o.kmLimite !== null && <span className="block text-xs font-normal text-tinta-suave">va {km(o.kmActual, unidadDe(o.equipo))}</span>}
                    </td>
                    <td className={TD}>
                      <Chip tono={o.atrasada ? 'error' : TONO_ESTADO[o.estado]}>{o.atrasada ? 'Atrasada' : ETIQUETA_ESTADO_OT[o.estado]}</Chip>
                    </td>
                    <td className={cn(TD, 'text-tinta-suave')}>{o.asignado ?? 'Sin asignar'}</td>
                  </tr>
                  {ab && (
                    <tr className="border-b border-borde bg-[#f5f9fd]">
                      <td colSpan={7} className="p-3">
                        <DetalleOt o={o} zonas={zonas} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-tinta-suave">
                  No hay órdenes con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SelectorZonas({ zonas, equipo, valor, onCambiar }: { zonas: Zona[]; equipo: Equipo; valor: string[]; onCambiar: (z: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {zonas
        .filter((z) => (equipo === 'tractor' ? z.tractor : equipo === 'semi' ? z.semi : z.genset))
        .map((z) => {
          const on = valor.includes(z.codigo);
          return (
            <button
              key={z.codigo}
              type="button"
              onClick={() => onCambiar(on ? valor.filter((x) => x !== z.codigo) : [...valor, z.codigo])}
              className={cn('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-[#d4a106] bg-[#fff4c2] text-[#6b5000]' : 'border-borde text-tinta-suave hover:bg-hover')}
            >
              {z.nombre}
            </button>
          );
        })}
    </div>
  );
}

function NuevaOt({ zonas, onCerrar }: { zonas: Zona[]; onCerrar: () => void }) {
  const { rolesApp } = useSesion();
  const asigna = rolesApp.includes('mantenimiento_jefe') || rolesApp.includes('ti');
  const equipos = useEquiposMant(true).data ?? [];
  const mecanicos = useMecanicos(asigna).data ?? [];
  const crear = useCrearOt();
  const envio = useEnvio();
  const [eq, setEq] = useState('');
  const [titulo, setTitulo] = useState('');
  const [desc, setDesc] = useState('');
  const [zs, setZs] = useState<string[]>([]);
  const [prio, setPrio] = useState<Prioridad>('normal');
  const [limite, setLimite] = useState('');
  const [asignado, setAsignado] = useState('');
  const elegido = equipos.find((e) => `${e.equipo}:${e.id}` === eq);

  return (
    <div className={cn(TARJETA, 'max-w-3xl space-y-3 p-4')}>
      <p className="font-medium text-tinta">Nueva orden de trabajo</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Equipo</span>
          <select
            className={cn(CONTROL_FILTRO, 'h-10 w-full')}
            value={eq}
            onChange={(e) => {
              setEq(e.target.value);
              setZs([]);
            }}
          >
            <option value="">Elegí el tractor, el semi o el genset…</option>
            <optgroup label="Tractores">
              {equipos
                .filter((e) => e.equipo === 'tractor')
                .map((e) => (
                  <option key={`t${e.id}`} value={`tractor:${e.id}`}>
                    {e.patente} {e.descripcion ? `· ${e.descripcion}` : ''}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Semis">
              {equipos
                .filter((e) => e.equipo === 'semi')
                .map((e) => (
                  <option key={`s${e.id}`} value={`semi:${e.id}`}>
                    {e.patente} {e.descripcion ? `· ${e.descripcion}` : ''}
                  </option>
                ))}
            </optgroup>
            {equipos.some((e) => e.equipo === 'genset') && (
              <optgroup label="Gensets">
                {equipos
                  .filter((e) => e.equipo === 'genset')
                  .map((e) => (
                    <option key={`g${e.id}`} value={`genset:${e.id}`}>
                      {e.patente} {e.descripcion ? `· ${e.descripcion}` : ''}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Qué hay que hacer</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} placeholder="Ej.: Ruido en frenos del eje 2" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="block text-xs text-tinta-suave">Detalle (opcional)</span>
          <textarea className={cn(CONTROL_FILTRO, 'min-h-16 w-full py-2')} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Prioridad</span>
          <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={prio} onChange={(e) => setPrio(e.target.value as Prioridad)}>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Hacer antes del (opcional)</span>
          <input type="date" className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={limite} onChange={(e) => setLimite(e.target.value)} />
        </label>
        {asigna && (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Asignar a (opcional)</span>
            <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={asignado} onChange={(e) => setAsignado(e.target.value)}>
              <option value="">Sin asignar</option>
              {mecanicos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {elegido && (
        <div className="space-y-1">
          <span className="block text-xs text-tinta-suave">Qué revisar (se marca en amarillo): elegilo en la lista o tocá el camión</span>
          <SelectorZonas zonas={zonas} equipo={elegido.equipo} valor={zs} onCambiar={setZs} />
          {elegido.equipo !== 'genset' && (
            <Camion3D
              equipo={elegido.equipo}
              marca={elegido.equipo === 'tractor' ? elegido.descripcion : null}
              tipoSemi={elegido.equipo === 'semi' ? elegido.descripcion : null}
              zonas={zs}
              nombres={Object.fromEntries(zonas.map((z) => [z.codigo, z.nombre]))}
              onTocar={(z) => setZs((v) => (v.includes(z) ? v.filter((x) => x !== z) : [...v, z]))}
              alto={240}
            />
          )}
        </div>
      )}
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={crear.isPending}
          onClick={() =>
            void envio.enviar(
              crear.mutateAsync({
                equipo: elegido?.equipo ?? 'tractor',
                equipoId: elegido?.id ?? 0,
                titulo,
                descripcion: desc.trim() || null,
                zonas: zs,
                prioridad: prio,
                fechaLimite: limite || null,
                asignado: asignado ? Number(asignado) : null,
              }),
              onCerrar,
            )
          }
        >
          {crear.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Crear orden
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function DetalleOt({ o, zonas }: { o: OrdenTrabajo; zonas: Zona[] }) {
  const { rolesApp, zonaHoraria, usuarioId } = useSesion();
  const jefe = rolesApp.includes('mantenimiento_jefe') || rolesApp.includes('ti');
  const mecanico = rolesApp.includes('mecanico');
  const verifica = useCan('mantenimiento.ordenes:transicionar') && jefe;
  const abierta = o.estado === 'pendiente' || o.estado === 'en_curso';
  const trabaja = abierta && (jefe || (mecanico && (o.mia || o.asignadoA === null)));
  const anula = abierta && (jefe || rolesApp.includes('gerencia') || (o.estado === 'pendiente' && o.creadoPorId === usuarioId));
  const [panel, setPanel] = useState<'terminar' | 'anular' | 'devolver' | 'nota' | null>(null);
  const envio = useEnvio();
  const asignar = useAsignarOt();
  const iniciar = useIniciarOt();
  const verificar = useVerificarOt();
  const mecanicos = useMecanicos(jefe && abierta).data ?? [];
  const nombreZona = (c: string) => zonas.find((z) => z.codigo === c)?.nombre ?? c;

  return (
    <div className={cn(TARJETA, 'max-w-4xl space-y-4 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-tinta">
            <span className="font-mono">{o.numero}</span> · {o.titulo}
          </p>
          <p className="text-xs text-tinta-suave">
            {o.equipo === 'semi' ? `Semi ${o.patente} · ${o.tipoSemi ?? ''}` : `${ETIQUETA_EQUIPO[o.equipo]} ${o.patente} · ${[o.marca, o.modelo].filter(Boolean).join(' ')}`} · pedida por{' '}
            {o.creadoPor ?? 'el sistema'} el {formatearFechaHora(o.creadoEn, zonaHoraria)}
          </p>
        </div>
        <Chip tono={TONO_PRIORIDAD[o.prioridad]}>Prioridad {ETIQUETA_PRIORIDAD[o.prioridad].toLowerCase()}</Chip>
      </div>

      {o.descripcion && <p className="text-sm text-tinta">{o.descripcion}</p>}
      {o.zonas.length > 0 && o.equipo === 'genset' && <p className="text-sm text-tinta">Revisar: {o.zonas.map(nombreZona).join(', ')}</p>}
      {o.zonas.length > 0 && o.equipo !== 'genset' && (
        <Camion3D
          equipo={o.equipo}
          marca={o.marca}
          modelo={o.modelo}
          tipoSemi={o.tipoSemi}
          zonas={o.zonas}
          nombres={Object.fromEntries(o.zonas.map((z) => [z, nombreZona(z)]))}
          alto={240}
        />
      )}

      <div className="space-y-2 rounded-md bg-hover p-3">
        <p className="whitespace-pre-line text-sm text-tinta">{o.mensaje}</p>
        <BotonCopiar texto={o.mensaje} />
      </div>

      {(o.estado === 'terminada' || o.estado === 'verificada') && (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
          <dt className="text-tinta-suave">Trabajo hecho</dt>
          <dd className="text-tinta">{o.trabajoRealizado}</dd>
          <dt className="text-tinta-suave">Terminada</dt>
          <dd className="text-tinta">
            {o.terminadaPor} · {o.terminadaEn ? formatearFechaHora(o.terminadaEn, zonaHoraria) : ''}
            {o.kmAlTerminar !== null && ` · ${km(o.kmAlTerminar, unidadDe(o.equipo))}`}
          </dd>
          {o.repuestos && (
            <>
              <dt className="text-tinta-suave">Repuestos</dt>
              <dd className="text-tinta">{o.repuestos}</dd>
            </>
          )}
          {(o.costo !== null || o.proveedor) && (
            <>
              <dt className="text-tinta-suave">Costo / taller</dt>
              <dd className="text-tinta">{[o.costo !== null ? `${o.moneda} ${formatearNumero(o.costo, 0)}` : null, o.proveedor].filter(Boolean).join(' · ')}</dd>
            </>
          )}
          {o.verificadaPor && (
            <>
              <dt className="text-tinta-suave">Verificada por</dt>
              <dd className="text-tinta">{o.verificadaPor}</dd>
            </>
          )}
        </dl>
      )}
      {o.estado === 'anulada' && <p className="text-sm text-tinta-suave">Anulada: {o.motivoAnulacion}</p>}

      {/* Migración 216: insumos del stock usados en la orden (se cargan mientras está abierta o recién terminada) */}
      <InsumosOt ot={o.id} puedeCargar={trabaja || (o.estado === 'terminada' && (jefe || mecanico))} />

      <div className="flex flex-wrap items-center gap-2">
        {abierta && jefe && (
          <select
            aria-label="Asignar a"
            className={cn(CONTROL_FILTRO, 'h-9')}
            value={o.asignadoA ?? ''}
            disabled={asignar.isPending}
            onChange={(e) => void envio.enviar(asignar.mutateAsync({ id: o.id, usuario: e.target.value ? Number(e.target.value) : null }), () => undefined)}
          >
            <option value="">Sin asignar</option>
            {mecanicos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        )}
        {abierta && mecanico && !jefe && o.asignadoA === null && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => void envio.enviar(asignar.mutateAsync({ id: o.id, usuario: usuarioId }), () => undefined)}>
            <UserCheck className="size-4" /> Tomarla
          </button>
        )}
        {trabaja && o.estado === 'pendiente' && (
          <button type="button" className={BOTON_SECUNDARIO} disabled={iniciar.isPending} onClick={() => void envio.enviar(iniciar.mutateAsync({ id: o.id }), () => undefined)}>
            <Play className="size-4" /> Empezar
          </button>
        )}
        {trabaja && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setPanel(panel === 'terminar' ? null : 'terminar')}>
            <Check className="size-4" /> Terminar
          </button>
        )}
        {verifica && o.estado === 'terminada' && (
          <>
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={verificar.isPending}
              onClick={() => void envio.enviar(verificar.mutateAsync({ id: o.id, ok: true, comentario: null }), () => undefined)}
            >
              <Check className="size-4" /> Verificar
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'devolver' ? null : 'devolver')}>
              <RotateCcw className="size-4" /> Devolver
            </button>
          </>
        )}
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'nota' ? null : 'nota')}>
          <MessageSquare className="size-4" /> Nota
        </button>
        {anula && (
          <button type="button" className="text-sm text-error hover:underline" onClick={() => setPanel(panel === 'anular' ? null : 'anular')}>
            <Ban className="mr-1 inline size-4" />
            Anular
          </button>
        )}
      </div>
      <ErrorBase error={envio.error} />

      {panel === 'terminar' && <Terminar o={o} onCerrar={() => setPanel(null)} />}
      {(panel === 'anular' || panel === 'devolver' || panel === 'nota') && <Texto o={o} modo={panel} onCerrar={() => setPanel(null)} />}

      {o.notas.length > 0 && (
        <ul className="space-y-1 border-t border-borde pt-2 text-xs text-tinta-suave">
          <li className="flex items-center gap-1 font-medium text-tinta">
            <ClipboardList className="size-3.5" /> Historial
          </li>
          {o.notas.map((n, k) => (
            <li key={k}>
              {formatearFechaHora(n.en, zonaHoraria)} · {n.por ?? 'Sistema'}: <span className="text-tinta">{n.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Terminar({ o, onCerrar }: { o: OrdenTrabajo; onCerrar: () => void }) {
  const terminar = useTerminarOt();
  const envio = useEnvio();
  const [trabajo, setTrabajo] = useState('');
  const [kmT, setKmT] = useState('');
  const [rep, setRep] = useState('');
  const [costo, setCosto] = useState('');
  const [moneda, setMoneda] = useState('CLP');
  const [prov, setProv] = useState('');
  return (
    <div className="space-y-3 rounded-md border border-marca/40 bg-panel p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="block text-xs text-tinta-suave">Qué se hizo</span>
          <textarea className={cn(CONTROL_FILTRO, 'min-h-16 w-full py-2')} value={trabajo} onChange={(e) => setTrabajo(e.target.value)} />
        </label>
        {o.equipo !== 'semi' && (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">{o.equipo === 'genset' ? 'Horas del horómetro (vacío = las últimas anotadas)' : 'Km del tractor (vacío = el del GPS)'}</span>
            <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="numeric" value={kmT} onChange={(e) => setKmT(e.target.value)} />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Repuestos (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={rep} onChange={(e) => setRep(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Costo (opcional)</span>
            <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Moneda</span>
            <select className={cn(CONTROL_FILTRO, 'h-10')} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="CLP">CLP</option>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Taller o proveedor (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={prov} onChange={(e) => setProv(e.target.value)} />
        </label>
      </div>
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={terminar.isPending}
          onClick={() =>
            void envio.enviar(
              terminar.mutateAsync({
                id: o.id,
                trabajo,
                km: decimal(kmT),
                repuestos: rep.trim() || null,
                costo: decimal(costo),
                moneda: costo.trim() ? moneda : null,
                proveedor: prov.trim() || null,
              }),
              onCerrar,
            )
          }
        >
          {terminar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Terminar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Texto({ o, modo, onCerrar }: { o: OrdenTrabajo; modo: 'anular' | 'devolver' | 'nota'; onCerrar: () => void }) {
  const anular = useAnularOt();
  const verificar = useVerificarOt();
  const nota = useNotaOt();
  const envio = useEnvio();
  const [t, setT] = useState('');
  const ph = { anular: 'Por qué se anula', devolver: 'Qué falta (vuelve a «en curso»)', nota: 'Escribí la nota' }[modo];
  const enviar = () =>
    modo === 'anular'
      ? anular.mutateAsync({ id: o.id, motivo: t })
      : modo === 'devolver'
        ? verificar.mutateAsync({ id: o.id, ok: false, comentario: t })
        : nota.mutateAsync({ id: o.id, texto: t });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={cn(CONTROL_FILTRO, 'h-9 min-w-64 flex-1')} placeholder={ph} value={t} onChange={(e) => setT(e.target.value)} />
      <button type="button" className={BOTON_SECUNDARIO} onClick={() => void envio.enviar(enviar(), onCerrar)}>
        <Check className="size-4" /> {modo === 'anular' ? 'Anular' : modo === 'devolver' ? 'Devolver' : 'Guardar nota'}
      </button>
      <ErrorBase error={envio.error} />
    </div>
  );
}
