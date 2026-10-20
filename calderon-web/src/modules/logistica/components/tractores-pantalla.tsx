'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fuel, LoaderCircle, Play, Truck, UserRoundPen } from 'lucide-react';
import { Cargando, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { LicenciaChip } from '@/modules/flota/components/choferes/estado-chofer';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_TRACTORES } from '@/shared/ui/pestanas-secciones';
import type { FechaDia } from '@/shared/types/dominio';
import { ETIQUETA_SITUACION_TRACTOR, SITUACIONES_TRACTOR, type SituacionTractor, type Tractor } from '../domain/viaje-chofer.types';
import { useAsignarTractor, useIniciarViajeChofer, useOpcionesViaje, useTractores } from '../queries/hooks';
import { Lista } from './viajes-pantalla';
import { SelectorItems, SituacionTractorChip, type ItemElegido } from './viaje-chofer-comun';

type Abierto = { camionId: number; que: 'iniciar' | 'chofer' } | null;

/**
 * Logística > Tractores y viajes (migración 46). Un tractor = su chofer fijo. Desde acá se cambia el
 * chofer y se inicia el viaje del chofer, que es aparte de la operación de Logística.
 */
export function TractoresPantalla() {
  const { data, isPending, isError, refetch } = useTractores();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<SituacionTractor | null>(null);
  const t = normalizar(texto);
  const filas = (data ?? []).filter(
    (x) => (!filtro || x.situacion === filtro) && (!t || [x.patente, x.codigoInterno, x.chofer ?? '', x.viajeChofer ?? ''].some((c) => normalizar(c).includes(t))),
  );
  const cuenta = (s: SituacionTractor) => (data ?? []).filter((x) => x.situacion === s).length;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Tractores y viajes" subtitulo="Logística" />
      <Pestanas items={PESTANAS_TRACTORES} />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Cada tractor tiene su chofer fijo. El viaje del chofer empieza con la carga a tanque lleno y termina con la siguiente carga a tanque
        lleno del tractor. Es aparte de la operación: si el semi pasa a otro tractor, la operación va en los dos viajes.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar tractor o chofer"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="h-9 w-full max-w-xs rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca"
        />
        <BotonFiltro activo={filtro === null} onClick={() => setFiltro(null)}>
          Todos {data ? `(${data.length})` : ''}
        </BotonFiltro>
        {SITUACIONES_TRACTOR.map((s) => (
          <BotonFiltro key={s} activo={filtro === s} onClick={() => setFiltro(filtro === s ? null : s)}>
            {ETIQUETA_SITUACION_TRACTOR[s]} ({cuenta(s)})
          </BotonFiltro>
        ))}
      </div>

      {isPending ? (
        <Cargando texto="Cargando tractores…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron cargar los tractores." onReintentar={() => refetch()} />
      ) : filas.length === 0 ? (
        <div className={TARJETA}>
          <Vacio icono={<Truck className="size-5" />} texto={data.length === 0 ? 'Todavía no hay tractores cargados.' : 'Ningún tractor coincide.'} />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((x) => (
            <TarjetaTractor
              key={x.camionId}
              t={x}
              abierto={abierto?.camionId === x.camionId ? abierto.que : null}
              onAbrir={(que) => setAbierto(que ? { camionId: x.camionId, que } : null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BotonFiltro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn('h-9 rounded-full border px-3 text-sm', activo ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde bg-panel text-tinta hover:bg-hover')}
    >
      {children}
    </button>
  );
}

function TarjetaTractor({ t, abierto, onAbrir }: { t: Tractor; abierto: 'iniciar' | 'chofer' | null; onAbrir: (q: 'iniciar' | 'chofer' | null) => void }) {
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria);
  const puedeAsignar = useCan('flota.asignaciones:editar');
  const puedeIniciar = useCan('operacion.tramos:editar');

  return (
    <li className={cn(TARJETA, 'flex flex-col gap-3 p-4', abierto === 'iniciar' && 'sm:col-span-2 xl:col-span-3')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-semibold text-tinta">{t.patente}</p>
          <p className="text-xs text-tinta-suave">{t.codigoInterno}</p>
        </div>
        <SituacionTractorChip s={t.situacion} />
      </div>

      <div className="text-sm">
        {t.chofer ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-tinta">{t.chofer}</span>
            {t.licenciaVencimiento && <LicenciaChip vence={t.licenciaVencimiento as FechaDia} hoy={hoy} />}
          </p>
        ) : (
          <p className="text-alerta">Sin chofer fijo</p>
        )}
        {t.asignadoDesde && <p className="text-xs text-tinta-suave">Desde el {formatearFechaDia(t.asignadoDesde)}</p>}
      </div>

      {t.viajeId ? (
        <Link href={`/operacion/viajes-chofer/${t.viajeId}`} className="rounded-lg bg-marca-suave px-3 py-2 text-sm text-marca hover:underline">
          Viaje <span className="font-mono font-semibold">{t.viajeNumero}</span> desde {formatearFechaHora(t.viajeSalida, zonaHoraria)}
          {t.viajeChofer && t.viajeChofer !== t.chofer && <span className="block text-xs">con {t.viajeChofer}</span>}
        </Link>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-tinta-suave">
          <Fuel className="size-3.5" />
          {t.corteDisponible ? `Carga a tanque lleno: ${formatearFechaHora(t.corteDisponible, zonaHoraria)}` : 'Sin carga a tanque lleno para salir'}
        </p>
      )}

      {abierto === null && (
        <div className="mt-auto flex flex-wrap gap-2">
          {puedeIniciar && t.situacion !== 'en_viaje' && t.situacion !== 'taller' && (
            <button type="button" className={BOTON_PRIMARIO} onClick={() => onAbrir('iniciar')}>
              <Play className="size-4" /> Iniciar viaje
            </button>
          )}
          {puedeAsignar && (
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => onAbrir('chofer')}>
              <UserRoundPen className="size-4" /> {t.choferId ? 'Cambiar chofer' : 'Asignar chofer'}
            </button>
          )}
        </div>
      )}
      {abierto === 'chofer' && <CambiarChofer t={t} onCerrar={() => onAbrir(null)} />}
      {abierto === 'iniciar' && <IniciarViaje t={t} onCerrar={() => onAbrir(null)} />}
    </li>
  );
}

function CambiarChofer({ t, onCerrar }: { t: Tractor; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const asignar = useAsignarTractor();
  const { data: op } = useOpcionesViaje();
  const [chofer, setChofer] = useState(t.choferId ? String(t.choferId) : '');
  const [desde, setDesde] = useState<string>(hoyEnZona(zonaHoraria));
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <form
      className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const r = await asignar.mutateAsync({ camionId: t.camionId, choferId: chofer, desde });
        if (r.ok) onCerrar();
        else setError(r.error);
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-tinta">Chofer fijo</span>
        <Lista valor={chofer} opciones={op?.choferes} onCambiar={setChofer} vacio="Sin chofer" className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-tinta">Desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
      </label>
      <p className="text-xs text-tinta-suave">El chofer anterior deja este tractor. Si el nuevo tenía otro tractor, ese queda sin chofer.</p>
      <ErrorBase error={error} />
      <div className="flex gap-2">
        <button type="submit" className={BOTON_PRIMARIO} disabled={asignar.isPending}>
          {asignar.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function IniciarViaje({ t, onCerrar }: { t: Tractor; onCerrar: () => void }) {
  const router = useRouter();
  const { zonaHoraria } = useSesion();
  const iniciar = useIniciarViajeChofer();
  const { data: op } = useOpcionesViaje();
  const [chofer, setChofer] = useState(t.choferId ? String(t.choferId) : '');
  const [items, setItems] = useState<ItemElegido[]>([]);
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);

  return (
    <form
      className="space-y-4 rounded-lg border border-borde bg-fondo/40 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const r = await iniciar.mutateAsync({ camionId: t.camionId, choferId: chofer, items, observacion });
        if (r.ok) router.push(`/operacion/viajes-chofer/${r.data}`);
        else setError(r.error);
      }}
    >
      <h3 className="font-medium text-tinta">Iniciar el viaje de {t.patente}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-tinta">Chofer</span>
          <Lista valor={chofer} opciones={op?.choferes} onCambiar={setChofer} className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
          <span className="block text-xs text-tinta-suave">Viene el chofer fijo del tractor. Cambialo solo si sale otro.</span>
        </label>
        <div className="space-y-1 text-sm">
          <span className="font-medium text-tinta">Sale con la carga a tanque lleno</span>
          {t.corteDisponible ? (
            <p className="flex h-9 items-center gap-2 rounded-md border border-borde bg-panel px-2">
              <Fuel className="size-4 text-marca" /> {formatearFechaHora(t.corteDisponible, zonaHoraria)}
            </p>
          ) : (
            <p className="rounded-md border border-alerta/40 bg-alerta-suave px-2 py-2 text-alerta">
              El tractor no tiene una carga a tanque lleno sin usar.{' '}
              <Link href="/combustible/cargas/nueva" className="underline">
                Registrala
              </Link>{' '}
              marcando «corte de viaje» y volvé.
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-tinta">¿Qué lleva? <span className="font-normal text-tinta-suave">(se puede completar después)</span></p>
        <SelectorItems camionId={t.camionId} elegidos={items} onCambiar={setItems} />
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-tinta">Observación</span>
        <input value={observacion} maxLength={2000} onChange={(e) => setObservacion(e.target.value)} className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
      </label>
      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BOTON_PRIMARIO} disabled={iniciar.isPending}>
          {iniciar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} Iniciar viaje
          {items.length > 0 && ` con ${items.length} ${items.length === 1 ? 'operación' : 'operaciones'}`}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
