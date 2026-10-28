import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Construction } from 'lucide-react';
import { requirePermiso } from '@/modules/core/auth/guards';
import { rutaDe } from '@/modules/core/navigation/rutas';

/**
 * Marcador de las pantallas del menú cuyos módulos de negocio todavía no existen.
 * Aplica la verificación fina de permisos (capa 3) y muestra el destino real.
 * Cada módulo nuevo agrega su carpeta en (app)/ y tiene prioridad sobre esta ruta.
 */
type Props = { params: Promise<{ ruta: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ruta } = await params;
  return { title: rutaDe(`/${ruta.join('/')}`)?.titulo ?? 'No encontrado' };
}

export default async function ModuloPendientePage({ params }: Props) {
  const { ruta } = await params;
  const pathname = `/${ruta.join('/')}`;
  const encontrado = rutaDe(pathname);
  if (!encontrado) notFound();

  await requirePermiso(`${encontrado.pantalla}:ver`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-tinta">{encontrado.titulo}</h1>
      </header>
      <section className="flex items-start gap-3 rounded-xl border border-dashed border-borde bg-panel p-6">
        <Construction className="mt-0.5 size-5 shrink-0 text-alerta" />
        <div>
          <h2 className="font-medium text-tinta">Módulo en construcción</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Tu rol tiene acceso a esta pantalla. El módulo de negocio se incorpora en la próxima etapa.
          </p>
        </div>
      </section>
    </div>
  );
}
