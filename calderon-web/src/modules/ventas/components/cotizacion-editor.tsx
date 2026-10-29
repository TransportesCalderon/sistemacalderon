'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Copy, LoaderCircle, Plus, Printer, Save, Send, Trash2, X } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { SelectTipoCarga } from '@/modules/catalogos/components/tipos-carga';
import { ETIQUETA_UNIDAD, usd, type Adicional, type Cotizacion, type Linea } from '../domain/ventas.types';
import {
  useAnularCotizacion,
  useCotizacion,
  useDuplicarCotizacion,
  useEmpresa,
  useEmpresas,
  useEnviarCotizacion,
  useGuardarCotizacion,
  useResponderCotizacion,
  useSugerencia,
  useTarifario,
} from '../queries/hooks';
import { ChipCotizacion } from './comun';

/** Un renglón tal como se edita (todo texto; la base lo valida y lo calcula). */
interface Fila {
  clave: string;
  tipo: 'flete' | 'adicional';
  lineaId: string;
  adicionalCodigo: string;
  descripcion: string;
  tipoOperacion: string;
  tipoContenedor: string;
  unidad: string;
  cantidad: string;
  viajes: string;
  vueltaVacia: boolean;
  precioUsd: string;
}
let n = 0;
const nueva = (tipo: Fila['tipo'], extra: Partial<Fila> = {}): Fila => ({
  clave: `f${++n}`,
  tipo,
  lineaId: '',
  adicionalCodigo: '',
  descripcion: '',
  tipoOperacion: '',
  tipoContenedor: '',
  unidad: tipo === 'flete' ? 'viaje' : 'fijo',
  cantidad: '1',
  viajes: '1',
  vueltaVacia: false,
  precioUsd: '',
  ...extra,
});
const aTexto = (v: number | null) => (v === null ? '' : String(v));

/** Ventas › Cotización: nueva o una existente. En borrador se edita; después solo cambia de estado. */
export function CotizacionEditor({ id, empresaInicial }: { id: number | null; empresaInicial: number | null }) {
  const router = useRouter();
  const { data: c, isLoading, isError, error, refetch } = useCotizacion(id);
  const tarifario = useTarifario();
  const empresas = useEmpresas(null, null);
  const puedeEditar = useCan('ventas.cotizaciones:editar');
  const puedeEstado = useCan('ventas.cotizaciones:transicionar');
  const guardar = useGuardarCotizacion();
  const envio = useEnvio();

  const [empresaId, setEmpresaId] = useState<string>(empresaInicial ? String(empresaInicial) : '');
  const { zonaHoraria } = useSesion();
  const [cab, setCab] = useState({ contactoId: '', oportunidadId: '', fecha: hoyEnZona(zonaHoraria) as string, validezDias: '', condiciones: '', observacion: '' });
  const [filas, setFilas] = useState<Fila[]>([nueva('flete')]);

  useEffect(() => {
    if (!c) return;
    setEmpresaId(String(c.empresaId));
    setCab({
      contactoId: c.contactoId ? String(c.contactoId) : '',
      oportunidadId: c.oportunidadId ? String(c.oportunidadId) : '',
      fecha: c.fecha,
      validezDias: String(c.validezDias),
      condiciones: c.condiciones ?? '',
      observacion: c.observacion ?? '',
    });
    setFilas(
      c.renglones.map((r) =>
        nueva(r.tipo, {
          lineaId: aTexto(r.lineaId),
          adicionalCodigo: r.adicionalCodigo ?? '',
          descripcion: r.descripcion,
          tipoOperacion: r.tipoOperacion ?? '',
          tipoContenedor: r.tipoContenedor ?? '',
          unidad: r.unidad,
          cantidad: String(r.cantidad),
          viajes: aTexto(r.viajes),
          vueltaVacia: r.vueltaVacia,
          precioUsd: String(r.precioUsd),
        }),
      ),
    );
  }, [c]);

  // Condiciones generales por defecto en una nueva
  useEffect(() => {
    if (!id && tarifario.data && !cab.condiciones && !cab.validezDias) {
      setCab((x) => ({ ...x, condiciones: tarifario.data.parametros.condiciones, validezDias: String(tarifario.data.parametros.validezDias) }));
    }
  }, [id, tarifario.data, cab.condiciones, cab.validezDias]);

  const empresa = useEmpresa(empresaId ? Number(empresaId) : null);
  const borrador = !c || c.estado === 'borrador';
  const editable = borrador && puedeEditar;

  if (id && isLoading) return <Cargando texto="Abriendo la cotización…" />;
  if (id && (isError || !c)) return <ErrorLectura texto="No se pudo leer la cotización." onReintentar={() => void refetch()} error={error} />;

  const cambiar = (clave: string, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  const quitar = (clave: string) => setFilas((fs) => fs.filter((f) => f.clave !== clave));

  const enviarGuardar = async () => {
    envio.setError(null);
    const r = await guardar.mutateAsync({
      id: c?.id ?? null,
      version: c?.version ?? null,
      empresaId: Number(empresaId) || 0,
      contactoId: cab.contactoId ? Number(cab.contactoId) : null,
      oportunidadId: cab.oportunidadId ? Number(cab.oportunidadId) : null,
      fecha: cab.fecha || null,
      validezDias: cab.validezDias ? Number(cab.validezDias) : null,
      condiciones: cab.condiciones,
      observacion: cab.observacion,
      renglones: filas.map((f) => ({
        tipo: f.tipo,
        lineaId: f.lineaId ? Number(f.lineaId) : null,
        adicionalCodigo: f.adicionalCodigo || null,
        descripcion: f.descripcion,
        tipoOperacion: (f.tipoOperacion || null) as 'exportacion' | null,
        tipoContenedor: f.tipoContenedor,
        unidad: f.unidad,
        cantidad: f.cantidad,
        viajes: f.viajes,
        vueltaVacia: f.vueltaVacia,
        precioUsd: f.precioUsd,
      })),
    });
    if (!r.ok) return envio.setError(r.error);
    if (!c) router.replace(`/cotizaciones/${r.data}`);
  };

  return (
    <div className="space-y-4">
      <Link href="/cotizaciones" className="inline-flex items-center gap-1 text-sm text-marca hover:underline">
        <ChevronLeft className="size-4" /> Cotizaciones
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-tinta">
          {c ? c.numero : 'Nueva cotización'} {c && <ChipCotizacion estado={c.estado} />}
        </h1>
        {c && (
          <Link href={`/ventas/cotizaciones/${c.id}/imprimir`} target="_blank" className="inline-flex items-center gap-1 text-sm text-marca hover:underline">
            <Printer className="size-4" /> {c.estado === 'borrador' ? 'Vista previa del PDF' : 'PDF para el cliente'}
          </Link>
        )}
      </div>
      {c?.motivo && <p className="text-sm text-tinta-suave">Motivo: {c.motivo}</p>}

      <section className={cn(TARJETA, 'grid gap-3 p-4 sm:grid-cols-3')}>
        <Campo label="Empresa">
          <select value={empresaId} disabled={!editable || !!c} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Elegí…</option>
            {(empresas.data ?? [])
              .filter((e) => !e.descartada || String(e.id) === empresaId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                  {e.clienteId ? '' : ' (prospecto)'}
                </option>
              ))}
          </select>
        </Campo>
        <Campo label="Contacto">
          <select value={cab.contactoId} disabled={!editable} onChange={(e) => setCab({ ...cab, contactoId: e.target.value })}>
            <option value="">—</option>
            {(empresa.data?.contactos ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Negocio">
          <select value={cab.oportunidadId} disabled={!editable} onChange={(e) => setCab({ ...cab, oportunidadId: e.target.value })}>
            <option value="">—</option>
            {(empresa.data?.negocios ?? [])
              .filter((x) => x.etapa !== 'perdido')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.titulo}
                </option>
              ))}
          </select>
        </Campo>
        <Campo label="Fecha">
          <input type="date" value={cab.fecha} disabled={!editable} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} />
        </Campo>
        <Campo label="Validez (días)">
          <input inputMode="numeric" value={cab.validezDias} disabled={!editable} onChange={(e) => setCab({ ...cab, validezDias: e.target.value })} />
        </Campo>
        {c && <p className="self-end pb-2 text-sm text-tinta-suave">Vence el {formatearFechaDia(c.vence)}</p>}
      </section>

      <section className={cn(TARJETA, 'space-y-3 p-4')}>
        <h2 className="font-semibold text-tinta">Fletes y adicionales (USD)</h2>
        {filas.map((f) =>
          f.tipo === 'flete' ? (
            <FilaFlete
              key={f.clave}
              f={f}
              lineas={tarifario.data?.lineas ?? []}
              empresaId={empresaId ? Number(empresaId) : null}
              editable={editable}
              guardado={c?.renglones.find((r) => r.tipo === 'flete' && String(r.lineaId) === f.lineaId) ?? null}
              onCambiar={(x) => cambiar(f.clave, x)}
              onQuitar={() => quitar(f.clave)}
            />
          ) : (
            <FilaAdicional
              key={f.clave}
              f={f}
              adicionales={tarifario.data?.adicionales ?? []}
              editable={editable}
              onCambiar={(x) => cambiar(f.clave, x)}
              onQuitar={() => quitar(f.clave)}
            />
          ),
        )}
        {editable && (
          <div className="flex gap-3 text-sm">
            <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setFilas([...filas, nueva('flete')])}>
              <Plus className="size-4" /> Flete
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setFilas([...filas, nueva('adicional')])}>
              <Plus className="size-4" /> Adicional
            </button>
          </div>
        )}
      </section>

      {c && <Totales c={c} />}

      <section className={cn(TARJETA, 'grid gap-3 p-4 sm:grid-cols-2')}>
        <Campo label="Condiciones (salen en el PDF)">
          <textarea className="h-28 py-2" value={cab.condiciones} disabled={!editable} onChange={(e) => setCab({ ...cab, condiciones: e.target.value })} />
        </Campo>
        <Campo label="Nota interna (no sale en el PDF)">
          <textarea className="h-28 py-2" value={cab.observacion} disabled={!editable} onChange={(e) => setCab({ ...cab, observacion: e.target.value })} />
        </Campo>
      </section>

      <ErrorBase error={envio.error} />
      <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
        {editable && (
          <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending} onClick={() => void enviarGuardar()}>
            {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar y calcular
          </button>
        )}
        {c && puedeEstado && <Acciones c={c} />}
      </div>
    </div>
  );
}

function FilaFlete({
  f,
  lineas,
  empresaId,
  editable,
  guardado,
  onCambiar,
  onQuitar,
}: {
  f: Fila;
  lineas: Linea[];
  empresaId: number | null;
  editable: boolean;
  guardado: { costoUsd: number | null; tarifaUsd: number | null; importeUsd: number } | null;
  onCambiar: (x: Partial<Fila>) => void;
  onQuitar: () => void;
}) {
  const s = useSugerencia(editable && f.lineaId ? Number(f.lineaId) : null, empresaId, f.unidad, f.tipoContenedor.trim() || null, f.vueltaVacia);
  const sug = s.data;
  const costoViaje = sug?.costo?.costoUsd ?? null;
  return (
    <div className="space-y-2 rounded-lg border border-borde p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(12rem,2fr)_8rem_6rem_6rem_7rem_7rem_auto]">
        <Campo label="Ruta">
          <select value={f.lineaId} disabled={!editable} onChange={(e) => onCambiar({ lineaId: e.target.value })}>
            <option value="">Elegí…</option>
            {lineas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
                {l.km ? ` (${l.km.toLocaleString('es-AR')} km)` : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Precio">
          <select value={f.unidad} disabled={!editable} onChange={(e) => onCambiar({ unidad: e.target.value })}>
            <option value="viaje">por viaje</option>
            <option value="tonelada">por tonelada</option>
            <option value="kilo">por kilo</option>
          </select>
        </Campo>
        <Campo label={f.unidad === 'viaje' ? 'Viajes' : f.unidad === 'tonelada' ? 'Toneladas' : 'Kilos'}>
          <input inputMode="decimal" value={f.cantidad} disabled={!editable} onChange={(e) => onCambiar({ cantidad: e.target.value })} />
        </Campo>
        {f.unidad !== 'viaje' ? (
          <Campo label="En viajes">
            <input inputMode="decimal" value={f.viajes} disabled={!editable} onChange={(e) => onCambiar({ viajes: e.target.value })} />
          </Campo>
        ) : (
          <span />
        )}
        <Campo label="Tipo de carga">
          <SelectTipoCarga value={f.tipoContenedor} disabled={!editable} vacio="Cualquiera" onValor={(v) => onCambiar({ tipoContenedor: v })} />
        </Campo>
        <Campo label="Precio USD">
          <input inputMode="decimal" value={f.precioUsd} disabled={!editable} onChange={(e) => onCambiar({ precioUsd: e.target.value })} />
        </Campo>
        {editable ? (
          <button type="button" aria-label="Quitar" className="self-end pb-2 text-tinta-suave hover:text-error" onClick={onQuitar}>
            <Trash2 className="size-4" />
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta-suave">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="size-3.5 accent-marca" checked={f.vueltaVacia} disabled={!editable} onChange={(e) => onCambiar({ vueltaVacia: e.target.checked })} />
          Vuelve vacío (el costo cuenta ida y vuelta)
        </label>
        <select
          aria-label="Tipo de operación"
          className="h-7 rounded-md border border-borde bg-panel px-1 text-xs"
          value={f.tipoOperacion}
          disabled={!editable}
          onChange={(e) => onCambiar({ tipoOperacion: e.target.value })}
        >
          <option value="">Tipo de operación…</option>
          <option value="exportacion">Exportación</option>
          <option value="importacion">Importación</option>
          <option value="nacional">Nacional</option>
          <option value="round_trip">Round trip</option>
        </select>
        {editable && s.isFetching && <LoaderCircle className="size-3.5 animate-spin" />}
        {editable && sug && (
          <>
            <span>
              Costo estimado: <b className="text-tinta">{costoViaje !== null ? `${usd(costoViaje)} por viaje` : (sug.costo?.falta ?? '—')}</b>
            </span>
            {sug.tarifaUsd !== null && (
              <span>
                Tarifa {sug.tarifaDe === 'cliente' ? 'del cliente' : 'general'}: <b className="text-tinta">{usd(sug.tarifaUsd)}</b>
              </span>
            )}
            {sug.precioConMargen !== null && (
              <span>
                Con {sug.margenObjetivoPct} % de margen: <b className="text-tinta">{usd(sug.precioConMargen)}</b>
              </span>
            )}
            {sug.sugerido !== null && String(sug.sugerido) !== f.precioUsd && (
              <button type="button" className="font-medium text-marca hover:underline" onClick={() => onCambiar({ precioUsd: String(sug.sugerido) })}>
                Usar {usd(sug.sugerido)}
              </button>
            )}
          </>
        )}
        {!editable && guardado && (
          <span>
            Costo estimado al cotizar: <b className="text-tinta">{usd(guardado.costoUsd)}</b>
            {guardado.tarifaUsd !== null && ` · tarifa ${usd(guardado.tarifaUsd)}`} · importe <b className="text-tinta">{usd(guardado.importeUsd)}</b>
          </span>
        )}
      </div>
    </div>
  );
}

function FilaAdicional({
  f,
  adicionales,
  editable,
  onCambiar,
  onQuitar,
}: {
  f: Fila;
  adicionales: Adicional[];
  editable: boolean;
  onCambiar: (x: Partial<Fila>) => void;
  onQuitar: () => void;
}) {
  const a = adicionales.find((x) => x.codigo === f.adicionalCodigo);
  return (
    <div className="grid gap-2 rounded-lg border border-dashed border-borde p-3 sm:grid-cols-[minmax(12rem,2fr)_minmax(10rem,2fr)_6rem_7rem_auto]">
      <Campo label="Adicional">
        <select
          value={f.adicionalCodigo}
          disabled={!editable}
          onChange={(e) => {
            const x = adicionales.find((y) => y.codigo === e.target.value);
            onCambiar({ adicionalCodigo: e.target.value, unidad: x?.unidad ?? 'fijo', precioUsd: x?.precioUsd !== null && x?.precioUsd !== undefined ? String(x.precioUsd) : f.precioUsd });
          }}
        >
          <option value="">Elegí…</option>
          {adicionales
            .filter((x) => x.activo || x.codigo === f.adicionalCodigo)
            .map((x) => (
              <option key={x.codigo} value={x.codigo}>
                {x.nombre} ({ETIQUETA_UNIDAD[x.unidad]})
              </option>
            ))}
        </select>
      </Campo>
      <Campo label="Detalle (opcional)">
        <input value={f.descripcion} disabled={!editable} onChange={(e) => onCambiar({ descripcion: e.target.value })} />
      </Campo>
      <Campo label={a?.unidad === 'por_dia' ? 'Días' : a?.unidad === 'por_hora' ? 'Horas' : 'Cantidad'}>
        <input inputMode="decimal" value={f.cantidad} disabled={!editable} onChange={(e) => onCambiar({ cantidad: e.target.value })} />
      </Campo>
      <Campo label={a?.unidad === 'porcentaje' ? '% del flete' : 'Precio USD'}>
        <input inputMode="decimal" value={f.precioUsd} disabled={!editable} onChange={(e) => onCambiar({ precioUsd: e.target.value })} />
      </Campo>
      {editable ? (
        <button type="button" aria-label="Quitar" className="self-end pb-2 text-tinta-suave hover:text-error" onClick={onQuitar}>
          <Trash2 className="size-4" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function Totales({ c }: { c: Cotizacion }) {
  const malo = c.margenPct !== null && c.margenPct < 10;
  return (
    <section className={cn(TARJETA, 'grid gap-3 p-4 sm:grid-cols-4')}>
      <div>
        <p className="text-xs text-tinta-suave uppercase">Total</p>
        <p className="text-2xl font-semibold tabular-nums text-tinta">{usd(c.totalUsd)}</p>
      </div>
      <div>
        <p className="text-xs text-tinta-suave uppercase">Costo estimado</p>
        <p className="text-2xl font-semibold tabular-nums text-tinta">{usd(c.costoUsd)}</p>
        {c.costoUsd === null && <p className="text-xs text-alerta">Falta el costo de alguna ruta (km o costo por km).</p>}
      </div>
      <div>
        <p className="text-xs text-tinta-suave uppercase">Margen</p>
        <p className={cn('text-2xl font-semibold tabular-nums', malo ? 'text-error' : 'text-exito')}>{usd(c.margenUsd)}</p>
      </div>
      <div>
        <p className="text-xs text-tinta-suave uppercase">Margen sobre el costo</p>
        <p className={cn('text-2xl font-semibold tabular-nums', malo ? 'text-error' : 'text-exito')}>
          {c.margenPct === null ? '—' : `${c.margenPct.toLocaleString('es-AR')} %`}
        </p>
      </div>
      <p className="text-xs text-tinta-suave sm:col-span-4">El costo no incluye los adicionales: es el del viaje (combustible, costo fijo por km, gastos y canon del chofer).</p>
    </section>
  );
}

function Acciones({ c }: { c: Cotizacion }) {
  const router = useRouter();
  const enviar = useEnviarCotizacion();
  const responder = useResponderCotizacion();
  const anular = useAnularCotizacion();
  const duplicar = useDuplicarCotizacion();
  const envio = useEnvio();
  const [tarifas, setTarifas] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const respondible = c.estado === 'enviada' || c.estado === 'vencida';
  const esCliente = useMemo(() => c.clienteId !== null, [c.clienteId]);
  return (
    <>
      {c.estado === 'borrador' && (
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={enviar.isPending}
          onClick={() => void envio.enviar(enviar.mutateAsync({ id: c.id, version: c.version }), () => undefined)}
        >
          <Send className="size-4" /> Marcar como enviada
        </button>
      )}
      {respondible && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={responder.isPending}
            onClick={async () => {
              envio.setError(null);
              const r = await responder.mutateAsync({ id: c.id, aceptada: true, motivo: null, guardarTarifas: esCliente && tarifas });
              if (!r.ok) return envio.setError(r.error);
              setAviso(r.data > 0 ? `Aceptada. ${r.data} precio(s) quedaron como tarifa del cliente.` : 'Aceptada.');
            }}
          >
            <Check className="size-4" /> La aceptó
          </button>
          {esCliente ? (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-marca" checked={tarifas} onChange={(e) => setTarifas(e.target.checked)} />
              Guardar los precios como tarifa del cliente
            </label>
          ) : (
            <span className="text-xs text-tinta-suave">Es prospecto: después de aceptar, pasalo a cliente desde su ficha.</span>
          )}
          <AccionConMotivo
            etiqueta="La rechazó"
            icono={<X className="size-4" />}
            titulo="El cliente rechazó la cotización"
            explicacion="Contá por qué (precio, plazos, eligió a otro…): sirve para la próxima."
            ocupado={responder.isPending}
            error={envio.error}
            onConfirmar={async (motivo) => {
              const r = await responder.mutateAsync({ id: c.id, aceptada: false, motivo, guardarTarifas: false });
              if (!r.ok) envio.setError(r.error);
              return r.ok;
            }}
          />
        </div>
      )}
      {(c.estado === 'borrador' || c.estado === 'enviada') && (
        <AccionConMotivo
          etiqueta="Anular"
          icono={<Trash2 className="size-4" />}
          titulo="Anular la cotización"
          explicacion="Queda en la lista como anulada."
          ocupado={anular.isPending}
          error={envio.error}
          onConfirmar={async (motivo) => {
            const r = await anular.mutateAsync({ id: c.id, motivo });
            if (!r.ok) envio.setError(r.error);
            return r.ok;
          }}
        />
      )}
      {c.estado !== 'borrador' && (
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={duplicar.isPending}
          onClick={async () => {
            const r = await duplicar.mutateAsync({ id: c.id });
            if (!r.ok) return envio.setError(r.error);
            router.push(`/cotizaciones/${r.data}`);
          }}
        >
          <Copy className="size-4" /> Duplicar
        </button>
      )}
      {aviso && <p className="w-full text-sm text-exito">{aviso}</p>}
      <div className="w-full">
        <ErrorBase error={envio.error} />
      </div>
    </>
  );
}
