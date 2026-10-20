'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';

/**
 * Pestañas entre pantallas hermanas (por ejemplo «Por validar | Sin ticket»): una sola
 * entrada en el menú y se cambia de vista desde la pantalla. Cada pestaña es una ruta.
 */
export function Pestanas({ items }: { items: readonly { href: string; etiqueta: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Vistas" className="-mt-1 mb-4 flex flex-wrap gap-1 border-b border-borde">
      {items.map((i) => {
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
