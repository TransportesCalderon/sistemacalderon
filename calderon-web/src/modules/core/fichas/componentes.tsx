'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Cargando } from '@/modules/combustible/components/comun/ui';
import type { CamionId, CargaId, CierreViajeId, ChoferId, ClienteId } from '@/shared/types/dominio';
import type { TipoFicha } from './ficha-url';

/**
 * Sprint 1 · S1-02: el componente de cada tipo de ficha. Son los mismos de las páginas de
 * detalle, cargados recién cuando se abren (next/dynamic), para no sumar peso a cada pantalla.
 */
const cargando = () => <Cargando texto="Abriendo la ficha…" />;
type Ficha = ComponentType<{ id: number }>;

export const COMPONENTES_FICHA: Record<TipoFicha, Ficha> = {
  camion: dynamic(
    () => import('@/modules/flota/components/camiones/camion-ficha').then((m) => ({ default: ({ id }: { id: number }) => <m.CamionFicha id={id as CamionId} /> })),
    { loading: cargando },
  ),
  chofer: dynamic(
    () => import('@/modules/flota/components/choferes/chofer-ficha').then((m) => ({ default: ({ id }: { id: number }) => <m.ChoferFicha id={id as ChoferId} /> })),
    { loading: cargando },
  ),
  cliente: dynamic(
    () => import('@/modules/comercial/components/clientes/cliente-ficha').then((m) => ({ default: ({ id }: { id: number }) => <m.ClienteFicha id={id as ClienteId} /> })),
    { loading: cargando },
  ),
  carga: dynamic(
    () => import('@/modules/combustible/components/cargas/carga-ficha').then((m) => ({ default: ({ id }: { id: number }) => <m.CargaFicha id={id as CargaId} /> })),
    { loading: cargando },
  ),
  cierre: dynamic(
    () => import('@/modules/combustible/components/cierres/cierre-ficha').then((m) => ({ default: ({ id }: { id: number }) => <m.CierreFicha id={id as CierreViajeId} /> })),
    { loading: cargando },
  ),
  viaje: dynamic(() => import('@/modules/logistica/components/viaje-chofer-ficha').then((m) => ({ default: m.ViajeChoferFicha })), { loading: cargando }),
  genset: dynamic(() => import('@/modules/combustible/components/genset/genset-ficha').then((m) => ({ default: m.GensetFicha })), { loading: cargando }),
  empresa: dynamic(() => import('@/modules/ventas/components/empresa-ficha').then((m) => ({ default: m.EmpresaFicha })), { loading: cargando }),
  operacion: dynamic(() => import('@/modules/logistica/components/operacion-ficha').then((m) => ({ default: m.OperacionFicha })), { loading: cargando }),
  factura: dynamic(() => import('@/modules/ventas/components/factura-ficha').then((m) => ({ default: m.FacturaFicha })), { loading: cargando }),
};
