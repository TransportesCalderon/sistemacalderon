import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { cerrarSesion } from '@/modules/core/auth/actions';
import { getSessionContext } from '@/modules/core/auth/session';

export const metadata: Metadata = { title: 'Sin acceso' };

const MENSAJES = {
  vinculo: {
    titulo: 'Tu usuario todavía no está habilitado',
    texto:
      'Iniciaste sesión, pero tu usuario no está vinculado al sistema o no tiene roles. Pedile al administrador que ejecute seg.fn_vincular_usuario con tu email y que verifique que el hook del token esté activo. Después cerrá sesión y volvé a entrar.',
  },
  permiso: {
    titulo: 'No tenés permiso para esta pantalla',
    texto: 'Tu rol no incluye esta sección. Si necesitás acceder, pedíselo al administrador del sistema.',
  },
  chofer: {
    titulo: 'Acceso de choferes en preparación',
    texto: 'El acceso de choferes se habilita cuando se active la seguridad por registro propio. Mientras tanto, consultá con la base.',
  },
} as const;

export default async function SinAccesoPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const ctx = await getSessionContext();
  const esChofer = ctx?.identidad?.rolesApp.length === 1 && ctx.identidad.rolesApp[0] === 'chofer';
  const clave: keyof typeof MENSAJES = esChofer ? 'chofer' : motivo === 'permiso' ? 'permiso' : 'vinculo';
  const { titulo, texto } = MENSAJES[clave];

  return (
    <div className="space-y-4 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-alerta-suave text-alerta">
        <Lock className="size-6" />
      </span>
      <h1 className="text-lg font-semibold text-tinta">{titulo}</h1>
      <p className="text-sm text-tinta-suave">{texto}</p>
      {ctx?.email && <p className="text-xs text-tinta-suave">Sesión: {ctx.email}</p>}
      <div className="flex flex-col gap-2 pt-2">
        {clave === 'permiso' && (
          <Link href="/" className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca/90">
            Ir a mi página de inicio
          </Link>
        )}
        <form action={cerrarSesion}>
          <button type="submit" className="w-full rounded-md border border-borde px-3 py-2 text-sm text-tinta hover:bg-hover">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
