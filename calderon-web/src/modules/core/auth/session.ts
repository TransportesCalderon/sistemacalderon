import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { env } from '@/shared/lib/env';
import { permisosDe } from '@/modules/core/permissions/resolver';
import type { MapaPermisos, OpcionesResolucion } from '@/modules/core/permissions/types';
import { decodificarClaims, identidadDesdeClaims, type IdentidadNegocio } from './claims';
import { COOKIE_ZONA, esZonaValida, type ZonaHoraria } from './zonas';

export interface ContextoSesion {
  authUserId: string;
  email: string;
  /** null = usuario de Auth sin vínculo en seg.usuario (o hook desactivado). */
  identidad: IdentidadNegocio | null;
  permisos: MapaPermisos;
  zonaHoraria: ZonaHoraria;
  /** Código ISO de la moneda base; null mientras no se defina (decisión pendiente #1). */
  monedaBase: string | null;
  gerenciaDetalleAlertas: OpcionesResolucion['gerenciaDetalleAlertas'];
}

/** Lo que se expone al navegador mediante el Session Provider (sin tokens). */
export interface SesionCliente {
  email: string;
  usuarioId: number;
  rolesApp: IdentidadNegocio['rolesApp'];
  choferId: number | null;
  permisos: MapaPermisos;
  zonaHoraria: ZonaHoraria;
  monedaBase: string | null;
}

/**
 * Contexto de sesión de la petición actual. Envuelto en React.cache: se resuelve una
 * sola vez por petición aunque lo llamen el layout, la página y las server actions.
 */
export const getSessionContext = cache(async (): Promise<ContextoSesion | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sesion } = await supabase.auth.getSession();
  const identidad = identidadDesdeClaims(sesion.session ? decodificarClaims(sesion.session.access_token) : null);

  let monedaBase: string | null = null;
  let gerenciaDetalleAlertas: ContextoSesion['gerenciaDetalleAlertas'] = 'agregado';

  // Sin rol de base de datos (chofer, o usuario sin vínculo) PostgREST no permite leer ref.*
  if (identidad?.rolBd) {
    const [moneda, parametro] = await Promise.all([
      supabase.schema('ref').from('moneda').select('codigo').eq('es_base', true).is('eliminado_en', null).maybeSingle(),
      supabase
        .schema('ref')
        .from('parametro')
        .select('valor')
        .eq('codigo', 'ana.gerencia_detalle_alertas')
        .is('eliminado_en', null)
        .maybeSingle(),
    ]);
    monedaBase = moneda.data?.codigo ?? null;
    if (parametro.data?.valor === 'detalle') gerenciaDetalleAlertas = 'detalle';
  }

  const cookieStore = await cookies();
  const zonaCookie = cookieStore.get(COOKIE_ZONA)?.value;
  const zonaHoraria: ZonaHoraria = esZonaValida(zonaCookie)
    ? zonaCookie
    : esZonaValida(env.zonaHorariaDefecto)
      ? env.zonaHorariaDefecto
      : 'America/Argentina/Mendoza';

  return {
    authUserId: user.id,
    email: user.email ?? '',
    identidad,
    permisos: identidad ? permisosDe(identidad.rolesApp, { gerenciaDetalleAlertas }) : {},
    zonaHoraria,
    monedaBase,
    gerenciaDetalleAlertas,
  };
});

export function aSesionCliente(ctx: ContextoSesion & { identidad: IdentidadNegocio }): SesionCliente {
  return {
    email: ctx.email,
    usuarioId: ctx.identidad.usuarioId,
    rolesApp: ctx.identidad.rolesApp,
    choferId: ctx.identidad.choferId,
    permisos: ctx.permisos,
    zonaHoraria: ctx.zonaHoraria,
    monedaBase: ctx.monedaBase,
  };
}
