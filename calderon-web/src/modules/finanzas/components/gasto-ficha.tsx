'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LoaderCircle, Plus, Save, X } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { useProveedores } from '@/modules/catalogos/queries/hooks';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { cuentasParaGasto, dinero, TIPOS_DOCUMENTO, type Asiento, type Gasto, type TipoDocumento } from '../domain/finanzas.types';
import {
  useAnularGasto,
  useCamionesFinanzas,
  useCargasPorFacturar,
  useVincularCargas,
  useCuentasDinero,
  useGasto,
  useGuardarGasto,
  useGuardarProveedorRapido,
  usePlanCuentas,
  useRegistrarMovimiento,
} from '../queries/hooks';
import { fecha, MONEDAS, OpcionesCuentas } from './comun';
import { TrazaContable } from './traza';

interface Form {
  fecha: string;
  vence: string;
  proveedorId: number | null;
  proveedorNombre: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  descripcion: string;
  cuentaId: number | null;
  camionId: number | null;
  moneda: string;
  neto: string;
  exento: string;
  total: string;
}

const desdeGasto = (g: Gasto): Form => ({
  fecha: g.fecha,
  vence: g.vence,
  proveedorId: g.proveedorId,
  proveedorNombre: g.proveedorNombre ?? '',
  tipoDocumento: g.tipoDocumento,
  numeroDocumento: g.numeroDocumento ?? '',
  descripcion: g.descripcion,
  cuentaId: g.cuentaId,
  camionId: g.camionId,
  moneda: g.moneda,
  neto: g.tipoDocumento === 'factura' || g.tipoDocumento === 'boleta_honorarios' ? String(g.neto) : '',
  exento: g.tipoDocumento === 'factura' && g.exento > 0 ? String(g.exento) : '',
  total: g.tipoDocumento === 'factura' || g.tipoDocumento === 'boleta_honorarios' ? '' : String(g.total),
});

/** Finanzas › Gastos › nuevo o ficha: el documento, sus pagos y el asiento que armó el sistema. */
export function GastoFicha({ id }: { id: number | null }) {
  const { zonaHoraria } = useSesion();
  const router = useRouter();
  const puede = useCan('finanzas.gastos:editar');
  const puedeAnular = useCan('finanzas.gastos:transicionar');
  const { data: g, isLoading, isError, error, refetch } = useGasto(id);
  const { data: plan } = usePlanCuentas();
  const { data: proveedores } = useProveedores();
  const { data: camiones } = useCamionesFinanzas();
  const guardar = useGuardarGasto();
  const anular = useAnularGasto();
  const envio = useEnvio();
  const hoy = hoyEnZona(zonaHoraria) as string;
  const [f, setF] = useState<Form>({
    fecha: hoy,
    vence: '',
    proveedorId: null,
    proveedorNombre: '',
    tipoDocumento: 'factura',
    numeroDocumento: '',
    descripcion: '',
    cuentaId: null,
    camionId: null,
    moneda: 'CLP',
    neto: '',
    exento: '',
    total: '',
  });
  useEffect(() => {
    if (g) setF(desdeGasto(g));
  }, [g]);

  if (id && isLoading) return <Cargando texto="Abriendo el gasto…" />;
  if (id && (isError || !g)) return <ErrorLectura texto="No se pudo abrir el gasto." onReintentar={() => void refetch()} error={error} />;

  const editable = puede && (!g || g.estado === 'vigente');
  const cambiar = (c: Partial<Form>) => setF((x) => ({ ...x, ...c }));
  const doc = TIPOS_DOCUMENTO.find((t) => t.valor === f.tipoDocumento)!;
  const conProveedor = f.tipoDocumento === 'factura' || f.tipoDocumento === 'factura_exenta' || f.tipoDocumento === 'boleta_honorarios';

  const enviar = () =>
    void envio.enviar(
      guardar.mutateAsync({
        id: g?.id ?? null,
        version: g?.version ?? null,
        fecha: f.fecha,
        vence: f.vence || null,
        proveedorId: f.proveedorId,
        proveedorNombre: f.proveedorId ? null : f.proveedorNombre,
        tipoDocumento: f.tipoDocumento,
        numeroDocumento: f.numeroDocumento,
        descripcion: f.descripcion,
        cuentaId: f.cuentaId ?? 0,
        camionId: f.camionId,
        moneda: f.moneda,
        neto: f.neto,
        exento: f.exento,
        total: f.total,
      }).then((r) => {
        if (r.ok && !g) router.replace(`/finanzas/gastos/${r.data}`);
        return r;
      }),
      () => undefined,
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo={g ? `Gasto ${g.numero}` : 'Nuevo gasto'} subtitulo="Finanzas" />
        <Link href="/finanzas/gastos" className={BOTON_SECUNDARIO}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </div>

      {g?.estado === 'anulado' && (
        <p className="rounded-lg border border-borde bg-hover p-3 text-sm text-tinta-suave">Anulado: {g.motivo}</p>
      )}
      {g?.fijo && (
        <p className="text-sm text-tinta-suave">
          Generado por el gasto fijo «{g.fijo}». Si la factura vino por otro monto o con otro número, corregilo acá.
        </p>
      )}

      <Seccion titulo="Documento">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label="Tipo de documento" ayuda={doc.ayuda}>
              <select value={f.tipoDocumento} onChange={(e) => cambiar({ tipoDocumento: e.target.value as TipoDocumento })}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha del documento">
              <input type="date" value={f.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
            </Campo>
            <Campo label="Vence" ayuda="Vacío = se paga en el día.">
              <input type="date" value={f.vence} onChange={(e) => cambiar({ vence: e.target.value })} />
            </Campo>
            <ElegirProveedor
              proveedores={(proveedores ?? []).map((p) => ({ id: p.id, nombre: p.razonSocial, rut: p.identificadorFiscal }))}
              valor={f.proveedorId}
              texto={f.proveedorNombre}
              obligatorio={conProveedor}
              onCambiar={(proveedorId, proveedorNombre) => cambiar({ proveedorId, proveedorNombre })}
            />
            <Campo label={conProveedor ? 'N° del documento' : 'N° del documento (si tiene)'}>
              <input value={f.numeroDocumento} maxLength={30} onChange={(e) => cambiar({ numeroDocumento: e.target.value })} />
            </Campo>
            <Campo label="Qué es">
              <input value={f.descripcion} maxLength={200} placeholder="Ej.: luz de la oficina de octubre" onChange={(e) => cambiar({ descripcion: e.target.value })} />
            </Campo>
            <Campo label="Categoría (cuenta)">
              <select value={f.cuentaId ?? ''} onChange={(e) => cambiar({ cuentaId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Elegí…</option>
                <OpcionesCuentas cuentas={cuentasParaGasto(plan ?? [])} />
              </select>
            </Campo>
            <Campo label="Camión (si es de un camión)">
              <select value={f.camionId ?? ''} onChange={(e) => cambiar({ camionId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Ninguno —</option>
                {(camiones ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patente} · {c.codigo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Moneda">
              <select value={f.moneda} onChange={(e) => cambiar({ moneda: e.target.value })}>
                {MONEDAS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Campo>
            {f.tipoDocumento === 'factura' ? (
              <>
                <Campo label="Neto (afecto a IVA)">
                  <input inputMode="decimal" value={f.neto} onChange={(e) => cambiar({ neto: e.target.value })} />
                </Campo>
                <Campo label="Exento (si tiene)">
                  <input inputMode="decimal" value={f.exento} onChange={(e) => cambiar({ exento: e.target.value })} />
                </Campo>
              </>
            ) : f.tipoDocumento === 'boleta_honorarios' ? (
              <Campo label="Bruto de la boleta">
                <input inputMode="decimal" value={f.neto} onChange={(e) => cambiar({ neto: e.target.value })} />
              </Campo>
            ) : (
              <Campo label="Total">
                <input inputMode="decimal" value={f.total} onChange={(e) => cambiar({ total: e.target.value })} />
              </Campo>
            )}
          </fieldset>

          {g && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-fondo p-3 text-sm tabular-nums">
              {g.neto > 0 && <span>Neto {dinero(g.neto, g.moneda)}</span>}
              {g.exento > 0 && <span>Exento {dinero(g.exento, g.moneda)}</span>}
              {g.iva > 0 && <span>IVA {dinero(g.iva, g.moneda)}</span>}
              {g.retencion > 0 && <span>Retención {dinero(g.retencion, g.moneda)}</span>}
              <span className="font-semibold">Total {dinero(g.total, g.moneda)}</span>
              {g.moneda !== 'CLP' && <span className="text-tinta-suave">= {dinero(g.totalClp)}</span>}
              <span className={cn('font-semibold', g.saldo > 0 ? 'text-marca' : 'text-exito')}>{g.saldo > 0 ? `Falta pagar ${dinero(g.saldo, g.moneda)}` : 'Pagado'}</span>
            </div>
          )}

          <ErrorBase error={envio.error} onRecargar={() => void refetch()} />
          {editable && (
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={BOTON_PRIMARIO} disabled={guardar.isPending}>
                {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} {g ? 'Guardar cambios' : 'Guardar el gasto'}
              </button>
              {g && puedeAnular && g.pagos.every((p) => p.estado === 'anulado') && (
                <AccionConMotivo
                  etiqueta="Anular"
                  icono={<X className="size-4" />}
                  titulo="Anular el gasto"
                  explicacion="Se borra su asiento. Si ya tiene pagos, anulá primero los pagos."
                  ocupado={anular.isPending}
                  error={envio.error}
                  onConfirmar={async (motivo) => {
                    const r = await anular.mutateAsync({ id: g.id, motivo });
                    if (!r.ok) envio.setError(r.error);
                    return r.ok;
                  }}
                />
              )}
            </div>
          )}
        </form>
      </Seccion>

      {g && (
        <>
          <Seccion titulo="Pagos">
            {g.pagos.length === 0 ? (
              <p className="text-sm text-tinta-suave">Todavía no tiene pagos.</p>
            ) : (
              <ul className="divide-y divide-borde text-sm">
                {g.pagos.map((p) => (
                  <li key={p.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 py-2', p.estado === 'anulado' && 'text-tinta-suave line-through')}>
                    <span className="tabular-nums">{fecha(p.fecha)}</span>
                    <span>{p.cuenta}</span>
                    <span className="font-medium tabular-nums">{dinero(p.monto, p.moneda)}</span>
                    {p.moneda !== g.moneda && <span className="text-xs text-tinta-suave">= {dinero(p.montoDocumento, g.moneda)}</span>}
                    {p.conciliado && <Chip tono="exito">Conciliado</Chip>}
                    <span className="text-xs text-tinta-suave">{p.numero}</span>
                  </li>
                ))}
              </ul>
            )}
            {g.estado === 'vigente' && g.saldo > 0 && <PagarGasto gastoId={g.id} moneda={g.moneda} saldo={g.saldo} />}
          </Seccion>
          {g.proveedorId && <CargasDeLaFactura gasto={g} />}
          <TrazaContable origen="gasto" id={g.id} />
        </>
      )}
    </div>
  );
}

/** Proveedor de la lista, o alta rápida (razón social y RUT). Sin documento: solo un nombre. */
function ElegirProveedor({
  proveedores,
  valor,
  texto,
  obligatorio,
  onCambiar,
}: {
  proveedores: { id: number; nombre: string; rut: string | null }[];
  valor: number | null;
  texto: string;
  obligatorio: boolean;
  onCambiar: (id: number | null, texto: string) => void;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [razon, setRazon] = useState('');
  const [rut, setRut] = useState('');
  const crear = useGuardarProveedorRapido();
  const envio = useEnvio();
  if (nuevo) {
    return (
      <div className="space-y-2 rounded-lg border border-borde p-3 sm:col-span-2 lg:col-span-3">
        <p className="text-sm font-medium text-tinta">Nuevo proveedor</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo label="Razón social">
            <input value={razon} maxLength={200} onChange={(e) => setRazon(e.target.value)} />
          </Campo>
          <Campo label="RUT" ayuda="Con guion: 76.123.456-7">
            <input value={rut} maxLength={20} onChange={(e) => setRut(e.target.value)} />
          </Campo>
        </div>
        <ErrorBase error={envio.error} />
        <div className="flex gap-2">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={crear.isPending}
            onClick={() =>
              void envio.enviar(
                crear.mutateAsync({ razonSocial: razon, rut }).then((r) => {
                  if (r.ok) {
                    onCambiar(r.data, '');
                    setNuevo(false);
                  }
                  return r;
                }),
                () => undefined,
              )
            }
          >
            Agregar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setNuevo(false)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Campo label={obligatorio ? 'Proveedor' : 'Proveedor (opcional)'}>
        <select value={valor ?? ''} onChange={(e) => onCambiar(e.target.value ? Number(e.target.value) : null, '')}>
          <option value="">{obligatorio ? 'Elegí…' : '— Sin proveedor de la lista —'}</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {p.rut ? ` (${p.rut})` : ''}
            </option>
          ))}
        </select>
      </Campo>
      {!valor && !obligatorio && (
        <input
          className="h-9 w-full rounded-md border border-borde bg-panel px-3 text-sm"
          placeholder="O escribí a quién (ej.: ferretería del barrio)"
          value={texto}
          maxLength={150}
          onChange={(e) => onCambiar(null, e.target.value)}
          aria-label="A quién se le pagó"
        />
      )}
      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-marca hover:underline" onClick={() => setNuevo(true)}>
        <Plus className="size-3.5" /> Nuevo proveedor
      </button>
    </div>
  );
}

/** Registrar un pago del gasto desde un banco o caja. */
export function PagarGasto({ gastoId, moneda, saldo, onListo }: { gastoId: number; moneda: string; saldo: number; onListo?: () => void }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('finanzas.cobros_pagos:editar');
  const { data: cuentas } = useCuentasDinero(puede);
  const pagar = useRegistrarMovimiento();
  const envio = useEnvio();
  const activas = (cuentas ?? []).filter((c) => c.activa);
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [f, setF] = useState(hoyEnZona(zonaHoraria) as string);
  const [monto, setMonto] = useState(String(saldo));
  const [montoDoc, setMontoDoc] = useState('');
  useEffect(() => {
    if (cuenta === null && activas.length > 0) setCuenta((activas.find((c) => c.moneda === moneda) ?? activas[0])!.id);
  }, [activas, cuenta, moneda]);
  if (!puede) return null;
  if (activas.length === 0)
    return (
      <p className="mt-3 text-sm text-tinta-suave">
        Para registrar pagos, primero cargá un banco o caja en{' '}
        <Link href="/conciliacion" className="font-medium text-marca underline">
          Bancos y cajas
        </Link>
        .
      </p>
    );
  const cd = activas.find((c) => c.id === cuenta);
  const otraMoneda = cd && cd.moneda !== moneda;
  return (
    <div className={cn(TARJETA, 'mt-3 space-y-3 bg-fondo/40 p-3')}>
      <p className="text-sm font-medium text-tinta">Registrar un pago</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Desde">
          <select value={cuenta ?? ''} onChange={(e) => setCuenta(Number(e.target.value))}>
            {activas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha">
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
        </Campo>
        <Campo label={`Monto pagado${cd ? ` (${cd.moneda})` : ''}`}>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
        {otraMoneda && (
          <Campo label={`Cuánto cancela (${moneda})`} ayuda="Vacío = se calcula con el tipo de cambio del día.">
            <input inputMode="decimal" value={montoDoc} onChange={(e) => setMontoDoc(e.target.value)} />
          </Campo>
        )}
      </div>
      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={pagar.isPending}
        onClick={() =>
          void envio.enviar(
            pagar.mutateAsync({
              tipo: 'pago',
              fecha: f,
              cuentaDineroId: cuenta ?? 0,
              monto,
              gastoId,
              facturaId: null,
              cuentaId: null,
              destinoId: null,
              montoDestino: null,
              montoDocumento: otraMoneda ? montoDoc : null,
              descripcion: null,
            }),
            () => onListo?.(),
          )
        }
      >
        {pagar.isPending && <LoaderCircle className="size-4 animate-spin" />} Registrar el pago
      </button>
    </div>
  );
}

/** El asiento que armó el sistema (para el contador). */
export function VerAsiento({ asiento }: { asiento: Asiento | null }) {
  if (!asiento) return null;
  return (
    <details className="rounded-lg border border-borde bg-panel p-3 text-sm">
      <summary className="cursor-pointer font-medium text-tinta">Ver el asiento contable</summary>
      <p className="mt-2 text-xs text-tinta-suave">
        {fecha(asiento.fecha)} · {asiento.glosa}
      </p>
      <table className="mt-2 w-full text-sm tabular-nums">
        <thead className="text-xs text-tinta-suave">
          <tr>
            <th className="py-1 text-left font-medium">Cuenta</th>
            <th className="py-1 text-right font-medium">Debe</th>
            <th className="py-1 text-right font-medium">Haber</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {asiento.lineas.map((l, i) => (
            <tr key={i}>
              <td className="py-1">
                {l.codigo} · {l.cuenta}
              </td>
              <td className="py-1 text-right">{l.debe ? dinero(l.debe) : ''}</td>
              <td className="py-1 text-right">{l.haber ? dinero(l.haber) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Cargas de combustible (guías) que cubre esta factura del proveedor (migración 74). */
function CargasDeLaFactura({ gasto: g }: { gasto: Gasto }) {
  const puede = useCan('finanzas.gastos:editar');
  const { data } = useCargasPorFacturar(g.proveedorId, g.id);
  const vincular = useVincularCargas();
  const envio = useEnvio();
  const [marcadas, setMarcadas] = useState<Set<number> | null>(null);
  const lista = data ?? [];
  if (lista.length === 0 && g.cargas.length === 0) return null;
  const actuales = marcadas ?? new Set(lista.filter((c) => c.enEsta).map((c) => c.id));
  const suma = lista.filter((c) => actuales.has(c.id)).reduce((s, c) => s + c.clp, 0);
  const editable = puede && g.estado === 'vigente';
  return (
    <Seccion titulo="Cargas de combustible que cubre esta factura">
      <p className="text-sm text-tinta-suave">
        Son las cargas en cuenta corriente o con tarjeta de este proveedor que todavía no tienen factura. Marcá las que vienen en esta factura (las
        guías): así el combustible queda contado una sola vez y la diferencia (IVA, ajustes de precio) se ve sola.
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel text-xs text-tinta-suave">
            <tr>
              <th className="w-8 py-1" />
              <th className="py-1 text-left font-medium">Fecha</th>
              <th className="py-1 text-left font-medium">Camión</th>
              <th className="py-1 text-left font-medium">Guía</th>
              <th className="py-1 text-right font-medium">Litros</th>
              <th className="py-1 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde tabular-nums">
            {lista.map((c) => (
              <tr key={c.id}>
                <td className="py-1">
                  <input
                    type="checkbox"
                    className="size-4 accent-marca"
                    disabled={!editable}
                    checked={actuales.has(c.id)}
                    aria-label={`Carga del ${fecha(c.fecha)}`}
                    onChange={(e) => {
                      const n = new Set(actuales);
                      if (e.target.checked) n.add(c.id);
                      else n.delete(c.id);
                      setMarcadas(n);
                    }}
                  />
                </td>
                <td className="py-1">{fecha(c.fecha)}</td>
                <td className="py-1">{c.camion ?? '—'}</td>
                <td className="py-1">{c.guia ?? '—'}</td>
                <td className="py-1 text-right">{c.litros}</td>
                <td className="py-1 text-right">{dinero(c.clp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        Marcadas: <span className="font-semibold tabular-nums">{dinero(suma)}</span> · Factura: <span className="font-semibold tabular-nums">{dinero(g.totalClp)}</span>
        {actuales.size > 0 && Math.abs(g.totalClp - suma) >= 1 && (
          <span className="text-tinta-suave"> · diferencia {dinero(g.totalClp - suma)} (IVA y ajustes)</span>
        )}
      </p>
      <ErrorBase error={envio.error} />
      {editable && marcadas && (
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={vincular.isPending}
          onClick={() => void envio.enviar(vincular.mutateAsync({ gastoId: g.id, cargas: [...actuales] }), () => setMarcadas(null))}
        >
          {vincular.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar las cargas de la factura
        </button>
      )}
    </Seccion>
  );
}
