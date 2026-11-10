'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Cargando, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { browserDb } from '@/shared/supabase/browser';
import { CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { GRUPOS_ACTIVIDAD, actividadRepository } from '../actividad';

const PERIODOS = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'ayer', etiqueta: 'Ayer' },
  { valor: '7', etiqueta: 'Últimos 7 días' },
  { valor: '30', etiqueta: 'Últimos 30 días' },
] as const;

function rango(p: string): { desde: string; hasta: string | null } {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (p === 'hoy') return { desde: hoy.toISOString(), hasta: null };
  if (p === 'ayer') return { desde: new Date(hoy.getTime() - 86_400_000).toISOString(), hasta: hoy.toISOString() };
  return { desde: new Date(hoy.getTime() - Number(p) * 86_400_000).toISOString(), hasta: null };
}

/**
 * Migración 235 · Registro de actividad (Gerencia, TI y Auditoría): qué se hizo, cuándo y quién, en palabras.
 * Sale de la auditoría que la base ya guardaba de cada cambio.
 */
export function RegistroActividad() {
  const { zonaHoraria } = useSesion();
  const [periodo, setPeriodo] = useState('hoy');
  const [grupo, setGrupo] = useState('');
  const [usuario, setUsuario] = useState('');
  const r = rango(periodo);
  const repo = actividadRepository(browserDb());
  const usuarios = useQuery({ queryKey: ['pendientes', 'actividad', 'usuarios'] as const, queryFn: () => repo.usuarios(), staleTime: 300_000 });
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['pendientes', 'actividad', 'lista', periodo, grupo, usuario] as const,
    queryFn: () => repo.lista({ desde: r.desde, hasta: r.hasta, grupo: grupo || null, usuario: usuario ? Number(usuario) : null }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select className={CONTROL_FILTRO} value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.etiqueta}
            </option>
          ))}
        </select>
        <select className={CONTROL_FILTRO} value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Qué">
          {GRUPOS_ACTIVIDAD.map((g) => (
            <option key={g.valor} value={g.valor}>
              {g.etiqueta}
            </option>
          ))}
        </select>
        <select className={CONTROL_FILTRO} value={usuario} onChange={(e) => setUsuario(e.target.value)} aria-label="Quién">
          <option value="">Todas las personas</option>
          {usuarios.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </div>
      {isPending ? (
        <Cargando texto="Leyendo el registro…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo leer el registro de actividad." error={error} onReintentar={() => void refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<History className="size-6" />} texto="No hay actividad en ese período." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-3 py-2.5">Día y hora</th>
                <th className="px-3 py-2.5">Qué</th>
                <th className="px-3 py-2.5">Qué se hizo</th>
                <th className="px-3 py-2.5">Quién</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-tinta-suave">{formatearFechaHora(a.en, zonaHoraria)}</td>
                  <td className="px-3 py-2">
                    {a.ruta ? (
                      <Link href={a.ruta} className="text-marca hover:underline">
                        {a.tipo} {a.registro}
                      </Link>
                    ) : (
                      <span>
                        {a.tipo} {a.registro}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-tinta">
                    {a.que}
                    {a.motivo && <span className="block text-xs text-tinta-suave">{a.motivo}</span>}
                  </td>
                  <td className="px-3 py-2 text-tinta-suave">{a.usuario ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.length >= 500 && <p className="text-xs text-tinta-suave">Se muestran los 500 más recientes: achicá el período o filtrá.</p>}
    </div>
  );
}
