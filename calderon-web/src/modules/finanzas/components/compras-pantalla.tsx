'use client';

import { Fragment, useState } from 'react';
import { Check, FileText, LoaderCircle, Paperclip, Pencil, Plus, Send, ShoppingCart, Sparkles, Star, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { useProveedores } from '@/modules/catalogos/queries/hooks';
import { abrirArchivo, borrarArchivo, subirArchivo } from '@/modules/chofer/components/archivos';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_GASTOS } from '@/shared/ui/pestanas-secciones';
import type { ErrorAccion } from '@/server/actions/result';
import { aNumero } from '../domain/compra-rodado';
import {
  ETIQUETA_ESTADO_COMPRA,
  textoEntrega,
  textoPago,
  textoPesos,
  type CotizacionCompra,
  type EstadoPedidoCompra,
  type PedidoCompra,
} from '../domain/compras';
import { dinero } from '../domain/finanzas.types';
import {
  useAnularCotizacionCompra,
  useAnularPedidoCompra,
  useElevarPedidoCompra,
  useGuardarCotizacionCompra,
  useGuardarPedidoCompra,
  usePedidoCompra,
  usePedidosCompra,
  useResolverPedidoCompra,
} from '../queries/compras.hooks';
import { useCamionesFinanzas } from '../queries/hooks';
import { fecha, MONEDAS } from './comun';
import { ElegirProveedor } from './gasto-ficha';

/** Migración 282: la base que trae los pedidos de compra, las cotizaciones y la orden de compra. */
export const VERSION_COMPRAS = 282;

const TONO_ESTADO: Record<EstadoPedidoCompra, 'neutro' | 'marca' | 'exito' | 'alerta' | 'error'> = {
  cotizando: 'marca',
  para_aprobar: 'alerta',
  aprobado: 'exito',
  rechazado: 'error',
  anulado: 'neutro',
};

const errorDe = (e: unknown): ErrorAccion => ({ codigo: 'desconocido', mensaje: e instanceof Error ? e.message : 'No se pudo subir el archivo.' });

/**
 * Finanzas › Gastos › Compras (migración 282): pedir una compra, cargar las cotizaciones de cada proveedor,
 * ver cuál recomienda Iris y que Gerencia apruebe. Al aprobar, la base arma la orden de compra.
 */
export function ComprasPantalla() {
  const hayBase = useBaseTiene(VERSION_COMPRAS);
  const puede = useCan('finanzas.gastos:editar');
  const [nuevo, setNuevo] = useState(false);
  const [todos, setTodos] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const { data, isLoading, isError, error, refetch } = usePedidosCompra(todos);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Compras" subtitulo="Finanzas" />
        {puede && hayBase && !nuevo && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Nuevo pedido de compra
          </button>
        )}
      </div>
      <Pestanas items={PESTANAS_GASTOS} />
      {!hayBase ? (
        <Vacio icono={<ShoppingCart className="size-6" />} texto="Falta aplicar en la base la migración 282 (compras y cotizaciones)." />
      ) : (
        <>
          <p className="text-sm text-tinta-suave">
            Pedí la compra, cargá la cotización de cada proveedor y mirá cuál recomienda Iris. Gerencia la aprueba y en ese momento sale la
            orden de compra.
          </p>
          {nuevo && (
            <FormPedido
              onCerrar={() => setNuevo(false)}
              onGuardado={(id) => {
                setNuevo(false);
                setAbierto(id);
              }}
            />
          )}
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Ver también los cerrados hace más de 30 días
          </label>
          {isLoading ? (
            <Cargando texto="Buscando pedidos de compra…" />
          ) : isError || !data ? (
            <ErrorLectura texto="No se pudieron leer los pedidos de compra." onReintentar={() => void refetch()} error={error} />
          ) : data.length === 0 ? (
            <Vacio icono={<ShoppingCart className="size-6" />} texto="No hay pedidos de compra." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y border-borde bg-fondo">
                  <tr>
                    <th className={TH}>Pedido</th>
                    <th className={TH}>Qué se compra</th>
                    <th className={TH}>Cotizaciones</th>
                    <th className={TH}>Estado</th>
                    <th className={TH}>Orden de compra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {data.map((p) => (
                    <Fragment key={p.id}>
                      <tr
                        className={cn('cursor-pointer hover:bg-hover', abierto === p.id && 'bg-hover')}
                        onClick={() => setAbierto(abierto === p.id ? null : p.id)}
                      >
                        <td className={TD}>
                          <span className="font-medium text-tinta">{p.numero}</span>
                          <span className="block text-xs text-tinta-suave">{fecha(p.fecha)}</span>
                        </td>
                        <td className={TD}>
                          {p.descripcion}
                          {p.camion && <span className="block text-xs text-tinta-suave">Camión {p.camion}</span>}
                          {p.urgente && <span className="mt-1 block"><Chip tono="error">Urgente</Chip></span>}
                        </td>
                        <td className={TD}>{p.cotizaciones}</td>
                        <td className={TD}>
                          <Chip tono={TONO_ESTADO[p.estado]}>{ETIQUETA_ESTADO_COMPRA[p.estado]}</Chip>
                        </td>
                        <td className={TD}>
                          {p.orden ? (
                            <>
                              <span className="font-medium text-tinta">{p.orden}</span>
                              <span className="block text-xs text-tinta-suave">
                                {p.proveedorElegido} · {dinero(p.total, p.moneda ?? 'CLP')}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {abierto === p.id && (
                        <tr>
                          <td colSpan={5} className="bg-fondo p-3">
                            <DetallePedido id={p.id} onCerrar={() => setAbierto(null)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Alta o corrección del pedido: qué hay que comprar, para qué camión y si es urgente. */
function FormPedido({ pedido, onCerrar, onGuardado }: { pedido?: PedidoCompra; onCerrar: () => void; onGuardado: (id: number) => void }) {
  const { data: camiones } = useCamionesFinanzas();
  const guardar = useGuardarPedidoCompra();
  const envio = useEnvio();
  const [descripcion, setDescripcion] = useState(pedido?.descripcion ?? '');
  const [detalle, setDetalle] = useState(pedido?.detalle ?? '');
  const [camionId, setCamionId] = useState<number | null>(pedido?.camionId ?? null);
  const [urgente, setUrgente] = useState(pedido?.urgente ?? false);
  return (
    <div className={cn(TARJETA, 'space-y-3 p-4')}>
      <h3 className="font-medium text-tinta">{pedido ? `Corregir ${pedido.numero}` : 'Nuevo pedido de compra'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Qué hay que comprar" error={envio.campo('descripcion')}>
          <input value={descripcion} maxLength={200} placeholder="Ej.: pastillas de freno del eje delantero" onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
        <Campo label="Camión (si es para uno)">
          <select value={camionId ?? ''} onChange={(e) => setCamionId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— No es de un camión —</option>
            {(camiones ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.patente}
              </option>
            ))}
          </select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo label="Detalle (opcional)" ayuda="Medidas, marca, número de parte, cantidad…">
            <textarea rows={2} maxLength={2000} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </Campo>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} /> Es urgente (el camión está parado): Iris le da más peso a la entrega
      </label>
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(
              guardar
                .mutateAsync({
                  id: pedido?.id ?? null,
                  version: pedido?.version ?? null,
                  descripcion,
                  detalle: detalle.trim() || null,
                  camionId,
                  urgente,
                })
                .then((r) => {
                  if (r.ok) onGuardado(r.data);
                  return r;
                }),
              () => undefined,
            )
          }
        >
          {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** El pedido abierto: datos, la recomendación de Iris, las cotizaciones y lo que se puede hacer. */
function DetallePedido({ id, onCerrar }: { id: number; onCerrar: () => void }) {
  const { data: p, isLoading, isError, error, refetch } = usePedidoCompra(id);
  const [editando, setEditando] = useState(false);
  const [cotizando, setCotizando] = useState<CotizacionCompra | 'nueva' | null>(null);
  if (isLoading) return <Cargando texto="Abriendo el pedido…" />;
  if (isError || !p) return <ErrorLectura texto="No se pudo abrir el pedido de compra." onReintentar={() => void refetch()} error={error} />;
  const vigentes = p.cotizaciones.filter((c) => !c.anulada);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-tinta">
            {p.numero} · {p.descripcion}
          </h3>
          <p className="text-sm text-tinta-suave">
            {fecha(p.fecha)}
            {p.camion && ` · Camión ${p.camion}`}
            {p.creadoPor && ` · Pidió ${p.creadoPor}`}
            {p.elevadoPor && ` · Mandó a aprobar ${p.elevadoPor}`}
            {p.resueltoPor && ` · Resolvió ${p.resueltoPor}`}
          </p>
          {p.detalle && <p className="mt-1 text-sm whitespace-pre-line text-tinta">{p.detalle}</p>}
          {p.nota && <p className="mt-1 text-sm text-tinta">Nota: {p.nota}</p>}
        </div>
        <div className="flex items-center gap-2">
          {p.urgente && <Chip tono="error">Urgente</Chip>}
          <Chip tono={TONO_ESTADO[p.estado]}>{ETIQUETA_ESTADO_COMPRA[p.estado]}</Chip>
          {p.puedoEditar && !editando && (
            <button type="button" className="text-sm text-marca hover:underline" onClick={() => setEditando(true)}>
              <Pencil className="inline size-3.5" /> Corregir
            </button>
          )}
          <button type="button" aria-label="Cerrar" className="text-tinta-suave hover:text-tinta" onClick={onCerrar}>
            <X className="size-4" />
          </button>
        </div>
      </div>
      {editando && <FormPedido pedido={p} onCerrar={() => setEditando(false)} onGuardado={() => setEditando(false)} />}

      {p.orden && (
        <div className={cn(TARJETA, 'space-y-1 border-exito/40 p-3 text-sm', p.orden.anulada && 'opacity-60')}>
          <p className="font-medium text-tinta">
            Orden de compra {p.orden.numero}
            {p.orden.anulada && ' (anulada)'}
          </p>
          <p className="text-tinta">
            {p.orden.proveedor}
            {p.orden.rut && ` (${p.orden.rut})`} · {dinero(p.orden.total + p.orden.flete, p.orden.moneda)}
            {p.orden.flete > 0 && ` (con ${dinero(p.orden.flete, p.orden.moneda)} de flete)`}
          </p>
          <p className="text-tinta-suave">
            {fecha(p.orden.fecha)} · {textoEntrega(p.orden.entregaInmediata, p.orden.entregaDias)} · {textoPago(p.orden.pagoDias)}
          </p>
          <p className="text-xs text-tinta-suave">La factura del proveedor se carga en Gastos, como siempre.</p>
        </div>
      )}

      {vigentes.length > 0 && <RecomendacionIris p={p} />}

      <Cotizaciones p={p} onEditar={(c) => setCotizando(c)} />
      {p.puedoEditar &&
        (cotizando ? (
          <FormCotizacion
            pedidoId={p.id}
            cotizacion={cotizando === 'nueva' ? null : cotizando}
            onCerrar={() => setCotizando(null)}
          />
        ) : (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setCotizando('nueva')}>
            <Plus className="size-4" /> Cargar una cotización
          </button>
        ))}

      <Acciones p={p} />
    </div>
  );
}

/** Lo que dice Iris: la recomendación explicada, los avisos y cómo pesa cada criterio. */
function RecomendacionIris({ p }: { p: PedidoCompra }) {
  const c = p.comparacion;
  return (
    <div className="space-y-2 rounded-lg border border-marca/30 bg-marca-suave p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-tinta">
        <Sparkles className="size-4 text-marca" /> Iris compara las cotizaciones
      </p>
      {c.explicacion ? <p className="text-tinta">{c.explicacion}</p> : <p className="text-tinta-suave">Todavía no hay una cotización que se pueda comparar.</p>}
      {c.advertencias.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-alerta">
          {c.advertencias.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-tinta-suave">
        Cómo pesa cada cosa: {textoPesos(c.pesos)}. Todo en pesos con el tipo de cambio de hoy, con IVA y flete. Gerencia decide.
      </p>
    </div>
  );
}

/** Tabla de cotizaciones con el puntaje de cada una. */
function Cotizaciones({ p, onEditar }: { p: PedidoCompra; onEditar: (c: CotizacionCompra) => void }) {
  const anular = useAnularCotizacionCompra();
  const envio = useEnvio();
  const [errArchivo, setErrArchivo] = useState<string | null>(null);
  if (p.cotizaciones.length === 0) return <p className="text-sm text-tinta-suave">Todavía no hay cotizaciones cargadas.</p>;
  const porId = new Map(p.comparacion.cotizaciones.map((c) => [c.id, c]));
  const orden = [...p.cotizaciones].sort((a, b) => {
    if (a.anulada !== b.anulada) return a.anulada ? 1 : -1;
    return (porId.get(b.id)?.puntaje ?? -1) - (porId.get(a.id)?.puntaje ?? -1);
  });
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-y border-borde bg-panel">
            <tr>
              <th className={TH}>Proveedor</th>
              <th className={cn(TH, 'text-right')}>Total con IVA</th>
              <th className={TH}>Entrega</th>
              <th className={TH}>Pago</th>
              <th className={TH}>Historial</th>
              <th className={TH}>Puntaje de Iris</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {orden.map((c) => {
              const k = porId.get(c.id);
              const elegida = p.cotizacionElegidaId === c.id;
              return (
                <tr key={c.id} className={cn(c.anulada && 'opacity-50', elegida && 'bg-hover')}>
                  <td className={TD}>
                    <span className="font-medium text-tinta">{c.proveedor}</span>
                    {c.numeroProveedor && <span className="block text-xs text-tinta-suave">Cotización {c.numeroProveedor}</span>}
                    <span className="block text-xs text-tinta-suave">
                      {fecha(c.fecha)}
                      {c.validaHasta && ` · válida hasta ${fecha(c.validaHasta)}`}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {k?.recomendada && (
                        <Chip tono="marca">
                          <Star className="inline size-3" /> Recomendada por Iris
                        </Chip>
                      )}
                      {elegida && <Chip tono="exito">Elegida</Chip>}
                      {k?.vencida && <Chip tono="error">Vencida</Chip>}
                      {c.anulada && <Chip tono="neutro">Anulada</Chip>}
                    </span>
                    {c.garantia && <span className="block text-xs text-tinta-suave">Garantía: {c.garantia}</span>}
                    {c.observacion && <span className="block text-xs text-tinta-suave">{c.observacion}</span>}
                    {c.anulada && c.motivo && <span className="block text-xs text-tinta-suave">Anulada: {c.motivo}</span>}
                  </td>
                  <td className={cn(TD, 'text-right whitespace-nowrap')}>
                    <span className="font-medium text-tinta">{dinero(c.total + c.flete, c.moneda)}</span>
                    {c.flete > 0 && <span className="block text-xs text-tinta-suave">con {dinero(c.flete, c.moneda)} de flete</span>}
                    {c.moneda !== 'CLP' && k?.totalClp !== null && k?.totalClp !== undefined && (
                      <span className="block text-xs text-tinta-suave">= {dinero(k.totalClp)}</span>
                    )}
                  </td>
                  <td className={TD}>{textoEntrega(c.entregaInmediata, c.entregaDias)}</td>
                  <td className={TD}>{textoPago(c.pagoDias)}</td>
                  <td className={TD}>
                    {k ? (k.comprasAnteriores === 0 ? 'Sin compras anteriores' : `${k.comprasAnteriores} compras`) : '—'}
                    {k?.ultimaCompra && <span className="block text-xs text-tinta-suave">Última: {fecha(k.ultimaCompra)}</span>}
                  </td>
                  <td className={TD}>
                    {k?.comparable && k.puntaje !== null ? (
                      <div className="w-36 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-borde">
                            <div className={cn('h-2 rounded-full', k.recomendada ? 'bg-marca' : 'bg-tinta-suave')} style={{ width: `${Math.min(k.puntaje, 100)}%` }} />
                          </div>
                          <span className="w-10 text-right font-medium text-tinta">{k.puntaje.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</span>
                        </div>
                        {k.puntajes && (
                          <p className="text-xs text-tinta-suave">
                            Precio {k.puntajes.precio} · Entrega {k.puntajes.entrega} · Pago {k.puntajes.pago} · Historial {k.puntajes.historial}
                          </p>
                        )}
                      </div>
                    ) : c.anulada ? (
                      '—'
                    ) : (
                      <span className="text-xs text-tinta-suave">No se compara</span>
                    )}
                  </td>
                  <td className={cn(TD, 'space-y-1 text-right')}>
                    {c.archivoRuta && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-marca hover:underline"
                        onClick={async () => setErrArchivo(await abrirArchivo(c.archivoRuta!))}
                      >
                        <FileText className="size-4" /> Ver
                      </button>
                    )}
                    {p.puedoEditar && !c.anulada && (
                      <div className="flex flex-col items-end gap-1">
                        <button type="button" className="text-sm text-marca hover:underline" onClick={() => onEditar(c)}>
                          Corregir
                        </button>
                        <AccionConMotivo
                          etiqueta="Anular"
                          titulo={`Anular la cotización de ${c.proveedor}`}
                          ocupado={anular.isPending}
                          error={envio.error}
                          onConfirmar={async (motivo) => {
                            const r = await anular.mutateAsync({ id: c.id, motivo });
                            if (!r.ok) envio.setError(r.error);
                            return r.ok;
                          }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {errArchivo && <p className="text-sm text-error">{errArchivo}</p>}
    </div>
  );
}

/** Cargar o corregir la cotización de un proveedor. */
function FormCotizacion({ pedidoId, cotizacion, onCerrar }: { pedidoId: number; cotizacion: CotizacionCompra | null; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const { data: proveedores } = useProveedores();
  const guardar = useGuardarCotizacionCompra();
  const envio = useEnvio();
  const c = cotizacion;
  const [proveedorId, setProveedorId] = useState<number | null>(c?.proveedorId ?? null);
  const [numero, setNumero] = useState(c?.numeroProveedor ?? '');
  const [fechaCot, setFechaCot] = useState(c?.fecha ?? (hoyEnZona(zonaHoraria) as string));
  const [valida, setValida] = useState(c?.validaHasta ?? '');
  const [moneda, setMoneda] = useState(c?.moneda ?? 'CLP');
  const [total, setTotal] = useState(c ? String(c.total).replace('.', ',') : '');
  const [flete, setFlete] = useState(c && c.flete > 0 ? String(c.flete).replace('.', ',') : '');
  const [inmediata, setInmediata] = useState(c?.entregaInmediata ?? false);
  const [dias, setDias] = useState(c && !c.entregaInmediata && c.entregaDias !== null ? String(c.entregaDias) : '');
  const [pago, setPago] = useState(c ? String(c.pagoDias) : '0');
  const [garantia, setGarantia] = useState(c?.garantia ?? '');
  const [obs, setObs] = useState(c?.observacion ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const entero = (v: string) => (v.trim() === '' ? null : Math.round(aNumero(v)));

  const confirmar = async () => {
    envio.setError(null);
    if (!proveedorId) return envio.setError({ codigo: 'validacion', mensaje: 'Elegí el proveedor.' });
    let sub: { ruta: string; nombre: string } | null = null;
    if (archivo) {
      setSubiendo(true);
      try {
        const r = await subirArchivo(archivo, `compras/${pedidoId}`);
        sub = { ruta: r.ruta, nombre: r.nombre };
      } catch (e) {
        setSubiendo(false);
        return envio.setError(errorDe(e));
      }
      setSubiendo(false);
    }
    const r = await guardar.mutateAsync({
      id: c?.id ?? null,
      pedidoId,
      proveedorId,
      numeroProveedor: numero.trim() || null,
      fecha: fechaCot,
      validaHasta: valida || null,
      moneda,
      total: aNumero(total),
      flete: aNumero(flete),
      entregaInmediata: inmediata,
      entregaDias: inmediata ? 0 : entero(dias),
      pagoDias: entero(pago) ?? 0,
      garantia: garantia.trim() || null,
      observacion: obs.trim() || null,
      archivoRuta: sub?.ruta ?? null,
      archivoNombre: sub?.nombre ?? null,
    });
    if (!r.ok) {
      if (sub) void borrarArchivo(sub.ruta);
      return envio.setError(r.error);
    }
    onCerrar();
  };

  return (
    <div className={cn(TARJETA, 'space-y-3 p-4')}>
      <h3 className="font-medium text-tinta">{c ? `Corregir la cotización de ${c.proveedor}` : 'Cargar una cotización'}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ElegirProveedor
          proveedores={(proveedores ?? []).map((x) => ({ id: x.id, nombre: x.razonSocial, rut: x.identificadorFiscal }))}
          valor={proveedorId}
          texto=""
          obligatorio
          onCambiar={(idProv) => setProveedorId(idProv)}
        />
        <Campo label="N° de la cotización (opcional)">
          <input value={numero} maxLength={40} onChange={(e) => setNumero(e.target.value)} />
        </Campo>
        <Campo label="Fecha de la cotización">
          <input type="date" value={fechaCot} onChange={(e) => setFechaCot(e.target.value)} />
        </Campo>
        <Campo label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Total con IVA">
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </Campo>
        <Campo label="Flete o envío con IVA (si se cobra aparte)">
          <input inputMode="decimal" value={flete} placeholder="0" onChange={(e) => setFlete(e.target.value)} />
        </Campo>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 pt-6 text-sm text-tinta">
            <input type="checkbox" checked={inmediata} onChange={(e) => setInmediata(e.target.checked)} /> Tiene el repuesto: entrega inmediata
          </label>
        </div>
        {!inmediata && (
          <Campo label="¿En cuántos días entrega?">
            <input inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} />
          </Campo>
        )}
        <Campo label="Días para pagar" ayuda="0 = al contado">
          <input inputMode="numeric" value={pago} onChange={(e) => setPago(e.target.value)} />
        </Campo>
        <Campo label="Válida hasta (opcional)">
          <input type="date" value={valida} onChange={(e) => setValida(e.target.value)} />
        </Campo>
        <Campo label="Garantía (opcional)">
          <input value={garantia} maxLength={120} placeholder="Ej.: 6 meses" onChange={(e) => setGarantia(e.target.value)} />
        </Campo>
        <Campo label="Observación (opcional)">
          <input value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-marca hover:underline">
        <Paperclip className="size-4" />
        <span className="max-w-72 truncate">
          {archivo ? archivo.name : c?.archivoNombre ? `Cambiar el archivo (${c.archivoNombre})` : 'Adjuntar la cotización (foto o PDF)'}
        </span>
        <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </label>
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending || subiendo} onClick={() => void confirmar()}>
          {(guardar.isPending || subiendo) && <LoaderCircle className="size-4 animate-spin" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Mandar a aprobar (Finanzas), aprobar, devolver o rechazar (Gerencia) y anular. */
function Acciones({ p }: { p: PedidoCompra }) {
  const elevar = useElevarPedidoCompra();
  const resolver = useResolverPedidoCompra();
  const anular = useAnularPedidoCompra();
  const envio = useEnvio();
  const comparables = p.comparacion.cotizaciones.filter((c) => c.comparable);
  const [elegida, setElegida] = useState<number | null>(p.comparacion.recomendadaId);
  const [nota, setNota] = useState('');
  const distinta = elegida !== null && elegida !== p.comparacion.recomendadaId;
  const confirmar = async (accion: 'aprobar' | 'devolver' | 'rechazar', motivo: string | null) => {
    const r = await resolver.mutateAsync({ id: p.id, accion, cotizacionId: accion === 'aprobar' ? elegida : null, nota: motivo });
    if (!r.ok) envio.setError(r.error);
    return r.ok;
  };
  if (!p.puedoEditar && !p.puedoResolver && !p.puedoAnular) return null;
  return (
    <div className="space-y-3 border-t border-borde pt-3">
      {p.puedoResolver && (
        <div className="space-y-3 rounded-lg border border-borde bg-panel p-3">
          <p className="font-medium text-tinta">Aprobar la compra</p>
          <div className="space-y-1">
            {comparables.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-tinta">
                <input type="radio" name={`elegida-${p.id}`} checked={elegida === c.id} onChange={() => setElegida(c.id)} />
                {c.proveedor} · {c.totalClp !== null ? dinero(c.totalClp) : '—'} · {c.puntaje?.toLocaleString('es-AR', { maximumFractionDigits: 1 })} puntos
                {c.recomendada && <Chip tono="marca">Recomendada por Iris</Chip>}
              </label>
            ))}
          </div>
          <Campo label={distinta ? '¿Por qué elegís otra que la recomendada? *' : 'Nota (opcional)'}>
            <textarea rows={2} maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={resolver.isPending || elegida === null}
              onClick={() => void confirmar('aprobar', nota.trim() || null)}
            >
              {resolver.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Aprobar y emitir la orden de compra
            </button>
            <AccionConMotivo
              etiqueta="Devolver para cotizar de nuevo"
              titulo="Devolver el pedido"
              explicacion="Vuelve a Finanzas para cargar o corregir cotizaciones."
              ocupado={resolver.isPending}
              error={envio.error}
              onConfirmar={(m) => confirmar('devolver', m)}
            />
            <AccionConMotivo
              etiqueta="Rechazar"
              titulo="Rechazar la compra"
              explicacion="El pedido queda cerrado: no se compra."
              ocupado={resolver.isPending}
              error={envio.error}
              onConfirmar={(m) => confirmar('rechazar', m)}
            />
          </div>
        </div>
      )}
      <ErrorBase error={envio.error} />
      <div className="flex flex-wrap gap-2">
        {p.puedoEditar && (
          <AccionConMotivo
            etiqueta="Mandar a Gerencia para aprobar"
            icono={<Send className="size-4" />}
            titulo="Mandar a aprobar"
            explicacion="Gerencia recibe el aviso con la recomendación de Iris. Mientras tanto no se pueden cambiar las cotizaciones."
            motivoOpcional
            primario
            ocupado={elevar.isPending}
            error={envio.error}
            onConfirmar={async (m) => {
              const r = await elevar.mutateAsync({ id: p.id, nota: m || null });
              if (!r.ok) envio.setError(r.error);
              return r.ok;
            }}
          />
        )}
        {p.puedoAnular && (
          <AccionConMotivo
            etiqueta="Anular el pedido"
            titulo={`Anular ${p.numero}`}
            {...(p.orden && !p.orden.anulada ? { explicacion: `También se anula la orden de compra ${p.orden.numero}.` } : {})}
            ocupado={anular.isPending}
            error={envio.error}
            onConfirmar={async (m) => {
              const r = await anular.mutateAsync({ id: p.id, motivo: m });
              if (!r.ok) envio.setError(r.error);
              return r.ok;
            }}
          />
        )}
      </div>
    </div>
  );
}
