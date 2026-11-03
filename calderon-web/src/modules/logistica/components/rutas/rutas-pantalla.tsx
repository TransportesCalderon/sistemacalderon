'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Map as MapaIcono, Search, TriangleAlert } from 'lucide-react';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { TARJETA } from '@/shared/ui/clases';
import { VERSION_RUTAS_CHOFER, VERSION_RUTAS_PANTALLA, type OperacionRuta } from '../../domain/rutas';
import { useRutasOperaciones } from '../../queries/hooks';
import { RutaOperacion } from './ruta-operacion';
import { TablaChoferes } from './rutas-choferes';

type Filtro = 'sin' | 'con' | 'todas';
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: 'sin', texto: 'Sin ruta' },
  { id: 'con', texto: 'Con ruta' },
  { id: 'todas', texto: 'Todas' },
];

/**
 * Migración 156 · Viajes › Rutas para choferes: todas las operaciones abiertas en un lugar, para que
 * Telemetría cargue la ruta de cada una (antes estaba dentro del detalle de la operación). Muestra
 * también si el camión está fuera de la ruta (desvío).
 */
export function RutasPantalla() {
  const hay = useBaseTiene(VERSION_RUTAS_PANTALLA);
  if (!hay) {
    return (
      <div className="space-y-5">
        <Encabezado titulo="Rutas para choferes" subtitulo="Viajes" />
        <p className="text-sm text-tinta-suave">Esta pantalla se habilita con la migración 156 en Supabase.</p>
      </div>
    );
  }
  return <PorChofer />;
}

/** Migración 161: por chofer (tabla de choferes activos); con una base anterior, la lista por operación. */
function PorChofer() {
  const porChofer = useBaseTiene(VERSION_RUTAS_CHOFER);
  if (!porChofer) return <Lista />;
  return (
    <div className="space-y-5">
      <Encabezado titulo="Rutas para choferes" subtitulo="Viajes" />
      <p className="text-sm text-tinta-suave">
        Los choferes activos. Tocá uno para cargarle rutas en orden: las de su operación y también movimientos sin operación. El chofer ve solo
        la que está en curso y, si el camión se aleja de ella, aparece un aviso de desvío.
      </p>
      <TablaChoferes />
    </div>
  );
}

function Lista() {
  const { data, isPending, isError, error, refetch } = useRutasOperaciones();
  const [filtro, setFiltro] = useState<Filtro>('sin');
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);

  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (data ?? []).filter(
      (o) =>
        (filtro === 'todas' || (filtro === 'con') === (o.ruta !== null)) &&
        (!t || [String(o.numero), o.cliente, o.origen, o.destino, o.tractor ?? '', o.chofer ?? ''].some((x) => x.toLowerCase().includes(t))),
    );
  }, [data, filtro, texto]);
  const sinRuta = (data ?? []).filter((o) => o.ruta === null).length;
  const desvios = (data ?? []).filter((o) => o.desvio).length;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Rutas para choferes" subtitulo="Viajes" />
      <p className="text-sm text-tinta-suave">
        Las operaciones abiertas. Pegá el link de Google Maps de la ruta: el chofer la ve en su teléfono y, si el camión se aleja de la ruta,
        aparece un aviso de desvío.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              filtro === f.id ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde text-tinta-suave hover:bg-hover',
            )}
          >
            {f.texto}
            {f.id === 'sin' && sinRuta > 0 && <span className="ml-1 font-semibold">({sinRuta})</span>}
          </button>
        ))}
        {desvios > 0 && (
          <Chip tono="error">
            <TriangleAlert className="size-3.5" /> {desvios === 1 ? '1 camión fuera de la ruta' : `${desvios} camiones fuera de la ruta`}
          </Chip>
        )}
        <label className="ml-auto flex h-9 items-center gap-2 rounded-md border border-borde bg-panel px-3 text-sm">
          <Search className="size-4 text-tinta-suave" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Operación, cliente, tractor o chofer…"
            className="w-56 bg-transparent outline-none"
          />
        </label>
      </div>

      {isPending ? (
        <Cargando texto="Buscando las operaciones…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron leer las operaciones." onReintentar={() => void refetch()} error={error} />
      ) : filas.length === 0 ? (
        <Vacio
          icono={<MapaIcono className="size-6" />}
          texto={filtro === 'sin' && !texto ? 'Todas las operaciones abiertas tienen su ruta.' : 'No hay operaciones con ese filtro.'}
        />
      ) : (
        <ul className="space-y-2">
          {filas.map((o) => (
            <Fila key={o.servicioId} o={o} abierta={abierta === o.servicioId} onAbrir={() => setAbierta(abierta === o.servicioId ? null : o.servicioId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({ o, abierta, onAbrir }: { o: OperacionRuta; abierta: boolean; onAbrir: () => void }) {
  const { zonaHoraria } = useSesion();
  return (
    <li className={cn(TARJETA, 'overflow-hidden', o.desvio && 'border-error/40')}>
      <button type="button" onClick={onAbrir} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-hover">
        {abierta ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
        <span className="font-semibold text-tinta">Op. {o.numero}</span>
        <span className="text-tinta">{o.cliente}</span>
        <span className="text-tinta-suave">
          {o.origen} → {o.destino}
        </span>
        <span className="text-tinta-suave">{[o.tractor, o.chofer].filter(Boolean).join(' · ') || 'Sin equipo asignado'}</span>
        {o.presentacion && <span className="text-xs text-tinta-suave">{formatearFechaHora(o.presentacion, zonaHoraria)}</span>}
        <span className="ml-auto flex flex-wrap gap-1.5">
          {o.estado === 'en_curso' && <Chip tono="marca">En curso</Chip>}
          {o.ruta ? (
            <Chip tono={o.ruta.orden === null ? 'neutro' : 'exito'}>
              {o.ruta.orden === null
                ? `${o.ruta.total} ${o.ruta.total === 1 ? 'ruta hecha' : 'rutas hechas'}`
                : o.ruta.total > 1
                  ? `Ruta ${o.ruta.orden} de ${o.ruta.total}: ${o.ruta.partida} → ${o.ruta.destino}`
                  : `Ruta: ${o.ruta.puntos} puntos`}
            </Chip>
          ) : (
            <Chip tono="alerta">Sin ruta</Chip>
          )}
          {o.desvio && (
            <Chip tono="error" title="El camión está lejos de la ruta">
              <TriangleAlert className="size-3.5" /> Fuera de la ruta: {o.desvio.km} km, {o.desvio.minutos} min
            </Chip>
          )}
        </span>
      </button>
      {abierta && (
        <div className="border-t border-borde px-4 py-3">
          <RutaOperacion servicioId={o.servicioId} abierta />
        </div>
      )}
    </li>
  );
}
