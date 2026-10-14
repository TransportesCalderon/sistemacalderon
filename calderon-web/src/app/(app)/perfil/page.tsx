import type { Metadata } from 'next';
import { requireSession } from '@/modules/core/auth/guards';
import { ETIQUETA_ROL } from '@/modules/core/permissions/roles';
import { CambiarPasswordForm } from './cambiar-password-form';

export const metadata: Metadata = { title: 'Mi perfil' };

export default async function PerfilPage() {
  const ctx = await requireSession();
  return (
    <div className="max-w-lg space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-tinta">Mi perfil</h1>
        <p className="mt-1 text-sm text-tinta-suave">{ctx.email}</p>
        <p className="text-sm text-tinta-suave">{ctx.identidad.rolesApp.map((r) => ETIQUETA_ROL[r]).join(' · ')}</p>
      </header>
      <section className="rounded-xl border border-borde bg-panel p-6">
        <h2 className="mb-4 font-medium text-tinta">Cambiar contraseña</h2>
        <CambiarPasswordForm />
      </section>
    </div>
  );
}
