'use client';

import { useState } from 'react';
import { CircleCheck, CircleAlert, Coins, Trash2 } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { normalizarDecimal } from '../domain/catalogos.schemas';
import { cotizacionDesdeTasa, tasaDesdeCotizacion, type TipoCambio } from '../domain/catalogos.types';
import { useCrearTipoCambio, useEliminarTipoCambio, useMonedas, useTiposCambio } from '../queries/hooks';
import { Panel, TD, TH, useEnvio } from './comun';

/** Monedas en las que se carga habitualmente: la pantalla avisa si falta la cotización de hoy. */
const HABITUALES = ['ARS', 'CLP'];

const cotizacion = (v: number) => formatearNumero(v, v >= 100 ? 2 : 4);

/**
 * Finanzas > Tipos de cambio. Una cotización oficial por día y por moneda. Cada carga en otra
 * moneda usa la del mismo día (migración 28): si falta, la base rechaza la carga.
 */
export function TiposCambioPantalla() {
  const { zonaHoraria, monedaBase } = useSesion();
  const puede = useCan('finanzas.tipos_cambio:editar');
  const [moneda, setMoneda] = useState('');
  const { data, isPending, isError, refetch } = useTiposCambio(moneda || undefined);
  const { data: hoyData } = useTiposCambio();
  const { data: monedas } = useMonedas();
  const [eliminando, setEliminando] = useState<number | null>(null);
  const hoy = hoyEnZona(zonaHoraria);
  const base = monedaBase ?? 'USD';
  const otras = (monedas ?? []).filter((m) => !m.esBase);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Tipos de cambio" subtitulo="Catálogos" />

      <section className={cn(TARJETA, 'flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm')} aria-label="Cotizaciones de hoy">
        <span className="text-tinta-suave">Hoy, {formatearFechaDia(hoy)}:</span>
        {HABITUALES.map((m) => {
          const t = hoyData?.find((x) => x.moneda === m && x.fecha === hoy);
          return t ? (
            <span key={m} className="inline-flex items-center gap-1 text-exito">
              <CircleCheck className="size-4" /> {m}: 1 {base} = {cotizacion(cotizacionDesdeTasa(t.tasa))}
            </span>
          ) : (
            <span key={m} className="inline-flex items-center gap-1 text-alerta">
              <CircleAlert className="size-4" /> Falta {m}: las cargas de hoy en {m} se van a rechazar
            </span>
          );
        })}
      </section>

      {puede && <AltaTipoCambio hoy={hoy} base={base} otras={otras} />}

      <div className="flex items-center gap-2">
        <select className={CONTROL_FILTRO} value={moneda} onChange={(e) => setMoneda(e.target.value)} aria-label="Moneda">
          <option value="">Todas las monedas</option>
          {otras.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo} · {m.nombre}
            </option>
          ))}
        </select>
        <span className="text-xs text-tinta-suave">Últimas 120 cotizaciones</span>
      </div>

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando cotizaciones…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las cotizaciones." onReintentar={() => refetch()} />
        ) : data.length === 0 ? (
          <Vacio icono={<Coins className="size-5" />} texto="Todavía no hay cotizaciones cargadas." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Moneda</th>
                <th className={cn(TH, 'text-right')}>1 {base} =</th>
                <th className={TH}>Fuente</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((t) => (
                <FilaCotizacion key={t.id} t={t} puede={puede} abierta={eliminando === t.id} onAbrir={setEliminando} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaCotizacion({ t, puede, abierta, onAbrir }: { t: TipoCambio; puede: boolean; abierta: boolean; onAbrir: (id: number | null) => void }) {
  const eliminar = useEliminarTipoCambio();
  const { error, enviar } = useEnvio();
  return (
    <>
      <tr>
        <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{formatearFechaDia(t.fecha)}</td>
        <td className={TD}>{t.moneda}</td>
        <td className={cn(TD, 'text-right tabular-nums')} title={`Se guarda como ${t.tasa} ${t.monedaBase} por 1 ${t.moneda}`}>
          {cotizacion(cotizacionDesdeTasa(t.tasa))} {t.moneda}
        </td>
        <td className={cn(TD, 'text-tinta-suave')}>{t.fuente ?? '—'}</td>
        {puede && (
          <td className={cn(TD, 'text-right')}>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir(abierta ? null : t.id)}>
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {abierta && (
        <tr>
          <td colSpan={5} className="px-3 pb-3">
            <Panel
              titulo={`Eliminar la cotización ${t.moneda} del ${formatearFechaDia(t.fecha)}`}
              explicacion="Solo si se cargó mal y todavía no la usó ninguna carga. Después podés cargar la correcta."
              error={error}
              ocupado={eliminar.isPending}
              textoBoton="Eliminar"
              onCerrar={() => onAbrir(null)}
              onConfirmar={() => enviar(eliminar.mutateAsync({ id: t.id, versionFila: t.versionFila }), () => onAbrir(null))}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function AltaTipoCambio({ hoy, base, otras }: { hoy: string; base: string; otras: { codigo: string; nombre: string }[] }) {
  const crear = useCrearTipoCambio();
  const { error, enviar, campo, setError } = useEnvio();
  const [fecha, setFecha] = useState(hoy);
  const [moneda, setMoneda] = useState('ARS');
  const [valor, setValor] = useState('');
  const [fuente, setFuente] = useState('');
  const [guardada, setGuardada] = useState<string | null>(null);
  const n = Number(normalizarDecimal(valor));
  const vista = valor.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;

  return (
    <Panel
      titulo="Cargar cotización del día"
      explicacion={
        <>
          Escribila como se lee: cuántos {moneda || 'pesos'} vale 1 {base}. Con coma decimal, los puntos son de miles (7.300,50); sin coma, el
          punto es decimal (5.42).
          {guardada && <span className="mt-1 block text-exito">Guardada: {guardada}.</span>}
        </>
      }
      error={error}
      ocupado={crear.isPending}
      textoBoton="Guardar cotización"
      onCerrar={() => {
        setValor('');
        setFuente('');
        setError(null);
      }}
      onConfirmar={() =>
        enviar(crear.mutateAsync({ fecha, moneda, unidadesPorBase: valor, fuente }), () => {
          setGuardada(`${moneda} del ${formatearFechaDia(fecha)}`);
          setValor('');
        })
      }
    >
      <Campo label="Fecha *" error={campo('fecha')}>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <Campo label="Moneda *" error={campo('moneda')}>
        <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
          {otras.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo} · {m.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo
        label={`1 ${base} = ¿cuántos ${moneda}? *`}
        error={campo('unidadesPorBase')}
        ayuda={vista ? `Se va a guardar: 1 ${base} = ${cotizacion(vista)} ${moneda} (${tasaDesdeCotizacion(vista)} ${base} por ${moneda})` : 'Por ejemplo 950 para CLP.'}
      >
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Campo label="Fuente" error={campo('fuente')} ayuda="Opcional: BCRA, Banco Central de Chile…">
        <input maxLength={100} value={fuente} onChange={(e) => setFuente(e.target.value)} />
      </Campo>
    </Panel>
  );
}
