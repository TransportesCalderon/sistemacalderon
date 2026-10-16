'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Coins, Fuel, SlidersHorizontal, Truck } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { Encabezado } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { TARJETA } from '@/shared/ui/clases';
import type { Permiso } from '@/modules/core/permissions/types';
import { useEstaciones, useParametros, useProveedores, useTiposCambio } from '../queries/hooks';

/**
 * Configuración > Catálogos: punto de entrada de los datos que necesita la operación antes de
 * registrar cargas. Cada tarjeta lleva a su pantalla.
 */
export function CatalogosInicio() {
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria);
  const { data: estaciones } = useEstaciones();
  const { data: proveedores } = useProveedores();
  const { data: cotizaciones } = useTiposCambio();
  const { data: parametros } = useParametros();
  const deHoy = new Set((cotizaciones ?? []).filter((t) => t.fecha === hoy).map((t) => t.moneda));
  const faltan = ['ARS', 'CLP'].filter((m) => !deHoy.has(m));
  const provisionales = (parametros ?? []).filter((p) => p.provisional && !p.obsoleto).length;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Catálogos" subtitulo="Configuración" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Lo que tiene que estar cargado antes de registrar cargas: proveedores, estaciones y la cotización del día de cada moneda.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Tarjeta href="/comercial/proveedores" permiso="comercial.proveedores:ver" icono={<Truck className="size-5" />} titulo="Proveedores">
          {proveedores === undefined ? '…' : proveedores.length === 0 ? <Falta>Sin proveedores</Falta> : `${proveedores.length} cargados`}
        </Tarjeta>
        <Tarjeta href="/comercial/estaciones" permiso="comercial.proveedores:ver" icono={<Fuel className="size-5" />} titulo="Estaciones de servicio">
          {estaciones === undefined ? '…' : estaciones.length === 0 ? <Falta>Sin estaciones: no se pueden registrar cargas</Falta> : `${estaciones.length} cargadas`}
        </Tarjeta>
        <Tarjeta href="/finanzas/tipos-cambio" permiso="finanzas.tipos_cambio:ver" icono={<Coins className="size-5" />} titulo="Tipos de cambio">
          {cotizaciones === undefined ? '…' : faltan.length === 0 ? 'Cotizaciones de hoy cargadas (ARS y CLP)' : <Falta>Falta la de hoy: {faltan.join(' y ')}</Falta>}
        </Tarjeta>
        <Tarjeta href="/configuracion/parametros" permiso="configuracion.catalogos:ver" icono={<SlidersHorizontal className="size-5" />} titulo="Parámetros">
          {parametros === undefined ? '…' : provisionales > 0 ? <Falta>{provisionales === 1 ? '1 provisional' : `${provisionales} provisionales`} por confirmar</Falta> : 'Todos confirmados'}
        </Tarjeta>
      </div>
    </div>
  );
}

function Falta({ children }: { children: ReactNode }) {
  return <span className="text-alerta">{children}</span>;
}

function Tarjeta({ href, permiso, icono, titulo, children }: { href: string; permiso: Permiso; icono: ReactNode; titulo: string; children: ReactNode }) {
  const puede = useCan(permiso);
  const contenido = (
    <>
      <span className="grid size-10 place-items-center rounded-full bg-marca-suave text-marca">{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-tinta">{titulo}</span>
        <span className="block text-sm text-tinta-suave">{puede ? children : 'Sin acceso con tu rol'}</span>
      </span>
      {puede && <ArrowRight className="size-4 text-tinta-suave" />}
    </>
  );
  return puede ? (
    <Link href={href} className={cn(TARJETA, 'flex items-center gap-4 p-5 hover:bg-hover')}>
      {contenido}
    </Link>
  ) : (
    <div className={cn(TARJETA, 'flex items-center gap-4 p-5 opacity-60')}>{contenido}</div>
  );
}
