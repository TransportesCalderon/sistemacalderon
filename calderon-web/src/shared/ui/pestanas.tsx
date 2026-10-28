'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';
import { can } from '@/modules/core/permissions/resolver';
import { useSesion } from '@/modules/core/session/session-provider';

/**
 * Pestañas entre pantallas hermanas (por ejemplo «Por validar | Sin ticket»): una sola
 * entrada en el menú y se cambia de vista desde la pantalla. Cada pestaña es una ruta.
 * Solo se muestran las pestañas que el rol puede ver; si queda una sola, no se muestra nada.
 */
export function Pestanas({ items }: { items: readonly { href: string; etiqueta: string }[] }) {
  const pathname = usePathname();
  const { permisos } = useSesion();
  const visibles = items.filter((i) => {
    const pantalla = pantallaDeRuta(i.href);
    return pantalla === null || can(permisos, `${pantalla}:ver`);
  });
  if (visibles.length < 2) return null;
  return (
    <nav aria-label="Vistas" className="-mt-1 mb-4 flex flex-wrap gap-1 border-b border-borde">
      {visibles.map((i) => {
        const activa = pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={activa ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              activa ? 'border-marca font-medium text-marca' : 'border-transparent text-tinta-suave hover:text-tinta',
            )}
          >
            {i.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
