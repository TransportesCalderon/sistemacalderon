'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileWarning, LoaderCircle, Moon, Printer, ShieldCheck, X } from 'lucide-react';
import { Chip } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { estadoFueraHorario, VERSION_HORARIO, type CirculandoFueraHorario, type FueraHorario } from '../domain/horario.types';
import { useAnularHabilitacionHorario, useFueraHorario, useHabilitarFueraHorario, useLabrarActaFueraHorario, useSinSancionFueraHorario } from '../queries/horario.hooks';

const fechaNoche = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const hora = (iso: string | null, zona: string) =>
  iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }) : '';

/**
 * Migración 286 · Arriba de Seguimiento de viajes: el horario de manejo. Quién circuló fuera de horario esta noche
 * (o la que pasó, de día), en qué quedó cada aviso y quién está habilitado. Quien tiene la marca «Habilita fuera de
 * horario» puede dar permiso a un tractor por una noche, con motivo, y anularlo.
 */
export function FueraDeHorario() {
  const hay = useBaseTiene(VERSION_HORARIO);
  const { data } = useFueraHorario(hay);
  if (!hay || !data) return null;
  const hayAlgo = data.circulando.length > 0 || data.habilitados.length > 0 || data.pendientes.length > 0;
  if (!hayAlgo && !data.puedeHabilitar) return null;
  const sinResolver = [...data.circulando, ...data.pendientes].some((c) => c.infraccion && !c.acta && !c.sinSancion);
  return (
    <section
      className={cn(TARJETA, 'space-y-3 p-4', (sinResolver || data.circulando.some((c) => !c.habilitado && !c.detenidoEn)) && 'border-2 border-error/40')}
    >
      <p className="flex items-center gap-2 font-semibold text-tinta">
        <Moon className="size-5 text-marca" /> Horario de manejo: de {data.desde} a {data.tope}
        {!data.activo && <Chip tono="neutro">Avisos apagados</Chip>}
      </p>
      <p className="text-sm text-tinta-suave">
        A las {data.hasta} al chofer que circula y a Telemetría les llega un aviso para que busque dónde pasar la noche. El máximo es hasta las {data.tope}:
        después (o antes de las {data.desde}), sin permiso para esa noche, es <strong className="text-error">infracción</strong> y se labra el acta.
      </p>
      <Circulando datos={data} />
      <Pendientes datos={data} />
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
        {datos.circulando.map((c) => (
          <FilaNoche key={c.id} c={c} datos={datos} zona={zonaHoraria} />
        ))}
      </ul>
    </div>
  );
}

/** Migración 389: infracciones de noches anteriores que siguen sin acta ni decisión. */
function Pendientes({ datos }: { datos: FueraHorario }) {
  const { zonaHoraria } = useSesion();
  if (datos.pendientes.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-sm font-medium text-error">
        <FileWarning className="size-4" /> Infracciones de noches anteriores sin acta ({datos.pendientes.length})
      </p>
      <ul className="divide-y divide-borde rounded-lg border border-error/30 text-sm">
        {datos.pendientes.map((c) => (
          <FilaNoche key={c.id} c={c} datos={datos} zona={zonaHoraria} noche={c.noche} />
        ))}
      </ul>
    </div>
  );
}

function FilaNoche({ c, datos, zona, noche }: { c: CirculandoFueraHorario; datos: FueraHorario; zona: string; noche?: string }) {
  const e = estadoFueraHorario(c);
  const [abierto, setAbierto] = useState<'acta' | 'sin' | null>(null);
  const resolver = c.infraccion && !c.acta && !c.sinSancion;
  return (
    <li className={cn('space-y-2 px-3 py-2', resolver && 'bg-error/5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-mono font-semibold">{c.patente}</span>
          <span className="text-tinta-suave"> · {c.chofer ?? 'chofer sin identificar'}</span>
          {noche && <span className="text-tinta-suave"> · noche del {fechaNoche(noche)}</span>}
          <span className="block text-xs text-tinta-suave">
            Desde {formatearFechaHora(c.desde, zona)} · último dato {formatearFechaHora(c.ultimoTs, zona)}
            {c.velocidadKmh !== null && ` a ${Math.round(c.velocidadKmh)} km/h`}
            {c.escaladoEn && ` · Gerencia avisada ${formatearFechaHora(c.escaladoEn, zona)}`}
          </span>
          {c.infraccion && c.infraccionDesde && (
            <span className="block text-xs font-medium text-error">
              Manejó sin permiso de {hora(c.infraccionDesde, zona)} a {hora(c.infraccionHasta, zona)}
              {c.infraccionVmax !== null && ` (hasta ${Math.round(c.infraccionVmax)} km/h)`}, después de las {datos.tope}
            </span>
          )}
          {c.sinSancion && (
            <span className="block text-xs text-tinta-suave">
              Sin sanción: {c.sinSancion.motivo}
              {c.sinSancion.por && ` · ${c.sinSancion.por}`}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Chip tono={e.tono}>{e.texto}</Chip>
          {c.acta && (
            <Link href={`/actas/${c.acta.id}/imprimir`} className="inline-flex items-center gap-1 text-xs text-marca hover:underline">
              <Printer className="size-3.5" /> Ver acta
            </Link>
          )}
          {resolver && datos.puedeActa && abierto === null && (
            <button type="button" className={cn(BOTON_PRIMARIO, 'h-8 px-3 text-xs')} onClick={() => setAbierto('acta')}>
              <FileWarning className="size-3.5" /> Labrar acta
            </button>
          )}
          {resolver && datos.puedeSinSancion && abierto === null && (
            <button type="button" className="text-xs text-tinta-suave underline" onClick={() => setAbierto('sin')}>
              Sin sanción
            </button>
          )}
        </span>
      </div>
      {abierto === 'acta' && <LabrarActa c={c} onCerrar={() => setAbierto(null)} />}
      {abierto === 'sin' && <SinSancion c={c} onCerrar={() => setAbierto(null)} />}
    </li>
  );
}

function LabrarActa({ c, onCerrar }: { c: CirculandoFueraHorario; onCerrar: () => void }) {
  const labrar = useLabrarActaFueraHorario();
  const [descripcion, setDescripcion] = useState('');
  const [lugar, setLugar] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-lg bg-hover p-3">
      <p className="text-sm font-medium text-tinta">Acta de infracción por manejo fuera de horario · {c.patente}</p>
      <p className="text-xs text-tinta-suave">
        Si no escribís qué pasó, el acta dice el horario permitido, de qué hora a qué hora manejó, la velocidad y cuándo se le avisó. El monto y el descuento se
        ponen después en Actas.
      </p>
      <textarea
        rows={2}
        maxLength={2000}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Qué pasó (opcional)"
        className="w-full rounded-md border border-borde bg-panel px-3 py-2 text-sm"
      />
      <input
        maxLength={200}
        value={lugar}
        onChange={(e) => setLugar(e.target.value)}
        placeholder="Lugar (opcional): Ruta 7, Uspallata…"
        className="h-10 w-full rounded-md border border-borde bg-panel px-3 text-sm"
      />
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={labrar.isPending}
          onClick={async () => {
            setError(null);
            const r = await labrar.mutateAsync({ id: c.id, descripcion: descripcion.trim() || null, lugar: lugar.trim() || null });
            if (!r.ok) return setError(r.error.mensaje);
            onCerrar();
          }}
        >
          {labrar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FileWarning className="size-4" />} Labrar acta
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={labrar.isPending} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SinSancion({ c, onCerrar }: { c: CirculandoFueraHorario; onCerrar: () => void }) {
  const sin = useSinSancionFueraHorario();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-lg bg-hover p-3">
      <p className="text-sm font-medium text-tinta">Dejar sin sanción · {c.patente}</p>
      <input
        maxLength={300}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Por qué no corresponde (por ejemplo: permiso dado por teléfono, error del GPS)"
        className="h-10 w-full rounded-md border border-borde bg-panel px-3 text-sm"
      />
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={sin.isPending || motivo.trim().length < 5}
          onClick={async () => {
            setError(null);
            const r = await sin.mutateAsync({ id: c.id, motivo: motivo.trim() });
            if (!r.ok) return setError(r.error.mensaje);
            onCerrar();
          }}
        >
          {sin.isPending && <LoaderCircle className="size-4 animate-spin" />} Dejar sin sanción
        </button>
        <button type="button" className="text-sm text-tinta-suave underline" disabled={sin.isPending} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
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
        Habilitar para la noche del {fechaNoche(datos.proxima)} (después de las {datos.tope} y hasta las {datos.desde})
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
