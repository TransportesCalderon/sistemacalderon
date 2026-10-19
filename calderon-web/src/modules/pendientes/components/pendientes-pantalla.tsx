'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { Cargando, Chip, Encabezado, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { REFRESCO } from '@/shared/query/frescura';
import { browserDb } from '@/shared/supabase/browser';
import { ETIQUETA_GRUPO, GRUPOS, pendientesQuery, type Pendiente } from '../pendientes';

/** Inicio > Mis pendientes: lo que espera una acción del usuario. Se actualiza cada minuto. */
export function PendientesPantalla() {
  const { zonaHoraria, permisos } = useSesion();
  const { data, isPending, isError, refetch } = useQuery({ ...pendientesQuery(browserDb()), refetchInterval: REFRESCO.bandeja });
  // Solo lo que el usuario puede abrir (la matriz de permisos decide qué pantallas ve)
  const visibles = (data ?? []).filter((p) => p.pantalla === null || alcanceDe(permisos, `${p.pantalla}:ver`) !== null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Mis pendientes" subtitulo="Inicio" />
      {isPending ? (
        <Cargando texto="Buscando pendientes…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron cargar los pendientes." onReintentar={() => refetch()} />
      ) : visibles.length === 0 ? (
        <Vacio icono={<ClipboardCheck className="size-6" />} texto="No tenés nada pendiente." />
      ) : (
        GRUPOS.map((g) => {
          const items = visibles.filter((p) => p.grupo === g);
          if (items.length === 0) return null;
          return (
            <Seccion
              key={g}
              titulo={`${ETIQUETA_GRUPO[g].titulo} (${items.reduce((n, p) => n + (p.grupo === 'revisar' ? 1 : p.cantidad), 0)})`}
            >
              <p className="-mt-2 text-xs text-tinta-suave">{ETIQUETA_GRUPO[g].ayuda}</p>
              <ul className="divide-y divide-borde">
                {items.map((p) => (
                  <Item key={`${p.tipo}-${p.refId ?? 'total'}`} p={p} zonaHoraria={zonaHoraria} />
                ))}
              </ul>
            </Seccion>
          );
        })
      )}
    </div>
  );
}

function Item({ p, zonaHoraria }: { p: Pendiente; zonaHoraria: string }) {
  return (
    <li>
      <Link href={p.ruta} className="flex items-center gap-3 py-3 hover:bg-hover">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-tinta">
            {p.titulo} {p.grupo === 'revisar' && p.cantidad > 1 && <Chip tono="alerta">{p.cantidad}</Chip>}
          </p>
          {p.detalle && <p className="truncate text-sm text-tinta-suave">{p.detalle}</p>}
        </div>
        {p.fecha && <span className="shrink-0 text-xs text-tinta-suave tabular-nums">{formatearFechaHora(p.fecha, zonaHoraria)}</span>}
        <ChevronRight className="size-4 shrink-0 text-tinta-suave" />
      </Link>
    </li>
  );
}
