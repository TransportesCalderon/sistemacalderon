'use client';

import { ElegirCuentaDinero } from '@/modules/finanzas/components/elegir-cuenta';
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, LoaderCircle, Lock, Unlock, Wallet, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useMonedas } from '@/modules/combustible/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { dinero, ETIQUETA_ESTADO, ETIQUETA_MOVIMIENTO, nombrePeriodo, type FondoDeChofer, type GastoPorRevisar, type Saldo } from '../domain/chofer.types';
import {
  useAnularMovimiento,
  useCargarGastoOficina,
  useCategoriasGasto,
  useCerrarFondo,
  useCuentaChofer,
  usePeriodoDe,
  useFondos,
  useGastosPorRevisar,
  useReabrirFondo,
  useRegistrarEntrega,
  useRevisarGasto,
} from '../queries/hooks';
import { abrirArchivo, borrarArchivo, subirArchivo } from './archivos';
import { TONO_ESTADO } from './mis-gastos';

const Saldos = ({ saldos }: { saldos: Saldo[] }) =>
  saldos.filter((s) => s.saldo !== 0).length === 0 ? (
    <span className="text-tinta-suave">0</span>
  ) : (
    <span className="flex flex-col">
      {saldos
        .filter((s) => s.saldo !== 0)
        .map((s) => (
          <span key={s.moneda} className={cn('tabular-nums', s.saldo < 0 && 'text-exito')} title={s.saldo > 0 ? 'Tiene para rendir' : 'Se le debe'}>
            {dinero(s.saldo, s.moneda)}
          </span>
        ))}
    </span>
  );

/** El período anterior a uno dado («2026-10-01» → «2026-09-01»). */
function mesAnterior(periodo: string): string {
  const [a, m] = periodo.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
}

/** Administración › Fondos de choferes: gastos por revisar, saldo de cada chofer y su cuenta. */
export function FondosPantalla() {
  const fondos = useFondos();
  const [elegido, setElegido] = useState<number | null>(null);
  const fila = fondos.data?.find((f) => f.choferId === elegido) ?? null;

  return (
    <div className="space-y-6">
      <Encabezado titulo="Fondos de choferes" subtitulo="Administración" />
      <GastosPorRevisar />
      <section className={cn(TARJETA, 'overflow-x-auto')}>
        <h2 className="px-4 pt-4 font-semibold text-tinta">Saldo de cada chofer</h2>
        <p className="px-4 pb-2 text-sm text-tinta-suave">
          Positivo: tiene dinero de la empresa para rendir (al cerrar el período se descuenta). Negativo: gastó de más (se le reintegra).
        </p>
        {fondos.isLoading ? (
          <Cargando texto="Leyendo los fondos…" />
        ) : fondos.isError ? (
          <ErrorLectura texto="No se pudieron leer los fondos." onReintentar={() => void fondos.refetch()} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Chofer</th>
                <th className={TH}>Saldo</th>
                <th className={TH}>Por revisar</th>
                <th className={TH}>Último movimiento</th>
                <th className={TH}>Último cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {(fondos.data ?? []).map((f) => (
                <tr
                  key={f.choferId}
                  className={cn('cursor-pointer hover:bg-hover', elegido === f.choferId && 'bg-marca-suave/40')}
                  onClick={() => setElegido(elegido === f.choferId ? null : f.choferId)}
                >
                  <td className={cn(TD, 'font-medium text-tinta')}>{f.chofer}</td>
                  <td className={TD}>
                    <Saldos saldos={f.saldos} />
                  </td>
                  <td className={TD}>{f.porRevisar > 0 ? <Chip tono="alerta">{f.porRevisar}</Chip> : '—'}</td>
                  <td className={TD}>{f.ultimoMovimiento ? formatearFechaDia(f.ultimoMovimiento) : '—'}</td>
                  <td className={TD}>{f.ultimoCierre ? nombrePeriodo(f.ultimoCierre) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {fila && <CuentaChofer f={fila} onCerrar={() => setElegido(null)} />}
    </div>
  );
}

function GastosPorRevisar() {
  const { data, isLoading } = useGastosPorRevisar();
  if (isLoading) return null;
  if (!data || data.length === 0)
    return (
      <div className={cn(TARJETA, 'flex items-center gap-2 p-4 text-sm text-tinta-suave')}>
        <Check className="size-5 text-exito" /> No hay gastos de choferes por revisar.
      </div>
    );
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <h2 className="font-semibold text-tinta">Gastos por revisar ({data.length})</h2>
      <ul className="divide-y divide-borde">
        {data.map((g) => (
          <FilaRevisar key={g.id} g={g} />
        ))}
      </ul>
    </section>
  );
}

function FilaRevisar({ g }: { g: GastoPorRevisar }) {
  const puede = useCan('rrhh.fondos:transicionar');
  const revisar = useRevisarGasto();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <li className="flex flex-wrap items-start gap-x-6 gap-y-2 py-3 text-sm">
      <div className="min-w-48 flex-1">
        <p className="font-medium text-tinta">
          {g.chofer} · {g.categoria}
        </p>
        <p className="text-xs text-tinta-suave">
          {formatearFechaDia(g.fecha)}
          {g.lugar && ` · ${g.lugar}`}
          {g.operacion && ` · Operación ${g.operacion}`}
          {g.tractor && ` · ${g.tractor}`} · {g.numero}
        </p>
        {g.detalle && <p className="text-tinta-suave">{g.detalle}</p>}
        {g.repetido && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-alerta">
            <AlertTriangle className="size-3.5" /> Hay otro gasto del mismo día, moneda e importe
          </p>
        )}
      </div>
      <p className="text-base font-semibold tabular-nums text-tinta">{dinero(g.importe, g.moneda)}</p>
      <div className="flex flex-wrap items-center gap-2">
        {g.comprobante ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-marca hover:underline"
            onClick={async () => {
              const e = await abrirArchivo(g.comprobante!);
              setError(e ? { codigo: 'desconocido', mensaje: e } : null);
            }}
          >
            <ExternalLink className="size-4" /> Comprobante
          </button>
        ) : (
          <span className="text-xs text-alerta">Sin comprobante</span>
        )}
        {puede && (
          <>
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={revisar.isPending}
              onClick={async () => {
                setError(null);
                const r = await revisar.mutateAsync({ gastoId: g.id, aprobar: true, motivo: null });
                if (!r.ok) setError(r.error);
                else setAviso(r.data.aviso);
              }}
            >
              {revisar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Aprobar
            </button>
            <AccionConMotivo
              etiqueta="Rechazar"
              icono={<X className="size-4" />}
              titulo="Rechazar el gasto"
              explicacion="El chofer va a ver el motivo. No resta de su fondo."
              ocupado={revisar.isPending}
              error={error}
              onConfirmar={async (motivo) => {
                const r = await revisar.mutateAsync({ gastoId: g.id, aprobar: false, motivo });
                if (!r.ok) setError(r.error);
                return r.ok;
              }}
            />
          </>
        )}
      </div>
      <div className="w-full">
        <ErrorBase error={error} />
        {aviso && <p className="text-xs text-alerta">{aviso}</p>}
      </div>
    </li>
  );
}

function CuentaChofer({ f, onCerrar }: { f: FondoDeChofer; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('rrhh.fondos:editar');
  const puedeCerrar = useCan('rrhh.fondos:transicionar');
  const cuenta = useCuentaChofer(f.choferId);
  const [panel, setPanel] = useState<'entrega' | 'devolucion' | 'gasto' | null>(null);
  const hoy = hoyEnZona(zonaHoraria) as string;
  // El período que se cierra es el último terminado: el anterior al de hoy (lo calcula la base)
  const actual = usePeriodoDe(hoy);
  const periodo = useMemo(() => (actual.data ? mesAnterior(actual.data) : null), [actual.data]);
  const cerrar = useCerrarFondo();
  const reabrir = useReabrirFondo();
  const anular = useAnularMovimiento();
  const envio = useEnvio();

  return (
    <section className={cn(TARJETA, 'space-y-4 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-tinta">{f.chofer}</h2>
          <p className="text-sm text-tinta-suave">Cuenta del fondo fijo</p>
        </div>
        <button type="button" className="text-sm text-tinta-suave hover:underline" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setPanel(panel === 'entrega' ? null : 'entrega')}>
            <Wallet className="size-4" /> Entregar dinero
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'devolucion' ? null : 'devolucion')}>
            Devolvió vuelto
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'gasto' ? null : 'gasto')}>
            Cargar gasto (ticket en papel)
          </button>
        </div>
      )}
      {(panel === 'entrega' || panel === 'devolucion') && <FormEntrega choferId={f.choferId} tipo={panel} onListo={() => setPanel(null)} />}
      {panel === 'gasto' && <FormGastoOficina choferId={f.choferId} onListo={() => setPanel(null)} />}

      {puedeCerrar && periodo && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-borde p-3 text-sm">
          <span className="text-tinta">
            Período {nombrePeriodo(periodo)}
            {f.ultimoCierre && f.ultimoCierre >= periodo ? ' · cerrado' : ' · abierto'}
          </span>
          {!(f.ultimoCierre && f.ultimoCierre >= periodo) ? (
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={cerrar.isPending}
              onClick={() => void envio.enviar(cerrar.mutateAsync({ choferId: f.choferId, periodo }), () => undefined)}
            >
              <Lock className="size-4" /> Cerrar el período
            </button>
          ) : (
            <AccionConMotivo
              etiqueta="Reabrir el período"
              icono={<Unlock className="size-4" />}
              titulo="Reabrir el período"
              explicacion="Se anula el cierre y el saldo vuelve a la cuenta. Solo si la liquidación no está pagada."
              ocupado={reabrir.isPending}
              error={envio.error}
              onConfirmar={async (motivo) => {
                const r = await reabrir.mutateAsync({ choferId: f.choferId, periodo: f.ultimoCierre!, motivo });
                if (!r.ok) envio.setError(r.error);
                return r.ok;
              }}
            />
          )}
          <span className="w-full text-xs text-tinta-suave">
            Al cerrar, el saldo queda para la liquidación (lo que sobra se descuenta y lo que falta se reintegra) y la cuenta vuelve a 0. No se puede con
            gastos por revisar.
          </span>
          <div className="w-full">
            <ErrorBase error={envio.error} />
          </div>
        </div>
      )}

      {cuenta.isLoading ? (
        <Cargando texto="Leyendo la cuenta…" />
      ) : !cuenta.data || cuenta.data.movimientos.length === 0 ? (
        <Vacio icono={<Wallet className="size-6" />} texto="Sin movimientos en los últimos 4 meses." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Fecha</th>
                <th className={TH}>Movimiento</th>
                <th className={TH}>Detalle</th>
                <th className={cn(TH, 'text-right')}>Importe</th>
                <th className={TH}>Estado</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {cuenta.data.movimientos.map((m) => (
                <tr key={m.id}>
                  <td className={TD}>{formatearFechaDia(m.fecha)}</td>
                  <td className={TD}>
                    {m.tipo === 'gasto' ? m.categoriaNombre : ETIQUETA_MOVIMIENTO[m.tipo]}
                    <span className="block text-xs text-tinta-suave">
                      {m.numero}
                      {m.porChofer && ' · lo subió el chofer'}
                    </span>
                  </td>
                  <td className={cn(TD, 'max-w-64 text-tinta-suave')}>
                    {[m.lugar, m.detalle, m.operacion && `Op. ${m.operacion}`, m.tractor].filter(Boolean).join(' · ')}
                    {m.motivo && <span className="block text-xs">Motivo: {m.motivo}</span>}
                    {m.comprobante && (
                      <button type="button" className="block text-xs text-marca hover:underline" onClick={() => void abrirArchivo(m.comprobante!)}>
                        Ver comprobante
                      </button>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums', m.efecto < 0 && 'text-tinta-suave')}>
                    {m.efecto > 0 ? '+' : m.efecto < 0 ? '−' : ''} {dinero(Math.abs(m.importe), m.moneda)}
                  </td>
                  <td className={TD}>
                    <Chip tono={TONO_ESTADO[m.estado]}>{ETIQUETA_ESTADO[m.estado]}</Chip>
                  </td>
                  <td className={TD}>
                    {puedeCerrar && m.tipo !== 'cierre' && ['registrado', 'aprobado'].includes(m.estado) && (
                      <AccionConMotivo
                        etiqueta="Anular"
                        titulo="Anular el movimiento"
                        explicacion="Si era un gasto aprobado, sale también de los costos del viaje."
                        ocupado={anular.isPending}
                        error={envio.error}
                        onConfirmar={async (motivo) => {
                          const r = await anular.mutateAsync({ movimientoId: m.id, motivo });
                          if (!r.ok) envio.setError(r.error);
                          return r.ok;
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FormEntrega({ choferId, tipo, onListo }: { choferId: number; tipo: 'entrega' | 'devolucion'; onListo: () => void }) {
  const { zonaHoraria } = useSesion();
  const monedas = useMonedas();
  const registrar = useRegistrarEntrega();
  const envio = useEnvio();
  const [v, setV] = useState({ moneda: '', importe: '', fecha: hoyEnZona(zonaHoraria) as string, detalle: '', cuentaId: null as number | null });
  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-4 sm:grid-cols-4">
      <h3 className="font-medium text-tinta sm:col-span-4">{tipo === 'entrega' ? 'Entregar dinero al chofer' : 'El chofer devolvió el vuelto'}</h3>
      <Campo label="Moneda" error={envio.campo('moneda')}>
        <select value={v.moneda} onChange={(e) => setV({ ...v, moneda: e.target.value })}>
          <option value="">Elegí…</option>
          {(monedas.data ?? []).map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo} · {m.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Importe" error={envio.campo('importe')}>
        <input inputMode="decimal" value={v.importe} onChange={(e) => setV({ ...v, importe: e.target.value })} />
      </Campo>
      <Campo label="Fecha" error={envio.campo('fecha')}>
        <input type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} />
      </Campo>
      <Campo label="Detalle (opcional)">
        <input value={v.detalle} maxLength={500} onChange={(e) => setV({ ...v, detalle: e.target.value })} placeholder="Ej.: para el viaje a Chile" />
      </Campo>
      <ElegirCuentaDinero
        valor={v.cuentaId}
        onCambio={(c) => setV({ ...v, cuentaId: c })}
        etiqueta={tipo === 'entrega' ? 'Sale de (banco o caja)' : 'Entra a (banco o caja)'}
      />
      <div className="sm:col-span-4">
        <ErrorBase error={envio.error} />
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={registrar.isPending}
          onClick={() => void envio.enviar(registrar.mutateAsync({ tipo, choferId, ...v }), onListo)}
        >
          {registrar.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );
}

function FormGastoOficina({ choferId, onListo }: { choferId: number; onListo: () => void }) {
  const { zonaHoraria } = useSesion();
  const monedas = useMonedas();
  const categorias = useCategoriasGasto();
  const cargar = useCargarGastoOficina();
  const envio = useEnvio();
  const [v, setV] = useState({ categoria: '', moneda: '', importe: '', fecha: hoyEnZona(zonaHoraria) as string, detalle: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const guardar = async () => {
    envio.setError(null);
    let subido: { ruta: string; hash: string; nombre: string } | null = null;
    try {
      setSubiendo(true);
      if (archivo) subido = await subirArchivo(archivo, `oficina/gastos-${choferId}`);
    } catch (e) {
      setSubiendo(false);
      envio.setError({ codigo: 'desconocido', mensaje: e instanceof Error ? e.message : 'No se pudo subir.' });
      return;
    }
    setSubiendo(false);
    const r = await cargar.mutateAsync({ choferId, ...v, comprobante: subido?.ruta ?? null, hash: subido?.hash ?? null, nombreArchivo: subido?.nombre ?? null });
    if (!r.ok) {
      await borrarArchivo(subido?.ruta);
      envio.setError(r.error);
      return;
    }
    if (r.data.aviso) setAviso(r.data.aviso);
    else onListo();
  };

  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-4 sm:grid-cols-3">
      <h3 className="font-medium text-tinta sm:col-span-3">Gasto del chofer con ticket en papel (queda aprobado)</h3>
      <Campo label="¿Qué gasto es?" error={envio.campo('categoria')}>
        <select value={v.categoria} onChange={(e) => setV({ ...v, categoria: e.target.value })}>
          <option value="">Elegí…</option>
          {(categorias.data ?? []).map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Moneda" error={envio.campo('moneda')}>
        <select value={v.moneda} onChange={(e) => setV({ ...v, moneda: e.target.value })}>
          <option value="">Elegí…</option>
          {(monedas.data ?? []).map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Importe" error={envio.campo('importe')}>
        <input inputMode="decimal" value={v.importe} onChange={(e) => setV({ ...v, importe: e.target.value })} />
      </Campo>
      <Campo label="Fecha del ticket" error={envio.campo('fecha')}>
        <input type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} />
      </Campo>
      <Campo label="Detalle" error={envio.campo('detalle')}>
        <input value={v.detalle} maxLength={500} onChange={(e) => setV({ ...v, detalle: e.target.value })} />
      </Campo>
      <Campo label="Foto del ticket (opcional)">
        <input type="file" accept="image/*,application/pdf" className="py-1.5" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </Campo>
      <div className="space-y-2 sm:col-span-3">
        <ErrorBase error={envio.error} />
        {aviso && (
          <p className="text-sm text-alerta">
            Guardado. {aviso}{' '}
            <button type="button" className="underline" onClick={onListo}>
              Listo
            </button>
          </p>
        )}
        {!aviso && (
          <button type="button" className={BOTON_PRIMARIO} disabled={subiendo || cargar.isPending} onClick={() => void guardar()}>
            {(subiendo || cargar.isPending) && <LoaderCircle className="size-4 animate-spin" />} Guardar
          </button>
        )}
      </div>
    </div>
  );
}
