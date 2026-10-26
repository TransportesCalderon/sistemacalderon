'use client';

import { useState } from 'react';
import { LoaderCircle, RadioTower, Search } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Seccion, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ActionResult, ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { haceTexto, minutosDesde } from '../domain/flota.types';
import { estadoEquipo, type CamionParaEnlazar, type EquipoTrackerway, type EstadoEquipo } from '../domain/trackerway.types';
import { useBuscarEquiposTrackerway, useEnlazarEquipoTrackerway, useImportarEquipoTrackerway, usePanelTrackerway } from '../queries/hooks';

const ESTADO: Record<EstadoEquipo, { texto: string; tono: Tono }> = {
  se_trae: { texto: 'Se trae', tono: 'exito' },
  no_se_trae: { texto: 'No se trae', tono: 'neutro' },
  sin_enlazar: { texto: 'Sin camión', tono: 'alerta' },
  llega_por_otra: { texto: 'Llega por su marca', tono: 'marca' },
};

/**
 * Configuración > Equipos GPS (migración 72): los equipos Teltonika de Trackerway.
 * Se enlaza cada equipo con su camión y se marca cuáles se traen. Los Renault y Volvo
 * que también tienen equipo en Trackerway siguen llegando por su propia conexión.
 */
export function EquiposTrackerwayPantalla() {
  const puedeCambiar = useCan('telemetria.calidad:editar');
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, error, refetch } = usePanelTrackerway();
  const buscar = useBuscarEquiposTrackerway();
  const [err, setErr] = useState<ErrorAccion | null>(null);

  const ejecutar = async <T,>(p: Promise<ActionResult<T>>) => {
    setErr(null);
    const r = await p;
    if (!r.ok) setErr(r.error);
  };

  return (
    <div className="space-y-5">
      <Encabezado titulo="Equipos GPS (Trackerway)" subtitulo="Configuración">
        {puedeCambiar && (
          <button type="button" className={BOTON_PRIMARIO} disabled={buscar.isPending} onClick={() => ejecutar(buscar.mutateAsync({}))}>
            {buscar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} Buscar equipos
          </button>
        )}
      </Encabezado>

      <p className="text-sm text-tinta-suave">
        Acá elegís qué camiones con GPS Teltonika se traen de Trackerway. Los Renault y Volvo siguen llegando por su propia conexión y no se traen
        de acá. Los datos se actualizan solos cada 2 minutos.
      </p>

      <ErrorBase error={err} />

      {isPending ? (
        <Cargando texto="Cargando los equipos…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron leer los equipos." error={error} onReintentar={() => refetch()} />
      ) : (
        <>
          <Conexion credenciales={data.credenciales} tarea={data.tarea} ultima={data.ultima} zonaHoraria={zonaHoraria} />
          {data.equipos.length === 0 ? (
            <Vacio
              icono={<RadioTower className="size-6" />}
              texto={
                data.credenciales
                  ? 'Todavía no hay equipos. Tocá «Buscar equipos» para traer la lista de Trackerway.'
                  : 'Primero cargá las credenciales en Supabase Vault y después tocá «Buscar equipos».'
              }
            />
          ) : (
            <Seccion titulo={`Equipos (${data.equipos.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-y border-borde bg-fondo">
                    <tr>
                      <th className={TH}>Equipo en Trackerway</th>
                      <th className={TH}>Camión</th>
                      <th className={TH}>Estado</th>
                      <th className={TH}>Traer datos</th>
                      <th className={TH}>Último dato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {data.equipos.map((e) => (
                      <FilaEquipo
                        key={e.imei}
                        equipo={e}
                        camiones={data.camiones}
                        puedeCambiar={puedeCambiar}
                        zonaHoraria={zonaHoraria}
                        onResultado={setErr}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-tinta-suave">
                Si un equipo no tiene camión, elegilo en la lista. Después marcá «Traer datos» en los que quieras ver en el sistema.
              </p>
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}

function Conexion({
  credenciales,
  tarea,
  ultima,
  zonaHoraria,
}: {
  credenciales: boolean;
  tarea: boolean;
  ultima: { en: string; ok: boolean; detalle: string | null } | null;
  zonaHoraria: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-panel p-3 text-sm">
      <span className="font-medium text-tinta">Conexión:</span>
      {credenciales ? <Chip tono="exito">Credenciales cargadas</Chip> : <Chip tono="alerta">Faltan las credenciales en Vault</Chip>}
      {tarea ? <Chip tono="exito">Se actualiza cada 2 minutos</Chip> : <Chip tono="neutro">Actualización automática apagada</Chip>}
      {ultima && (
        <span className="text-tinta-suave">
          Última vez: {formatearFechaHora(ultima.en as never, zonaHoraria)} · {ultima.ok ? 'bien' : <span className="text-error">{ultima.detalle ?? 'con error'}</span>}
        </span>
      )}
    </div>
  );
}

function FilaEquipo({
  equipo: e,
  camiones,
  puedeCambiar,
  zonaHoraria,
  onResultado,
}: {
  equipo: EquipoTrackerway;
  camiones: CamionParaEnlazar[];
  puedeCambiar: boolean;
  zonaHoraria: string;
  onResultado: (e: ErrorAccion | null) => void;
}) {
  const enlazar = useEnlazarEquipoTrackerway();
  const importar = useImportarEquipoTrackerway();
  const estado = estadoEquipo(e);
  const ocupado = enlazar.isPending || importar.isPending;
  const min = minutosDesde(e.ultimoDato);

  const correr = async (p: Promise<ActionResult<unknown>>) => {
    onResultado(null);
    const r = await p;
    if (!r.ok) onResultado(r.error);
  };

  return (
    <tr className={cn(e.importa && 'bg-exito/5')}>
      <td className={TD}>
        <span className="font-medium text-tinta">{e.nombre ?? 'Sin nombre'}</span>
        <span className="block font-mono text-xs text-tinta-suave">{e.imei}</span>
      </td>
      <td className={TD}>
        {puedeCambiar ? (
          <select
            className={cn(CONTROL_FILTRO, 'w-full max-w-[220px]')}
            value={e.camionId ?? ''}
            disabled={ocupado}
            aria-label={`Camión del equipo ${e.nombre ?? e.imei}`}
            onChange={(ev) => correr(enlazar.mutateAsync({ imei: e.imei, camionId: ev.target.value === '' ? null : Number(ev.target.value) }))}
          >
            <option value="">— Sin camión —</option>
            {camiones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.patente} · {c.codigoInterno}
                {c.otraApi ? ' (Renault/Volvo)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono">{e.patente ?? '—'}</span>
        )}
      </td>
      <td className={TD}>
        <Chip tono={ESTADO[estado].tono}>
          {estado === 'llega_por_otra' ? `Llega por ${e.otraApi === 'volvo' ? 'Volvo' : 'Renault'}` : ESTADO[estado].texto}
        </Chip>
      </td>
      <td className={TD}>
        {estado === 'llega_por_otra' ? (
          <span className="text-xs text-tinta-suave">No hace falta</span>
        ) : (
          <label className={cn('inline-flex items-center gap-2', (!puedeCambiar || e.camionId === null) && 'opacity-50')}>
            <input
              type="checkbox"
              className="size-4 accent-marca"
              checked={e.importa}
              disabled={!puedeCambiar || ocupado || e.camionId === null}
              onChange={(ev) => correr(importar.mutateAsync({ imei: e.imei, importar: ev.target.checked }))}
            />
            {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <span>{e.importa ? 'Sí' : 'No'}</span>}
          </label>
        )}
      </td>
      <td className={cn(TD, 'tabular-nums')}>
        {e.ultimoDato ? formatearFechaHora(e.ultimoDato, zonaHoraria) : '—'}
        <span className="block text-xs text-tinta-suave">{e.importa ? haceTexto(min) : ''}</span>
      </td>
    </tr>
  );
}
