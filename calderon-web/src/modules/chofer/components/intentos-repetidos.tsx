'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, ShieldAlert } from 'lucide-react';
import { AccionConMotivo, Chip } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora } from '@/shared/lib/fechas';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { TARJETA } from '@/shared/ui/clases';
import { revisarIntentoRepetido } from '../actions/intento-repetido.actions';
import { dinero } from '../domain/chofer.types';
import { abrirArchivo } from './archivos';

interface Intento {
  id: number;
  creado_en: string;
  chofer: string;
  regla: string;
  fecha: string | null;
  moneda: string | null;
  importe: number | null;
  comprobante_nro: string | null;
  operacion_nro: string | null;
  comprobante_uri: string | null;
  original: { numero: string; chofer: string; fecha: string; importe: number; moneda: string; estado: string; comprobante_uri: string | null };
  mismo_chofer: boolean;
  revisado: boolean;
  nota: string | null;
  revisado_por: string | null;
}

/**
 * Migración 257 · Fondos de choferes: intentos de cargar un comprobante que ya estaba cargado (por el mismo chofer o por
 * otro). La base no los dejó cargar; acá Administración los ve con las dos fotos y los marca revisados.
 */
export function IntentosRepetidos() {
  const hay = useBaseTiene(257);
  const { data } = useQuery({
    queryKey: ['chofer', 'intentos-repetidos'] as const,
    enabled: hay,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data: d, error } = await browserDb().schema('fin').rpc('fn_intentos_gasto_repetido', { p_dias: 60 });
      if (error) throw error;
      return (Array.isArray(d) ? d : []) as unknown as Intento[];
    },
  });
  if (!hay || !data || data.length === 0) return null;
  const pendientes = data.filter((i) => !i.revisado).length;
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4', pendientes > 0 && 'border-2 border-error/40')}>
      <h2 className="flex items-center gap-2 font-semibold text-tinta">
        <ShieldAlert className="size-5 text-error" /> Comprobantes repetidos que se quisieron cargar
        {pendientes > 0 && <Chip tono="error">{pendientes} sin revisar</Chip>}
      </h2>
      <p className="text-sm text-tinta-suave">
        El sistema no los dejó cargar porque el comprobante ya estaba en otro gasto (últimos 60 días). Revisá si fue un error o a propósito.
      </p>
      <ul className="divide-y divide-borde">
        {data.map((i) => (
          <FilaIntento key={i.id} i={i} />
        ))}
      </ul>
    </section>
  );
}

function FilaIntento({ i }: { i: Intento }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('rrhh.fondos:transicionar');
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const ver = async (ruta: string) => {
    const e = await abrirArchivo(ruta);
    if (e) setError({ codigo: 'desconocido', mensaje: e });
  };
  return (
    <li className={cn('space-y-1 py-3 text-sm', i.revisado && 'opacity-70')}>
      <p className="font-medium text-tinta">
        {i.chofer} quiso cargar {i.importe !== null ? dinero(i.importe, i.moneda ?? undefined) : 'un comprobante'}
        {i.mismo_chofer ? ' que él mismo ya había cargado' : ` que ya había cargado ${i.original.chofer}`}
      </p>
      <p className="text-xs text-tinta-suave">
        {formatearFechaHora(i.creado_en, zonaHoraria)} · Coincide por {i.regla} con el gasto {i.original.numero} ({formatearFechaDia(i.original.fecha)},{' '}
        {dinero(i.original.importe, i.original.moneda)}, {i.original.estado.replace('_', ' ')})
        {i.comprobante_nro && ` · Comprobante n.º ${i.comprobante_nro}`}
        {i.operacion_nro && ` · Operación n.º ${i.operacion_nro}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {i.comprobante_uri && (
          <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => void ver(i.comprobante_uri!)}>
            <ExternalLink className="size-3.5" /> Foto que quiso cargar
          </button>
        )}
        {i.original.comprobante_uri && (
          <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => void ver(i.original.comprobante_uri!)}>
            <ExternalLink className="size-3.5" /> Foto del gasto {i.original.numero}
          </button>
        )}
        {i.revisado ? (
          <span className="inline-flex items-center gap-1 text-xs text-exito">
            <Check className="size-3.5" /> Revisado{i.revisado_por ? ` por ${i.revisado_por}` : ''}
            {i.nota ? `: ${i.nota}` : ''}
          </span>
        ) : (
          puede && (
            <AccionConMotivo
              etiqueta="Marcar revisado"
              icono={<Check className="size-4" />}
              titulo="Marcar revisado"
              explicacion="Anotá qué pasó (por ejemplo: error del chofer, se habló con él)."
              motivoOpcional
              ocupado={ocupado}
              error={error}
              onConfirmar={async (nota) => {
                setOcupado(true);
                const r = await revisarIntentoRepetido({ intentoId: i.id, nota: nota || null });
                setOcupado(false);
                if (!r.ok) {
                  setError(r.error);
                  return false;
                }
                await invalidar(qc, 'fondo');
                return true;
              }}
            />
          )
        )}
      </div>
      {error && <p className="text-xs text-error">{error.mensaje}</p>}
    </li>
  );
}
