import Link from 'next/link';
import { cn } from '@/shared/lib/cn';

/** ¿A dónde fue la carga? Tractor (carga normal) o genset (migración 48). */
export function DestinoCargaSelector({ actual }: { actual: 'tractor' | 'genset' }) {
  const op = [
    { id: 'tractor', etiqueta: 'Al tractor', href: '/combustible/cargas/nueva' },
    { id: 'genset', etiqueta: 'Al genset', href: '/combustible/cargas/nueva?destino=genset' },
  ] as const;
  return (
    <nav aria-label="¿A dónde fue el combustible?" className="inline-flex rounded-lg border border-borde bg-panel p-1">
      {op.map((o) => (
        <Link
          key={o.id}
          href={o.href}
          aria-current={actual === o.id ? 'page' : undefined}
          className={cn('rounded-md px-3 py-1.5 text-sm', actual === o.id ? 'bg-marca text-white' : 'text-tinta hover:bg-hover')}
        >
          {o.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
