import { can } from '@/modules/core/permissions/resolver';
import type { MapaPermisos } from '@/modules/core/permissions/types';
import { MAS, type GrupoMas } from './navigation';
import { pantallaDeRuta } from './rutas';

/** Un ítem de «Más» ya resuelto para una persona: adónde lleva y qué rutas lo marcan como actual. */
export interface ItemMasVisible {
  etiqueta: string;
  href: string;
  rutas: readonly string[];
}
export interface GrupoMasVisible {
  id: GrupoMas['id'];
  etiqueta: string;
  items: ItemMasVisible[];
}

/** Se puede ver una ruta si se puede ver la pantalla que la protege (rutas.ts, Sprint 0 · T01). */
export const puedeVerRuta = (permisos: MapaPermisos, ruta: string) => {
  const pantalla = pantallaDeRuta(ruta.split('?')[0] ?? ruta);
  return pantalla !== null && can(permisos, `${pantalla}:ver`);
};

/** «Más» de una persona: cada ítem lleva a la primera de sus pestañas que puede ver; lo que no ve no aparece. */
export function masVisible(permisos: MapaPermisos): GrupoMasVisible[] {
  return MAS.map((g) => ({
    id: g.id,
    etiqueta: g.etiqueta,
    items: g.items.flatMap((i) => {
      const rutas = i.rutas.filter((r) => puedeVerRuta(permisos, r));
      return rutas.length ? [{ etiqueta: i.etiqueta, href: rutas[0]!, rutas }] : [];
    }),
  })).filter((g) => g.items.length > 0);
}

/** Destino después del login: Hoy; el chofer, Mi viaje; si no, lo primero que pueda ver de «Más». */
export function rutaInicial(permisos: MapaPermisos): string {
  if (can(permisos, 'inicio.hoy:ver')) return '/hoy';
  if (can(permisos, 'chofer.mi_carga:ver')) return '/mi-viaje';
  return masVisible(permisos)[0]?.items[0]?.href ?? '/sin-acceso';
}

function coincide(pathname: string, ruta: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/** Ítem de «Más» de la página actual (la coincidencia más larga entre todas sus pestañas). */
export function itemActual(pathname: string, grupos: readonly GrupoMasVisible[]): string | null {
  let mejor: { href: string; largo: number } | null = null;
  for (const i of grupos.flatMap((g) => g.items))
    for (const r of i.rutas) if (coincide(pathname, r) && (!mejor || r.length > mejor.largo)) mejor = { href: i.href, largo: r.length };
  return mejor?.href ?? null;
}
