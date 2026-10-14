'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { cambiarPassword } from '@/modules/core/auth/actions';
import { cambiarPasswordSchema, type CambiarPasswordInput } from '@/modules/core/auth/schemas';
import { Campo } from '@/shared/ui/campo';

export function CambiarPasswordForm() {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const form = useForm<CambiarPasswordInput>({
    resolver: zodResolver(cambiarPasswordSchema),
    defaultValues: { password: '', confirmacion: '' },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((valores) =>
        iniciar(async () => {
          const r = await cambiarPassword(valores);
          setMensaje(r.ok ? { ok: true, texto: 'Contraseña actualizada.' } : { ok: false, texto: r.error.mensaje });
          if (r.ok) form.reset();
        }),
      )}
    >
      <Campo label="Contraseña nueva" error={form.formState.errors.password?.message} ayuda="Mínimo 10 caracteres.">
        <input type="password" autoComplete="new-password" {...form.register('password')} />
      </Campo>
      <Campo label="Repetir contraseña" error={form.formState.errors.confirmacion?.message}>
        <input type="password" autoComplete="new-password" {...form.register('confirmacion')} />
      </Campo>
      {mensaje && (
        <p role="status" className={mensaje.ok ? 'text-sm text-exito' : 'text-sm text-error'}>
          {mensaje.texto}
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="flex h-10 items-center gap-2 rounded-md bg-marca px-4 text-sm font-medium text-white hover:bg-marca/90 disabled:opacity-70"
      >
        {pendiente && <LoaderCircle className="size-4 animate-spin" />}
        Guardar
      </button>
    </form>
  );
}
