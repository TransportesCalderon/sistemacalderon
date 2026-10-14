import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { menuVisible } from '@/modules/core/navigation/filtrar';
import { ETIQUETA_ROL } from '@/modules/core/permissions/roles';

export const metadata: Metadata = { title: 'Dashboard' };

/** Dashboard principal: los widgets se incorporan con el módulo dashboard. */
export default async function InicioPage() {
  const ctx = await requirePermiso('inicio.dashboard:ver');
  const grupos = menuVisible(ctx.permisos);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-tinta">Dashboard</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          {ctx.identidad.rolesApp.map((r) => ETIQUETA_ROL[r]).join(' · ')} · {ctx.email}
        </p>
      </header>
      <section className="rounded-xl border border-dashed border-borde bg-panel p-6">
        <h2 className="font-medium text-tinta">Base del sistema lista</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Sesión, permisos y navegación funcionando. Los indicadores del dashboard (consumo, alertas, rentabilidad) se agregan con sus módulos.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-fondo p-3">
            <dt className="text-xs text-tinta-suave">Secciones habilitadas</dt>
            <dd className="text-xl font-semibold text-tinta">{grupos.length}</dd>
          </div>
          <div className="rounded-lg bg-fondo p-3">
            <dt className="text-xs text-tinta-suave">Pantallas habilitadas</dt>
            <dd className="text-xl font-semibold text-tinta">{grupos.reduce((n, g) => n + g.entradas.length, 0)}</dd>
          </div>
          <div className="rounded-lg bg-fondo p-3">
            <dt className="text-xs text-tinta-suave">Moneda base</dt>
            <dd className="text-xl font-semibold text-tinta">{ctx.monedaBase ?? '—'}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
