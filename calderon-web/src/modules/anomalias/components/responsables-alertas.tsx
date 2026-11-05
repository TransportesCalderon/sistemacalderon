'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Fuel, Users } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Dato, ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearNumero } from '@/shared/lib/numeros';
import { CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { cn } from '@/shared/lib/cn';
import { EQUIPOS, VERSION_CARGA_IMPOSIBLE, VERSION_GESTION_ALERTAS, type ResponsablesAlerta } from '../domain/gestion.types';
import { useCambiarResponsableAlerta, useResponsablesAlertas, useResumenCargaImposible } from '../queries/hooks';

const CATEGORIA: Record<string, string> = { combustible: 'Combustible', telemetria: 'Manejo y ruta', operativa: 'Operativa', documental: 'Documentos' };

/** Migración 189 · Quién se hace cargo de cada tipo de alerta (lo cambian TI o Gerencia, sin tocar código). */
export function ResponsablesAlertas() {
  const hay = useBaseTiene(VERSION_GESTION_ALERTAS);
  const [abierto, setAbierto] = useState(false);
  const { data, isPending } = useResponsablesAlertas(hay && abierto);
  if (!hay) return null;
  return (
    <section className={cn(TARJETA, 'p-4')}>
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <span className="flex items-center gap-2 font-medium text-tinta">
          <Users className="size-4" /> Responsables por tipo de alerta y plazo
        </span>
        {abierto ? <ChevronUp className="size-5 text-tinta-suave" /> : <ChevronDown className="size-5 text-tinta-suave" />}
      </button>
      {abierto &&
        (isPending || !data ? (
          <Cargando texto="Cargando…" />
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-tinta-suave">
              Cada alerta nueva queda a cargo de este equipo (o persona) con {formatearNumero(data.plazoHoras, 0)} h para resolverla. Si vence, escala a quienes
              reciben escalamientos (se marcan en Usuarios). El cambio vale para las alertas nuevas.
            </p>
            <ul className="divide-y divide-borde text-sm">
              {data.tipos.map((t) => (
                <FilaResponsable key={t.codigo} t={t} data={data} />
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

function FilaResponsable({ t, data }: { t: ResponsablesAlerta['tipos'][number]; data: ResponsablesAlerta }) {
  const cambiar = useCambiarResponsableAlerta();
  const envio = useEnvio();
  const personas = data.usuarios.filter((u) => u.roles.includes(t.rol));
  const guardar = (rol: string, usuarioId: number | null) => void envio.enviar(cambiar.mutateAsync({ codigo: t.codigo, rol, usuarioId }), () => undefined);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span>
        <span className="font-medium text-tinta">{t.nombre}</span>
        <span className="block text-xs text-tinta-suave">{CATEGORIA[t.categoria] ?? t.categoria}</span>
      </span>
      {data.puedoCambiar ? (
        <span className="flex flex-wrap gap-2">
          <select className={CONTROL_FILTRO} value={t.rol} disabled={cambiar.isPending} onChange={(e) => guardar(e.target.value, null)}>
            {EQUIPOS.map((e) => (
              <option key={e.rol} value={e.rol}>
                {e.nombre}
              </option>
            ))}
          </select>
          <select
            className={CONTROL_FILTRO}
            value={t.usuarioId ?? ''}
            disabled={cambiar.isPending}
            onChange={(e) => guardar(t.rol, e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todo el equipo</option>
            {personas.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </span>
      ) : (
        <span className="text-tinta">{t.responsable}</span>
      )}
      <ErrorBase error={envio.error} />
    </li>
  );
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Migración 188 · Cómo viene la regla de carga imposible: para medir falsos positivos antes de endurecerla. */
export function ResumenCargaImposible() {
  const hay = useBaseTiene(VERSION_CARGA_IMPOSIBLE);
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoyISO());
  const { data, isPending, error } = useResumenCargaImposible(desde, hasta, hay && abierto && !!desde && !!hasta);
  if (!hay) return null;
  return (
    <section className={cn(TARJETA, 'p-4')}>
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <span className="flex items-center gap-2 font-medium text-tinta">
          <Fuel className="size-4" /> Carga imposible: cómo viene la regla
        </span>
        {abierto ? <ChevronUp className="size-5 text-tinta-suave" /> : <ChevronDown className="size-5 text-tinta-suave" />}
      </button>
      {abierto && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-tinta-suave">
            Se revisan todas las cargas (también las normales y las que no tienen telemetría). Falso positivo es solo la alerta descartada (no debía existir);
            la justificada era válida y tuvo una explicación legítima, y se cuenta aparte. El margen (5 % de la capacidad o 30 L) se cambia en Umbrales.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
            <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
          </div>
          {error ? (
            <p className="text-sm text-error">{error instanceof Error ? error.message : 'No se pudo leer.'}</p>
          ) : isPending || !data ? (
            <Cargando texto="Cargando…" />
          ) : (
            <>
              <dl className="grid gap-4 sm:grid-cols-4">
                <Dato etiqueta="Revisadas">{formatearNumero(data.revisadas, 0)}</Dato>
                <Dato etiqueta="Normales">{formatearNumero(data.normales, 0)}</Dato>
                <Dato etiqueta="Imposibles">
                  {formatearNumero(data.imposibles, 0)} ({formatearNumero(data.litrosExceso, 0)} L de más)
                </Dato>
                <Dato etiqueta="Sin dato">{formatearNumero(data.sinDato, 0)}</Dato>
                <Dato etiqueta="Abiertas">{formatearNumero(data.abiertas, 0)}</Dato>
                <Dato etiqueta="Confirmadas">{formatearNumero(data.confirmadas, 0)}</Dato>
                <Dato etiqueta="Justificadas (válidas)">{formatearNumero(data.justificadas, 0)}</Dato>
                <Dato etiqueta="Falsos positivos (descartadas)">
                  {formatearNumero(data.falsosPositivos, 0)}
                  {data.pctFalsosPositivos !== null && ` (${formatearNumero(data.pctFalsosPositivos, 1)} % de las cerradas)`}
                </Dato>
              </dl>
              {data.sinDatoMotivos.length > 0 && (
                <ul className="text-xs text-tinta-suave">
                  {data.sinDatoMotivos.map((m) => (
                    <li key={m.motivo}>
                      Sin dato: {m.motivo} ({m.cantidad})
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
