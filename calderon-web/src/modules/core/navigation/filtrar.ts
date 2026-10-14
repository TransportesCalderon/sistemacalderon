import { can } from '@/modules/core/permissions/resolver';
import type { MapaPermisos } from '@/modules/core/permissions/types';
import { NAVEGACION, type GrupoMenu } from './navigation';

/** Menú visible para un usuario: entradas con permiso de ver; grupos vacíos se ocultan. */
export function menuVisible(permisos: MapaPermisos): GrupoMenu[] {
  return NAVEGACION.map((grupo) => ({
    ...grupo,
    entradas: grupo.entradas.filter((e) => can(permisos, `${e.pantalla}:ver`)),
  })).filter((grupo) => grupo.entradas.length > 0);
}

/** Primera ruta a la que el usuario tiene acceso (destino después del login). */
export function rutaInicial(permisos: MapaPermisos): string {
  return menuVisible(permisos)[0]?.entradas[0]?.href ?? '/sin-acceso';
}
