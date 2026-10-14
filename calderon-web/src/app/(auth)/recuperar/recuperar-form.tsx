'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { solicitarRecuperacion } from '@/modules/core/auth/actions';
import { recuperarSchema, type RecuperarInput } from '@/modules/core/auth/schemas';
import { Campo } from '@/shared/ui/campo';

export function RecuperarForm() {
  const [pendiente, iniciar] = useTransition();
  const [enviado, setEnviado] = useState(false);
  const form = useForm<RecuperarInput>({ resolver: zodResolver(recuperarSchema), defaultValues: { email: '' } });

  if (enviado) {
    return (
      <div className="space-y-4 text-sm">
        <p className="rounded-md bg-marca-suave px-3 py-2 text-tinta">Si el email está registrado, en unos minutos vas a recibir el enlace.</p>
        <Link href="/login" className="block text-center text-marca hover:underline">
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((valores) =>
        iniciar(async () => {
          const r = await solicitarRecuperacion(valores);
          if (r.ok) setEnviado(true);
          else form.setError('email', { message: r.error.campos?.email ?? r.error.mensaje });
        }),
      )}
    >
      <Campo label="Email" error={form.formState.errors.email?.message}>
        <input type="email" autoComplete="username" autoFocus {...form.register('email')} />
      </Campo>
      <button
        type="submit"
        disabled={pendiente}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-marca text-sm font-medium text-white hover:bg-marca/90 disabled:opacity-70"
      >
        {pendiente && <LoaderCircle className="size-4 animate-spin" />}
        Enviar enlace
      </button>
      <Link href="/login" className="block text-center text-sm text-marca hover:underline">
        Volver
      </Link>
    </form>
  );
}
