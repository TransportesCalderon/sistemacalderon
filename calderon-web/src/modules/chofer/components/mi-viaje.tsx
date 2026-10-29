'use client';

import Link from 'next/link';
import { ChevronRight, FileUp, Gauge, Package, Receipt } from 'lucide-react';
import { Cargando, Chip, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { importeACobrar } from '@/modules/liquidacion/components/mis-liquidaciones';
import { TONO_LIQ } from '@/modules/liquidacion/components/liquidaciones-pantalla';
import { ETIQUETA_ESTADO_LIQ } from '@/modules/liquidacion/domain/liquidacion.types';
import { useMisLiquidaciones } from '@/modules/liquidacion/queries/hooks';
import { AvisoCargaChofer } from '@/modules/telemetria/components/aviso-carga-chofer';
import { cn } from '@/shared/lib/cn';
import { TARJETA } from '@/shared/ui/clases';
import { nombrePeriodo } from '../domain/chofer.types';
import { useMiFondo, useMisCargas } from '../queries/hooks';
import { CompartirUbicacion } from './compartir-ubicacion';
import { TarjetaCarga } from './mi-carga';
import { TextoSaldo } from './mis-gastos';

const BOTON_GRANDE =
  'flex flex-col items-center justify-center gap-1.5 rounded-xl text-center border border-borde bg-panel px-2 py-4 text-sm font-medium text-tinta shadow-sm active:bg-hover disabled:opacity-50';

/**
 * Sprint 7 · Mi viaje: lo único que usa el chofer, en una pantalla. Arriba tres botones (documento,
 * gasto, foto del tablero) y dos tarjetas (su fondo y lo que va a cobrar); abajo la carga asignada.
 * Junta las pantallas Mi carga, Mis gastos, Mis liquidaciones y Tablero del camión (reusa sus partes).
 */
export function MiViaje() {
  const { data, isLoading, isError, refetch } = useMisCargas();
  const verGastos = useCan('chofer.mis_gastos:ver');
  const verLiquidaciones = useCan('chofer.mis_liquidaciones:ver');

  if (isLoading) return <Cargando texto="Buscando tu viaje…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer tu viaje." onReintentar={() => void refetch()} />;
  const primera = data.cargas[0];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-tinta">Mi viaje</h1>
        {data.chofer && <p className="text-sm text-tinta-suave">{data.chofer}</p>}
      </header>

      <AvisoCargaChofer />

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={BOTON_GRANDE}
          disabled={!primera}
          title={primera ? undefined : 'Cuando tengas una carga asignada'}
          onClick={() => primera && document.getElementById(`documentos-${primera.servicioId}`)?.scrollIntoView({ behavior: 'smooth' })}
        >
          <FileUp className="size-6 text-marca" /> Documento
        </button>
        {verGastos && (
          <Link href="/mi-viaje?ver=gastos&nuevo=1" className={BOTON_GRANDE}>
            <Receipt className="size-6 text-marca" /> Gasto
          </Link>
        )}
        <Link href="/mi-viaje?ver=tablero" className={BOTON_GRANDE}>
          <Gauge className="size-6 text-marca" /> Foto del tablero
        </Link>
      </div>

      {(verGastos || verLiquidaciones) && (
        <div className="grid grid-cols-2 gap-2">
          {verGastos && <TarjetaFondo />}
          {verLiquidaciones && <TarjetaACobrar />}
        </div>
      )}

      <CompartirUbicacion habilitado={data.compartirUbicacion} intervaloS={data.intervaloS} />

      {data.cargas.length === 0 ? (
        <div className={cn(TARJETA, 'space-y-2 p-6 text-center')}>
          <Package className="mx-auto size-8 text-tinta-suave" />
          <p className="font-medium text-tinta">No tenés ninguna carga asignada.</p>
          <p className="text-sm text-tinta-suave">Cuando Logística te asigne una, aparece acá.</p>
        </div>
      ) : (
        data.cargas.map((c) => <TarjetaCarga key={c.servicioId} c={c} />)
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
