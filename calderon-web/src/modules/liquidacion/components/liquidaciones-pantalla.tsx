'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Calculator, Check, ChevronLeft, ChevronRight, LoaderCircle, Printer, RefreshCw, Trash2, Undo2, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { nombrePeriodo } from '@/modules/chofer/domain/chofer.types';
import { usePeriodoDe } from '@/modules/chofer/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_ICONO, BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_ESTADO_LIQ, ETIQUETA_TIPO, moverPeriodo, pesos, TIPOS_RENGLON, type EstadoLiquidacion, type TipoRenglon } from '../domain/liquidacion.types';
import {
  useAgregarRenglon,
  useAnularLiquidacion,
  useAprobarLiquidacion,
  useConceptos,
  useLiquidacion,
  usePagarLiquidacion,
  usePeriodoLiquidaciones,
  usePrepararLiquidacion,
  usePrepararLiquidaciones,
  useQuitarRenglon,
  useReabrirLiquidacion,
} from '../queries/hooks';
import { CopiaFirmada } from './copia-firmada';
import { Recibo } from './recibo';
import { SueldoLegal } from './sueldo-legal';

export const TONO_LIQ: Record<EstadoLiquidacion, Tono> = { borrador: 'alerta', aprobada: 'marca', pagada: 'exito', anulada: 'neutro' };

/** Administración › Liquidaciones: las del período, prepararlas, revisarlas, aprobarlas y registrar el pago. */
export function LiquidacionesPantalla() {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('liquidacion.liquidaciones:editar');
  const actual = usePeriodoDe(hoyEnZona(zonaHoraria));
  const [elegido, setElegido] = useState<string | null>(null);
  const periodo = elegido ?? (actual.data ? moverPeriodo(actual.data, -1) : null);
  const { data, isLoading, isError, refetch } = usePeriodoLiquidaciones(periodo);
  const [abierta, setAbierta] = useState<number | null>(null);
  const todas = usePrepararLiquidaciones();
  const envio = useEnvio();
  const [resultado, setResultado] = useState<string | null>(null);

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
              const r = await todas.mutateAsync({ periodo });
              if (!r.ok) return envio.setError(r.error);
              setResultado(
                `${r.data.preparadas} preparada(s).` +
                  (r.data.errores.length > 0 ? ` No se pudo: ${r.data.errores.map((e) => `${e.chofer} (${e.error})`).join('; ')}` : ''),
              );
            }}
          >
            {todas.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Calculator className="size-4" />} Preparar todas
          </button>
        )}
      </div>
      <p className="text-sm text-tinta-suave">
        «Preparar» arma cada borrador con el sueldo fijo, el canon y los km de línea de los viajes cerrados, los conceptos automáticos y los descuentos
        de combustible, ralentí y fondo. Se puede volver a preparar las veces que haga falta mientras sea borrador; lo que se agrega a mano queda.
      </p>
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
                <th className={TH}>Estado</th>
                <th className={cn(TH, 'text-right')}>Remunerativo</th>
                <th className={cn(TH, 'text-right')}>No remunerativo</th>
                <th className={cn(TH, 'text-right')}>Descuentos</th>
                <th className={cn(TH, 'text-right')}>Neto ({data.moneda})</th>
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
                    <Chip tono={TONO_LIQ[l.estado]}>{ETIQUETA_ESTADO_LIQ[l.estado]}</Chip>
                    {l.avisos > 0 && l.estado === 'borrador' && (
                      <span className="ml-1 inline-flex items-center text-alerta" title="Tiene avisos">
                        <AlertTriangle className="size-4" />
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{pesos(l.remunerativo)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{pesos(l.noRemunerativo)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{pesos(l.descuentos)}</td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{pesos(l.neto)}</td>
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
  const { data: l, isLoading } = useLiquidacion(id);
  const preparar = usePrepararLiquidacion();
  const aprobar = useAprobarLiquidacion();
  const pagar = usePagarLiquidacion();
  const reabrir = useReabrirLiquidacion();
  const anular = useAnularLiquidacion();
  const quitar = useQuitarRenglon();
  const envio = useEnvio();
  const [agregar, setAgregar] = useState(false);
  const [pago, setPago] = useState({ fecha: hoyEnZona(zonaHoraria) as string, forma: '', banco: '', numero: '' });

  if (isLoading || !l) return <Cargando texto="Abriendo la liquidación…" />;
  const borrador = l.estado === 'borrador';

  return (
    <section className={cn(TARJETA, 'space-y-4 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-tinta">
            {l.chofer} · {l.numero} <Chip tono={TONO_LIQ[l.estado]}>{ETIQUETA_ESTADO_LIQ[l.estado]}</Chip>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <Recibo l={l} compacto />
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

      <SueldoLegal l={l} />
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
        {borrador && puedeEstado && (
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={aprobar.isPending}
            onClick={() => void envio.enviar(aprobar.mutateAsync({ id: l.id, version: l.version }), () => undefined)}
          >
            {aprobar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Aprobar
          </button>
        )}
        {l.estado === 'aprobada' && puedeEstado && (
          <div className="flex flex-wrap items-end gap-2">
            <Campo label="Fecha del pago">
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
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={pagar.isPending}
              onClick={() => void envio.enviar(pagar.mutateAsync({ id: l.id, fecha: pago.fecha, forma: pago.forma, banco: pago.banco, numero: pago.numero }), () => undefined)}
            >
              Registrar el pago (numera el comprobante de egreso)
            </button>
          </div>
        )}
        {l.estado === 'aprobada' && puedeEstado && (
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
        {borrador && puedeEstado && (
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
