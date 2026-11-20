'use client';

import { useState } from 'react';
import { LoaderCircle, Moon, ShieldCheck, X } from 'lucide-react';
import { Chip } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { estadoFueraHorario, VERSION_HORARIO, type FueraHorario } from '../domain/horario.types';
import { useAnularHabilitacionHorario, useFueraHorario, useHabilitarFueraHorario } from '../queries/horario.hooks';

const fechaNoche = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

/**
 * Migración 286 · Arriba de Seguimiento de viajes: el horario de manejo. Quién circuló fuera de horario esta noche
 * (o la que pasó, de día), en qué quedó cada aviso y quién está habilitado. Quien tiene la marca «Habilita fuera de
 * horario» puede dar permiso a un tractor por una noche, con motivo, y anularlo.
 */
export function FueraDeHorario() {
  const hay = useBaseTiene(VERSION_HORARIO);
  const { data } = useFueraHorario(hay);
  if (!hay || !data) return null;
  const hayAlgo = data.circulando.length > 0 || data.habilitados.length > 0;
  if (!hayAlgo && !data.puedeHabilitar) return null;
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4', data.circulando.some((c) => !c.habilitado && !c.detenidoEn) && 'border-2 border-error/40')}>
      <p className="flex items-center gap-2 font-semibold text-tinta">
        <Moon className="size-5 text-marca" /> Horario de manejo: de {data.desde} a {data.hasta}
        {!data.activo && <Chip tono="neutro">Avisos apagados</Chip>}
      </p>
      <p className="text-sm text-tinta-suave">
        Fuera de horario, al chofer que circula y a Telemetría les llega un aviso para que busque dónde pasar la noche; si una hora después sigue
        manejando, el aviso llega a Gerencia. Con permiso para esa noche, no se avisa.
      </p>
      <Circulando datos={data} />
      <Habilitados datos={data} />
      {data.puedeHabilitar && <Habilitar datos={data} />}
    </section>
  );
}

function Circulando({ datos }: { datos: FueraHorario }) {
  const { zonaHoraria } = useSesion();
  if (datos.circulando.length === 0)
    return <p className="text-sm text-tinta">{datos.enHorario ? 'Anoche nadie circuló fuera de horario.' : 'Esta noche nadie circula fuera de horario.'}</p>;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-tinta">
        {datos.enHorario ? `La noche del ${fechaNoche(datos.noche)}` : 'Esta noche'}: circularon fuera de horario
      </p>
      <ul className="divide-y divide-borde rounded-lg border border-borde text-sm">
        {datos.circulando.map((c) => {
          const e = estadoFueraHorario(c);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-mono font-semibold">{c.patente}</span>
                <span className="text-tinta-suave"> · {c.chofer ?? 'chofer sin identificar'}</span>
                <span className="block text-xs text-tinta-suave">
                  Desde {formatearFechaHora(c.desde, zonaHoraria)} · último dato {formatearFechaHora(c.ultimoTs, zonaHoraria)}
                  {c.velocidadKmh !== null && ` a ${Math.round(c.velocidadKmh)} km/h`}
                  {c.escaladoEn && ` · Gerencia avisada ${formatearFechaHora(c.escaladoEn, zonaHoraria)}`}
                </span>
              </span>
              <Chip tono={e.tono}>{e.texto}</Chip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Habilitados({ datos }: { datos: FueraHorario }) {
  const anular = useAnularHabilitacionHorario();
  const [error, setError] = useState<string | null>(null);
  if (datos.habilitados.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-tinta">Habilitados a circular fuera de horario</p>
      <ul className="divide-y divide-borde rounded-lg border border-borde text-sm">
        {datos.habilitados.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              <ShieldCheck className="mr-1 inline size-4 text-exito" />
              <span className="font-mono font-semibold">{h.patente}</span>
              {h.chofer && <span className="text-tinta-suave"> · {h.chofer}</span>}
              <span className="block text-xs text-tinta-suave">
                Noche del {fechaNoche(h.noche)} · {h.motivo}
                {h.por && ` · habilitó ${h.por}`}
              </span>
            </span>
            {datos.puedeHabilitar && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-error hover:underline"
                disabled={anular.isPending}
                onClick={async () => {
                  setError(null);
                  const r = await anular.mutateAsync({ id: h.id, motivo: null });
                  if (!r.ok) setError(r.error.mensaje);
                }}
              >
                <X className="size-3.5" /> Anular
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}

function Habilitar({ datos }: { datos: FueraHorario }) {
  const habilitar = useHabilitarFueraHorario();
  const [abierto, setAbierto] = useState(false);
  const [camion, setCamion] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const ya = new Set(datos.habilitados.filter((h) => h.noche === datos.proxima).map((h) => h.camionId));
  // Primero los que están circulando sin permiso
  const sinPermiso = new Set(datos.circulando.filter((c) => !c.habilitado && !c.detenidoEn).map((c) => c.camionId));
  const opciones = datos.tractores
    .filter((t) => !ya.has(t.id))
    .sort((a, b) => Number(sinPermiso.has(b.id)) - Number(sinPermiso.has(a.id)) || a.patente.localeCompare(b.patente, 'es', { numeric: true }));

  if (!abierto)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(true)}>
          <ShieldCheck className="size-4" /> Habilitar a un tractor fuera de horario
        </button>
        {hecho && <span className="text-sm text-exito">{hecho}</span>}
      </div>
    );
  return (
    <div className="space-y-2 rounded-lg bg-hover p-3">
      <p className="text-sm font-medium text-tinta">
        Habilitar para la noche del {fechaNoche(datos.proxima)} (de las {datos.hasta} a las {datos.desde})
      </p>
      <select
        aria-label="Tractor"
        value={camion ?? ''}
        onChange={(e) => setCamion(e.target.value ? Number(e.target.value) : null)}
        className="h-11 w-full rounded-md border border-borde bg-panel px-3 text-base sm:w-96"
      >
        <option value="">Elegí el tractor…</option>
        {opciones.map((t) => (
          <option key={t.id} value={t.id}>
            {t.patente}
            {t.chofer ? ` · ${t.chofer}` : ''}
            {sinPermiso.has(t.id) ? ' · circulando ahora' : ''}
          </option>
        ))}
      </select>
      <input
        value={motivo}
        maxLength={300}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (por ejemplo: turno de descarga a primera hora)"
        className="h-11 w-full rounded-md border border-borde bg-panel px-3 text-base"
      />
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={habilitar.isPending || camion === null || motivo.trim().length < 5}
          onClick={async () => {
            if (camion === null) return;
            setError(null);
            const r = await habilitar.mutateAsync({ camionId: camion, motivo: motivo.trim() });
            if (!r.ok) {
              setError(r.error.mensaje);
              return;
            }
            setHecho(`Habilitado. Se le avisó al chofer y a Telemetría.`);
            setAbierto(false);
            setCamion(null);
            setMotivo('');
          }}
        >
          {habilitar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Habilitar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={habilitar.isPending} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
