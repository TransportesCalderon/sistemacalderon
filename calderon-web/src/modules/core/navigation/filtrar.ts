import { can } from '@/modules/core/permissions/resolver';
import type { MapaPermisos } from '@/modules/core/permissions/types';
import { NAVEGACION, type EntradaMenu, type GrupoMenu } from './navigation';
import { pantallaDeRuta } from './rutas';

/** Pantalla que habilita una entrada del menú: la de su ruta en rutas.ts (Sprint 0 · T01). */
export function pantallaDeEntrada(e: EntradaMenu) {
  return pantallaDeRuta(e.href.split('?')[0] ?? e.href);
}

/** Menú visible para un usuario: entradas con permiso de ver (o de editar, las altas); grupos vacíos se ocultan. */
export function menuVisible(permisos: MapaPermisos): GrupoMenu[] {
  return NAVEGACION.map((grupo) => ({
    ...grupo,
    entradas: grupo.entradas.filter((e) => {
      const pantalla = pantallaDeEntrada(e);
      return pantalla !== null && can(permisos, `${pantalla}:${e.accion ?? 'ver'}`);
    }),
  })).filter((grupo) => grupo.entradas.length > 0);
}

/** Primera ruta a la que el usuario tiene acceso (destino después del login). */
export function rutaInicial(permisos: MapaPermisos): string {
  return menuVisible(permisos).find((g) => g.id !== 'cargar')?.entradas[0]?.href ?? '/sin-acceso';
}
