'use client';

import { Fragment, useState } from 'react';
import { ArrowLeftRight, Check, ChevronDown, ChevronRight, ClipboardCheck, LoaderCircle, Package, Pencil, Plus, Receipt, Scale, Warehouse } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  CATEGORIAS,
  ETIQUETA_CATEGORIA,
  ETIQUETA_MOVIMIENTO,
  UNIDADES,
  VERSION_STOCK,
  cant,
  decimalLocal,
  pesos,
  stockEn,
  type Categoria,
  type FacturaInsumos,
  type Insumo,
  type Panol,
  type Unidad,
} from '../../domain/stock.types';
import {
  useAjustarInsumo,
  useCuadreInsumos,
  useFacturasInsumos,
  useGuardarInsumo,
  useGuardarPanol,
  useIngresoCompra,
  useIngresoInsumo,
  useKardexInsumo,
  useStockInsumos,
  useTraspasarInsumo,
} from '../../queries/hooks';

const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
const LABEL = 'space-y-1 text-sm';
const MINI = 'block text-xs text-tinta-suave';
type Pestana = 'stock' | 'facturas' | 'cuadre';

/**
 * Migración 216 · Mantenimiento › Stock de insumos. Stock por pañol con su costo promedio, kardex, ingresos manuales,
 * compras (renglones de las facturas de Finanzas), traspasos, ajustes por inventario y el cuadre con la contabilidad.
 * Todo lo valida y calcula la base.
 */
export function StockPantalla() {
  const hay = useBaseTiene(VERSION_STOCK);
  const { rolesApp } = useSesion();
  const edita = useCan('mantenimiento.stock:editar');
  const gestiona = edita && (rolesApp.includes('mantenimiento_jefe') || rolesApp.includes('ti'));
  const detallaCompras = edita && (gestiona || rolesApp.includes('finanzas'));
  const [pestana, setPestana] = useState<Pestana>('stock');
  const { data, isPending, isError, error, refetch, isFetching } = useStockInsumos(hay);
  const facturas = useFacturasInsumos(hay, true).data ?? [];

  if (!hay) return <Vacio icono={<Package className="size-6" />} texto="Falta aplicar en la base el cambio de Stock de insumos." />;
  if (isPending) return <Cargando texto="Leyendo el stock…" />;
  if (isError) return <ErrorLectura texto="No se pudo leer el stock de insumos." error={error} onReintentar={() => void refetch()} />;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Stock de insumos" subtitulo="Mantenimiento">
        <span className="text-sm text-tinta-suave">
          Valor en stock: <strong className="text-tinta">{pesos(data.valorTotal)}</strong>
        </span>
      </Encabezado>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['stock', 'Stock', null],
            ['facturas', 'Facturas por detallar', facturas.length],
            ['cuadre', 'Cuadre con contabilidad', null],
          ] as const
        ).map(([k, t, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPestana(k)}
            className={cn('rounded-full border px-3 py-1 text-sm', pestana === k ? 'border-marca bg-marca/10 text-marca' : 'border-borde text-tinta-suave hover:bg-hover')}
          >
            {t}
            {n ? ` (${n})` : ''}
          </button>
        ))}
      </div>

      {pestana === 'stock' && <TablaStock insumos={data.insumos} panoles={data.panoles} gestiona={gestiona} cargando={isFetching} />}
      {pestana === 'facturas' && <Facturas insumos={data.insumos} panoles={data.panoles} detalla={detallaCompras} />}
      {pestana === 'cuadre' && <CuadrePanel />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function TablaStock({ insumos, panoles, gestiona, cargando }: { insumos: Insumo[]; panoles: Panol[]; gestiona: boolean; cargando: boolean }) {
  const [buscar, setBuscar] = useState('');
  const [cat, setCat] = useState<'' | Categoria>('');
  const [soloBajo, setSoloBajo] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [panel, setPanel] = useState<'insumo' | 'panoles' | null>(null);
  const b = buscar.trim().toLowerCase();
  const lista = insumos.filter(
    (i) => (!cat || i.categoria === cat) && (!soloBajo || i.bajoMinimo) && (!b || i.codigo.toLowerCase().includes(b) || i.nombre.toLowerCase().includes(b)),
  );
  const bajos = insumos.filter((i) => i.bajoMinimo).length;

  return (
    <div className="space-y-4">
      <section className={cn(TARJETA, 'flex flex-wrap items-center gap-2 p-3')} aria-label="Filtros">
        <input className={cn(CONTROL_FILTRO, 'h-9 min-w-56')} placeholder="Buscar por código o nombre" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select aria-label="Categoría" className={cn(CONTROL_FILTRO, 'h-9')} value={cat} onChange={(e) => setCat(e.target.value as '' | Categoria)}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CATEGORIA[c]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
          <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} /> Bajo el mínimo ({bajos})
        </label>
        {gestiona && (
          <span className="ml-auto flex gap-2">
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'panoles' ? null : 'panoles')}>
              <Warehouse className="size-4" /> Pañoles
            </button>
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setPanel(panel === 'insumo' ? null : 'insumo')}>
              <Plus className="size-4" /> Nuevo insumo
            </button>
          </span>
        )}
      </section>

      {panel === 'insumo' && <FormInsumo insumo={null} onCerrar={() => setPanel(null)} />}
      {panel === 'panoles' && <Panoles panoles={panoles} />}
      {panoles.length === 0 && (
        <p className="text-sm text-alerta">Todavía no hay pañoles: {gestiona ? 'creá al menos uno (botón «Pañoles»)' : 'el Jefe de mantenimiento tiene que crearlos'}.</p>
      )}

      {lista.length === 0 ? (
        <Vacio icono={<Package className="size-6" />} texto={insumos.length === 0 ? 'Todavía no hay insumos cargados.' : 'Ningún insumo con ese filtro.'} />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto', cargando && 'opacity-80')}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className={TH} />
                <th className={TH}>Código</th>
                <th className={TH}>Insumo</th>
                <th className={TH}>Categoría</th>
                <th className={cn(TH, 'text-right')}>Stock</th>
                <th className={cn(TH, 'text-right')}>Mínimo</th>
                <th className={cn(TH, 'text-right')}>Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((i) => (
                <Fragment key={i.id}>
                  <tr className={cn('cursor-pointer hover:bg-hover', !i.activo && 'opacity-60')} onClick={() => setAbierto(abierto === i.id ? null : i.id)}>
                    <td className={TD}>{abierto === i.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className={cn(TD, 'font-mono')}>{i.codigo}</td>
                    <td className={TD}>
                      {i.nombre}
                      {!i.activo && <span className="ml-1 text-xs text-tinta-suave">(de baja)</span>}
                    </td>
                    <td className={TD}>{ETIQUETA_CATEGORIA[i.categoria]}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {cant(i.cantidad)} {i.unidad}
                      {i.bajoMinimo && (
                        <span className="ml-2">
                          <Chip tono="alerta">bajo el mínimo</Chip>
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{i.stockMinimo > 0 ? cant(i.stockMinimo) : '—'}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{pesos(i.valor)}</td>
                  </tr>
                  {abierto === i.id && (
                    <tr>
                      <td colSpan={7} className="bg-fondo p-3">
                        <DetalleInsumo i={i} panoles={panoles} gestiona={gestiona} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-tinta-suave">
        El costo es el promedio ponderado en pesos chilenos: cada compra lo recalcula y lo que se usa en una orden de trabajo sale a ese costo.
      </p>
    </div>
  );
}

function DetalleInsumo({ i, panoles, gestiona }: { i: Insumo; panoles: Panol[]; gestiona: boolean }) {
  const { zonaHoraria } = useSesion();
  const [panol, setPanol] = useState<number | null>(null);
  const [accion, setAccion] = useState<'ingreso' | 'traspaso' | 'ajuste' | 'editar' | null>(null);
  const kardex = useKardexInsumo(i.id, panol);
  const alterna = (a: typeof accion) => setAccion(accion === a ? null : a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {i.porPanol.length === 0 && <span className="text-sm text-tinta-suave">Sin stock en ningún pañol.</span>}
        {i.porPanol.map((p) => (
          <div key={p.panolId} className={cn(TARJETA, 'px-3 py-2 text-sm')}>
            <p className="font-medium text-tinta">{p.panol}</p>
            <p className="tabular-nums text-tinta">
              {cant(p.cantidad)} {i.unidad} · {pesos(p.valor)}
            </p>
            <p className="text-xs text-tinta-suave tabular-nums">costo promedio {formatearNumero(p.costoPromedio, 2)}</p>
          </div>
        ))}
      </div>
      {i.observacion && <p className="text-sm text-tinta-suave">{i.observacion}</p>}

      {gestiona && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => alterna('ingreso')}>
            <Plus className="size-4" /> Ingreso manual
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => alterna('traspaso')}>
            <ArrowLeftRight className="size-4" /> Traspasar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => alterna('ajuste')}>
            <Scale className="size-4" /> Ajustar por inventario
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => alterna('editar')}>
            <Pencil className="size-4" /> Editar
          </button>
        </div>
      )}
      {accion === 'ingreso' && <FormIngreso i={i} panoles={panoles} onCerrar={() => setAccion(null)} />}
      {accion === 'traspaso' && <FormTraspaso i={i} panoles={panoles} onCerrar={() => setAccion(null)} />}
      {accion === 'ajuste' && <FormAjuste i={i} panoles={panoles} onCerrar={() => setAccion(null)} />}
      {accion === 'editar' && <FormInsumo insumo={i} onCerrar={() => setAccion(null)} />}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-tinta">Movimientos</h3>
          <select aria-label="Pañol" className={cn(CONTROL_FILTRO, 'h-8')} value={panol ?? ''} onChange={(e) => setPanol(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todos los pañoles</option>
            {panoles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        {kardex.isPending ? (
          <Cargando texto="Leyendo los movimientos…" />
        ) : kardex.isError ? (
          <ErrorLectura texto="No se pudieron leer los movimientos." error={kardex.error} onReintentar={() => void kardex.refetch()} />
        ) : kardex.data.length === 0 ? (
          <p className="text-sm text-tinta-suave">Sin movimientos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-tinta-suave">
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Movimiento</th>
                  <th className={TH}>Pañol</th>
                  <th className={cn(TH, 'text-right')}>Cantidad</th>
                  <th className={cn(TH, 'text-right')}>Costo unit.</th>
                  <th className={cn(TH, 'text-right')}>Importe</th>
                  <th className={cn(TH, 'text-right')}>Saldo</th>
                  <th className={TH}>Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {kardex.data.map((m) => (
                  <tr key={m.id}>
                    <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{formatearFechaHora(m.fecha, zonaHoraria)}</td>
                    <td className={TD}>{ETIQUETA_MOVIMIENTO[m.tipo]}</td>
                    <td className={TD}>{m.panol}</td>
                    <td className={cn(TD, 'text-right tabular-nums', m.cantidad < 0 && 'text-error')}>
                      {m.cantidad > 0 ? '+' : ''}
                      {cant(m.cantidad)}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(m.costoUnitario, 2)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{pesos(m.importe)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{cant(m.saldoCantidad)}</td>
                    <td className={cn(TD, 'text-xs text-tinta-suave')}>
                      {[m.ot ? `OT ${m.ot}` : null, m.factura ? `${m.factura}${m.proveedor ? ` · ${m.proveedor}` : ''}` : null, m.motivo, m.usuario]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function Botones({ pendiente, onGuardar, onCerrar, texto = 'Guardar' }: { pendiente: boolean; onGuardar: () => void; onCerrar: () => void; texto?: string }) {
  return (
    <div className="flex gap-2">
      <button type="button" className={BOTON_PRIMARIO} disabled={pendiente} onClick={onGuardar}>
        {pendiente ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {texto}
      </button>
      <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
        Cancelar
      </button>
    </div>
  );
}

function SelectPanol({ panoles, valor, onCambiar, etiqueta, insumo }: { panoles: Panol[]; valor: string; onCambiar: (v: string) => void; etiqueta: string; insumo?: Insumo }) {
  return (
    <label className={LABEL}>
      <span className={MINI}>{etiqueta}</span>
      <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={valor} onChange={(e) => onCambiar(e.target.value)}>
        <option value="">Elegí…</option>
        {panoles
          .filter((p) => p.activo || stockEn(insumo, p.id) > 0)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {insumo ? ` (hay ${cant(stockEn(insumo, p.id))})` : ''}
            </option>
          ))}
      </select>
    </label>
  );
}

function FormInsumo({ insumo, onCerrar }: { insumo: Insumo | null; onCerrar: () => void }) {
  const guardar = useGuardarInsumo();
  const envio = useEnvio();
  const [codigo, setCodigo] = useState(insumo?.codigo ?? '');
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [unidad, setUnidad] = useState<Unidad>(insumo?.unidad ?? 'unidad');
  const [categoria, setCategoria] = useState<Categoria>(insumo?.categoria ?? 'repuesto');
  const [minimo, setMinimo] = useState(insumo ? String(insumo.stockMinimo).replace('.', ',') : '');
  const [obs, setObs] = useState(insumo?.observacion ?? '');
  const [activo, setActivo] = useState(insumo?.activo ?? true);
  return (
    <div className="space-y-3 rounded-md border border-marca/40 bg-panel p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={LABEL}>
          <span className={MINI}>Código</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full font-mono uppercase')} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </label>
        <label className={cn(LABEL, 'sm:col-span-2')}>
          <span className={MINI}>Nombre</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className={LABEL}>
          <span className={MINI}>Unidad</span>
          <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          <span className={MINI}>Categoría</span>
          <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          <span className={MINI}>Stock mínimo (avisa debajo)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </label>
        <label className={cn(LABEL, 'sm:col-span-2')}>
          <span className={MINI}>Observación (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        {insumo && (
          <label className="flex items-center gap-1.5 self-end text-sm text-tinta-suave">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
          </label>
        )}
      </div>
      <ErrorBase error={envio.error} />
      <Botones
        pendiente={guardar.isPending}
        onCerrar={onCerrar}
        onGuardar={() =>
          void envio.enviar(
            guardar.mutateAsync({
              id: insumo?.id ?? null,
              codigo,
              nombre,
              unidad,
              categoria,
              stockMinimo: decimalLocal(minimo) ?? 0,
              observacion: obs.trim() || null,
              activo,
            }),
            onCerrar,
          )
        }
      />
    </div>
  );
}

function Panoles({ panoles }: { panoles: Panol[] }) {
  const guardar = useGuardarPanol();
  const envio = useEnvio();
  const [nombre, setNombre] = useState('');
  const [ubic, setUbic] = useState('');
  return (
    <div className="space-y-3 rounded-md border border-marca/40 bg-panel p-3">
      <ul className="divide-y divide-borde text-sm">
        {panoles.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-1.5">
            <span className={cn('font-medium', !p.activo && 'text-tinta-suave line-through')}>{p.nombre}</span>
            <span className="text-tinta-suave">{p.ubicacion ?? ''}</span>
            <button
              type="button"
              className="ml-auto text-xs text-marca hover:underline"
              disabled={guardar.isPending}
              onClick={() => void envio.enviar(guardar.mutateAsync({ id: p.id, nombre: p.nombre, ubicacion: p.ubicacion, activo: !p.activo }), () => undefined)}
            >
              {p.activo ? 'Dar de baja' : 'Reactivar'}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className={LABEL}>
          <span className={MINI}>Nuevo pañol</span>
          <input className={cn(CONTROL_FILTRO, 'h-10')} placeholder="Ej.: Base Mendoza" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className={LABEL}>
          <span className={MINI}>Ubicación (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10')} value={ubic} onChange={(e) => setUbic(e.target.value)} />
        </label>
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(guardar.mutateAsync({ id: null, nombre, ubicacion: ubic.trim() || null, activo: true }), () => {
              setNombre('');
              setUbic('');
            })
          }
        >
          <Plus className="size-4" /> Agregar
        </button>
      </div>
      <ErrorBase error={envio.error} />
    </div>
  );
}

function FormIngreso({ i, panoles, onCerrar }: { i: Insumo; panoles: Panol[]; onCerrar: () => void }) {
  const ingreso = useIngresoInsumo();
  const envio = useEnvio();
  const [panol, setPanol] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('Stock inicial');
  return (
    <div className="space-y-3 rounded-md border border-marca/40 bg-panel p-3">
      <p className="text-xs text-tinta-suave">
        Para el stock que ya había o lo que llegó sin factura. Las compras con factura se cargan desde «Facturas por detallar».
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <SelectPanol panoles={panoles.filter((p) => p.activo)} valor={panol} onCambiar={setPanol} etiqueta="Pañol" />
        <label className={LABEL}>
          <span className={MINI}>Cantidad ({i.unidad})</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </label>
        <label className={LABEL}>
          <span className={MINI}>Costo unitario (CLP, sin IVA)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
        </label>
        <label className={LABEL}>
          <span className={MINI}>Motivo</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      </div>
      <ErrorBase error={envio.error} />
      <Botones
        pendiente={ingreso.isPending}
        onCerrar={onCerrar}
        texto="Ingresar"
        onGuardar={() =>
          void envio.enviar(
            ingreso.mutateAsync({ insumo: i.id, panol: Number(panol) || 0, cantidad: decimalLocal(cantidad) ?? 0, costo: decimalLocal(costo) ?? -1, motivo }),
            onCerrar,
          )
        }
      />
    </div>
  );
}

function FormTraspaso({ i, panoles, onCerrar }: { i: Insumo; panoles: Panol[]; onCerrar: () => void }) {
  const traspasar = useTraspasarInsumo();
  const envio = useEnvio();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  return (
    <div className="space-y-3 rounded-md border border-marca/40 bg-panel p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <SelectPanol panoles={panoles} valor={desde} onCambiar={setDesde} etiqueta="Desde" insumo={i} />
        <SelectPanol panoles={panoles.filter((p) => p.activo)} valor={hasta} onCambiar={setHasta} etiqueta="Hacia" />
        <label className={LABEL}>
          <span className={MINI}>Cantidad ({i.unidad})</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </label>
        <label className={LABEL}>
          <span className={MINI}>Motivo (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      </div>
      <ErrorBase error={envio.error} />
      <Botones
        pendiente={traspasar.isPending}
        onCerrar={onCerrar}
        texto="Traspasar"
        onGuardar={() =>
          void envio.enviar(
            traspasar.mutateAsync({
              insumo: i.id,
              desde: Number(desde) || 0,
              hasta: Number(hasta) || 0,
              cantidad: decimalLocal(cantidad) ?? 0,
              motivo: motivo.trim() || null,
            }),
            onCerrar,
          )
        }
      />
    </div>
  );
}

function FormAjuste({ i, panoles, onCerrar }: { i: Insumo; panoles: Panol[]; onCerrar: () => void }) {
  const ajustar = useAjustarInsumo();
  const envio = useEnvio();
  const [panol, setPanol] = useState('');
  const [contado, setContado] = useState('');
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('Inventario físico');
  const hay = panol ? stockEn(i, Number(panol)) : null;
  const nuevo = decimalLocal(contado);
  return (
    <div className="space-y-3 rounded-md border border-marca/40 bg-panel p-3">
      <p className="text-xs text-tinta-suave">Anotá lo que hay contado en el pañol. La diferencia va a «Otros costos de operación».</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <SelectPanol panoles={panoles} valor={panol} onCambiar={setPanol} etiqueta="Pañol" insumo={i} />
        <label className={LABEL}>
          <span className={MINI}>Contado ({i.unidad})</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} />
        </label>
        {hay !== null && nuevo !== null && nuevo > hay && (
          <label className={LABEL}>
            <span className={MINI}>Costo unitario de lo que aparece (vacío = el promedio)</span>
            <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </label>
        )}
        <label className={LABEL}>
          <span className={MINI}>Motivo</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      </div>
      {hay !== null && nuevo !== null && (
        <p className="text-sm text-tinta">
          Hay {cant(hay)} en el sistema: {nuevo === hay ? 'no hay diferencia.' : `se ${nuevo > hay ? 'suman' : 'restan'} ${cant(Math.abs(nuevo - hay))}.`}
        </p>
      )}
      <ErrorBase error={envio.error} />
      <Botones
        pendiente={ajustar.isPending}
        onCerrar={onCerrar}
        texto="Ajustar"
        onGuardar={() =>
          void envio.enviar(
            ajustar.mutateAsync({ insumo: i.id, panol: Number(panol) || 0, contado: nuevo ?? -1, motivo, costo: decimalLocal(costo) }),
            onCerrar,
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function Facturas({ insumos, panoles, detalla }: { insumos: Insumo[]; panoles: Panol[]; detalla: boolean }) {
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);
  const { data, isPending, isError, error, refetch } = useFacturasInsumos(true, !todas);
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-tinta-suave">
        Son las facturas que Finanzas cargó en Gastos con la cuenta «1.1.13 Repuestos e insumos en bodega». Al detallar qué trae cada una, entra al stock
        con su costo (neto, sin IVA, al tipo de cambio de la factura).
      </p>
      <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
        <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Ver también las ya detalladas
      </label>
      {isPending ? (
        <Cargando texto="Leyendo las facturas…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron leer las facturas de insumos." error={error} onReintentar={() => void refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Receipt className="size-6" />} texto="No hay facturas de insumos por detallar." />
      ) : (
        <ul className="space-y-2">
          {data.map((f) => (
            <li key={f.id} className={cn(TARJETA, 'p-3')}>
              <button type="button" className="flex w-full flex-wrap items-baseline gap-x-3 text-left text-sm" onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                {abierta === f.id ? <ChevronDown className="size-4 self-center" /> : <ChevronRight className="size-4 self-center" />}
                <span className="font-mono font-semibold">{f.numero}</span>
                <span>{f.documento ? `Factura ${f.documento}` : ''}</span>
                <span className="text-tinta-suave">{f.fecha}</span>
                <span>{f.proveedor ?? ''}</span>
                <span className="ml-auto tabular-nums">
                  {f.moneda} {formatearNumero(f.neto, 2)} neto
                  {f.pendiente > 0.01 ? (
                    <span className="ml-2">
                      <Chip tono="alerta">falta detallar {formatearNumero(f.pendiente, 2)}</Chip>
                    </span>
                  ) : (
                    <span className="ml-2">
                      <Chip tono="exito">detallada</Chip>
                    </span>
                  )}
                </span>
              </button>
              {abierta === f.id && f.pendiente > 0.01 && detalla && <DetallarFactura f={f} insumos={insumos} panoles={panoles} onCerrar={() => setAbierta(null)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Renglon {
  insumo: string;
  panol: string;
  cantidad: string;
  neto: string;
}
function DetallarFactura({ f, insumos, panoles, onCerrar }: { f: FacturaInsumos; insumos: Insumo[]; panoles: Panol[]; onCerrar: () => void }) {
  const compra = useIngresoCompra();
  const envio = useEnvio();
  const vacio: Renglon = { insumo: '', panol: panoles.find((p) => p.activo)?.id.toString() ?? '', cantidad: '', neto: '' };
  const [renglones, setRenglones] = useState<Renglon[]>([vacio]);
  const cambiar = (k: number, c: Partial<Renglon>) => setRenglones(renglones.map((r, j) => (j === k ? { ...r, ...c } : r)));
  const suma = renglones.reduce((s, r) => s + (decimalLocal(r.neto) ?? 0), 0);
  const activos = insumos.filter((i) => i.activo);
  return (
    <div className="mt-3 space-y-3 border-t border-borde pt-3">
      {f.descripcion && <p className="text-sm text-tinta-suave">{f.descripcion}</p>}
      {renglones.map((r, k) => {
        const ins = activos.find((i) => String(i.id) === r.insumo);
        return (
          <div key={k} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <select aria-label="Insumo" className={cn(CONTROL_FILTRO, 'h-10')} value={r.insumo} onChange={(e) => cambiar(k, { insumo: e.target.value })}>
              <option value="">Insumo…</option>
              {activos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.codigo} · {i.nombre}
                </option>
              ))}
            </select>
            <select aria-label="Pañol" className={cn(CONTROL_FILTRO, 'h-10')} value={r.panol} onChange={(e) => cambiar(k, { panol: e.target.value })}>
              <option value="">Pañol…</option>
              {panoles
                .filter((p) => p.activo)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
            <input
              aria-label="Cantidad"
              className={cn(CONTROL_FILTRO, 'h-10')}
              inputMode="decimal"
              placeholder={`Cantidad${ins ? ` (${ins.unidad})` : ''}`}
              value={r.cantidad}
              onChange={(e) => cambiar(k, { cantidad: e.target.value })}
            />
            <input
              aria-label="Neto del renglón"
              className={cn(CONTROL_FILTRO, 'h-10')}
              inputMode="decimal"
              placeholder={`Neto ${f.moneda}`}
              value={r.neto}
              onChange={(e) => cambiar(k, { neto: e.target.value })}
            />
            <button
              type="button"
              className="text-xs text-error hover:underline disabled:opacity-40"
              disabled={renglones.length === 1}
              onClick={() => setRenglones(renglones.filter((_, j) => j !== k))}
            >
              Quitar
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setRenglones([...renglones, vacio])}>
          <Plus className="size-4" /> Otro renglón
        </button>
        <span className="tabular-nums text-tinta-suave">
          Suma {f.moneda} {formatearNumero(suma, 2)} de {formatearNumero(f.pendiente, 2)} por detallar
        </span>
      </div>
      <ErrorBase error={envio.error} />
      <Botones
        pendiente={compra.isPending}
        onCerrar={onCerrar}
        texto="Ingresar al stock"
        onGuardar={() =>
          void envio.enviar(
            compra.mutateAsync({
              gasto: f.id,
              renglones: renglones.map((r) => ({
                insumoId: Number(r.insumo) || 0,
                panolId: Number(r.panol) || 0,
                cantidad: decimalLocal(r.cantidad) ?? 0,
                neto: decimalLocal(r.neto) ?? -1,
              })),
            }),
            onCerrar,
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function CuadrePanel() {
  const { data, isPending, isError, error, refetch } = useCuadreInsumos(true);
  if (isPending) return <Cargando texto="Calculando el cuadre…" />;
  if (isError) return <ErrorLectura texto="No se pudo calcular el cuadre." error={error} onReintentar={() => void refetch()} />;
  const tiles: [string, number][] = [
    ['Saldo de la cuenta 1.1.13', data.saldoContable],
    ['Facturas sin detallar', data.facturasSinDetallar],
    ['Valor del stock', data.valorStock],
    ...(data.antesDeLaContabilidad !== 0 ? [['Movido antes del arranque de la contabilidad', data.antesDeLaContabilidad] as [string, number]] : []),
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([t, v]) => (
          <div key={t} className={cn(TARJETA, 'p-4')}>
            <p className="text-xs text-tinta-suave">{t}</p>
            <p className="text-xl font-semibold tabular-nums text-tinta">{pesos(v)}</p>
          </div>
        ))}
      </div>
      <div className={cn(TARJETA, 'flex items-center gap-3 p-4')}>
        <ClipboardCheck className={cn('size-6', data.cuadra ? 'text-exito' : 'text-error')} />
        <p className="text-sm text-tinta">
          {data.cuadra ? 'El stock cuadra con la contabilidad.' : `No cuadra: hay una diferencia de ${pesos(data.diferencia)}.`}
        </p>
      </div>
      <p className="text-xs text-tinta-suave">Saldo de la cuenta − facturas sin detallar = valor del stock.</p>
    </div>
  );
}
