'use client';

import { useState } from 'react';
import { CircleAlert, CircleCheck, Coins, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { Cargando, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { normalizarDecimal } from '../domain/catalogos.schemas';
import { cotizacionLegible, tasaDesde, type TipoCambio } from '../domain/catalogos.types';
import { useActualizarCotizaciones, useCrearTipoCambio, useEliminarTipoCambio, useImportaciones, useMonedas, useTiposCambio } from '../queries/hooks';
import { Panel, TD, TH, useEnvio } from './comun';

/** Monedas habituales de la operación: la pantalla avisa si falta la cotización vigente. */
const HABITUALES = ['USD', 'ARS', 'CLP'];

const numero = (v: number) => formatearNumero(v, v >= 100 ? 2 : 4);

function Cotizacion({ t }: { t: TipoCambio }) {
  const c = cotizacionLegible(t.moneda, t.monedaBase, t.tasa);
  return (
    <span title={`Se guarda como ${t.tasa} ${t.monedaBase} por 1 ${t.moneda}`}>
      1 {c.uno} = {numero(c.valor)} {c.otra}
    </span>
  );
}

/**
 * Finanzas > Tipos de cambio (migraciones 28 y 29). Las cotizaciones se actualizan solas dos veces
 * por día (BCRA minorista y dólar observado del Banco Central de Chile); también se pueden pedir
 * ahora o cargar a mano. Una carga usa la última cotización de hasta N días (parámetro).
 */
export function TiposCambioPantalla() {
  const { zonaHoraria, monedaBase } = useSesion();
  const puede = useCan('finanzas.tipos_cambio:editar');
  const [moneda, setMoneda] = useState('');
  const { data, isPending, isError, refetch } = useTiposCambio(moneda || undefined);
  const { data: todas } = useTiposCambio();
  const { data: monedas } = useMonedas();
  const [eliminando, setEliminando] = useState<number | null>(null);
  const hoy = hoyEnZona(zonaHoraria);
  const base = monedaBase ?? '—';
  const otras = (monedas ?? []).filter((m) => !m.esBase);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Tipos de cambio" subtitulo="Catálogos">
        {puede && <ActualizarAhora />}
      </Encabezado>

      <section className={cn(TARJETA, 'flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm')} aria-label="Cotizaciones vigentes">
        <span className="text-tinta-suave">Moneda base: <strong className="text-tinta">{base}</strong> · Vigentes hoy:</span>
        {HABITUALES.filter((m) => m !== monedaBase).map((m) => {
          const t = todas?.find((x) => x.moneda === m && x.monedaBase === monedaBase && x.fecha <= hoy);
          return t ? (
            <span key={m} className={cn('inline-flex items-center gap-1', t.fecha === hoy ? 'text-exito' : 'text-tinta')}>
              <CircleCheck className="size-4" /> <Cotizacion t={t} />
              {t.fecha !== hoy && <span className="text-xs text-tinta-suave">(del {formatearFechaDia(t.fecha)})</span>}
            </span>
          ) : (
            <span key={m} className="inline-flex items-center gap-1 text-alerta">
              <CircleAlert className="size-4" /> Sin cotización {m}
            </span>
          );
        })}
      </section>

      <Importaciones zonaHoraria={zonaHoraria} />

      {puede && monedaBase && <AltaTipoCambio hoy={hoy} base={monedaBase} otras={otras} />}

      <div className="flex items-center gap-2">
        <select className={CONTROL_FILTRO} value={moneda} onChange={(e) => setMoneda(e.target.value)} aria-label="Moneda">
          <option value="">Todas las monedas</option>
          {otras.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo} · {m.nombre}
            </option>
          ))}
        </select>
        <span className="text-xs text-tinta-suave">Últimas 120 cotizaciones hacia {base}</span>
      </div>

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando cotizaciones…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las cotizaciones." onReintentar={() => refetch()} />
        ) : data.filter((t) => t.monedaBase === monedaBase).length === 0 ? (
          <Vacio icono={<Coins className="size-5" />} texto={`Todavía no hay cotizaciones hacia ${base}.`} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Moneda</th>
                <th className={cn(TH, 'text-right')}>Cotización</th>
                <th className={TH}>Fuente</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data
                .filter((t) => t.monedaBase === monedaBase)
                .map((t) => (
                  <FilaCotizacion key={t.id} t={t} puede={puede} abierta={eliminando === t.id} onAbrir={setEliminando} />
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ActualizarAhora() {
  const actualizar = useActualizarCotizaciones();
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className={BOTON_SECUNDARIO}
        disabled={actualizar.isPending}
        onClick={async () => {
          setError(null);
          const r = await actualizar.mutateAsync({});
          if (!r.ok) setError(r.error);
        }}
      >
        {actualizar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Actualizar ahora
      </button>
      <ErrorBase error={error} />
    </div>
  );
}

/** Últimas actualizaciones automáticas, con lo que respondieron los bancos. */
function Importaciones({ zonaHoraria }: { zonaHoraria: string }) {
  const { data } = useImportaciones();
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">
        Todavía no corrió ninguna actualización automática. Corre sola dos veces por día; también podés pedirla con «Actualizar ahora».
      </p>
    );
  }
  const u = data[0]!;
  return (
    <details className={cn(TARJETA, 'p-4 text-sm')}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        {u.ok ? <CircleCheck className="size-4 text-exito" /> : <CircleAlert className="size-4 text-alerta" />}
        <span>
          Última actualización {u.origen === 'programada' ? 'automática' : 'pedida'}: {formatearFechaHora(u.ejecutadoEn, zonaHoraria)} ·{' '}
          {u.insertadas} {u.insertadas === 1 ? 'cotización nueva' : 'cotizaciones nuevas'}
          {!u.ok && ' · con avisos'}
        </span>
      </summary>
      <ul className="mt-3 space-y-2">
        {data.map((i) => (
          <li key={i.id} className="border-t border-borde pt-2">
            <p className={i.ok ? 'text-tinta' : 'text-alerta'}>
              {formatearFechaHora(i.ejecutadoEn, zonaHoraria)} · {i.origen === 'programada' ? 'automática' : 'pedida'} · {i.insertadas} nuevas
            </p>
            {i.detalle && <p className="text-xs whitespace-pre-line text-tinta-suave">{i.detalle}</p>}
          </li>
        ))}
      </ul>
    </details>
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
        <td className={cn(TD, 'text-right tabular-nums')}>
          <Cotizacion t={t} />
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
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [moneda, setMoneda] = useState(otras[0]?.codigo ?? '');
  const [sentido, setSentido] = useState<'directa' | 'inversa'>(base === 'USD' ? 'inversa' : 'directa');
  const [valor, setValor] = useState('');
  const [fuente, setFuente] = useState('');
  const n = Number(normalizarDecimal(valor));
  const vista = valor.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  const [uno, otra] = sentido === 'directa' ? [moneda, base] : [base, moneda];

  if (!abierto) {
    return (
      <button type="button" className="text-sm text-marca hover:underline" onClick={() => setAbierto(true)}>
        Cargar una cotización a mano (por ejemplo BRL o PYG, o si un banco no respondió)
      </button>
    );
  }
  return (
    <Panel
      titulo="Cargar cotización a mano"
      explicacion="Con coma decimal, los puntos son de miles (7.300,50); sin coma, el punto es decimal (5.42). Si ya hay una cotización de esa moneda para ese día, eliminala primero."
      error={error}
      ocupado={crear.isPending}
      textoBoton="Guardar cotización"
      onCerrar={() => {
        setAbierto(false);
        setValor('');
        setError(null);
      }}
      onConfirmar={() => enviar(crear.mutateAsync({ fecha, moneda, sentido, valor, fuente }), () => setValor(''))}
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
      <Campo label="Cómo la escribís">
        <select value={sentido} onChange={(e) => setSentido(e.target.value as 'directa' | 'inversa')}>
          <option value="directa">
            1 {moneda} = … {base}
          </option>
          <option value="inversa">
            1 {base} = … {moneda}
          </option>
        </select>
      </Campo>
      <Campo
        label={`1 ${uno} = ¿cuántos ${otra}? *`}
        error={campo('valor')}
        ayuda={vista ? `Se va a guardar: 1 ${uno} = ${numero(vista)} ${otra} (${tasaDesde(vista, sentido)} ${base} por ${moneda})` : undefined}
      >
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Campo label="Fuente" error={campo('fuente')}>
        <input maxLength={100} value={fuente} onChange={(e) => setFuente(e.target.value)} />
      </Campo>
    </Panel>
  );
}
