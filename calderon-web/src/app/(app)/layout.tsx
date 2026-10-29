import { Suspense, type ReactNode } from 'react';
import { requireSession } from '@/modules/core/auth/guards';
import { aSesionCliente } from '@/modules/core/auth/session';
import { menuVisible } from '@/modules/core/navigation/filtrar';
import { can } from '@/modules/core/permissions/resolver';
import { SessionProvider } from '@/modules/core/session/session-provider';
import { AppShell } from '@/modules/core/layout/app-shell';
import { AvisoMonedaBase } from '@/modules/core/layout/aviso-moneda-base';
import { PanelFicha } from '@/modules/core/fichas/panel-ficha';

/**
 * Layout de la aplicación (Server Component): resuelve la sesión una vez, filtra el menú
 * con los permisos y entrega al cliente solo datos serializables. No consulta datos de negocio.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  const menu = menuVisible(ctx.permisos);
  // El chofer no registra importes en moneda base ni la puede leer: el aviso no es para él
  const aviso = ctx.monedaBase || ctx.identidad.rolBd === 'tc_chofer' ? null : <AvisoMonedaBase puedeConfigurar={can(ctx.permisos, 'configuracion.catalogos:editar')} />;

  return (
    <SessionProvider value={aSesionCliente(ctx)}>
      <AppShell menu={menu} aviso={aviso}>
        {children}
      </AppShell>
      {/* Sprint 1: la ficha abierta (?ficha=tipo:id) a la derecha, sin salir de la pantalla */}
      <Suspense fallback={null}>
        <PanelFicha />
      </Suspense>
    </SessionProvider>
  );
}
