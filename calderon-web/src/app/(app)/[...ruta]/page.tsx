import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Construction } from 'lucide-react';
import { requirePermiso } from '@/modules/core/auth/guards';
import { NAVEGACION, pantallaDeRuta } from '@/modules/core/navigation/navigation';

/**
 * Marcador de las pantallas del menú cuyos módulos de negocio todavía no existen.
 * Aplica la verificación fina de permisos (capa 3) y muestra el destino real.
 * Cada módulo nuevo agrega su carpeta en (app)/ y tiene prioridad sobre esta ruta.
 */
function entradaDe(pathname: string) {
  for (const grupo of NAVEGACION) {
    const entrada = grupo.entradas.find((e) => pathname === e.href || pathname.startsWith(`${e.href}/`));
    if (entrada) return { grupo, entrada };
  }
  return null;
}

type Props = { params: Promise<{ ruta: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ruta } = await params;
  return { title: entradaDe(`/${ruta.join('/')}`)?.entrada.etiqueta ?? 'No encontrado' };
}

export default async function ModuloPendientePage({ params }: Props) {
  const { ruta } = await params;
  const pathname = `/${ruta.join('/')}`;
  const pantalla = pantallaDeRuta(pathname);
  const encontrado = entradaDe(pathname);
  if (!pantalla || !encontrado) notFound();

  await requirePermiso(`${pantalla}:ver`);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-tinta-suave">{encontrado.grupo.etiqueta}</p>
        <h1 className="text-2xl font-semibold text-tinta">{encontrado.entrada.etiqueta}</h1>
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
