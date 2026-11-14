'use client';

import { useState } from 'react';
import { CheckCircle2, ExternalLink, Fuel, LoaderCircle } from 'lucide-react';
import { BUCKET_OPERACION } from '@/modules/chofer/domain/chofer.types';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import type { PorRegistrar } from '../../domain/orden-carga.types';
import { usePorRegistrar, useRegistrarCargaOrden } from '../../queries/orden-carga.hooks';

const aNumero = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')));
const aTexto = (n: number | null, d = 0) => (n === null ? '' : formatearNumero(n, d));

/**
 * Migración 253 · Arriba de Cargas: las cargas de las órdenes que el chofer ya terminó, con todo cargado (litros,
 * precio, odómetro, ticket). Solo falta decir si inicia viaje y dar el OK. Lo ven quienes registran cargas.
 */
export function OrdenesPorRegistrar() {
  const puede = useCan('combustible.cargas:editar');
  const { data } = usePorRegistrar(puede);
  if (!puede || !data || data.length === 0) return null;
  return (
    <section className="mb-4 space-y-3 rounded-xl border-2 border-marca/40 bg-marca-suave/40 p-4">
      <p className="flex items-center gap-2 font-semibold text-tinta">
        <Fuel className="size-5 text-marca" /> Cargas de órdenes para registrar ({data.length})
      </p>
      <p className="text-sm text-tinta-suave">El chofer ya terminó la carga y subió el ticket. Revisá los datos, decí si inicia viaje y registrala.</p>
      {data.map((p) => (
        <Fila key={p.ordenId} p={p} />
      ))}
    </section>
  );
}

function Fila({ p }: { p: PorRegistrar }) {
  const { zonaHoraria } = useSesion();
  const registrar = useRegistrarCargaOrden();
  const [litros, setLitros] = useState(aTexto(p.litros, 2));
  const [precio, setPrecio] = useState(aTexto(p.precioUnitario, 4));
  const [odometro, setOdometro] = useState(aTexto(p.odometroKm, 1));
  const [ticket, setTicket] = useState(p.ticketNumero ?? '');
  const [lleno, setLleno] = useState(p.tanqueLleno);
  const [inicia, setInicia] = useState<boolean | null>(null);
  const [faltante, setFaltante] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  if (hecho)
    return (
      <p className="flex items-center gap-2 rounded-lg bg-panel p-3 text-sm text-exito">
        <CheckCircle2 className="size-4" /> {p.numero}: carga registrada.
      </p>
    );

  const l = aNumero(litros);
  const pr = aNumero(precio);
  const campo = 'h-11 w-full rounded-md border border-borde bg-panel px-3 text-base';

  return (
    <div className={cn(TARJETA, 'space-y-3 p-3')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-tinta">
          {p.numero} · <span className="font-mono">{p.patente}</span>
        </p>
        <p className="text-xs text-tinta-suave">
          {p.chofer ?? 'Sin chofer'} · {p.estacion} · {p.fechaHora ? formatearFechaHora(p.fechaHora, zonaHoraria) : '—'}
        </p>
      </div>
      <p className="text-xs text-tinta-suave">Autorizado: {p.autorizado}</p>
      {p.alerta && <p className="rounded-md bg-alerta-suave p-2 text-xs text-alerta">{p.alerta}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="space-y-1 text-xs text-tinta-suave">
          Litros
          <input className={campo} inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-tinta-suave">
          Precio por litro{p.moneda ? ` (${p.moneda})` : ''}
          <input className={campo} inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-tinta-suave">
          Odómetro (km)
          <input className={campo} inputMode="decimal" value={odometro} onChange={(e) => setOdometro(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-tinta-suave">
          N.º de ticket
          <input className={campo} value={ticket} onChange={(e) => setTicket(e.target.value)} />
        </label>
      </div>
      {l !== null && pr !== null && (
        <p className="text-sm text-tinta">
          Importe: <strong>{p.moneda} {formatearNumero(l * pr, 2)}</strong>
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" className="size-4 accent-marca" checked={lleno} onChange={(e) => setLleno(e.target.checked)} /> Tanque lleno
      </label>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-tinta">¿Esta carga inicia viaje (corte de viaje)?</p>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={inicia === v}
              disabled={v && !lleno}
              onClick={() => setInicia(v)}
              className={cn(
                'min-h-12 rounded-lg border-2 px-3 text-base font-semibold disabled:opacity-50',
                inicia === v ? 'border-marca bg-marca-suave text-marca' : 'border-borde bg-panel text-tinta hover:bg-hover',
              )}
            >
              {v ? 'Sí, inicia viaje' : 'No'}
            </button>
          ))}
        </div>
        {!lleno && <p className="text-xs text-tinta-suave">Para iniciar viaje tiene que ser a tanque lleno.</p>}
        {inicia && (
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <label className="space-y-1 text-xs text-tinta-suave">
              Le faltaron (L) para quedar lleno
              <input className={campo} inputMode="decimal" placeholder="0" value={faltante} onChange={(e) => setFaltante(e.target.value)} />
            </label>
            {(aNumero(faltante) ?? 0) > 0 && (
              <label className="space-y-1 text-xs text-tinta-suave">
                Por qué
                <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. no se cargó la mochila" />
              </label>
            )}
          </div>
        )}
      </div>

      {p.tickets.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {p.tickets.map((ruta, i) => (
            <button
              key={ruta}
              type="button"
              className="inline-flex items-center gap-1 text-marca hover:underline"
              onClick={async () => {
                const ventana = window.open('', '_blank');
                const { data } = await browserDb().storage.from(BUCKET_OPERACION).createSignedUrl(ruta, 300);
                if (data && ventana) ventana.location.href = data.signedUrl;
                else ventana?.close();
              }}
            >
              <ExternalLink className="size-3.5" /> Ticket {i + 1}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      <button
        type="button"
        className={cn(BOTON_PRIMARIO, 'h-12 w-full justify-center text-base sm:w-auto')}
        disabled={registrar.isPending || inicia === null}
        onClick={async () => {
          setError(null);
          const r = await registrar.mutateAsync({
            ordenId: p.ordenId,
            iniciaViaje: inicia === true,
            ajustes: {
              litros: l,
              precio_unitario: pr,
              odometro_km: aNumero(odometro),
              ticket_numero: ticket.trim() || null,
              tanque_lleno: lleno,
              faltante_lleno_l: inicia ? aNumero(faltante) : null,
              faltante_observacion: inicia ? motivo.trim() || null : null,
            },
          });
          if (!r.ok) setError(r.error.mensaje);
          else setHecho(true);
        }}
      >
        {registrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Registrar carga
      </button>
    </div>
  );
}
