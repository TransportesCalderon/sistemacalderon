'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Gauge, Trash2 } from 'lucide-react';
import { Cargando, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { anularTableroChofer } from '../actions/tablero.actions';
import { horasATexto, type Tablero } from '../domain/tablero.types';
import { tableroRepository } from '../repositories/tablero.repository';
import { SubirTablero } from './subir-tablero';
import { invalidar } from '@/shared/query/invalidar';

/** Pantalla del chofer: elegir el camión, sacar las fotos del tablero y ver lo que ya cargó. */
export function TableroChofer() {
  const { choferId, zonaHoraria } = useSesion();
  const qc = useQueryClient();
  const ctx = useQuery({ queryKey: ['tablero', 'contexto'], queryFn: () => tableroRepository(browserDb()).contexto() });
  const lista = useQuery({ queryKey: ['tablero', 'mios'], queryFn: () => tableroRepository(browserDb()).lista(null, 30) });
  const [elegido, setElegido] = useState<number | null>(null);

  if (ctx.isLoading) return <Cargando texto="Buscando tu camión…" />;
  if (ctx.isError || !ctx.data) return <ErrorLectura texto="No se pudo leer tu camión." onReintentar={() => void ctx.refetch()} />;
  const camiones = ctx.data.camiones;
  const camionId = elegido ?? (camiones.length === 1 ? camiones[0]!.id : null);
  const refrescar = () => void invalidar(qc, 'tablero');

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/mi-viaje" className="inline-flex items-center gap-1 text-sm text-marca">
        <ArrowLeft className="size-4" /> Mi viaje
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-tinta">Tablero del camión</h1>
        <p className="text-sm text-tinta-suave">En cada llenado de corte: sacá las fotos, revisá los números, guardá y después tocá «Restablecer» en el camión.</p>
      </header>

      {camiones.length === 0 ? (
        <p className={cn(TARJETA, 'p-4 text-sm text-tinta-suave')}>No tenés un camión asignado ni un viaje abierto. Pedile a Operaciones que te asigne el tractor.</p>
      ) : (
        <>
          {camiones.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {camiones.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setElegido(c.id)}
                  className={cn('rounded-full border px-3 py-1.5 text-sm', c.id === camionId ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde text-tinta')}
                >
                  {c.patente}
                </button>
              ))}
            </div>
          )}
          {camionId === null ? (
            <p className="text-sm text-tinta-suave">Elegí el camión.</p>
          ) : (
            <section className={cn(TARJETA, 'space-y-3 p-4')}>
              <p className="flex items-center gap-2 font-medium text-tinta">
                <Gauge className="size-5 text-marca" /> {camiones.find((c) => c.id === camionId)?.patente}
              </p>
              <SubirTablero key={camionId} camionId={camionId} modo="chofer" carpeta={`${choferId ?? 0}/tablero`} onGuardado={refrescar} />
            </section>
          )}
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-tinta">Lo que ya cargaste (últimos 30 días)</h2>
        {(lista.data ?? []).length === 0 ? (
          <p className="text-sm text-tinta-suave">Todavía nada.</p>
        ) : (
          <ul className="space-y-2">
            {(lista.data ?? []).map((t) => (
              <FilaTablero key={t.id} t={t} zonaHoraria={zonaHoraria} onQuitado={refrescar} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilaTablero({ t, zonaHoraria, onQuitado }: { t: Tablero; zonaHoraria: string; onQuitado: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const hoy = Date.now() - new Date(t.tomadaEn).getTime() < 24 * 3600 * 1000;
  return (
    <li className={cn(TARJETA, 'space-y-1 p-3 text-sm')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-tinta">
          {t.patente} · {formatearFechaHora(t.tomadaEn, zonaHoraria)}
        </span>
        {hoy && (
          <button
            type="button"
            className={cn(BOTON_SECUNDARIO, 'px-2 py-1')}
            aria-label="Quitar"
            onClick={async () => {
              const r = await anularTableroChofer({ id: t.id });
              if (!r.ok) setError(r.error.mensaje);
              else onQuitado();
            }}
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <p className="text-tinta-suave">
        {[
          t.km !== undefined && `${formatearNumero(t.km, 0)} km`,
          t.litros !== undefined && `${formatearNumero(t.litros, 0)} L`,
          t.l_100km !== undefined && `${formatearNumero(t.l_100km, 1)} L/100 km`,
          t.horas !== undefined && `${horasATexto(t.horas)} h de motor`,
          t.puntaje !== undefined && `puntuación ${formatearNumero(t.puntaje, 0)} %`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {t.avisos.length > 0 && <p className="text-xs text-alerta">{t.avisos.join(' · ')}</p>}
      {error && <p className="text-xs text-error">{error}</p>}
    </li>
  );
}
