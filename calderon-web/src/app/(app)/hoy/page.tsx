import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { HoyPantalla } from '@/modules/hoy/components/hoy-pantalla';
import { RegistroActividad } from '@/modules/actividad/components/registro-actividad';
import { VEN_ACTIVIDAD } from '@/modules/actividad/actividad';
import { Encabezado } from '@/modules/combustible/components/comun/ui';
import { Pestanas } from '@/shared/ui/pestanas';
import { BASE_DEJA, baseDeja } from '@/modules/core/permissions/base-deja';

export const metadata: Metadata = { title: 'Hoy' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Sprint 3 · «Hoy» (migración 116): lo que le toca a cada uno, en una sola lista.
 * Migración 235: Gerencia, TI y Auditoría tienen además el registro de actividad (qué se hizo, cuándo y quién).
 */
export default async function Pagina({ searchParams }: Props) {
  const ctx = await requirePermiso('inicio.hoy:ver');
  const veActividad = ctx.identidad.rolesApp.some((r) => (VEN_ACTIVIDAD as readonly string[]).includes(r));
  // S4: el Auditor no puede leer «lo mío de hoy» en la base; ve directo el registro de actividad
  const veLoMio = baseDeja(BASE_DEJA.loMioDeHoy, ctx.identidad.rolBd, ctx.identidad.rolesApp);
  if (!veActividad) return <HoyPantalla />;
  if (!veLoMio)
    return (
      <div className="space-y-5">
        <Encabezado titulo="Registro de actividad" subtitulo="Qué se hizo, cuándo y quién" />
        <RegistroActividad />
      </div>
    );
  const pestanas = [
    { href: '/hoy', etiqueta: 'Lo que me toca' },
    { href: '/hoy?vista=actividad', etiqueta: 'Registro de actividad' },
  ];
  if ((await searchParams).vista === 'actividad')
    return (
      <div className="space-y-5">
        <Encabezado titulo="Registro de actividad" subtitulo="Qué se hizo, cuándo y quién" />
        <Pestanas items={pestanas} />
        <RegistroActividad />
      </div>
    );
  return (
    <>
      <Pestanas items={pestanas} />
      <HoyPantalla />
    </>
  );
}
