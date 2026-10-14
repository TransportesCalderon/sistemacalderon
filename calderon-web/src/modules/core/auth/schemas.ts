import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Ingresá tu email.').email('El email no es válido.'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
  next: z.string().optional(),
});

export type LoginInput = z.input<typeof loginSchema>;

export const recuperarSchema = z.object({
  email: z.string().trim().min(1, 'Ingresá tu email.').email('El email no es válido.'),
});

export type RecuperarInput = z.input<typeof recuperarSchema>;

export const cambiarPasswordSchema = z
  .object({
    password: z.string().min(10, 'Mínimo 10 caracteres.'),
    confirmacion: z.string(),
  })
  .refine((v) => v.password === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden.' });

export type CambiarPasswordInput = z.input<typeof cambiarPasswordSchema>;
