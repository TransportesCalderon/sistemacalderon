import type { PantallaId } from '@/modules/core/permissions/matriz';
import type { TipoFicha } from './ficha-url';

/**
 * Sprint 1 · S1-02: qué es cada tipo de ficha. Sin componentes (eso está en componentes.tsx),
 * para poder probarlo sin navegador.
 *   - pantalla: el permiso «ver» que hace falta (el mismo que protege su lista en rutas.ts).
 *   - lista: la pantalla a la que redirige la ruta de detalle vieja (S1-06).
 *   - version: migración que hace falta en la base (useBaseTiene); sin ella la ficha no se abre.
 */
export interface DefFicha {
  titulo: string;
  pantalla: PantallaId;
  lista: string;
  version?: number;
}

export const FICHAS: Record<TipoFicha, DefFicha> = {
  camion: { titulo: 'Camión', pantalla: 'flota.camiones', lista: '/ajustes/flota' },
  chofer: { titulo: 'Chofer', pantalla: 'flota.choferes', lista: '/ajustes/flota/choferes' },
  cliente: { titulo: 'Cliente', pantalla: 'comercial.clientes', lista: '/cotizaciones/datos-clientes' },
  carga: { titulo: 'Carga', pantalla: 'combustible.cargas', lista: '/analisis/cargas' },
  cierre: { titulo: 'Cierre', pantalla: 'combustible.cierre_viaje', lista: '/analisis/cierres' },
  viaje: { titulo: 'Viaje', pantalla: 'operacion.tramos', lista: '/analisis/viajes' },
  genset: { titulo: 'Genset', pantalla: 'flota.pizarra', lista: '/ajustes/flota/gensets' },
  empresa: { titulo: 'Empresa', pantalla: 'ventas.empresas', lista: '/cotizaciones/clientes' },
  operacion: { titulo: 'Operación', pantalla: 'operacion.servicios', lista: '/analisis/operaciones', version: 114 },
  factura: { titulo: 'Factura', pantalla: 'ventas.facturacion', lista: '/analisis/facturacion' },
};

/** Las rutas de detalle viejas (/x/[id]) y el tipo de ficha que las reemplaza (S1-06). */
export const DETALLES_VIEJOS: readonly { ruta: string; tipo: TipoFicha }[] = [
  { ruta: '/flota/camiones', tipo: 'camion' },
  { ruta: '/flota/choferes', tipo: 'chofer' },
  { ruta: '/comercial/clientes', tipo: 'cliente' },
  { ruta: '/combustible/cargas', tipo: 'carga' },
  { ruta: '/combustible/cierres', tipo: 'cierre' },
  { ruta: '/operacion/viajes-chofer', tipo: 'viaje' },
  { ruta: '/flota/gensets', tipo: 'genset' },
  { ruta: '/ventas/empresas', tipo: 'empresa' },
];
