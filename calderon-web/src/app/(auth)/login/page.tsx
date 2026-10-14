import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold text-tinta">Iniciar sesión</h1>
      <p className="mt-1 mb-6 text-sm text-tinta-suave">Ingresá con el email y la contraseña que te dio el administrador.</p>
      <LoginForm next={next} />
    </>
  );
}
