'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
  const busqueda = useSearchParams();
  const { permisos } = useSesion();
  const visibles = items.filter((i) => {
    const pantalla = pantallaDeRuta(i.href.split('?')[0] ?? i.href);
    return pantalla === null || can(permisos, `${pantalla}:ver`);
  });
  if (visibles.length < 2) return null;
  // Migración 223: una pestaña puede ser una vista de la misma pantalla (?vista=…): esa gana si coincide
  const vista = busqueda?.get('vista') ?? null;
  const deVista = visibles.find((i) => {
    const [base, q] = i.href.split('?');
    return q !== undefined && base === pathname && new URLSearchParams(q).get('vista') === vista;
  });
  // Si no, la de la ruta más larga que coincide (/cotizaciones/clientes no marca también /cotizaciones)
  const coincide = (href: string) => !href.includes('?') && (pathname === href || pathname.startsWith(`${href}/`));
  const activaHref =
    deVista?.href ?? (vista ? undefined : visibles.filter((i) => coincide(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href);
  return (
    <nav aria-label="Vistas" className="-mt-1 mb-4 flex flex-wrap gap-1 border-b border-borde">
      {visibles.map((i) => {
        const activa = i.href === activaHref;
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
