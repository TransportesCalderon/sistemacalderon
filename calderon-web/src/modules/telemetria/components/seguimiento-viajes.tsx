'use client';

import { Fragment, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Fuel, History, LoaderCircle, Radar } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';

const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 whitespace-nowrap';
import {
  ETIQUETA_RESULTADO,
  VERSION_PEDIDO_CARGA,
  VERSION_SEGUIMIENTO,
  VERSION_SEGUIMIENTO_DESDE,
  VERSION_SEGUIMIENTO_FOTO,
  type Estado,
  type Evaluacion,
  type Resultado,
  type ViajeEnCurso,
} from '../domain/seguimiento.types';
import { useControlesViaje, useRegistrarSeguimiento, useRegistrarSeguimientoFoto, useSeguimientoDesde, useViajesEnCurso } from '../queries/hooks';
import { SubirFotoComputadora, VerFotoControl, type FotoLeida } from './foto-computadora';
import { BotonCopiar } from './boton-copiar';
import { PedidoCarga } from './pedido-carga';

const TONO_RESULTADO: Record<Resultado, Tono> = { bien: 'exito', a_mejorar: 'alerta', mal: 'error', sin_datos: 'neutro' };
const COLOR_ESTADO: Record<NonNullable<Estado>, string> = { verde: 'text-exito', naranja: 'text-alerta', rojo: 'text-error' };
const num = (v: number | null, d = 1) => (v === null ? '—' : formatearNumero(v, d));
type Desde = 'salida' | 'control' | 'otro';
const decimal = (s: string) => {
  const t = s.trim().replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};

/**
 * Migración 194 · Telemetría › Seguimiento de viajes: cada viaje en curso con cómo viene (consumo
 * contra el objetivo del viaje y programador). La base interpreta el resultado y escribe el mensaje;
 * «Registrar control» lo guarda y «Copiar» lo deja listo para pegar en WhatsApp.
 */
export function SeguimientoViajes() {
  const { rolesApp, zonaHoraria } = useSesion();
  const hay = useBaseTiene(VERSION_SEGUIMIENTO);
  const registra = rolesApp.includes('analista_control') || rolesApp.includes('ti');
  const { data, isPending, isError, error, refetch, isFetching } = useViajesEnCurso(hay);
  // Lista de los tractores en viaje (A → Z); al tocar uno se despliega su seguimiento debajo, como en la Pizarra
  const [abierto, setAbierto] = useState<number | null>(null);
  const [filtro, setFiltro] = useState('');
  const f = filtro.trim().toLowerCase();
  const lista = [...(data ?? [])]
    .sort((a, b) => a.patente.localeCompare(b.patente, 'es', { numeric: true }))
    .filter((v) => !f || [v.patente, v.chofer, v.marca, v.linea].some((x) => x?.toLowerCase().includes(f)));

  if (!hay) return <Vacio icono={<Radar className="size-6" />} texto="Falta aplicar en la base el cambio del seguimiento de viajes." />;
  return (
    <div className="space-y-5">
      <Encabezado titulo="Seguimiento de viajes" subtitulo="Telemetría" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Cómo viene cada viaje desde la salida: consumo contra el objetivo del viaje (el mismo del cierre) y uso del programador. Tocá un tractor para ver el
        detalle: el sistema arma el mensaje para el chofer; registrá el control y copialo para mandarlo por WhatsApp.
      </p>
      {isPending ? (
        <Cargando texto="Leyendo los viajes en curso…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo leer.'} onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Radar className="size-6" />} texto="No hay viajes en curso." />
      ) : (
        <div className={cn('space-y-3', isFetching && 'opacity-80')}>
          <input
            type="search"
            aria-label="Buscar"
            className={cn(CONTROL_FILTRO, 'h-10 w-full max-w-md')}
            placeholder={`Buscar patente, chofer, marca o línea (${data.length} en viaje)…`}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <div className={cn(TARJETA, 'overflow-x-auto')}>
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className={cn(TH, 'w-8')} />
                  <th className={TH}>Patente</th>
                  <th className={TH}>Chofer</th>
                  <th className={TH}>Marca</th>
                  <th className={TH}>Salida</th>
                  <th className={TH}>Línea</th>
                  <th className={cn(TH, 'text-right')}>Km</th>
                  <th className={cn(TH, 'text-right')}>Litros</th>
                  <th className={cn(TH, 'text-right')}>L/100 km</th>
                  <th className={cn(TH, 'text-right')}>Programador</th>
                  <th className={TH}>Estado</th>
                  <th className={TH}>Último control</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((v) => {
                  const ab = abierto === v.viajeId;
                  const e = v.evaluacion;
                  return (
                    <Fragment key={v.viajeId}>
                      <tr
                        className={cn('cursor-pointer border-b border-borde hover:bg-hover', ab && 'bg-[#e7f0fa] hover:bg-[#e7f0fa]')}
                        onClick={() => setAbierto(ab ? null : v.viajeId)}
                        aria-expanded={ab}
                      >
                        <td className={cn(TD, 'text-tinta-suave')}>{ab ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                        <td className={TD}>
                          <button type="button" className="font-mono font-semibold tracking-wide text-tinta outline-none focus-visible:underline">
                            {v.patente}
                          </button>
                        </td>
                        <td className={TD}>
                          {v.chofer ?? 'Sin chofer'}
                          {v.choferViaje && <span className="block text-xs text-alerta">Viaje de {v.choferViaje}</span>}
                        </td>
                        <td className={cn(TD, 'text-tinta-suave')}>{v.marca ?? '—'}</td>
                        <td className={cn(TD, 'tabular-nums')}>{formatearFechaHora(v.salidaTs, zonaHoraria)}</td>
                        <td className={cn(TD, 'text-tinta-suave')}>{v.linea ?? '—'}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{num(v.km, 0)}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{num(v.litros, 0)}</td>
                        <td className={cn(TD, 'text-right font-semibold tabular-nums', e.estadoConsumo && COLOR_ESTADO[e.estadoConsumo])}>{num(e.l100km)}</td>
                        <td className={cn(TD, 'text-right font-semibold tabular-nums', e.estadoProgramador && COLOR_ESTADO[e.estadoProgramador])}>
                          {v.programadorPct === null ? '—' : `${num(v.programadorPct, 0)} %`}
                        </td>
                        <td className={TD}>
                          <Chip tono={TONO_RESULTADO[e.resultado]}>{ETIQUETA_RESULTADO[e.resultado]}</Chip>
                        </td>
                        <td className={cn(TD, 'text-xs text-tinta-suave')}>
                          {v.ultimoControl ? formatearFechaHora(v.ultimoControl.en, zonaHoraria) : '—'}
                          {v.controlesHoy > 0 && ` · ${v.controlesHoy} hoy`}
                          {/* Migración 259: cómo va la última solicitud de carga por sistema */}
                          {v.solicitudCarga && (
                            <span
                              className={cn(
                                'block',
                                v.solicitudCarga.estado === 'pendiente' ? 'text-alerta' : v.solicitudCarga.estado === 'aprobada' ? 'text-exito' : 'text-error',
                              )}
                              title={v.solicitudCarga.motivoRechazo ?? undefined}
                            >
                              <Fuel className="mr-1 inline size-3" />
                              {v.solicitudCarga.estado === 'pendiente'
                                ? 'Carga pendiente'
                                : v.solicitudCarga.estado === 'aprobada'
                                  ? `Carga aprobada${v.solicitudCarga.orden ? ` · ${v.solicitudCarga.orden}` : ''}`
                                  : 'Carga rechazada'}
                            </span>
                          )}
                        </td>
                      </tr>
                      {ab && (
                        <tr className="border-b border-borde bg-[#f5f9fd]">
                          <td colSpan={12} className="p-3">
                            <TarjetaViaje v={v} registra={registra} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-tinta-suave">
                      Ningún tractor coincide con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaViaje({ v, registra }: { v: ViajeEnCurso; registra: boolean }) {
  const { zonaHoraria } = useSesion();
  const registrar = useRegistrarSeguimiento();
  const registrarFoto = useRegistrarSeguimientoFoto();
  const envio = useEnvio();
  // Migración 240: foto de la computadora de a bordo (la IA la lee; la base calcula los litros)
  const conFoto = useBaseTiene(VERSION_SEGUIMIENTO_FOTO);
  const [foto, setFoto] = useState<FotoLeida | null>(null);
  const aTexto = (x: number | null) => (x === null ? '' : String(x));
  const [manual, setManual] = useState(!v.conTelemetria);
  const [km, setKm] = useState('');
  const [litros, setLitros] = useState('');
  const [prog, setProg] = useState('');
  const [hecho, setHecho] = useState<Evaluacion | null>(null);
  const [historial, setHistorial] = useState(false);
  // Migración 195: pedido de carga de combustible para Gerencia (259: solicitud con el formulario de la orden)
  const conPedido = useBaseTiene(VERSION_PEDIDO_CARGA);
  const [pedido, setPedido] = useState(false);
  // Migración 197: desde qué momento se mide (salida, último control u otro momento)
  const conDesde = useBaseTiene(VERSION_SEGUIMIENTO_DESDE);
  const [modo, setModo] = useState<Desde>('salida');
  const [otro, setOtro] = useState(() => isoAHoraLocal(v.salidaTs, zonaHoraria));
  const desde = modo === 'salida' ? null : modo === 'control' ? (v.ultimoControl?.en ?? null) : horaLocalAIso(otro, zonaHoraria);
  const tramo = useSeguimientoDesde(v.viajeId, conDesde ? desde : null);
  const n = tramo.data ?? v;
  const e = hecho ?? (desde && !tramo.data ? null : n.evaluacion);
  const elegir = (m: Desde) => {
    setModo(m);
    setHecho(null);
  };

  return (
    <div className={cn(TARJETA, 'max-w-3xl space-y-3 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-tinta">
            <span className="font-mono">{v.patente}</span> · {v.chofer ?? 'Sin chofer'}
          </p>
          <p className="text-xs text-tinta-suave">
            {v.marca ?? ''} · salió {formatearFechaHora(v.salidaTs, zonaHoraria)}
            {v.linea && ` · ${v.linea}`}
          </p>
          {v.choferViaje && (
            <p className="text-xs text-alerta">El viaje lo empezó {v.choferViaje}: si cambió el chofer, cambialo también en el viaje (para el cierre).</p>
          )}
        </div>
        {e && <Chip tono={TONO_RESULTADO[e.resultado]}>{ETIQUETA_RESULTADO[e.resultado]}</Chip>}
      </div>

      {conDesde && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-tinta-suave">Medir desde</span>
          {(
            [
              ['salida', 'La salida'],
              ['control', 'El último control'],
              ['otro', 'Otro momento'],
            ] as const
          ).map(([m, t]) =>
            m === 'control' && !v.ultimoControl ? null : (
              <button
                key={m}
                type="button"
                className={cn('rounded-full border px-3 py-1', modo === m ? 'border-marca bg-marca/10 text-marca' : 'border-borde text-tinta-suave hover:bg-hover')}
                onClick={() => elegir(m)}
              >
                {t}
              </button>
            ),
          )}
          {modo === 'otro' && (
            <input
              type="datetime-local"
              aria-label="Desde"
              className={cn(CONTROL_FILTRO, 'h-8')}
              value={otro}
              onChange={(x) => {
                setOtro(x.target.value);
                setHecho(null);
              }}
            />
          )}
          {desde && tramo.data && <span className="text-tinta-suave">desde {formatearFechaHora(tramo.data.desde, zonaHoraria)}</span>}
        </div>
      )}

      {tramo.isError ? (
        <ErrorLectura texto="No se pudo medir desde ese momento." error={tramo.error} onReintentar={() => void tramo.refetch()} />
      ) : !e ? (
        <Cargando texto="Calculando desde ese momento…" />
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-2 text-sm">
            <Dato etiqueta="Km">{num(n.km, 0)}</Dato>
            <Dato etiqueta="Litros">{num(n.litros, 0)}</Dato>
            <Dato etiqueta="L/100 km">
              <span className={e.estadoConsumo ? COLOR_ESTADO[e.estadoConsumo] : undefined}>{num(e.l100km)}</span>
              {e.objetivoL100km !== null ? (
                <span className="block text-xs text-tinta-suave">objetivo {num(e.objetivoL100km)}</span>
              ) : (
                e.l100km !== null && <span className="block text-xs text-alerta">sin objetivo</span>
              )}
            </Dato>
            <Dato etiqueta="Programador">
              <span className={e.estadoProgramador ? COLOR_ESTADO[e.estadoProgramador] : undefined}>
                {n.programadorPct === null ? '—' : `${num(n.programadorPct, 0)} %`}
              </span>
            </Dato>
          </dl>
          {/* Migración 241: nota para la oficina (no va en el mensaje al chofer) */}
          {e.nota && <p className="rounded-md bg-alerta-suave p-2 text-xs text-alerta">{e.nota}</p>}
          {!n.conTelemetria && (
            <p className="text-xs text-alerta">{n.motivoSinLitros ?? 'La telemetría de esta marca no da el consumo: cargá los números de su plataforma.'}</p>
          )}

          <div className="space-y-2 rounded-md bg-hover p-3">
            <p className="whitespace-pre-line text-sm text-tinta">{e.mensaje}</p>
            <BotonCopiar texto={e.mensaje} />
          </div>
        </>
      )}

      {registra && (
        <div className="space-y-2">
          {conFoto && (
            <div className="space-y-2 rounded-md border border-borde p-3">
              {foto ? (
                <div className="flex flex-wrap items-start gap-3">
                  {foto.url && (
                    <a href={foto.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- enlace temporal de Storage */}
                      <img src={foto.url} alt="Computadora de a bordo" className="h-24 rounded object-cover" />
                    </a>
                  )}
                  <div className="space-y-1 text-sm">
                    <p className="text-tinta">
                      La IA leyó: <b>{num(foto.datos.km)} km</b>
                      {foto.datos.l100km !== null && (
                        <>
                          {' '}
                          · <b>{num(foto.datos.l100km)} L/100 km</b>
                        </>
                      )}
                      {foto.datos.litros !== null && <> → {num(foto.datos.litros, 0)} L</>}
                    </p>
                    {foto.datos.avisos.map((a) => (
                      <p key={a} className="text-xs text-alerta">
                        {a}
                      </p>
                    ))}
                    <p className="text-xs text-tinta-suave">Revisá los números de abajo antes de registrar.</p>
                    <button type="button" className="text-xs text-marca hover:underline" onClick={() => setFoto(null)}>
                      Quitar la foto
                    </button>
                  </div>
                </div>
              ) : (
                <SubirFotoComputadora
                  viajeId={v.viajeId}
                  onLeida={(f) => {
                    setFoto(f);
                    setManual(true);
                    setKm(aTexto(f.datos.km));
                    setLitros(aTexto(f.datos.litros));
                    setProg(aTexto(f.datos.programadorPct));
                    setHecho(null);
                  }}
                />
              )}
              <p className="text-xs text-tinta-suave">
                Para que los números sean del viaje, el chofer tiene que poner en cero «Desde reset» al salir (o medí «desde» el momento del reset).
              </p>
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-xs text-tinta-suave">
            <input type="checkbox" className="accent-marca" checked={manual} onChange={(x) => setManual(x.target.checked)} /> Cargar los números a mano (de la
            plataforma de la marca)
          </label>
          {manual && (
            <div className="grid grid-cols-3 gap-2">
              <input className={CONTROL_FILTRO} inputMode="decimal" placeholder="Km" value={km} onChange={(x) => setKm(x.target.value)} />
              <input className={CONTROL_FILTRO} inputMode="decimal" placeholder="Litros" value={litros} onChange={(x) => setLitros(x.target.value)} />
              <input className={CONTROL_FILTRO} inputMode="decimal" placeholder="% programador" value={prog} onChange={(x) => setProg(x.target.value)} />
            </div>
          )}
          <ErrorBase error={envio.error} />
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={registrar.isPending || registrarFoto.isPending}
            onClick={() =>
              void envio.enviar(
                (foto
                  ? registrarFoto.mutateAsync({
                      viajeId: v.viajeId,
                      lecturaId: foto.lecturaId,
                      foto: foto.ruta,
                      desde: conDesde && desde ? desde : null,
                      km: decimal(km),
                      litros: decimal(litros),
                      programador: decimal(prog),
                    })
                  : registrar.mutateAsync({
                    viajeId: v.viajeId,
                    km: manual ? decimal(km) : null,
                    litros: manual ? decimal(litros) : null,
                    programador: manual ? decimal(prog) : null,
                      ...(conDesde && desde ? { desde } : {}),
                    })
                ).then((r) => {
                  if (r.ok) {
                    setHecho(r.data);
                    setFoto(null);
                  }
                  return r;
                }),
                () => undefined,
              )
            }
          >
            {registrar.isPending || registrarFoto.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Registrar control
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tinta-suave">
        <span>
          {v.ultimoControl
            ? `Último control: ${formatearFechaHora(v.ultimoControl.en, zonaHoraria)} por ${v.ultimoControl.por ?? '—'} (${ETIQUETA_RESULTADO[v.ultimoControl.resultado]})`
            : 'Sin controles todavía'}
          {v.controlesHoy > 0 && ` · ${v.controlesHoy} hoy`}
        </span>
        <span className="flex items-center gap-3">
          {conPedido && (
            <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setPedido(!pedido)}>
              <Fuel className="size-3.5" /> {pedido ? 'Cerrar la solicitud de carga' : 'Solicitar carga'}
            </button>
          )}
          <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setHistorial(!historial)}>
            <History className="size-3.5" /> {historial ? 'Ocultar historial' : 'Historial'}
          </button>
        </span>
      </div>
      {pedido && <PedidoCarga viajeId={v.viajeId} camionId={v.camionId} registra={registra} onCerrar={() => setPedido(false)} />}
      {historial && <Historial viajeId={v.viajeId} />}
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="font-semibold tabular-nums text-tinta">{children}</dd>
    </div>
  );
}

function Historial({ viajeId }: { viajeId: number }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending } = useControlesViaje(viajeId);
  if (isPending) return <Cargando texto="Cargando…" />;
  if (!data || data.length === 0) return <p className="text-xs text-tinta-suave">Todavía no hay controles de este viaje.</p>;
  return (
    <ul className="space-y-2 border-t border-borde pt-2 text-sm">
      {data.map((c) => (
        <li key={c.id} className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-tinta-suave">
            <Chip tono={TONO_RESULTADO[c.resultado]}>{ETIQUETA_RESULTADO[c.resultado]}</Chip>
            {formatearFechaHora(c.en, zonaHoraria)} · {c.por ?? '—'} · {num(c.km, 0)} km · {num(c.litros, 0)} L · {num(c.l100km)} L/100 km
            {c.programadorPct !== null && ` · ${num(c.programadorPct, 0)} % programador`}
            {c.fuente === 'manual' && ' · cargado a mano'}
            {c.fuente === 'foto' && ' · de la foto'}
            {c.foto && <VerFotoControl ruta={c.foto} />}
            {c.desde && ` · desde ${formatearFechaHora(c.desde, zonaHoraria)}`}
          </p>
          <p className="text-tinta">{c.mensaje}</p>
        </li>
      ))}
    </ul>
  );
}
