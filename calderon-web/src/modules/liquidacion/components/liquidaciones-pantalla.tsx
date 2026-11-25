'use client';

import { ElegirCuentaDinero } from '@/modules/finanzas/components/elegir-cuenta';
import { TrazaContable } from '@/modules/finanzas/components/traza';
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Calculator, Check, ChevronLeft, ChevronRight, Download, LoaderCircle, Printer, RefreshCw, Trash2, Undo2, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { nombrePeriodo } from '@/modules/chofer/domain/chofer.types';
import { usePeriodoDe } from '@/modules/chofer/queries/hooks';
import { useCan, usePuedeEnBase } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_ICONO, BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { clp } from '../domain/legal.types';
import { ETIQUETA_ESTADO_LIQ, ETIQUETA_TIPO, moverPeriodo, TIPOS_RENGLON, type EstadoLiquidacion, type FilaLiquidacion, type TipoRenglon } from '../domain/liquidacion.types';
import { csvNovedades } from '../domain/novedades';
import {
  useAgregarRenglon,
  useAnularLiquidacion,
  useAprobarLiquidacion,
  useConceptos,
  useLiquidacion,
  useNovedades,
  usePagarLiquidacion,
  usePeriodoLiquidaciones,
  usePrepararLiquidacion,
  usePrepararLiquidaciones,
  useQuitarRenglon,
  useReabrirLiquidacion,
} from '../queries/hooks';
import { CopiaFirmada } from './copia-firmada';
import { PasosLiquidacion } from './pasos-liquidacion';

export const TONO_LIQ: Record<EstadoLiquidacion, Tono> = { borrador: 'alerta', aprobada: 'marca', pagada: 'exito', anulada: 'neutro' };

/** En qué paso está: sin bono de Colaboradores, para revisar, por transferir o transferida. */
const pasoDe = (l: FilaLiquidacion): string =>
  l.estado === 'borrador' ? (l.conBono ? 'Para revisar' : 'Falta el bono') : l.estado === 'pagada' ? 'Transferida' : ETIQUETA_ESTADO_LIQ[l.estado];

const descargar = (texto: string, nombre: string) => {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Administración › Liquidaciones: las del período, prepararlas, revisarlas, aprobarlas y registrar el pago. */
export function LiquidacionesPantalla() {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('liquidacion.liquidaciones:editar');
  const actual = usePeriodoDe(hoyEnZona(zonaHoraria));
  const [elegido, setElegido] = useState<string | null>(null);
  const periodo = elegido ?? (actual.data ? moverPeriodo(actual.data, -1) : null);
  const { data, isLoading, isError, refetch } = usePeriodoLiquidaciones(periodo);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const todas = usePrepararLiquidaciones((hechas, total) => setAvance({ hechas, total }));
  const envio = useEnvio();
  const [resultado, setResultado] = useState<string | null>(null);
  const novedades = useNovedades();
  const porTransferir = (data?.liquidaciones ?? []).filter((l) => l.estado === 'aprobada');

  return (
    <div className="space-y-4">
      <Encabezado titulo="Liquidaciones" subtitulo="Administración" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={BOTON_ICONO} aria-label="Período anterior" disabled={!periodo} onClick={() => periodo && setElegido(moverPeriodo(periodo, -1))}>
          <ChevronLeft className="size-4" />
        </button>
        <div>
          <p className="font-semibold text-tinta">{periodo ? nombrePeriodo(periodo) : '…'}</p>
          {data && (
            <p className="text-xs text-tinta-suave">
              Del {formatearFechaDia(data.desde)} al {formatearFechaDia(data.hasta)}
            </p>
          )}
        </div>
        <button type="button" className={BOTON_ICONO} aria-label="Período siguiente" disabled={!periodo} onClick={() => periodo && setElegido(moverPeriodo(periodo, 1))}>
          <ChevronRight className="size-4" />
        </button>
        {puedeEditar && periodo && (
          <button
            type="button"
            className={cn(BOTON_PRIMARIO, 'ml-auto')}
            disabled={todas.isPending}
            onClick={async () => {
              setResultado(null);
              envio.setError(null);
              setAvance(null);
              const r = await todas.mutateAsync({ periodo });
              setAvance(null);
              if (!r.ok) return envio.setError(r.error);
              setResultado(
                `${r.data.preparadas} preparada(s).` +
                  (r.data.errores.length > 0 ? ` No se pudo: ${r.data.errores.map((e) => `${e.chofer} (${e.error})`).join('; ')}` : ''),
              );
            }}
          >
            {todas.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Calculator className="size-4" />}{' '}
            {todas.isPending && avance && avance.total > 0 ? `Preparando ${avance.hechas} de ${avance.total}…` : 'Preparar todas'}
          </button>
        )}
        {periodo && data && data.liquidaciones.length > 0 && (
          <button
            type="button"
            className={cn(BOTON_SECUNDARIO, !puedeEditar && 'ml-auto')}
            disabled={novedades.isPending}
            onClick={async () => {
              envio.setError(null);
              try {
                const n = await novedades.mutateAsync(periodo);
                descargar(csvNovedades(n, nombrePeriodo(periodo)), `novedades-${periodo.slice(0, 7)}.csv`);
              } catch (e) {
                envio.setError({ codigo: 'desconocido', mensaje: e instanceof Error ? e.message : 'No se pudieron leer las novedades.' });
              }
            }}
          >
            {novedades.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} Novedades para Colaboradores
          </button>
        )}
      </div>
      <p className="text-sm text-tinta-suave">
        1) «Preparar» arma las novedades (básico, bono por viaje, viáticos por día trabajado, adicional por km y bono por desempeño) y los descuentos.
        Descargá las novedades y mandáselas a Colaboradores. 2) Cuando vuelve el bono de sueldo, cargalo en cada chofer con el PDF. 3) Cerrá la
        liquidación: queda «Por transferir» hasta que se registra la transferencia.
      </p>
      {porTransferir.length > 0 && (
        <p className="rounded-lg bg-marca-suave px-4 py-2 text-sm font-medium text-marca">
          {porTransferir.length} por transferir · {clp(porTransferir.reduce((a, l) => a + (l.aPagar ?? 0), 0))} {data?.moneda}
        </p>
      )}
      <ErrorBase error={envio.error} />
      {resultado && <p className="text-sm text-tinta">{resultado}</p>}

      {isLoading || !periodo ? (
        <Cargando texto="Leyendo las liquidaciones…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudieron leer las liquidaciones." onReintentar={() => void refetch()} />
      ) : data.liquidaciones.length === 0 ? (
        <Vacio icono={<Calculator className="size-6" />} texto="Todavía no hay liquidaciones en este período. Tocá «Preparar todas»." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Chofer</th>
                <th className={TH}>Paso</th>
                <th className={cn(TH, 'text-right')}>Imponible</th>
                <th className={cn(TH, 'text-right')}>No imponible</th>
                <th className={cn(TH, 'text-right')}>Descuentos</th>
                <th className={cn(TH, 'text-right')}>A transferir ({data.moneda})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.liquidaciones.map((l) => (
                <tr key={l.id} className={cn('cursor-pointer hover:bg-hover', abierta === l.id && 'bg-marca-suave/40')} onClick={() => setAbierta(abierta === l.id ? null : l.id)}>
                  <td className={TD}>
                    <span className="font-medium text-tinta">{l.chofer}</span>
                    <span className="block text-xs text-tinta-suave">{l.numero}</span>
                  </td>
                  <td className={TD}>
                    <Chip tono={TONO_LIQ[l.estado]}>{pasoDe(l)}</Chip>
                    {l.avisos > 0 && l.estado === 'borrador' && (
                      <span className="ml-1 inline-flex items-center text-alerta" title="Tiene avisos">
                        <AlertTriangle className="size-4" />
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{clp(l.remunerativo)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{clp(l.noRemunerativo)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{clp(l.descuentos)}</td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{l.aPagar === null ? '—' : clp(l.aPagar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abierta && periodo && <FichaLiquidacion id={abierta} periodo={periodo} onCerrar={() => setAbierta(null)} />}
    </div>
  );
}

function FichaLiquidacion({ id, periodo, onCerrar }: { id: number; periodo: string; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('liquidacion.liquidaciones:editar');
  const puedeEstado = useCan('liquidacion.liquidaciones:transicionar');
  // S4: Finanzas registra el pago; aprobar, reabrir y anular lo deja la base solo a RR. HH. o TI
  const baseResuelve = usePuedeEnBase('resolverLiquidacion');
  const resuelve = puedeEstado && baseResuelve;
  const { data: l, isLoading } = useLiquidacion(id);
  const preparar = usePrepararLiquidacion();
  const aprobar = useAprobarLiquidacion();
  const pagar = usePagarLiquidacion();
  const reabrir = useReabrirLiquidacion();
  const anular = useAnularLiquidacion();
  const quitar = useQuitarRenglon();
  const envio = useEnvio();
  const [agregar, setAgregar] = useState(false);
  const [pago, setPago] = useState({ fecha: hoyEnZona(zonaHoraria) as string, forma: 'Transferencia', banco: '', numero: '', cuentaId: null as number | null });

  if (isLoading || !l) return <Cargando texto="Abriendo la liquidación…" />;
  const borrador = l.estado === 'borrador';

  return (
    <section className={cn(TARJETA, 'space-y-4 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-tinta">
            {l.chofer} · {l.numero} <Chip tono={TONO_LIQ[l.estado]}>{l.estado === 'pagada' ? 'Transferida' : ETIQUETA_ESTADO_LIQ[l.estado]}</Chip>
          </h2>
          {l.motivo && <p className="text-xs text-tinta-suave">Último motivo: {l.motivo}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {l.estado !== 'anulada' && (
            <Link href={`/rrhh/liquidaciones/${l.id}/recibo`} target="_blank" className="inline-flex items-center gap-1 text-marca hover:underline">
              <Printer className="size-4" /> {l.estado === 'borrador' ? 'Vista previa de los papeles' : 'Papeles para firmar'}
            </Link>
          )}
          <button type="button" className="text-tinta-suave hover:underline" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>

      {borrador && l.avisos.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-alerta-suave p-3 text-sm text-alerta">
          {l.avisos.map((a) => (
            <li key={a} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a}
            </li>
          ))}
        </ul>
      )}

      <PasosLiquidacion l={l} />
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        {borrador && puedeEditar && (
          <div className="space-y-2 lg:w-64">
            <p className="text-xs font-semibold text-tinta-suave uppercase">Agregados a mano</p>
            {l.renglones.filter((r) => r.origen === 'manual').length === 0 && <p className="text-xs text-tinta-suave">Ninguno.</p>}
            {l.renglones
              .filter((r) => r.origen === 'manual')
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{r.descripcion}</span>
                  <button
                    type="button"
                    aria-label="Quitar"
                    className="text-tinta-suave hover:text-error"
                    disabled={quitar.isPending}
                    onClick={() => void envio.enviar(quitar.mutateAsync({ id: r.id }), () => undefined)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      <CopiaFirmada l={l} />

      {agregar && <FormRenglon liquidacionId={l.id} onListo={() => setAgregar(false)} />}
      <ErrorBase error={envio.error} />

      <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
        {borrador && puedeEditar && (
          <>
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={preparar.isPending}
              onClick={() => void envio.enviar(preparar.mutateAsync({ choferId: l.choferId, periodo }), () => undefined)}
            >
              {preparar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Volver a preparar
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAgregar(!agregar)}>
              Agregar un renglón
            </button>
          </>
        )}
        {borrador && resuelve && (
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={aprobar.isPending}
            onClick={() => void envio.enviar(aprobar.mutateAsync({ id: l.id, version: l.version }), () => undefined)}
          >
            {aprobar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Cerrar y dejar por transferir
          </button>
        )}
        {l.estado === 'aprobada' && puedeEstado && (
          <div className="flex flex-wrap items-end gap-2">
            <Campo label="Fecha de la transferencia">
              <input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} />
            </Campo>
            <Campo label="Forma (opcional)">
              <input value={pago.forma} maxLength={120} placeholder="Transferencia, cheque…" onChange={(e) => setPago({ ...pago, forma: e.target.value })} />
            </Campo>
            <Campo label="Banco (opcional)">
              <input value={pago.banco} maxLength={80} onChange={(e) => setPago({ ...pago, banco: e.target.value })} />
            </Campo>
            <Campo label="N° de cheque u operación">
              <input value={pago.numero} maxLength={40} onChange={(e) => setPago({ ...pago, numero: e.target.value })} />
            </Campo>
            <ElegirCuentaDinero valor={pago.cuentaId} onCambio={(c) => setPago({ ...pago, cuentaId: c })} />
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={pagar.isPending}
              onClick={() => void envio.enviar(pagar.mutateAsync({ id: l.id, fecha: pago.fecha, forma: pago.forma, banco: pago.banco, numero: pago.numero, cuentaId: pago.cuentaId }), () => undefined)}
            >
              Registrar la transferencia (numera el comprobante de egreso)
            </button>
          </div>
        )}
        {l.estado === 'aprobada' && resuelve && (
          <AccionConMotivo
            etiqueta="Reabrir"
            icono={<Undo2 className="size-4" />}
            titulo="Reabrir la liquidación"
            explicacion="Vuelve a borrador para corregirla. El chofer deja de verla hasta que se apruebe de nuevo."
            ocupado={reabrir.isPending}
            error={envio.error}
            onConfirmar={async (motivo) => {
              const r = await reabrir.mutateAsync({ id: l.id, motivo });
              if (!r.ok) envio.setError(r.error);
              return r.ok;
            }}
          />
        )}
        {borrador && resuelve && (
          <AccionConMotivo
            etiqueta="Anular"
            icono={<X className="size-4" />}
            titulo="Anular la liquidación"
            explicacion="Por ejemplo, si el chofer no trabajó en el período. Después se puede volver a preparar."
            ocupado={anular.isPending}
            error={envio.error}
            onConfirmar={async (motivo) => {
              const r = await anular.mutateAsync({ id: l.id, motivo });
              if (!r.ok) envio.setError(r.error);
              else onCerrar();
              return r.ok;
            }}
          />
        )}
      </div>
      {l.estado !== 'borrador' && <TrazaContable origen="liquidacion" id={l.id} />}
    </section>
  );
}

function FormRenglon({ liquidacionId, onListo }: { liquidacionId: number; onListo: () => void }) {
  const conceptos = useConceptos();
  const agregar = useAgregarRenglon();
  const envio = useEnvio();
  const [v, setV] = useState<{ conceptoId: string; tipo: TipoRenglon | ''; descripcion: string; importe: string }>({
    conceptoId: '',
    tipo: '',
    descripcion: '',
    importe: '',
  });
  const activos = (conceptos.data ?? []).filter((c) => c.activo);
  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-4 sm:grid-cols-4">
      <Campo label="Concepto de la lista (opcional)">
        <select value={v.conceptoId} onChange={(e) => setV({ ...v, conceptoId: e.target.value })}>
          <option value="">Otro (escribilo)</option>
          {activos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {ETIQUETA_TIPO[c.tipo]}
            </option>
          ))}
        </select>
      </Campo>
      {!v.conceptoId && (
        <Campo label="Tipo" error={envio.campo('tipo')}>
          <select value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as TipoRenglon })}>
            <option value="">Elegí…</option>
            {TIPOS_RENGLON.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <Campo label={v.conceptoId ? 'Detalle (opcional)' : 'Qué es'} error={envio.campo('descripcion')}>
        <input value={v.descripcion} maxLength={200} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Ej.: premio por puntualidad" />
      </Campo>
      <Campo label="Importe" error={envio.campo('importe')}>
        <input inputMode="decimal" value={v.importe} onChange={(e) => setV({ ...v, importe: e.target.value })} />
      </Campo>
      <div className="sm:col-span-4">
        <ErrorBase error={envio.error} />
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={agregar.isPending}
          onClick={() =>
            void envio.enviar(
              agregar.mutateAsync({
                liquidacionId,
                conceptoId: v.conceptoId ? Number(v.conceptoId) : null,
                tipo: v.tipo || null,
                descripcion: v.descripcion,
                importe: v.importe,
              }),
              onListo,
            )
          }
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
