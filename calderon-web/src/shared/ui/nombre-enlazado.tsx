'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useFicha } from '@/modules/core/fichas/contexto';
import { conFicha, leerFicha, mismaFicha, rastroAlAbrir, type TipoFicha } from '@/modules/core/fichas/ficha-url';
import { FICHAS } from '@/modules/core/fichas/tipos';
import { can } from '@/modules/core/permissions/resolver';
import { useSesion } from '@/modules/core/session/session-provider';
import { baseTiene } from '@/shared/lib/version-base';
import { cn } from '@/shared/lib/cn';

/**
 * Sprint 1 · S1-03: el nombre de un camión, chofer, cliente, carga o viaje que abre su ficha
 * en el panel, sin salir de la pantalla. Reemplaza los enlaces a las páginas de detalle.
 *   <NombreEnlazado tipo="camion" id={12}>SXXV17</NombreEnlazado>
 * - Desde adentro del panel abre la ficha en el mismo panel y suma la actual al rastro.
 * - Si el rol no puede ver ese tipo, muestra solo el texto.
 * - Si su ficha es la abierta, se marca (data-ficha-abierta) y su fila queda resaltada.
 * - alternativa: a dónde ir si la base todavía no tiene la migración que necesita la ficha.
 */
export function NombreEnlazado({
  tipo,
  id,
  children,
  className,
  alternativa,
  title,
}: {
  tipo: TipoFicha;
  id: number;
  children: ReactNode;
  className?: string;
  alternativa?: string;
  title?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const ctx = useFicha();
  const { permisos, versionBase } = useSesion();
  const def = FICHAS[tipo];
  const ref = { tipo, id };
  const clase = className ?? 'text-marca hover:underline';

  if (!can(permisos, `${def.pantalla}:ver`)) return <span className={className}>{children}</span>;
  if (def.version && !baseTiene(versionBase, def.version)) {
    return alternativa ? (
      <Link href={alternativa} className={clase} title={title}>
        {children}
      </Link>
    ) : (
      <span className={className}>{children}</span>
    );
  }

  const rastro = ctx ? rastroAlAbrir(ctx.actual, ctx.rastro, ref) : [];
  const abierta = !ctx && mismaFicha(leerFicha(params.get('ficha')), ref);
  return (
    <Link
      href={`${pathname}${conFicha(params.toString(), ref, rastro)}`}
      scroll={false}
      className={cn(clase, abierta && 'font-semibold')}
      data-ficha-abierta={abierta || undefined}
      title={title}
      // Los enlaces suelen estar dentro de filas que también son clicables: el clic es solo del enlace
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
