'use client';

import { useState } from 'react';
import { KeyRound, LoaderCircle, LogOut, RefreshCw, Truck } from 'lucide-react';
import { cerrarSesion } from '@/modules/core/auth/actions';
import { useSesion } from '@/modules/core/session/session-provider';
import { haceTexto, minutosDesde } from '@/modules/telemetria/domain/flota.types';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { ErrorLectura } from '@/shared/ui/errores';
import { IconoIronTrack, NombreIronTrack } from '@/shared/ui/marca/marca';
import { cargaUnidad, horaCorta, RUTA_CLIENTE, tienePosicion, tituloUnidad, type UnidadCliente } from '../domain/seguimiento';
import { useSeguimientoCliente } from '../queries/hooks';
import { ClaveCliente } from './clave-cliente';
import { COLOR_UNIDAD, colorUnidad, MapaCliente } from './mapa-cliente';

/**
 * Migración 288 · La pantalla del usuario de un cliente: el mapa con los camiones que llevan su carga y una
 * tarjeta por cada uno (posición, chofer, tractor y semi, y su contenedor o referencia). Un camión aparece
 * cuando se retira la carga y sale cuando se entrega; lo decide la base con los datos de Operaciones.
 */
export function SeguimientoCliente({ pedirClave }: { pedirClave: boolean }) {
  const { zonaHoraria } = useSesion();
  const consulta = useSeguimientoCliente();
  const [clave, setClave] = useState(pedirClave);
  const [marcada, setMarcada] = useState<number | null>(null);
  const [foco, setFoco] = useState<{ id: number; vez: number } | null>(null);
  const datos = consulta.data;
  const unidades = datos?.unidades ?? [];

  const cerrarClave = () => {
    setClave(false);
    // Vino del enlace de «¿Olvidaste tu contraseña?» (?clave=1): se saca para que no se vuelva a abrir
    if (pedirClave) window.history.replaceState(null, '', RUTA_CLIENTE);
  };

  return (
    <div className="min-h-dvh bg-fondo">
      <header className="border-b border-borde bg-panel">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <IconoIronTrack className="size-8" />
            <NombreIronTrack className="text-lg text-tinta" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setClave(true)} title="Cambiar contraseña">
              <KeyRound className="size-4" />
              <span className="hidden sm:inline">Cambiar contraseña</span>
            </button>
            <form action={cerrarSesion}>
              <button type="submit" className={BOTON_SECUNDARIO}>
                <LogOut className="size-4" /> Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {datos?.cliente && <p className="text-sm text-tinta-suave">{datos.cliente}</p>}
            <h1 className="text-2xl font-semibold text-tinta">
              Tus cargas en camino{unidades.length > 0 ? ` (${unidades.length})` : ''}
            </h1>
            <p className="text-sm text-tinta-suave">Cada camión aparece cuando retiramos tu carga y sale del mapa cuando se entrega.</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-tinta-suave">
            {datos?.consultado && <span>Actualizado a las {horaCorta(datos.consultado, zonaHoraria)}</span>}
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
              <RefreshCw className={cn('size-4', consulta.isFetching && 'animate-spin')} /> Actualizar
            </button>
          </div>
        </div>

        {consulta.isPending ? (
          <div className={cn(TARJETA, 'flex items-center gap-2 p-6 text-sm text-tinta-suave')}>
            <LoaderCircle className="size-4 animate-spin" /> Buscando tus cargas…
          </div>
        ) : !datos ? (
          <div className={TARJETA}>
            <ErrorLectura texto="No se pudo cargar el seguimiento." error={consulta.error} onReintentar={() => void consulta.refetch()} />
          </div>
        ) : unidades.length === 0 ? (
          <div className={cn(TARJETA, 'flex flex-col items-center gap-3 px-6 py-14 text-center')}>
            <span className="grid size-12 place-items-center rounded-full bg-marca-suave text-marca">
              <Truck className="size-6" />
            </span>
            <p className="font-medium text-tinta">Ahora no hay camiones con carga tuya en camino.</p>
            <p className="max-w-md text-sm text-tinta-suave">Cuando retiremos una carga tuya, el camión aparece acá solo, con su posición.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <MapaCliente unidades={unidades} marcada={marcada} foco={foco} onTocar={setMarcada} zona={zonaHoraria} />
            <ul className="space-y-2 lg:max-h-[calc(100dvh-230px)] lg:overflow-y-auto lg:pr-1">
              {unidades.map((u) => (
                <TarjetaUnidad
                  key={u.id}
                  u={u}
                  marcada={u.id === marcada}
                  zona={zonaHoraria}
                  onElegir={() => {
                    setMarcada(u.id);
                    setFoco((f) => ({ id: u.id, vez: (f?.vez ?? 0) + 1 }));
                    // En el celular el mapa queda arriba de la lista: se sube hasta verlo
                    document.getElementById('mapa-cliente')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                />
              ))}
            </ul>
          </div>
        )}
        {datos && consulta.isError && (
          <p className="text-sm text-alerta">No se pudo actualizar: se muestra lo último que llegó. Se vuelve a probar en un minuto.</p>
        )}
        {unidades.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta-suave">
            <Referencia color={COLOR_UNIDAD.vivo} texto="En viaje" />
            <Referencia color={COLOR_UNIDAD.demorada} texto="GPS demorado (más de 30 min)" />
            <Referencia color={COLOR_UNIDAD.base} texto="Esperando en una base" />
          </p>
        )}
        <p className="text-xs text-tinta-suave">Se actualiza solo cada minuto. El GPS de cada camión manda su posición cada pocos minutos.</p>
      </main>

      <ClaveCliente abierta={clave} onCerrar={cerrarClave} />
    </div>
  );
}

function Referencia({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {texto}
    </span>
  );
}

function TarjetaUnidad({ u, marcada, zona, onElegir }: { u: UnidadCliente; marcada: boolean; zona: string; onElegir: () => void }) {
  const carga = cargaUnidad(u);
  const ubicada = tienePosicion(u);
  return (
    <li>
      <button
        type="button"
        onClick={ubicada ? onElegir : undefined}
        className={cn(TARJETA, 'block w-full p-3 text-left text-sm', ubicada ? 'hover:bg-hover' : 'cursor-default', marcada && 'ring-2 ring-marca')}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold text-tinta">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorUnidad(u) }} />
            {tituloUnidad(u)}
          </span>
          <span className="shrink-0 text-xs text-tinta-suave" title={formatearFechaHora(u.ts, zona)}>
            {u.ts ? haceTexto(minutosDesde(u.ts)) : ''}
          </span>
        </span>
        {u.enBase ? (
          <span className="mt-1 block text-tinta-suave">En {u.lugar ?? 'la base'}, esperando el próximo tractor</span>
        ) : (
          <span className="mt-1 block text-tinta-suave">
            Semi {u.semi ?? '—'} · Chofer: {u.chofer ?? '—'}
          </span>
        )}
        {carga && <span className="mt-0.5 block text-xs text-tinta-suave">{carga}</span>}
        {!ubicada && <span className="mt-0.5 block text-xs text-alerta">Todavía sin posición en el mapa</span>}
      </button>
    </li>
  );
}
