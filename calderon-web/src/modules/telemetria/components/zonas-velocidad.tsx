'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, MapPin, Mountain, Plus, Trash2, X } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { invalidar } from '@/shared/query/invalidar';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { cambiarEstadoZona, guardarZonaVelocidad } from '../actions/zona-velocidad.actions';
import { ETIQUETA_ESTADO_ZONA, ETIQUETA_SENTIDO, parsearZonas, type PuntoZona, type SentidoZona, type ZonaVelocidad } from '../domain/zona-velocidad';

const MapaZonas = dynamic(() => import('./mapa-zonas').then((m) => ({ default: m.MapaZonas })), { ssr: false });
const CLAVE = ['telemetria', 'zonas-velocidad'] as const;

function useZonas(activo: boolean) {
  return useQuery({
    queryKey: CLAVE,
    enabled: activo,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('tel').rpc('fn_zonas_velocidad');
      if (error) throw error;
      return parsearZonas(data);
    },
  });
}

interface Edicion {
  id: number | null;
  nombre: string;
  sentido: SentidoZona;
  velocidad: string;
  ancho: string;
  orden: string;
  observacion: string;
  puntos: PuntoZona[];
}
const aEdicion = (z: ZonaVelocidad | null): Edicion =>
  z
    ? { id: z.id, nombre: z.nombre, sentido: z.sentido, velocidad: String(z.velocidadMax), ancho: String(z.anchoM), orden: String(z.orden), observacion: z.observacion ?? '', puntos: z.puntos }
    : { id: null, nombre: '', sentido: 'ida', velocidad: '', ancho: '120', orden: '99', observacion: '', puntos: [] };

/**
 * Migración 307 · Velocidades máximas por tramo de montaña (Mendoza – Los Andes – Santiago – San Antonio).
 * Solo los tramos verificados generan alertas; las alertas confirmadas se convierten en acta de infracción.
 */
export function ZonasVelocidad() {
  const hay = useBaseTiene(307);
  const puede = useCan('anomalias.reglas:editar');
  const qc = useQueryClient();
  const q = useZonas(hay);
  const [filtro, setFiltro] = useState<SentidoZona | 'todos'>('todos');
  const [elegida, setElegida] = useState<number | null>(null);
  const [ed, setEd] = useState<Edicion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const zonas = useMemo(() => (q.data ?? []).filter((z) => filtro === 'todos' || z.sentido === filtro), [q.data, filtro]);
  if (!hay) return null;
  const recargar = () => invalidar(qc, 'telemetria');
  const pendientes = (q.data ?? []).filter((z) => z.estado === 'a_verificar').length;

  const editarZona = (z: ZonaVelocidad | null) => {
    setError(null);
    setAviso(null);
    setEd(aEdicion(z));
    setElegida(z?.id ?? null);
  };
  const estado = async (id: number, e: 'a_verificar' | 'verificada' | 'inactiva' | 'quitar') => {
    setError(null);
    const r = await cambiarEstadoZona({ id, estado: e });
    if (!r.ok) return setError(r.error.mensaje);
    if (e === 'quitar') {
      setEd(null);
      setElegida(null);
    }
    await recargar();
  };

  return (
    <Seccion
      titulo="Velocidades máximas por tramo (montaña)"
      acciones={
        puede && !ed ? (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => editarZona(null)}>
            <Plus className="size-4" /> Tramo nuevo
          </button>
        ) : null
      }
    >
      <p className="text-sm text-tinta-suave">
        La normativa de la empresa fija velocidades por tramo, distintas a la ida (Argentina → Chile) y a la vuelta. Cada tramo es un corredor sobre la ruta
        entre sus puntos. <strong>Solo los tramos verificados generan alertas</strong>: los cargados de las normativas tienen los puntos aproximados, así que
        hay que revisarlos en el mapa (arrastrar el inicio y el fin hasta el lugar exacto) y marcarlos «Verificado». Si un camión pasa el máximo por más de
        5 km/h en 2 lecturas seguidas, en el sentido del tramo, llega una alerta a Telemetría; si se confirma, se labra el acta.
      </p>
      {pendientes > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
          <MapPin className="size-4" /> {pendientes} {pendientes === 1 ? 'tramo falta verificar' : 'tramos faltan verificar'}: mientras tanto no generan alertas.
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        {(['todos', 'ida', 'vuelta'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn('rounded-full border px-3 py-1', filtro === f ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde text-tinta-suave')}
          >
            {f === 'todos' ? 'Todos' : ETIQUETA_SENTIDO[f]}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Cargando texto="Leyendo los tramos…" />
      ) : q.isError ? (
        <ErrorLectura texto="No se pudieron leer los tramos." onReintentar={() => void q.refetch()} />
      ) : (
        <>
          <MapaZonas
            zonas={zonas}
            elegida={elegida}
            puntos={ed ? ed.puntos : null}
            onElegir={(id) => {
              if (ed) return;
              setElegida(id);
            }}
            onMoverPunto={(i, p) => setEd((x) => (x ? { ...x, puntos: x.puntos.map((y, j) => (j === i ? p : y)) } : x))}
            onAgregarPunto={(p) => setEd((x) => (x ? { ...x, puntos: [...x.puntos, p] } : x))}
          />
          <p className="text-xs text-tinta-suave">
            <span className="text-exito">■</span> verificado · <span className="text-alerta">■</span> a verificar · <span className="text-tinta-suave">■</span> inactivo.
            {ed ? ' Editando: arrastrá los puntos; un clic en el mapa agrega uno al final.' : ' Tocá un tramo para verlo.'}
          </p>

          {ed && (
            <div className="space-y-3 rounded-lg border border-marca/40 bg-marca/5 p-3">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_8rem_8rem_6rem]">
                <Campo label="Tramo">
                  <input value={ed.nombre} maxLength={120} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} />
                </Campo>
                <Campo label="Sentido">
                  <select value={ed.sentido} onChange={(e) => setEd({ ...ed, sentido: e.target.value as SentidoZona })}>
                    <option value="ida">{ETIQUETA_SENTIDO.ida}</option>
                    <option value="vuelta">{ETIQUETA_SENTIDO.vuelta}</option>
                    <option value="ambos">{ETIQUETA_SENTIDO.ambos}</option>
                  </select>
                </Campo>
                <Campo label="Máximo (km/h)">
                  <input inputMode="numeric" value={ed.velocidad} onChange={(e) => setEd({ ...ed, velocidad: e.target.value })} />
                </Campo>
                <Campo label="Ancho (m)">
                  <input inputMode="numeric" value={ed.ancho} onChange={(e) => setEd({ ...ed, ancho: e.target.value })} />
                </Campo>
                <Campo label="Orden">
                  <input inputMode="numeric" value={ed.orden} onChange={(e) => setEd({ ...ed, orden: e.target.value })} />
                </Campo>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-tinta">
                  Puntos, en el sentido en que se maneja (el primero es el inicio del tramo). Con un solo punto el tramo es un círculo del ancho como radio (nudos
                  viales).
                </p>
                <ol className="space-y-1">
                  {ed.puntos.map((p, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="w-16 text-tinta-suave">{i === 0 ? 'Inicio' : i === ed.puntos.length - 1 ? 'Fin' : `Punto ${i + 1}`}</span>
                      <span className="font-mono text-xs">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </span>
                      <button type="button" aria-label="Quitar el punto" className="text-tinta-suave hover:text-error" onClick={() => setEd({ ...ed, puntos: ed.puntos.filter((_, j) => j !== i) })}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ol>
                {ed.puntos.length === 0 && <p className="text-alerta">Hacé clic en el mapa donde empieza el tramo y después donde termina.</p>}
              </div>
              <Campo label="Nota">
                <input value={ed.observacion} maxLength={500} onChange={(e) => setEd({ ...ed, observacion: e.target.value })} />
              </Campo>
              {error && <p className="text-sm text-error">{error}</p>}
              {aviso && <p className="text-sm text-alerta">{aviso}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BOTON_PRIMARIO}
                  disabled={ocupado}
                  onClick={async () => {
                    setOcupado(true);
                    setError(null);
                    setAviso(null);
                    const r = await guardarZonaVelocidad({
                      id: ed.id,
                      nombre: ed.nombre,
                      sentido: ed.sentido,
                      velocidadMax: Number(ed.velocidad),
                      anchoM: Number(ed.ancho) || 120,
                      orden: Number(ed.orden) || 0,
                      observacion: ed.observacion,
                      puntos: ed.puntos,
                    });
                    setOcupado(false);
                    if (!r.ok) return setError(r.error.mensaje);
                    if (r.data?.error) return setError(r.data.error);
                    if (r.data?.armado_con === 'recta') setAviso('El mapa no respondió: el corredor quedó en línea recta entre los puntos. Volvé a guardarlo más tarde.');
                    await recargar();
                    if (r.data?.id) setElegida(r.data.id);
                    if (r.data?.armado_con !== 'recta') setEd(null);
                  }}
                >
                  {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar y armar el corredor
                </button>
                <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setEd(null)}>
                  <X className="size-4" /> Cancelar
                </button>
                {ed.id && (
                  <button type="button" className="ml-auto text-sm text-error hover:underline" disabled={ocupado} onClick={() => void estado(ed.id!, 'quitar')}>
                    Quitar el tramo
                  </button>
                )}
              </div>
              <p className="text-xs text-tinta-suave">Si cambiás los puntos, el ancho, el sentido o el máximo de un tramo verificado, vuelve a quedar «a verificar».</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-borde">
                <tr>
                  <th className={TH}>Tramo</th>
                  <th className={TH}>Sentido</th>
                  <th className={cn(TH, 'text-right')}>Máximo</th>
                  <th className={cn(TH, 'text-right')}>Largo</th>
                  <th className={TH}>Estado</th>
                  <th className={cn(TH, 'text-right')}>Excesos 30 días</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {zonas.map((z) => (
                  <tr key={z.id} className={cn(z.id === elegida && 'bg-marca/5')}>
                    <td className={TD}>
                      <button type="button" className="text-left hover:underline" onClick={() => !ed && setElegida(z.id)}>
                        <Mountain className="mr-1 inline size-3.5 text-tinta-suave" />
                        {z.nombre}
                      </button>
                      {z.armadoCon === 'recta' && <span className="block text-xs text-alerta">corredor en línea recta (el mapa no respondió)</span>}
                    </td>
                    <td className={TD}>{z.sentido === 'ida' ? 'Ida' : z.sentido === 'vuelta' ? 'Vuelta' : 'Ambos'}</td>
                    <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{z.velocidadMax} km/h</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{z.armadoCon === 'punto' ? `radio ${z.anchoM} m` : z.km !== null ? `${formatearNumero(z.km, 1)} km` : '—'}</td>
                    <td className={TD}>
                      <Chip tono={z.estado === 'verificada' ? 'exito' : z.estado === 'a_verificar' ? 'alerta' : 'neutro'}>{ETIQUETA_ESTADO_ZONA[z.estado]}</Chip>
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{z.excesos30d}</td>
                    <td className={cn(TD, 'whitespace-nowrap text-right')}>
                      {puede && !ed && (
                        <span className="inline-flex gap-3 text-xs">
                          <button type="button" className="text-marca hover:underline" onClick={() => editarZona(z)}>
                            Editar
                          </button>
                          {z.estado !== 'verificada' && (
                            <button type="button" className="text-exito hover:underline" onClick={() => void estado(z.id, 'verificada')}>
                              Verificado
                            </button>
                          )}
                          {z.estado === 'verificada' && (
                            <button type="button" className="text-tinta-suave hover:underline" onClick={() => void estado(z.id, 'a_verificar')}>
                              A verificar
                            </button>
                          )}
                          {z.estado !== 'inactiva' ? (
                            <button type="button" className="text-tinta-suave hover:underline" onClick={() => void estado(z.id, 'inactiva')}>
                              Desactivar
                            </button>
                          ) : (
                            <button type="button" className="text-tinta-suave hover:underline" onClick={() => void estado(z.id, 'a_verificar')}>
                              Activar
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && !ed && <p className="text-sm text-error">{error}</p>}
        </>
      )}
    </Seccion>
  );
}
