'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Database, LoaderCircle, Pencil } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { ETIQUETA_DATO, type Regla } from '@/modules/anomalias/domain/alerta.types';
import { useCambiarUmbrales, useReglasAlertas } from '@/modules/anomalias/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { useInventarioTelemetria, useTarjetasSinEnlace } from '../queries/hooks';

/**
 * Configuración > Datos de los camiones (migración 49): qué datos manda realmente cada marca
 * (Renault, Volvo), tarjetas de conductor que todavía no están enlazadas a un chofer y los
 * umbrales de las alertas.
 */
export function DatosCamionesPantalla() {
  const verReglas = useCan('anomalias.reglas:ver');
  return (
    <div className="space-y-5">
      <Encabezado titulo="Datos de los camiones" subtitulo="Configuración" />
      <TarjetasSinEnlace />
      {verReglas && <Umbrales />}
      <Inventario />
    </div>
  );
}

function TarjetasSinEnlace() {
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, refetch } = useTarjetasSinEnlace(30);
  return (
    <Seccion titulo="Tarjetas de conductor sin enlazar">
      <p className="text-sm text-tinta-suave">
        Son tarjetas del tacógrafo que aparecen en la telemetría de los últimos 30 días y no están cargadas en ningún chofer. Mientras no se enlacen, el
        sistema usa el viaje de chofer o el chofer fijo del tractor. Para enlazarla: Más › Ajustes › Flota › Choferes › editar el chofer › «Identificador de conductor
        Optifleet».
      </p>
      {isPending ? (
        <Cargando texto="Buscando…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron leer las tarjetas." onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <p className="text-sm text-exito">Todas las tarjetas están enlazadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-borde">
              <tr>
                <th className={TH}>Tarjeta</th>
                <th className={TH}>Último camión</th>
                <th className={TH}>Última vez</th>
                <th className={cn(TH, 'text-right')}>Lecturas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((t) => (
                <tr key={`${t.choferExternoId}-${t.camionId}`}>
                  <td className={cn(TD, 'font-mono')}>{t.choferExternoId}</td>
                  <td className={cn(TD, 'font-mono')}>{t.patente}</td>
                  <td className={TD}>{formatearFechaHora(t.ultimoTs, zonaHoraria)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(t.lecturas, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/flota/choferes" className="mt-3 inline-block text-sm text-marca hover:underline">
            Ir a Choferes
          </Link>
        </div>
      )}
    </Seccion>
  );
}

function Umbrales() {
  const { data, isPending, isError, refetch } = useReglasAlertas();
  return (
    <Seccion titulo="Umbrales de las alertas">
      <p className="text-sm text-tinta-suave">Un cambio rige desde hoy (o desde mañana si ya se cambió hoy). Las alertas ya generadas no cambian.</p>
      {isPending ? (
        <Cargando texto="Cargando…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron leer las reglas." onReintentar={() => refetch()} />
      ) : (
        <ul className="divide-y divide-borde">
          {data.map((r) => (
            <FilaRegla key={r.codigo} r={r} />
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function FilaRegla({ r }: { r: Regla }) {
  const puede = useCan('anomalias.reglas:editar');
  const cambiar = useCambiarUmbrales();
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [activa, setActiva] = useState(r.activa);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const claves = Object.keys(r.parametros);

  const abrir = () => {
    setValores(Object.fromEntries(claves.map((k) => [k, String(r.parametros[k] ?? '')])));
    setActiva(r.activa);
    setError(null);
    setEditando(true);
  };

  return (
    <li className="space-y-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-tinta">
            {r.nombre} {!r.activa && <Chip tono="neutro">Apagada</Chip>}
          </p>
          {r.descripcion && <p className="text-sm text-tinta-suave">{r.descripcion}</p>}
          {!editando && (
            <p className="mt-1 text-sm text-tinta">
              {claves.map((k) => `${ETIQUETA_DATO[k] ?? k}: ${String(r.parametros[k])}`).join(' · ')}
              <span className="text-tinta-suave"> · versión {r.version}, desde {formatearFechaDia(r.vigenteDesde)}</span>
            </p>
          )}
        </div>
        {puede && !editando && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={abrir}>
            <Pencil className="size-4" /> Cambiar
          </button>
        )}
      </div>
      {editando && (
        <div className="space-y-3 rounded-lg border border-borde p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {claves.map((k) => (
              <label key={k} className="space-y-1 text-sm">
                <span className="block text-xs text-tinta-suave">{ETIQUETA_DATO[k] ?? k}</span>
                <input
                  inputMode="decimal"
                  className={cn(CONTROL_FILTRO, 'w-full')}
                  value={valores[k] ?? ''}
                  onChange={(e) => setValores({ ...valores, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Regla prendida
          </label>
          <ErrorBase error={error} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={cambiar.isPending}
              onClick={async () => {
                setError(null);
                // Lo que no es un número no se manda: la base dice qué falta
                const parametros = Object.fromEntries(
                  claves
                    .map((k) => [k, (valores[k] ?? '').trim().replace(',', '.')] as const)
                    .filter(([, v]) => v !== '' && Number.isFinite(Number(v)))
                    .map(([k, v]) => [k, Number(v)]),
                );
                const x = await cambiar.mutateAsync({ codigo: r.codigo, parametros, activa });
                if (!x.ok) setError(x.error);
                else setEditando(false);
              }}
            >
              {cambiar.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setEditando(false)} disabled={cambiar.isPending}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Inventario() {
  const [dias, setDias] = useState(7);
  const { data, isPending, isError, refetch } = useInventarioTelemetria(dias);
  const marcas = [...new Set((data ?? []).map((c) => c.marca))];
  return (
    <Seccion
      titulo="Qué datos manda cada marca"
      acciones={
        <select className={CONTROL_FILTRO} value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período">
          <option value={1}>Último día</option>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
        </select>
      }
    >
      <p className="text-sm text-tinta-suave">Porcentaje de las lecturas que traen cada dato. Si un dato no llega, las alertas y el puntaje que lo usan no se calculan.</p>
      {isPending ? (
        <Cargando texto="Revisando las lecturas…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo leer el inventario." onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Database className="size-6" />} texto="No hay lecturas en el período." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {marcas.map((m) => (
            <div key={m} className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-medium text-tinta capitalize">{m}</h3>
              <table className="w-full text-sm">
                <thead className="border-b border-borde">
                  <tr>
                    <th className={TH}>Dato</th>
                    <th className={cn(TH, 'text-right')}>Llega en</th>
                    <th className={TH}>Ejemplo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {data
                    .filter((c) => c.marca === m)
                    .map((c) => (
                      <tr key={`${c.seccion}.${c.campo}`}>
                        <td className={TD}>
                          {c.campo}
                          <span className="block text-xs text-tinta-suave">{c.seccion}</span>
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums', c.pct < 50 ? 'text-alerta' : 'text-tinta')}>{formatearNumero(c.pct, 0)} %</td>
                        <td className={cn(TD, 'max-w-[220px] truncate font-mono text-xs text-tinta-suave')} title={c.ejemplo ?? ''}>
                          {c.ejemplo ?? '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Seccion>
  );
}
