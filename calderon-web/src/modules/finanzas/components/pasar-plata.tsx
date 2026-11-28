'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import { Panel, useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { FlechaFila, useFilaAbierta } from '@/shared/ui/fila-desplegable';
import { dinero } from '../domain/finanzas.types';
import { cambioQueSale, montoEscrito, montosDe, type CuentaHoy, type CuentasHoy as DatosCuentas, type TransferenciaHecha, type TransferenciaHoy } from '../domain/pasar-plata';
import { useAnularTransferencia, useCuentasHoy, usePasarPlata } from '../queries/pasar-plata.hooks';
import { fecha } from './comun';

/**
 * Migración 388 · «Bancos y cajas» en «Hoy» (Finanzas y Gerencia): cada cuenta con su saldo en su moneda (los dólares, en
 * dólares) y «Transferir entre cuentas». Si la base todavía no tiene la migración, no se muestra.
 */
export function CuentasHoy() {
  const { data, isLoading, isError, error, refetch } = useCuentasHoy();
  if (isLoading) return <Cargando texto="Leyendo las cuentas…" />;
  if (isError) return <ErrorLectura texto="No se pudieron leer los bancos y las cajas." onReintentar={() => void refetch()} error={error} />;
  if (!data || data.cuentas.length === 0) return null;
  return (
    <Seccion
      titulo="Bancos y cajas"
      acciones={
        <Link href="/conciliacion" className="text-sm font-medium text-marca hover:underline">
          Ver en Bancos →
        </Link>
      }
    >
      <ul className="divide-y divide-borde text-sm">
        {data.cuentas.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-tinta">{c.nombre}</span>
              <span className="block text-xs text-tinta-suave">{queEs(c)}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              <span className={cn('block text-base font-semibold', c.saldo < 0 ? 'text-error' : 'text-tinta')}>{dinero(c.saldo, c.moneda)}</span>
              {c.moneda !== 'CLP' && (
                <span className="block text-xs text-tinta-suave">{c.saldoClp === null ? 'falta cargar el cambio de hoy' : `≈ ${dinero(c.saldoClp)}`}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <TransferirEntreCuentas datos={data} />
    </Seccion>
  );
}

/** «Banco · USD · cartola al 26/11», «Caja · CLP», «Tarjeta prepaga · CLP». */
function queEs(c: CuentaHoy): string {
  const tipo = c.tarjeta ? 'Tarjeta prepaga' : c.tipo === 'caja' ? 'Caja' : 'Banco';
  return [tipo, c.moneda, c.cartolaFecha ? `cartola al ${fecha(c.cartolaFecha).slice(0, 5)}` : null].filter(Boolean).join(' · ');
}

/**
 * El botón «Transferir entre cuentas», su formulario (se abre debajo del botón) y las últimas transferencias.
 * Se usa en «Hoy» y en Bancos › Movimientos. Quién puede lo dice la base (`datos.puede`).
 */
export function TransferirEntreCuentas({
  datos,
  cuentaInicial = null,
  conUltimas = true,
}: {
  datos: DatosCuentas;
  cuentaInicial?: number | null;
  conUltimas?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [hecha, setHecha] = useState<TransferenciaHecha | null>(null);
  const hayUltimas = conUltimas && datos.ultimas.length > 0;
  if (!datos.puede && !hayUltimas) return null;
  return (
    <div className="space-y-3">
      {datos.puede && !abierto && (
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          onClick={() => {
            setHecha(null);
            setAbierto(true);
          }}
        >
          <ArrowLeftRight className="size-4" /> Transferir entre cuentas
        </button>
      )}
      {abierto && (
        <FormTransferir
          datos={datos}
          cuentaInicial={cuentaInicial}
          onCerrar={() => setAbierto(false)}
          onHecha={(h) => {
            setHecha(h);
            setAbierto(false);
          }}
        />
      )}
      {hecha && (
        <div role="status" className="space-y-1 rounded-lg border border-exito/30 bg-exito/10 p-3 text-sm text-tinta">
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-exito" />
            <span>
              Anotada{hecha.numero ? ` ${hecha.numero}` : ''}: {hecha.resumen}
            </span>
          </p>
          {hecha.avisos.map((a) => (
            <p key={a} className="pl-6 text-alerta">
              {a}
            </p>
          ))}
        </div>
      )}
      {hayUltimas && <UltimasTransferencias ultimas={datos.ultimas} />}
    </div>
  );
}

function FormTransferir({
  datos,
  cuentaInicial,
  onCerrar,
  onHecha,
}: {
  datos: DatosCuentas;
  cuentaInicial: number | null;
  onCerrar: () => void;
  onHecha: (h: TransferenciaHecha) => void;
}) {
  const pasar = usePasarPlata();
  const envio = useEnvio();
  const { cuentas } = datos;
  const [desde, setDesde] = useState<number | null>(cuentas.some((c) => c.id === cuentaInicial) ? cuentaInicial : null);
  const [hacia, setHacia] = useState<number | null>(null);
  const [f, setF] = useState(datos.hoy);
  const [salio, setSalio] = useState('');
  const [llego, setLlego] = useState('');
  const [desc, setDesc] = useState('');
  const cDesde = cuentas.find((c) => c.id === desde);
  const cHacia = cuentas.find((c) => c.id === hacia);
  // Las dos cuentas, solo cuando son de monedas distintas (es un cambio de moneda: hay que decir cuánto llegó)
  const par = cDesde && cHacia && cDesde.moneda !== cHacia.moneda ? { desde: cDesde, hacia: cHacia } : null;
  const cambio = par ? cambioQueSale(par.desde, par.hacia, montoEscrito(salio), montoEscrito(llego), datos.cambios) : null;
  const lejos = cambio?.desvioPct !== null && cambio?.desvioPct !== undefined && Math.abs(cambio.desvioPct) > datos.desvioMaxPct;
  const opciones = (lista: CuentaHoy[]) =>
    lista.map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre} · {dinero(c.saldo, c.moneda)}
      </option>
    ));
  return (
    <Panel
      titulo="Transferir entre cuentas"
      explicacion="Para pasar plata de una cuenta nuestra a otra: de dólares a pesos, de un banco a otro, a una caja o a Vita. Se anota cuando ya se hizo, con lo que salió y lo que llegó tal como figura en el banco."
      error={envio.error}
      ocupado={pasar.isPending}
      textoBoton="Anotar la transferencia"
      onCerrar={onCerrar}
      onConfirmar={() => {
        envio.setError(null);
        void pasar
          .mutateAsync({ desdeId: desde ?? 0, haciaId: hacia ?? 0, fecha: f, salio, llego: par ? llego : null, descripcion: desc })
          .then((r) => (r.ok ? onHecha(r.data) : envio.setError(r.error)));
      }}
    >
      <Campo label="Sale de" error={envio.campo('desdeId')}>
        <select
          value={desde ?? ''}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            setDesde(id);
            if (id !== null && id === hacia) setHacia(null);
          }}
        >
          <option value="">Elegí…</option>
          {opciones(cuentas)}
        </select>
      </Campo>
      <Campo label="Llega a" error={envio.campo('haciaId')}>
        <select value={hacia ?? ''} onChange={(e) => setHacia(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Elegí…</option>
          {opciones(cuentas.filter((c) => c.id !== desde))}
        </select>
      </Campo>
      <Campo label="Fecha" error={envio.campo('fecha')}>
        <input type="date" value={f} max={datos.hoy} onChange={(e) => setF(e.target.value)} />
      </Campo>
      <Campo label={`Salió${cDesde ? ` (${cDesde.moneda})` : ''}`} error={envio.campo('salio')}>
        <input inputMode="decimal" value={salio} placeholder={cDesde?.moneda === 'CLP' ? 'Ej.: 2.000.000' : 'Ej.: 1.000,00'} onChange={(e) => setSalio(e.target.value)} />
      </Campo>
      {par && (
        <Campo label={`Llegó (${par.hacia.moneda})`} error={envio.campo('llego')}>
          <input inputMode="decimal" value={llego} placeholder={par.hacia.moneda === 'CLP' ? 'Ej.: 990.000' : 'Ej.: 1.000,00'} onChange={(e) => setLlego(e.target.value)} />
        </Campo>
      )}
      <Campo label="Descripción (opcional)" error={envio.campo('descripcion')}>
        <input value={desc} maxLength={200} placeholder={par ? 'Ej.: venta de dólares' : 'Ej.: para sueldos'} onChange={(e) => setDesc(e.target.value)} />
      </Campo>
      {cambio && (
        <p className={cn('text-xs sm:col-span-2 lg:col-span-3', lejos ? 'text-alerta' : 'text-tinta-suave')}>
          Cambio que sale de esos montos: <span className="font-medium text-tinta">{cambio.texto}</span>
          {cambio.delDia && <> · el de hoy: {cambio.delDia}</>}
          {lejos && <> · se aleja mucho del de hoy: revisá cuánto salió y cuánto llegó</>}
        </p>
      )}
      {par && !cambio && (
        <p className="text-xs text-tinta-suave sm:col-span-2 lg:col-span-3">
          Las cuentas son de monedas distintas: escribí cuánto salió en {par.desde.moneda} y cuánto llegó en {par.hacia.moneda}. La diferencia con el cambio del
          día queda anotada sola como diferencia de cambio.
        </p>
      )}
    </Panel>
  );
}

/**
 * Las transferencias de los últimos 30 días. Al tocar una se abre debajo con su detalle y «Anular» si se puede
 * (regla del renglón que se abre debajo; es una lista y no una tabla para que en el teléfono se lea bien).
 */
function UltimasTransferencias({ ultimas }: { ultimas: TransferenciaHoy[] }) {
  const fila = useFilaAbierta<number>();
  const anular = useAnularTransferencia();
  const envio = useEnvio();
  return (
    <details className="rounded-lg border border-borde bg-panel p-3 text-sm">
      <summary className="cursor-pointer font-medium text-tinta">Últimas transferencias entre cuentas ({ultimas.length})</summary>
      <ul className="mt-3 divide-y divide-borde">
        {ultimas.map((t) => {
          const abierta = fila.es(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-expanded={abierta}
                className={cn('flex w-full items-start gap-3 px-2 py-2.5 text-left hover:bg-hover', abierta && 'bg-marca-suave/40')}
                onClick={() => {
                  envio.setError(null);
                  fila.alternar(t.id);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-tinta">
                    {t.desde} → {t.hacia}
                  </span>
                  <span className="block text-xs text-tinta-suave">
                    {fecha(t.fecha)} · {t.numero}
                    {t.conciliada && ' · conciliada con el banco'}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block font-medium text-tinta">{dinero(t.salio, t.desdeMoneda)}</span>
                  {t.desdeMoneda !== t.haciaMoneda && <span className="block text-xs text-tinta-suave">→ {dinero(t.llego, t.haciaMoneda)}</span>}
                </span>
                <span className="mt-0.5">
                  <FlechaFila abierta={abierta} />
                </span>
              </button>
              {abierta && (
                <div className="space-y-3 border-l-4 border-marca bg-fondo/40 p-3">
                  <p className="text-tinta-suave">{[t.numero, montosDe(t), t.descripcion].filter(Boolean).join(' · ')}</p>
                  {t.puedeAnular ? (
                    <AccionConMotivo
                      etiqueta="Anular"
                      icono={<X className="size-4" />}
                      titulo={`Anular ${t.numero}`}
                      explicacion="Las dos cuentas vuelven al saldo de antes. Si después hay que anotarla bien, se carga de nuevo."
                      ocupado={anular.isPending}
                      error={envio.error}
                      onConfirmar={async (motivo) => {
                        envio.setError(null);
                        const r = await anular.mutateAsync({ id: t.id, motivo });
                        if (!r.ok) envio.setError(r.error);
                        else fila.cerrar();
                        return r.ok;
                      }}
                    />
                  ) : (
                    t.conciliada && <p className="text-xs text-tinta-suave">Ya está conciliada con la cartola del banco: si hay que anularla, lo hace Finanzas.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
