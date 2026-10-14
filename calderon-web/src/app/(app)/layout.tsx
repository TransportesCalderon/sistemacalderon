import type { ReactNode } from 'react';
import { requireSession } from '@/modules/core/auth/guards';
import { aSesionCliente } from '@/modules/core/auth/session';
import { menuVisible } from '@/modules/core/navigation/filtrar';
import { can } from '@/modules/core/permissions/resolver';
import { SessionProvider } from '@/modules/core/session/session-provider';
import { AppShell } from '@/modules/core/layout/app-shell';
import { AvisoMonedaBase } from '@/modules/core/layout/aviso-moneda-base';

/**
 * Layout de la aplicación (Server Component): resuelve la sesión una vez, filtra el menú
 * con los permisos y entrega al cliente solo datos serializables. No consulta datos de negocio.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  const menu = menuVisible(ctx.permisos);
  const aviso = ctx.monedaBase ? null : <AvisoMonedaBase puedeConfigurar={can(ctx.permisos, 'configuracion.catalogos:editar')} />;

  return (
    <SessionProvider value={aSesionCliente(ctx)}>
      <AppShell menu={menu} aviso={aviso}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
