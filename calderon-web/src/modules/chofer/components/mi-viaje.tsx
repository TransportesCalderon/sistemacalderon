'use client';

import Link from 'next/link';
import { ChevronRight, Gauge, Package, Receipt } from 'lucide-react';
import { Cargando, Chip, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { importeACobrar } from '@/modules/liquidacion/components/mis-liquidaciones';
import { TONO_LIQ } from '@/modules/liquidacion/components/liquidaciones-pantalla';
import { ETIQUETA_ESTADO_LIQ } from '@/modules/liquidacion/domain/liquidacion.types';
import { useMisLiquidaciones } from '@/modules/liquidacion/queries/hooks';
import { AvisoCargaChofer } from '@/modules/telemetria/components/aviso-carga-chofer';
import { AvisoTableroInicio } from '@/modules/telemetria/components/aviso-tablero-inicio';
import { cn } from '@/shared/lib/cn';
import { TARJETA } from '@/shared/ui/clases';
import { nombrePeriodo } from '../domain/chofer.types';
import { useMiFondo, useMiRuta, useMisCargas } from '../queries/hooks';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { RutaDelChofer } from './ruta-chofer';
import { CompartirUbicacion } from './compartir-ubicacion';
import { CargaSiguiente, TarjetaCarga } from './mi-carga';
import { TextoSaldo } from './mis-gastos';

const BOTON_CHICO =
  'flex items-center justify-center gap-2 rounded-xl border border-borde bg-panel px-3 py-3 text-sm font-medium text-tinta shadow-sm active:bg-hover';

/**
 * Sprint 7 · Mi viaje: lo único que usa el chofer, en una pantalla. Arriba tres botones (documento,
 * gasto, foto del tablero) y dos tarjetas (su fondo y lo que va a cobrar); abajo la carga asignada.
 * Junta las pantallas Mi carga, Mis gastos, Mis liquidaciones y Tablero del camión (reusa sus partes).
 */
export function MiViaje() {
  const { data, isLoading, isError, refetch } = useMisCargas();
  const verGastos = useCan('chofer.mis_gastos:ver');
  const verLiquidaciones = useCan('chofer.mis_liquidaciones:ver');
  // Migración 161: la ruta en curso es del chofer (puede ser un movimiento sin operación): va arriba de todo
  const porChofer = useBaseTiene(161);
  const miRuta = useMiRuta(porChofer);

  if (isLoading) return <Cargando texto="Buscando tu viaje…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer tu viaje." onReintentar={() => void refetch()} />;
  const [actual, ...despues] = data.cargas;
  const ruta = porChofer ? (miRuta.data ?? null) : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-tinta">Mi viaje</h1>
        {data.chofer && <p className="text-sm text-tinta-suave">{data.chofer}</p>}
      </header>

      <AvisoCargaChofer />
      <AvisoTableroInicio />

      {/* 1 · Lo de ahora: la ruta que le cargó Telemetría (solo la en curso; si no hay, nada) */}
      {ruta && <RutaDelChofer ruta={ruta} />}

      <CompartirUbicacion habilitado={data.compartirUbicacion} intervaloS={data.intervaloS} viaje={data.cargas.map((c) => c.servicioId).join(',')} />

      {/* 2 · El viaje de ahora */}
      {!actual ? (
        <div className={cn(TARJETA, 'space-y-2 p-6 text-center')}>
          <Package className="mx-auto size-8 text-tinta-suave" />
          <p className="font-medium text-tinta">No tenés ninguna carga asignada.</p>
          <p className="text-sm text-tinta-suave">Cuando Logística te asigne una, aparece acá.</p>
        </div>
      ) : (
        <TarjetaCarga c={actual} conRuta={!porChofer} />
      )}

      {/* 3 · Lo que viene después, chiquito */}
      {despues.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-tinta-suave">Después</h2>
          {despues.map((c) => (
            <CargaSiguiente key={c.servicioId} c={c} />
          ))}
        </section>
      )}

      {/* 4 · Lo demás: gasto, tablero, fondo y lo que va a cobrar */}
      <div className="grid grid-cols-2 gap-2">
        {verGastos && (
          <Link href="/mi-viaje?ver=gastos&nuevo=1" className={BOTON_CHICO}>
            <Receipt className="size-5 text-marca" /> Cargar gasto
          </Link>
        )}
        <Link href="/mi-viaje?ver=tablero" className={cn(BOTON_CHICO, !verGastos && 'col-span-2')}>
          <Gauge className="size-5 text-marca" /> Foto del tablero
        </Link>
      </div>

      {(verGastos || verLiquidaciones) && (
        <div className="grid grid-cols-2 gap-2">
          {verGastos && <TarjetaFondo />}
          {verLiquidaciones && <TarjetaACobrar />}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ titulo, href, children }: { titulo: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(TARJETA, 'flex min-h-28 flex-col gap-1 p-3 active:bg-hover')}>
      <span className="flex items-center justify-between text-xs font-semibold text-tinta-suave uppercase">
        {titulo} <ChevronRight className="size-4" />
      </span>
      <div className="flex-1">{children}</div>
    </Link>
  );
}

/** Mi fondo: lo que tiene para rendir o lo que se le reintegra (lo calcula la base). */
function TarjetaFondo() {
  const { data, isLoading, isError } = useMiFondo();
  const saldos = data?.saldos.filter((s) => s.saldo !== 0) ?? [];
  return (
    <Tarjeta titulo="Mi fondo" href="/mi-viaje?ver=gastos">
      {isLoading ? (
        <p className="text-sm text-tinta-suave">Leyendo…</p>
      ) : isError ? (
        <p className="text-sm text-error">No se pudo leer tu fondo.</p>
      ) : saldos.length === 0 ? (
        <p className="text-sm text-tinta-suave">No tenés dinero para rendir.</p>
      ) : (
        <div className="space-y-2">
          {saldos.map((s) => (
            <TextoSaldo key={s.moneda} s={s} />
          ))}
        </div>
      )}
    </Tarjeta>
  );
}

/** A cobrar: la última liquidación aprobada o pagada, con lo que cobra y su estado. */
function TarjetaACobrar() {
  const { data, isLoading, isError } = useMisLiquidaciones();
  const ultima = data?.[0];
  return (
    <Tarjeta titulo="A cobrar" href="/mi-viaje?ver=liquidaciones">
      {isLoading ? (
        <p className="text-sm text-tinta-suave">Leyendo…</p>
      ) : isError ? (
        <p className="text-sm text-error">No se pudieron leer tus liquidaciones.</p>
      ) : !ultima ? (
        <p className="text-sm text-tinta-suave">Todavía no tenés liquidaciones aprobadas.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-2xl font-semibold text-tinta tabular-nums">{importeACobrar(ultima)}</p>
          <p className="text-xs text-tinta-suave first-letter:uppercase">{nombrePeriodo(ultima.periodo)}</p>
          <Chip tono={TONO_LIQ[ultima.estado]}>{ETIQUETA_ESTADO_LIQ[ultima.estado]}</Chip>
        </div>
      )}
    </Tarjeta>
  );
}
