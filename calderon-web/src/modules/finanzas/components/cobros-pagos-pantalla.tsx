"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, LoaderCircle } from "lucide-react";
import { TD, TH, useEnvio } from "@/modules/catalogos/components/comun";
import {
  Cargando,
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
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/shared/ui/clases";
import { Campo } from "@/shared/ui/campo";
import { dinero, type PorCobrar, type PorPagar } from "../domain/finanzas.types";
import {
  useCuentasDinero,
  usePorCobrar,
  usePorPagar,
  useRegistrarMovimiento,
} from "../queries/hooks";
import { fecha, SeccionPlegada } from "./comun";
import { PagarGasto } from "./gasto-ficha";
import { CuentaEstaciones } from "./cuenta-estaciones";
// Migración 281: cuenta corriente de proveedores y orden de pago
import { CuentaProveedores } from "./cuenta-proveedores";
import { SaldosLinea, SaldosResumen } from "./saldos";
import { agruparSaldos } from "../domain/saldos-por-tercero";
import { useBaseTiene } from "@/shared/hooks/use-version-base";
import { ReciboForm, Recibos } from "./recibos";
// 19/11/2026: la cuenta corriente de los clientes, junto a Por cobrar (antes en Facturación)
import { CuentaCorrienteVista } from "@/modules/ventas/components/cuenta-corriente";
import { useAbrirFicha } from "@/modules/core/fichas/contexto";

// 20/11/2026 (plan de simplificación, cambio 4): «Entradas y salidas» pasó a Bancos › Movimientos (?ver=movimientos redirige)
const VISTAS = ["cobrar", "cuenta", "pagar", "recibos"] as const;
type Vista = (typeof VISTAS)[number];

/** Finanzas › Cobros y pagos: lo por cobrar y lo por pagar. */
export function CobrosPagosPantalla() {
  const params = useSearchParams();
  const [vista, setVista] = useState<Vista>(
    VISTAS.find((v) => v === params.get("ver")) ?? "cobrar",
  );
  // Migración 275: recibos de cobranza
  const hayRecibos = useBaseTiene(275);
  const abrirFicha = useAbrirFicha();
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
            ["cuenta", "Cuenta corriente"],
            ["pagar", "Por pagar"],
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
        <Link
          href="/conciliacion?vista=movimientos"
          className="ml-auto self-center px-3 text-xs text-tinta-suave hover:text-marca hover:underline"
        >
          Entradas y salidas: Bancos › Movimientos →
        </Link>
      </nav>
      {vista === "cobrar" ? (
        <NosDeben />
      ) : vista === "cuenta" ? (
        <CuentaCorrienteVista onAbrirFactura={(id) => abrirFicha("factura", id)} />
      ) : vista === "pagar" ? (
        <Debemos />
      ) : vista === "recibos" && hayRecibos ? (
        <Recibos />
      ) : (
        <NosDeben />
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
        Bancos
      </Link>
      .
    </p>
  );
}

// Migración 274: arriba, la cuenta corriente con las estaciones (cargas sin factura y facturas sin pagar)
// 20/11/2026 (plan de simplificación, cambios 2 y 3): un solo total arriba, la cuenta de cada proveedor con su «Pagar»
// (orden de pago). «Facturas por vencimiento» y «Detalle por estación» quedan plegados y sin total; se abren con
// ?facturas=1 (y ?gasto=N abre el pago de ese gasto) o ?estaciones=1. Sin la migración 281 se ven abiertos, como antes.
function Debemos() {
  const params = useSearchParams();
  const conCuenta = useBaseTiene(281);
  const gasto = Number(params.get("gasto")) || null;
  return (
    <div className="space-y-5">
      <CuentaProveedores />
      <GastosPorPagar
        plegado={conCuenta}
        abierta={params.get("facturas") === "1" || gasto !== null}
        gastoUrl={gasto}
      />
      <CuentaEstaciones
        plegado={conCuenta}
        abierta={params.get("estaciones") === "1"}
      />
    </div>
  );
}

/** Facturas por vencimiento (antes «Gastos por pagar»): cada gasto sin pagar, por proveedor, del que vence primero al último. */
function GastosPorPagar({
  plegado,
  abierta,
  gastoUrl,
}: {
  plegado: boolean;
  abierta: boolean;
  gastoUrl: number | null;
}) {
  const { data, isLoading, isError, error, refetch } = usePorPagar();
  const puede = useCan("finanzas.cobros_pagos:editar");
  // Mientras no se toque nada, queda abierto el pago del gasto de la dirección (la ficha del gasto lleva acá)
  const [abiertaElegida, setAbierta] = useState<number | null | undefined>(
    undefined,
  );
  const abiertaId = abiertaElegida !== undefined ? abiertaElegida : gastoUrl;
  if (isLoading) return <Cargando texto="Buscando las facturas por pagar…" />;
  if (isError || !data)
    return (
      <ErrorLectura
        texto="No se pudieron leer las facturas por pagar."
        onReintentar={() => void refetch()}
        error={error}
      />
    );
  if (data.length === 0)
    return plegado ? null : (
      <Vacio
        icono={<ArrowLeftRight className="size-6" />}
        texto="No hay facturas por pagar."
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
  const tabla = (
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
                  soloEsta={plegado}
                  abierta={abiertaId === g.id}
                  enfocar={abiertaElegida === undefined && gastoUrl === g.id}
                  onAbrir={() => setAbierta(abiertaId === g.id ? null : g.id)}
                  onListo={() => setAbierta(null)}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (plegado)
    return (
      <SeccionPlegada
        titulo={`Facturas por vencimiento · ${data.length}`}
        abierta={abierta}
      >
        <p className="text-sm text-tinta-suave">
          Cada factura sin pagar, de la que vence primero a la última. Para
          pagarle a un proveedor usá «Pagar» en su cuenta, arriba: cancela sus
          facturas más viejas. «Pagar solo esta factura» registra el pago de una
          sola.
        </p>
        {tabla}
      </SeccionPlegada>
    );
  return (
    <Seccion
      titulo={`Facturas por vencimiento · ${data.length} de ${grupos.length} ${grupos.length === 1 ? "proveedor" : "proveedores"} · ≈ ${dinero(total)}`}
    >
      <SaldosResumen totales={totales} />
      {tabla}
    </Seccion>
  );
}

function FilaPagar({
  g,
  puede,
  soloEsta,
  abierta,
  enfocar,
  onAbrir,
  onListo,
}: {
  g: PorPagar;
  puede: boolean;
  soloEsta: boolean;
  abierta: boolean;
  enfocar: boolean;
  onAbrir: () => void;
  onListo: () => void;
}) {
  const fila = useRef<HTMLTableRowElement>(null);
  // Si se llegó desde la ficha del gasto, la fila queda a la vista con su pago abierto
  useEffect(() => {
    if (enfocar) fila.current?.scrollIntoView({ block: "center" });
  }, [enfocar]);
  return (
    <>
      <tr ref={fila}>
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
              {abierta ? "Cerrar" : soloEsta ? "Pagar solo esta factura" : "Pagar"}
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
