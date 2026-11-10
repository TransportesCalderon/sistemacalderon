'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleX, Fuel, LoaderCircle } from 'lucide-react';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO } from '@/shared/ui/clases';
import { ordenCargaRepository } from '../../repositories/orden-carga.repository';

const MENSAJE: Record<string, string> = {
  no_existe: 'Este código QR no corresponde a ninguna orden de carga. No cargue.',
  autorizada: 'Esta orden ya fue usada. No cargue de nuevo.',
  cargada: 'Esta orden ya fue usada. No cargue de nuevo.',
  anulada: 'Esta orden fue anulada. No cargue.',
  bloqueada: 'Esta orden quedó bloqueada por palabras equivocadas. No cargue.',
  vencida: 'Esta orden venció. No cargue.',
};

/** Migración 234 · El playero confirma la carga con la palabra de seguridad (sin usuario). */
export function AutorizarCarga({ token }: { token: string }) {
  const repo = ordenCargaRepository(browserDb());
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['combustible', 'qr', token], queryFn: () => repo.publica(token), retry: 1 });
  const [palabra, setPalabra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  if (isPending) return <LoaderCircle className="mx-auto size-8 animate-spin text-tinta-suave" />;
  if (isError) return <p className="text-sm text-error">No se pudo leer la orden. Revisá la conexión y volvé a escanear el QR.</p>;

  if (listo)
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto size-14 text-exito" />
        <p className="text-xl font-semibold text-tinta">Carga autorizada</p>
        <p className="text-lg text-tinta">
          Puede cargar: <strong>{listo}</strong>
        </p>
        <p className="text-sm text-tinta-suave">
          {data.patente} · {data.chofer}
        </p>
      </div>
    );

  if (data.estado !== 'emitida')
    return (
      <div className="space-y-3 text-center">
        <CircleX className="mx-auto size-14 text-error" />
        <p className="text-lg font-semibold text-tinta">{MENSAJE[data.estado] ?? 'No cargue.'}</p>
        {data.patente && (
          <p className="text-sm text-tinta-suave">
            {data.numero} · {data.patente}
          </p>
        )}
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-lg font-semibold text-tinta">
        <Fuel className="size-6 text-marca" /> Orden de carga {data.numero}
      </p>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-tinta-suave">Chofer</dt>
          <dd className="text-right font-semibold text-tinta">{data.chofer}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-tinta-suave">Patente</dt>
          <dd className="font-mono font-semibold text-tinta">{data.patente}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-tinta-suave">Estación</dt>
          <dd className="text-right text-tinta">{data.estacion}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-tinta-suave">Autorizado</dt>
          <dd className="text-right text-lg font-bold text-marca">{data.autorizado}</dd>
        </div>
      </dl>
      <div className="space-y-1.5">
        <label htmlFor="palabra" className="block text-sm font-medium text-tinta">
          Palabra de seguridad (la que recibió la estación por mail)
        </label>
        <input
          id="palabra"
          autoComplete="off"
          autoCapitalize="characters"
          className="h-12 w-full rounded-md border border-borde bg-panel px-3 text-center font-mono text-lg tracking-wider uppercase"
          value={palabra}
          onChange={(e) => setPalabra(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <button
        type="button"
        className={`${BOTON_PRIMARIO} h-12 w-full justify-center text-base`}
        disabled={enviando}
        onClick={async () => {
          setError(null);
          setEnviando(true);
          try {
            const r = await repo.autorizar(token, palabra, navigator.userAgent);
            if (r.ok) setListo(r.autorizado ?? data.autorizado ?? '');
            else {
              setError(r.mensaje);
              void refetch();
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo autorizar.');
            void refetch();
          } finally {
            setEnviando(false);
          }
        }}
      >
        {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Confirmar la carga
      </button>
      <p className="text-xs text-tinta-suave">La orden sirve una sola vez. Después de confirmar, cargue lo autorizado.</p>
    </div>
  );
}
