import type { Metadata } from 'next';
import { RecuperarForm } from './recuperar-form';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function RecuperarPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-tinta">Recuperar contraseña</h1>
      <p className="mt-1 mb-6 text-sm text-tinta-suave">Te enviamos un enlace por email para elegir una contraseña nueva.</p>
      <RecuperarForm />
    </>
  );
}
