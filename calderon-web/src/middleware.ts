import { NextResponse, type NextRequest } from 'next/server';
import { actualizarSesion } from '@/server/supabase/middleware';
import { decodificarClaims, identidadDesdeClaims } from '@/modules/core/auth/claims';
import { esRutaPublica, esRutaSinPantalla, pantallaDeRuta } from '@/modules/core/navigation/rutas';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

/**
 * Capa 1 de permisos (arquitectura §7): refresca la sesión de Supabase y aplica la
 * guardia gruesa ruta → pantalla. La verificación fina (incluido el parámetro de
 * visibilidad de alertas de Gerencia) la repite cada página con requirePermiso().
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sesion = await actualizarSesion(request);

  /** Redirige conservando las cookies que Supabase haya refrescado. */
  const redirigir = (destino: string) => {
    const url = request.nextUrl.clone();
    const [ruta, query] = destino.split('?');
    url.pathname = ruta ?? '/';
    url.search = query ? `?${query}` : '';
    const respuesta = NextResponse.redirect(url);
    for (const cookie of sesion.response().cookies.getAll()) respuesta.cookies.set(cookie);
    return respuesta;
  };

  if (esRutaPublica(pathname)) {
    if (sesion.user && pathname === '/login') return redirigir('/');
    return sesion.response();
  }

  if (!sesion.user) {
    return redirigir(`/login?next=${encodeURIComponent(pathname + search)}`);
  }

  if (pathname === '/' || esRutaSinPantalla(pathname)) return sesion.response();

  const identidad = identidadDesdeClaims(sesion.accessToken ? decodificarClaims(sesion.accessToken) : null);
  if (!identidad) return redirigir('/sin-acceso?motivo=vinculo');

  const pantalla = pantallaDeRuta(pathname);
  if (pantalla) {
    // Permisivo con el parámetro de Gerencia: la página aplica el valor real.
    const permisos = permisosDe(identidad.rolesApp, { gerenciaDetalleAlertas: 'detalle' });
    if (!can(permisos, `${pantalla}:ver`)) return redirigir('/sin-acceso?motivo=permiso');
  }

  return sesion.response();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
