"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, LoaderCircle, Plus, X } from "lucide-react";
import { Panel, TD, TH, useEnvio } from "@/modules/catalogos/components/comun";
import {
  AccionConMotivo,
  Cargando,
  Chip,
  Encabezado,
  ErrorBase,
  ErrorLectura,
  Seccion,
  Vacio,
} from "@/modules/combustible/components/comun/ui";
import { useCan } from "@/modules/core/permissions/can";
import { useSesion } from "@/modules/core/session/session-provider";
import { cn } from "@/shared/lib/cn";
import { hoyEnZona } from "@/shared/lib/fechas";
import {
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  CONTROL_FILTRO,
  TARJETA,
} from "@/shared/ui/clases";
import { Campo } from "@/shared/ui/campo";
import {
  cuentasParaMovimiento,
  dinero,
  ETIQUETA_MOVIMIENTO,
  type CuentaDinero,
  type PorCobrar,
  type PorPagar,
} from "../domain/finanzas.types";
import {
  useAnularMovimiento,
  useCambiarFechaCobro,
  useCuentasDinero,
  useMovimientos,
  usePlanCuentas,
  usePorCobrar,
  usePorPagar,
  useRegistrarMovimiento,
} from "../queries/hooks";
import { fecha, OpcionesCuentas } from "./comun";
import { CambiarFechaCobro } from "@/modules/ventas/components/cambiar-fecha-cobro";
import { PagarGasto } from "./gasto-ficha";
import { CuentaEstaciones } from "./cuenta-estaciones";
import { SaldosLinea, SaldosResumen } from "./saldos";
import { agruparSaldos } from "../domain/saldos-por-tercero";
import { useBaseTiene } from "@/shared/hooks/use-version-base";
import { ReciboForm, Recibos } from "./recibos";

type Vista = "cobrar" | "pagar" | "movimientos" | "recibos";

/** Finanzas › Cobros y pagos: lo por cobrar, lo por pagar y todo lo que entró y salió. */
export function CobrosPagosPantalla() {
  const params = useSearchParams();
  const [vista, setVista] = useState<Vista>(
    (params.get("ver") as Vista) || "cobrar",
  );
  // Migración 275: recibos de cobranza
  const hayRecibos = useBaseTiene(275);
  return (
    <div className="space-y-5">
      <Encabezado titulo="Cobros y pagos" subtitulo="Finanzas" />
      <nav
        aria-label="Vistas"
        className="-mt-1 flex flex-wrap gap-1 border-b border-borde"
      >
        {(
          [
            // 19/11/2026: un solo nombre en todo el sistema: «Por cobrar» y «Por pagar»
            ["cobrar", "Por cobrar"],
            ["pagar", "Por pagar"],
            ["movimientos", "Entradas y salidas"],
            ["recibos", "Recibos"],
          ] as const
        )
          .filter(([v]) => v !== "recibos" || hayRecibos)
          .map(([v, t]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            aria-current={vista === v ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              vista === v
                ? "border-marca font-medium text-marca"
                : "border-transparent text-tinta-suave hover:text-tinta",
            )}
          >
            {t}
          </button>
        ))}
      </nav>
      {vista === "cobrar" ? (
        <NosDeben />
      ) : vista === "pagar" ? (
        <Debemos />
      ) : vista === "recibos" && hayRecibos ? (
        <Recibos />
      ) : (
        <Movimientos />
      )}
    </div>
  );
}

function NosDeben() {
  const { data, isLoading, isError, error, refetch } = usePorCobrar();
  const [abierta, setAbierta] = useState<number | null>(null);
  // Migración 275: recibo con varias facturas del mismo cliente
  const puedeCobrar = useCan("finanzas.cobros_pagos:editar");
  const hayRecibos = useBaseTiene(275);
  const puedeRecibo = puedeCobrar && hayRecibos;
  const [elegidas, setElegidas] = useState<{ cliente: string; ids: number[] }>({ cliente: "", ids: [] });
  const [reciboDe, setReciboDe] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const marcar = (cliente: string, id: number) => {
    setHecho(null);
    setElegidas((e) => {
      const ids = e.cliente === cliente ? e.ids : [];
      return { cliente, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] };
    });
    if (reciboDe !== cliente) setReciboDe(null);
  };
  if (isLoading) return <Cargando texto="Buscando facturas por cobrar…" />;
  if (isError || !data)
    return (
      <ErrorLectura
        texto="No se pudieron leer las facturas."
        onReintentar={() => void refetch()}
        error={error}
      />
    );
  const pendientes = data.filter((f) => !f.sinCuenta);
  const sinCuenta = data
    .filter((f) => f.sinCuenta)
    .sort((a, b) => a.cliente.localeCompare(b.cliente, "es", { sensitivity: "base" }));
  const total = pendientes.reduce((s, f) => s + (f.saldoClp ?? 0), 0);
  // 17/11/2026: por cliente, con lo vencido y lo que todavía no venció (por cliente y en total)
  const { grupos, totales } = agruparSaldos(pendientes, {
    nombre: (f) => f.cliente,
    moneda: (f) => f.moneda,
    saldo: (f) => f.saldo,
    vencido: (f) => f.diasVencida > 0,
    orden: (a, b) => a.vence.localeCompare(b.vence),
  });
  return (
    <div className="space-y-5">
      {sinCuenta.length > 0 && (
        <Seccion titulo="Cobradas desde Ventas sin decir el banco">
          <p className="text-sm text-tinta-suave">
            Decí a qué banco o caja entró cada una, así el saldo del banco y la
            contabilidad quedan bien.
          </p>
          <ul className="divide-y divide-borde text-sm">
            {sinCuenta.map((f) => (
              <li key={f.id} className="py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">
                    {f.numeroFiscal ?? f.numero}
                  </span>
                  <span>{f.cliente}</span>
                  <span className="tabular-nums">
                    {dinero(f.total, f.moneda)}
                  </span>
                  <span className="text-xs text-tinta-suave">
                    cobrada el {fecha(f.cobradaEn)}
                  </span>
                  <button
                    type="button"
                    className={cn(BOTON_SECUNDARIO, "ml-auto")}
                    onClick={() => setAbierta(abierta === f.id ? null : f.id)}
                  >
                    {abierta === f.id ? "Cerrar" : "Decir el banco"}
                  </button>
                </div>
                {abierta === f.id && (
                  <Cobrar facturaId={f.id} moneda={f.moneda} saldo={f.total} />
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}
      {pendientes.length === 0 ? (
        <Vacio
          icono={<ArrowLeftRight className="size-6" />}
          texto="No hay facturas por cobrar."
        />
      ) : (
        <Seccion
          titulo={`${pendientes.length} facturas de ${grupos.length} ${grupos.length === 1 ? "cliente" : "clientes"} · ≈ ${dinero(total)}`}
        >
          <SaldosResumen totales={totales} />
          {hecho && (
            <p className="text-sm font-medium text-exito">
              Recibo {hecho} registrado. Está en la pestaña «Recibos».
            </p>
          )}
          <p className="text-sm text-tinta-suave">
            Son las facturas emitidas en{" "}
            <Link
              href="/analisis/facturacion"
              className="font-medium text-marca underline"
            >
              Finanzas › Facturación
            </Link>
            . Un cobro puede ser parcial; cuando se completa, la factura queda
            cobrada.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-y border-borde bg-fondo">
                <tr>
                  <th className={cn(TH, "w-8")}>
                    {puedeRecibo && <span className="sr-only">Elegir para el recibo</span>}
                  </th>
                  <th className={TH}>Factura</th>
                  <th className={TH}>Vence</th>
                  <th className={cn(TH, "text-right")}>Total</th>
                  <th className={cn(TH, "text-right")}>Falta cobrar</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {grupos.map((g) => {
                  const ids = elegidas.cliente === g.nombre ? elegidas.ids : [];
                  return (
                    <Fragment key={g.nombre}>
                      <tr className="bg-fondo">
                        <td colSpan={3} className={cn(TD, "font-semibold text-tinta")}>
                          {g.nombre}
                          <span className="block text-xs font-normal text-tinta-suave">
                            {g.items.length} {g.items.length === 1 ? "factura" : "facturas"}
                          </span>
                        </td>
                        <td colSpan={3} className={cn(TD, "text-right text-xs")}>
                          <SaldosLinea saldos={g.saldos} />
                          {puedeRecibo && ids.length > 0 && reciboDe !== g.nombre && (
                            <button
                              type="button"
                              className={cn(BOTON_PRIMARIO, "mt-2")}
                              onClick={() => setReciboDe(g.nombre)}
                            >
                              Hacer un recibo ({ids.length})
                            </button>
                          )}
                        </td>
                      </tr>
                      {puedeRecibo && reciboDe === g.nombre && ids.length > 0 && (
                        <tr>
                          <td colSpan={6} className="bg-fondo/40 px-3 py-3">
                            <ReciboForm
                              cliente={g.nombre}
                              facturas={g.items.filter((f) => ids.includes(f.id))}
                              onCerrar={() => setReciboDe(null)}
                              onListo={(numero) => {
                                setReciboDe(null);
                                setElegidas({ cliente: "", ids: [] });
                                setHecho(numero);
                              }}
                            />
                          </td>
                        </tr>
                      )}
                      {g.items.map((f) => (
                        <FilaCobrar
                          key={f.id}
                          f={f}
                          abierta={abierta === f.id}
                          onAbrir={() => setAbierta(abierta === f.id ? null : f.id)}
                          elegir={
                            puedeRecibo
                              ? { marcada: ids.includes(f.id), onMarcar: () => marcar(g.nombre, f.id) }
                              : null
                          }
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
    </div>
  );
}

function FilaCobrar({
  f,
  abierta,
  onAbrir,
  elegir,
}: {
  f: PorCobrar;
  abierta: boolean;
  onAbrir: () => void;
  /** Migración 275: casilla para sumar la factura a un recibo. */
  elegir: { marcada: boolean; onMarcar: () => void } | null;
}) {
  const puede = useCan("finanzas.cobros_pagos:editar");
  return (
    <>
      <tr>
        <td className={cn(TD, "w-8")}>
          {elegir && (
            <input
              type="checkbox"
              aria-label={`Sumar ${f.numeroFiscal ?? f.numero} al recibo`}
              checked={elegir.marcada}
              onChange={elegir.onMarcar}
            />
          )}
        </td>
        <td className={cn(TD, "tabular-nums")}>
          <span className="font-medium">{f.numeroFiscal ?? f.numero}</span>
          <span className="block text-xs text-tinta-suave">
            {fecha(f.fecha)}
          </span>
        </td>
        <td
          className={cn(TD, "tabular-nums", f.diasVencida > 0 && "text-error")}
        >
          {fecha(f.vence)}
          {f.diasVencida > 0 && (
            <span className="block text-xs">hace {f.diasVencida} días</span>
          )}
        </td>
        <td className={cn(TD, "text-right tabular-nums")}>
          {dinero(f.total, f.moneda)}
        </td>
        <td className={cn(TD, "text-right font-medium tabular-nums")}>
          {dinero(f.saldo, f.moneda)}
          {f.moneda !== "CLP" && (
            <span className="block text-xs font-normal text-tinta-suave">
              ≈ {dinero(f.saldoClp)}
            </span>
          )}
        </td>
        <td className={cn(TD, "text-right")}>
          {puede && (
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              onClick={onAbrir}
            >
              {abierta ? "Cerrar" : "Cobrar"}
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={6} className="bg-fondo/40 px-3 pb-3">
            <Cobrar facturaId={f.id} moneda={f.moneda} saldo={f.saldo} />
          </td>
        </tr>
      )}
    </>
  );
}

function Cobrar({
  facturaId,
  moneda,
  saldo,
}: {
  facturaId: number;
  moneda: string;
  saldo: number;
}) {
  const { zonaHoraria } = useSesion();
  const { data: cuentas } = useCuentasDinero();
  const cobrar = useRegistrarMovimiento();
  const envio = useEnvio();
  const activas = (cuentas ?? []).filter((c) => c.activa);
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [f, setF] = useState(hoyEnZona(zonaHoraria) as string);
  const [monto, setMonto] = useState(String(saldo));
  const [montoDoc, setMontoDoc] = useState("");
  useEffect(() => {
    if (cuenta === null && activas.length > 0)
      setCuenta((activas.find((c) => c.moneda === moneda) ?? activas[0])!.id);
  }, [activas, cuenta, moneda]);
  if (activas.length === 0) return <SinCuentas />;
  const cd = activas.find((c) => c.id === cuenta);
  const otra = cd && cd.moneda !== moneda;
  return (
    <div className="space-y-3 pt-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Entró a">
          <select
            value={cuenta ?? ""}
            onChange={(e) => setCuenta(Number(e.target.value))}
          >
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
        <Campo label={`Monto que entró${cd ? ` (${cd.moneda})` : ""}`}>
          <input
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </Campo>
        {otra && (
          <Campo
            label={`Cuánto cancela (${moneda})`}
            ayuda="Vacío = con el tipo de cambio del día."
          >
            <input
              inputMode="decimal"
              value={montoDoc}
              onChange={(e) => setMontoDoc(e.target.value)}
            />
          </Campo>
        )}
      </div>
      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={cobrar.isPending}
        onClick={() =>
          void envio.enviar(
            cobrar.mutateAsync({
              tipo: "cobro",
              fecha: f,
              cuentaDineroId: cuenta ?? 0,
              monto,
              facturaId,
              gastoId: null,
              cuentaId: null,
              destinoId: null,
              montoDestino: null,
              montoDocumento: otra ? montoDoc : null,
              descripcion: null,
            }),
            () => undefined,
          )
        }
      >
        {cobrar.isPending && <LoaderCircle className="size-4 animate-spin" />}{" "}
        Registrar el cobro
      </button>
    </div>
  );
}

function SinCuentas() {
  return (
    <p className="pt-3 text-sm text-tinta-suave">
      Primero cargá un banco o caja en{" "}
      <Link
        href="/conciliacion"
        className="font-medium text-marca underline"
      >
        Bancos y cajas
      </Link>
      .
    </p>
  );
}

// Migración 274: arriba, la cuenta corriente con las estaciones (cargas sin factura y facturas sin pagar)
function Debemos() {
  return (
    <div className="space-y-5">
      <CuentaEstaciones />
      <GastosPorPagar />
    </div>
  );
}

function GastosPorPagar() {
  const { data, isLoading, isError, error, refetch } = usePorPagar();
  const puede = useCan("finanzas.cobros_pagos:editar");
  const [abierta, setAbierta] = useState<number | null>(null);
  if (isLoading) return <Cargando texto="Buscando gastos por pagar…" />;
  if (isError || !data)
    return (
      <ErrorLectura
        texto="No se pudieron leer los gastos."
        onReintentar={() => void refetch()}
        error={error}
      />
    );
  if (data.length === 0)
    return (
      <Vacio
        icono={<ArrowLeftRight className="size-6" />}
        texto="No hay gastos por pagar."
      />
    );
  const total = data.reduce((s, g) => s + g.saldoClp, 0);
  // 17/11/2026: por proveedor, con lo vencido y lo que todavía no venció (por proveedor y en total)
  const { grupos, totales } = agruparSaldos(data, {
    nombre: (g) => g.proveedor ?? "Sin proveedor",
    moneda: (g) => g.moneda,
    saldo: (g) => g.saldo,
    vencido: (g) => g.diasVencido > 0,
    orden: (a, b) => a.vence.localeCompare(b.vence),
  });
  return (
    <Seccion
      titulo={`Gastos por pagar · ${data.length} de ${grupos.length} ${grupos.length === 1 ? "proveedor" : "proveedores"} · ≈ ${dinero(total)}`}
    >
      <SaldosResumen totales={totales} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-y border-borde bg-fondo">
            <tr>
              <th className={TH}>Vence</th>
              <th className={TH}>Proveedor y detalle</th>
              <th className={cn(TH, "text-right")}>Total</th>
              <th className={cn(TH, "text-right")}>Falta pagar</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {grupos.map((p) => (
              <Fragment key={p.nombre}>
                <tr className="bg-fondo">
                  <td colSpan={2} className={cn(TD, "font-semibold text-tinta")}>
                    {p.nombre}
                    <span className="block text-xs font-normal text-tinta-suave">
                      {p.items.length} {p.items.length === 1 ? "gasto" : "gastos"}
                    </span>
                  </td>
                  <td colSpan={3} className={cn(TD, "text-right text-xs")}>
                    <SaldosLinea saldos={p.saldos} />
                  </td>
                </tr>
                {p.items.map((g) => (
                  <FilaPagar
                    key={g.id}
                    g={g}
                    puede={puede}
                    abierta={abierta === g.id}
                    onAbrir={() => setAbierta(abierta === g.id ? null : g.id)}
                    onListo={() => setAbierta(null)}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}

function FilaPagar({
  g,
  puede,
  abierta,
  onAbrir,
  onListo,
}: {
  g: PorPagar;
  puede: boolean;
  abierta: boolean;
  onAbrir: () => void;
  onListo: () => void;
}) {
  return (
    <>
      <tr>
        <td
          className={cn(TD, "tabular-nums", g.diasVencido > 0 && "text-error")}
        >
          {fecha(g.vence)}
          {g.diasVencido > 0 && (
            <span className="block text-xs">
              vencido hace {g.diasVencido} días
            </span>
          )}
        </td>
        <td className={TD}>
          <Link
            href={`/finanzas/gastos/${g.id}`}
            className="text-marca hover:underline"
          >
            {g.proveedor ?? g.descripcion}
          </Link>
          <span className="block text-xs text-tinta-suave">
            {g.descripcion}
            {g.numeroDocumento && ` · N° ${g.numeroDocumento}`}
          </span>
        </td>
        <td className={cn(TD, "text-right tabular-nums")}>
          {dinero(g.total, g.moneda)}
        </td>
        <td className={cn(TD, "text-right font-medium tabular-nums")}>
          {dinero(g.saldo, g.moneda)}
        </td>
        <td className={cn(TD, "text-right")}>
          {puede && (
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              onClick={onAbrir}
            >
              {abierta ? "Cerrar" : "Pagar"}
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={5} className="px-3 pb-3">
            <PagarGasto
              gastoId={g.id}
              moneda={g.moneda}
              saldo={g.saldo}
              onListo={onListo}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function Movimientos() {
  const puede = useCan("finanzas.cobros_pagos:editar");
  const puedeAnular = useCan("finanzas.cobros_pagos:transicionar");
  const { data: cuentas } = useCuentasDinero();
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const { data, isLoading, isError, error, refetch } = useMovimientos(
    cuenta,
    desde || null,
    hasta || null,
  );
  const anular = useAnularMovimiento();
  // Migración 273: un cobro cargado con la fecha equivocada se corrige sin anularlo
  const cambiarFecha = useCambiarFechaCobro();
  const envio = useEnvio();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <select
          className={CONTROL_FILTRO}
          value={cuenta ?? ""}
          onChange={(e) =>
            setCuenta(e.target.value ? Number(e.target.value) : null)
          }
          aria-label="Cuenta"
        >
          <option value="">Todas las cuentas</option>
          {(cuentas ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Desde{" "}
          <input
            type="date"
            className={CONTROL_FILTRO}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Hasta{" "}
          <input
            type="date"
            className={CONTROL_FILTRO}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        {puede && !nuevo && (
          <button
            type="button"
            className={cn(BOTON_PRIMARIO, "ml-auto")}
            onClick={() => setNuevo(true)}
          >
            <Plus className="size-4" /> Otro ingreso, egreso o transferencia
          </button>
        )}
      </div>
      {nuevo && (
        <NuevoMovimiento
          cuentas={(cuentas ?? []).filter((c) => c.activa)}
          onCerrar={() => setNuevo(false)}
        />
      )}
      <ErrorBase error={envio.error} />
      {isLoading ? (
        <Cargando texto="Buscando movimientos…" />
      ) : isError || !data ? (
        <ErrorLectura
          texto="No se pudieron leer los movimientos."
          onReintentar={() => void refetch()}
          error={error}
        />
      ) : data.length === 0 ? (
        <Vacio
          icono={<ArrowLeftRight className="size-6" />}
          texto="No hay movimientos en ese período."
        />
      ) : (
        <div className={cn(TARJETA, "overflow-x-auto")}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Qué</th>
                <th className={TH}>Cuenta</th>
                <th className={cn(TH, "text-right")}>Monto</th>
                <th className={TH}>Banco</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((m) => (
                <tr
                  key={m.id}
                  className={cn(m.estado === "anulado" && "text-tinta-suave")}
                >
                  <td className={cn(TD, "tabular-nums")}>
                    {fecha(m.fecha)}
                    <span className="block text-xs text-tinta-suave">
                      {m.numero}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className="text-xs text-tinta-suave">
                      {ETIQUETA_MOVIMIENTO[m.tipo]}
                    </span>
                    <span
                      className={cn(
                        "block",
                        m.estado === "anulado" && "line-through",
                      )}
                    >
                      {m.detalle}
                    </span>
                    {m.estado === "anulado" && (
                      <span className="block text-xs">Anulado: {m.motivo}</span>
                    )}
                  </td>
                  <td className={TD}>{m.cuenta}</td>
                  <td
                    className={cn(
                      TD,
                      "text-right font-medium tabular-nums",
                      m.monto < 0 ? "text-tinta" : "text-exito",
                    )}
                  >
                    {dinero(m.monto, m.moneda)}
                  </td>
                  <td className={TD}>
                    {m.conciliado ? (
                      <Chip tono="exito">Conciliado</Chip>
                    ) : m.estado === "vigente" ? (
                      <Chip tono="neutro">Sin conciliar</Chip>
                    ) : null}
                  </td>
                  <td className={cn(TD, "space-y-2 text-right")}>
                    {puedeAnular && m.estado === "vigente" && m.tipo === "cobro" && !m.conciliado && (
                      <CambiarFechaCobro
                        fechaActual={m.fecha.slice(0, 10)}
                        ocupado={cambiarFecha.isPending}
                        onGuardar={async (f, motivo) => {
                          const r = await cambiarFecha.mutateAsync({ id: m.id, fecha: f, motivo });
                          return r.ok ? null : r.error;
                        }}
                      />
                    )}
                    {puedeAnular && m.estado === "vigente" && (
                      <AccionConMotivo
                        etiqueta="Anular"
                        icono={<X className="size-4" />}
                        titulo={`Anular ${m.numero}`}
                        explicacion="Se borra su asiento. Si era un cobro, la factura vuelve a quedar por cobrar; si era un pago, el gasto vuelve a quedar por pagar."
                        ocupado={anular.isPending}
                        error={envio.error}
                        onConfirmar={async (motivo) => {
                          const r = await anular.mutateAsync({
                            id: m.id,
                            motivo,
                          });
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
    </div>
  );
}

function NuevoMovimiento({
  cuentas,
  onCerrar,
}: {
  cuentas: CuentaDinero[];
  onCerrar: () => void;
}) {
  const { zonaHoraria } = useSesion();
  const { data: plan } = usePlanCuentas();
  const registrar = useRegistrarMovimiento();
  const envio = useEnvio();
  const [tipo, setTipo] = useState<"ingreso" | "egreso" | "transferencia">(
    "egreso",
  );
  const [cuenta, setCuenta] = useState<number | null>(cuentas[0]?.id ?? null);
  const [destino, setDestino] = useState<number | null>(null);
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [f, setF] = useState(hoyEnZona(zonaHoraria) as string);
  const [monto, setMonto] = useState("");
  const [montoDestino, setMontoDestino] = useState("");
  const [desc, setDesc] = useState("");
  if (cuentas.length === 0) return <SinCuentas />;
  const cOrigen = cuentas.find((c) => c.id === cuenta);
  const cDestino = cuentas.find((c) => c.id === destino);
  const otraMoneda =
    tipo === "transferencia" &&
    cOrigen &&
    cDestino &&
    cOrigen.moneda !== cDestino.moneda;
  return (
    <Panel
      titulo="Otro ingreso, egreso o transferencia"
      explicacion="Para cobrar una factura o pagar un gasto usá las otras pestañas. Acá van: aportes o retiros de socios, préstamos, comisiones, impuestos, pasar plata entre cuentas…"
      error={envio.error}
      ocupado={registrar.isPending}
      textoBoton="Registrar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        void envio.enviar(
          registrar.mutateAsync({
            tipo,
            fecha: f,
            cuentaDineroId: cuenta ?? 0,
            monto,
            facturaId: null,
            gastoId: null,
            cuentaId: tipo === "transferencia" ? null : cuentaId,
            destinoId: tipo === "transferencia" ? destino : null,
            montoDestino: otraMoneda ? montoDestino : null,
            montoDocumento: null,
            descripcion: desc,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Qué es">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
        >
          <option value="egreso">Salió plata (otro egreso)</option>
          <option value="ingreso">Entró plata (otro ingreso)</option>
          <option value="transferencia">Transferencia entre mis cuentas</option>
        </select>
      </Campo>
      <Campo label={tipo === "transferencia" ? "Desde" : "Banco o caja"}>
        <select
          value={cuenta ?? ""}
          onChange={(e) => setCuenta(Number(e.target.value))}
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.moneda})
            </option>
          ))}
        </select>
      </Campo>
      {tipo === "transferencia" ? (
        <Campo label="Hacia">
          <select
            value={destino ?? ""}
            onChange={(e) =>
              setDestino(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Elegí…</option>
            {cuentas
              .filter((c) => c.id !== cuenta)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda})
                </option>
              ))}
          </select>
        </Campo>
      ) : (
        <Campo label="Cuenta contable (de qué es)">
          <select
            value={cuentaId ?? ""}
            onChange={(e) =>
              setCuentaId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Elegí…</option>
            <OpcionesCuentas cuentas={cuentasParaMovimiento(plan ?? [])} />
          </select>
        </Campo>
      )}
      <Campo label="Fecha">
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
      </Campo>
      <Campo label={`Monto${cOrigen ? ` (${cOrigen.moneda})` : ""}`}>
        <input
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </Campo>
      {otraMoneda && (
        <Campo label={`Llegó (${cDestino!.moneda})`}>
          <input
            inputMode="decimal"
            value={montoDestino}
            onChange={(e) => setMontoDestino(e.target.value)}
          />
        </Campo>
      )}
      <Campo label="Descripción">
        <input
          value={desc}
          maxLength={200}
          placeholder="Ej.: comisión de mantención"
          onChange={(e) => setDesc(e.target.value)}
        />
      </Campo>
    </Panel>
  );
}
