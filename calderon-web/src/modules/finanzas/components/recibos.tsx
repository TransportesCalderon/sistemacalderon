"use client";

import { useEffect, useState } from "react";
import { FileText, LoaderCircle, Paperclip, ReceiptText, X } from "lucide-react";
import { abrirArchivo, borrarArchivo } from "@/modules/chofer/components/archivos";
import { CampoComprobante, subirComprobante } from "@/modules/ventas/components/comprobante-cobro";
import { TD, TH, useEnvio } from "@/modules/catalogos/components/comun";
import {
  AccionConMotivo,
  Cargando,
  Chip,
  ErrorBase,
  ErrorLectura,
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
  armarRecibo,
  dinero,
  type PorCobrar,
} from "../domain/finanzas.types";
import {
  useAdjuntarComprobanteRecibo,
  useAnularRecibo,
  useCuentasDinero,
  useRecibos,
  useRegistrarRecibo,
} from "../queries/hooks";
import { fecha } from "./comun";

/**
 * Migración 275 · Recibo de cobranza: varias facturas del mismo cliente cobradas juntas.
 * Cada factura queda cobrada (o con cobro parcial) y unida al recibo. La base valida todo.
 */
export function ReciboForm({
  cliente,
  facturas,
  onCerrar,
  onListo,
}: {
  cliente: string;
  facturas: PorCobrar[];
  onCerrar: () => void;
  onListo: (numero: string) => void;
}) {
  const { zonaHoraria } = useSesion();
  const { data: cuentas } = useCuentasDinero();
  const registrar = useRegistrarRecibo();
  const envio = useEnvio();
  const moneda = facturas[0]?.moneda ?? "CLP";
  const activas = (cuentas ?? []).filter(
    (c) => c.activa && c.moneda === moneda,
  );
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [f, setF] = useState(hoyEnZona(zonaHoraria) as string);
  const [obs, setObs] = useState("");
  const [montos, setMontos] = useState<Record<number, string>>({});
  // Migración 279: comprobante de pago (foto o PDF)
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  useEffect(() => {
    if (cuenta === null && activas.length > 0) setCuenta(activas[0]!.id);
  }, [activas, cuenta]);
  const { total, otraMoneda } = armarRecibo(facturas, montos, moneda);
  return (
    <div className="space-y-3 rounded-lg border border-borde bg-superficie p-3">
      <p className="text-sm font-medium">
        Recibo de {cliente} · {facturas.length}{" "}
        {facturas.length === 1 ? "factura" : "facturas"}
      </p>
      {otraMoneda.length > 0 && (
        <p className="text-sm text-error">
          Hay facturas en otra moneda: un recibo va en una sola moneda ({moneda}).
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label={`Entró a (${moneda})`}>
          {activas.length === 0 ? (
            <p className="text-sm text-tinta-suave">
              No hay un banco o caja en {moneda}.
            </p>
          ) : (
            <select
              value={cuenta ?? ""}
              onChange={(e) => setCuenta(Number(e.target.value))}
            >
              {activas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo label="Fecha del recibo">
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
        </Campo>
        <Campo label="Observación">
          <input
            value={obs}
            maxLength={500}
            onChange={(e) => setObs(e.target.value)}
          />
        </Campo>
      </div>
      <table className="w-full text-sm">
        <thead className="border-y border-borde bg-fondo">
          <tr>
            <th className={TH}>Factura</th>
            <th className={cn(TH, "text-right")}>Falta cobrar</th>
            <th className={cn(TH, "text-right")}>Cobra en este recibo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {facturas.map((x) => (
            <tr key={x.id}>
              <td className={cn(TD, "tabular-nums")}>
                {x.numeroFiscal ?? x.numero}
                <span className="block text-xs text-tinta-suave">
                  vence {fecha(x.vence)}
                </span>
              </td>
              <td className={cn(TD, "text-right tabular-nums")}>
                {dinero(x.saldo, x.moneda)}
              </td>
              <td className={cn(TD, "text-right")}>
                <input
                  inputMode="decimal"
                  aria-label={`Monto de ${x.numeroFiscal ?? x.numero}`}
                  className={cn(CONTROL_FILTRO, "w-32 text-right")}
                  value={montos[x.id] ?? String(x.saldo)}
                  onChange={(e) =>
                    setMontos((m) => ({ ...m, [x.id]: e.target.value }))
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={cn(TD, "font-semibold")} colSpan={2}>
              Total del recibo
            </td>
            <td className={cn(TD, "text-right font-semibold tabular-nums")}>
              {dinero(total, moneda)}
            </td>
          </tr>
        </tfoot>
      </table>
      <CampoComprobante archivo={archivo} onArchivo={setArchivo} />
      <ErrorBase error={envio.error} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={registrar.isPending || subiendo}
          onClick={async () => {
            envio.setError(null);
            // El comprobante se sube a la carpeta de la primera factura (la base lo deja en el recibo y en sus facturas)
            let sub: { ruta: string; nombre: string } | null = null;
            if (archivo && facturas[0]) {
              setSubiendo(true);
              try {
                sub = await subirComprobante(facturas[0].id, archivo);
              } catch (e) {
                setSubiendo(false);
                envio.setError({ codigo: "desconocido", mensaje: e instanceof Error ? e.message : "No se pudo subir el comprobante." });
                return;
              }
              setSubiendo(false);
            }
            const r = await registrar.mutateAsync({
              fecha: f,
              cuentaDineroId: cuenta ?? 0,
              observacion: obs,
              facturas: facturas.map((x) => ({
                facturaId: x.id,
                monto: montos[x.id] ?? x.saldo,
              })),
              comprobanteRuta: sub?.ruta ?? null,
              comprobanteNombre: sub?.nombre ?? null,
            });
            if (r.ok) onListo(r.data.numero);
            else {
              void borrarArchivo(sub?.ruta);
              envio.setError(r.error);
            }
          }}
        >
          {(registrar.isPending || subiendo) && <LoaderCircle className="size-4 animate-spin" />}{" "}
          Registrar el recibo
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Pestaña «Recibos»: los recibos de cobranza con sus facturas (por defecto, los últimos 90 días). */
export function Recibos() {
  const puedeAnular = useCan("finanzas.cobros_pagos:transicionar");
  const puedeAdjuntar = useCan("finanzas.cobros_pagos:editar");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const { data, isLoading, isError, error, refetch } = useRecibos(
    desde || null,
    hasta || null,
  );
  const anular = useAnularRecibo();
  const envio = useEnvio();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
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
        <p className="text-sm text-tinta-suave">
          Los recibos se hacen en «Por cobrar», marcando las facturas de un cliente.
        </p>
      </div>
      <ErrorBase error={envio.error} />
      {isLoading ? (
        <Cargando texto="Buscando recibos…" />
      ) : isError || !data ? (
        <ErrorLectura
          texto="No se pudieron leer los recibos."
          onReintentar={() => void refetch()}
          error={error}
        />
      ) : data.length === 0 ? (
        <Vacio
          icono={<ReceiptText className="size-6" />}
          texto="No hay recibos en ese período."
        />
      ) : (
        <div className={cn(TARJETA, "overflow-x-auto")}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Recibo</th>
                <th className={TH}>Cliente</th>
                <th className={TH}>Facturas</th>
                <th className={cn(TH, "text-right")}>Total</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((r) => (
                <tr
                  key={r.id}
                  className={cn(r.estado === "anulado" && "text-tinta-suave")}
                >
                  <td className={cn(TD, "tabular-nums")}>
                    <span className="font-medium">{r.numero}</span>
                    <span className="block text-xs text-tinta-suave">
                      {fecha(r.fecha)} · {r.cuenta}
                    </span>
                  </td>
                  <td className={TD}>
                    {r.cliente}
                    {r.observacion && (
                      <span className="block text-xs text-tinta-suave">
                        {r.observacion}
                      </span>
                    )}
                    <ComprobanteRecibo
                      id={r.id}
                      facturaId={r.facturas[0]?.facturaId ?? null}
                      ruta={r.comprobanteRuta}
                      nombre={r.comprobanteNombre}
                      puede={puedeAdjuntar && r.estado === "vigente"}
                    />
                    {r.estado === "anulado" && (
                      <span className="block text-xs">
                        <Chip tono="neutro">Anulado</Chip> {r.motivoAnulacion}
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    <ul className="space-y-0.5">
                      {r.facturas.map((x) => (
                        <li
                          key={x.facturaId}
                          className={cn(
                            "flex justify-between gap-3 tabular-nums",
                            x.anulado && "line-through",
                          )}
                        >
                          <span>{x.numero}</span>
                          <span>{dinero(x.monto, r.moneda)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={cn(TD, "text-right font-medium tabular-nums")}>
                    {dinero(r.total, r.moneda)}
                  </td>
                  <td className={cn(TD, "text-right")}>
                    {puedeAnular && r.estado === "vigente" && (
                      <AccionConMotivo
                        etiqueta="Anular"
                        icono={<X className="size-4" />}
                        titulo={`Anular ${r.numero}`}
                        explicacion="Se anulan los cobros del recibo: sus facturas vuelven a quedar por cobrar."
                        ocupado={anular.isPending}
                        error={envio.error}
                        onConfirmar={async (motivo) => {
                          const res = await anular.mutateAsync({ id: r.id, motivo });
                          if (!res.ok) envio.setError(res.error);
                          return res.ok;
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

/** Migración 279 · Ver el comprobante del recibo, o adjuntarlo / cambiarlo. */
function ComprobanteRecibo({
  id,
  facturaId,
  ruta,
  nombre,
  puede,
}: {
  id: number;
  facturaId: number | null;
  ruta: string | null;
  nombre: string | null;
  puede: boolean;
}) {
  const adjuntar = useAdjuntarComprobanteRecibo();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ruta && !puede) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-3 text-xs">
      {ruta && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-marca hover:underline"
          onClick={async () => setError(await abrirArchivo(ruta))}
        >
          <FileText className="size-3.5" /> Comprobante{nombre && ` (${nombre})`}
        </button>
      )}
      {puede && facturaId !== null && (
        <label className="inline-flex cursor-pointer items-center gap-1 text-tinta-suave hover:underline">
          {ocupado ? <LoaderCircle className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          {ruta ? "Cambiar" : "Adjuntar comprobante"}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            disabled={ocupado}
            onChange={async (e) => {
              const a = e.target.files?.[0];
              e.target.value = "";
              if (!a) return;
              setOcupado(true);
              setError(null);
              try {
                const sub = await subirComprobante(facturaId, a);
                const r = await adjuntar.mutateAsync({ id, ruta: sub.ruta, nombre: sub.nombre });
                if (!r.ok) {
                  void borrarArchivo(sub.ruta);
                  setError(r.error.mensaje);
                } else if (r.data) void borrarArchivo(r.data);
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo subir el comprobante.");
              } finally {
                setOcupado(false);
              }
            }}
          />
        </label>
      )}
      {error && <span className="text-error">{error}</span>}
    </span>
  );
}
