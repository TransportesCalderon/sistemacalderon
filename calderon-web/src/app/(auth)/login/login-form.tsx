'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { iniciarSesion } from '@/modules/core/auth/actions';
import { loginSchema, type LoginInput } from '@/modules/core/auth/schemas';
import { Campo } from '@/shared/ui/campo';

export function LoginForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', next },
  });

  const enviar = form.handleSubmit((valores) => {
    setError(null);
    iniciar(async () => {
      const resultado = await iniciarSesion(valores);
      if (resultado.ok) {
        router.replace(resultado.data.destino);
        router.refresh();
        return;
      }
      for (const [campo, mensaje] of Object.entries(resultado.error.campos ?? {})) {
        if (campo === 'email' || campo === 'password') form.setError(campo, { message: mensaje });
      }
      setError(resultado.error.mensaje);
    });
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <Campo label="Email" error={form.formState.errors.email?.message}>
        <input type="email" autoComplete="username" autoFocus {...form.register('email')} />
      </Campo>
      <Campo label="Contraseña" error={form.formState.errors.password?.message}>
        <input type="password" autoComplete="current-password" {...form.register('password')} />
      </Campo>

      {error && (
        <p role="alert" className="rounded-md bg-error-suave px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-marca text-sm font-medium text-white hover:bg-marca/90 disabled:opacity-70"
      >
        {pendiente && <LoaderCircle className="size-4 animate-spin" />}
        Ingresar
      </button>

      <p className="text-center text-sm">
        <Link href="/recuperar" className="text-marca hover:underline">
          Olvidé mi contraseña
        </Link>
      </p>
    </form>
  );
}
