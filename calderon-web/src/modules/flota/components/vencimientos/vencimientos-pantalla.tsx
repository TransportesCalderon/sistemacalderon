'use client';

import { Fragment, useState } from 'react';
import { Ban, Check, Pencil, ChevronDown, ChevronRight, FileText, History, LoaderCircle, MapPin, Paperclip, Plus } from 'lucide-react';
import { abrirArchivo, borrarArchivo, subirArchivo } from '@/modules/chofer/components/archivos';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  ETIQUETA_ESTADO_VENC,
  carpetaVencimiento,
  fechaDia,
  textoDias,
  type EquipoVencimientos,
  type EstadoVencimiento,
  type ItemVencimiento,
  type TipoVencimiento,
} from '../../domain/vencimientos.types';
import { useAdjuntarVencimiento, useAnularVencimiento, useCorregirVencimiento, useHistorialVencimientos, useRegistrarVencimiento, useVencimientos } from '../../queries/hooks';

/** Sube el certificado a la carpeta del vencimiento y lo adjunta (si falla, no se pierde el vencimiento). */
async function adjuntar(
  id: number,
  archivo: File,
  enviar: (d: { id: number; ruta: string; nombre: string | null }) => Promise<{ ok: true; data: string | null } | { ok: false; error: { mensaje: string } }>,
): Promise<string | null> {
  try {
    const s = await subirArchivo(archivo, carpetaVencimiento(id));
    const r = await enviar({ id, ruta: s.ruta, nombre: s.nombre });
    if (!r.ok) {
      await borrarArchivo(s.ruta);
      return r.error.mensaje;
    }
    await borrarArchivo(r.data);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo subir el archivo.';
  }
}

const TONO: Record<EstadoVencimiento, Tono> = { vencido: 'error', por_vencer: 'alerta', al_dia: 'exito', sin_dato: 'neutro' };
const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
type FiltroEquipo = 'todos' | 'tractor' | 'semi';
type FiltroEstado = 'todos' | 'atencion' | EstadoVencimiento;

/**
 * Migración 198 · Mantenimiento › Vencimientos: revisión técnica y matafuegos de cada tractor y semi.
 * El estado, la zona (Región Metropolitana) y los avisos los decide la base; acá se muestran y se cargan.
 */
export function VencimientosPantalla() {
  const carga = useCan('mantenimiento.vencimientos:editar');
  const anula = useCan('mantenimiento.vencimientos:transicionar');
  const { data, isPending, isError, error, refetch, isFetching } = useVencimientos(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [fEquipo, setFEquipo] = useState<FiltroEquipo>('todos');
  const [fEstado, setFEstado] = useState<FiltroEstado>('todos');

  if (isPending) return <Cargando texto="Leyendo los vencimientos…" />;
  if (isError) return <ErrorLectura texto="No se pudieron leer los vencimientos." error={error} onReintentar={() => void refetch()} />;

  const cuenta = (e: EstadoVencimiento) => data.equipos.filter((x) => x.peor === e).length;
  const b = buscar.trim().toLowerCase();
  const lista = data.equipos.filter(
    (x) =>
      (fEquipo === 'todos' || x.equipo === fEquipo) &&
      (fEstado === 'todos' || (fEstado === 'atencion' ? x.peor === 'vencido' || x.peor === 'por_vencer' : x.peor === fEstado)) &&
      (!b || [x.patente, x.codigo, x.descripcion, x.ubicacion, x.tractor].some((t) => t?.toLowerCase().includes(b))),
  );

  return (
    <div className="space-y-5">
      <Encabezado titulo="Vencimientos" subtitulo="Mantenimiento" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Revisión técnica y matafuegos de cada tractor y semi. Lo vencido avisa siempre; lo que vence en 30 días o menos avisa cuando el equipo está en la Región
        Metropolitana (a Telemetría, Operaciones, Gerencia y Mantenimiento, una vez por día).
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['atencion', `Para atender (${cuenta('vencido') + cuenta('por_vencer')})`],
            ['vencido', `Vencidos (${cuenta('vencido')})`],
            ['por_vencer', `Por vencer (${cuenta('por_vencer')})`],
            ['sin_dato', `Sin cargar (${cuenta('sin_dato')})`],
            ['todos', `Todos (${data.equipos.length})`],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFEstado(k)}
            className={cn('rounded-full border px-3 py-1 text-sm', fEstado === k ? 'border-marca bg-marca/10 text-marca' : 'border-borde text-tinta-suave hover:bg-hover')}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Buscar"
          className={cn(CONTROL_FILTRO, 'h-10 w-full max-w-sm')}
          placeholder="Buscar patente, código o lugar…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
        <select aria-label="Equipo" className={cn(CONTROL_FILTRO, 'h-10')} value={fEquipo} onChange={(e) => setFEquipo(e.target.value as FiltroEquipo)}>
          <option value="todos">Tractores y semis</option>
          <option value="tractor">Solo tractores</option>
          <option value="semi">Solo semis</option>
        </select>
      </div>

      <div className={cn(TARJETA, 'overflow-x-auto', isFetching && 'opacity-80')}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
            <tr>
              <th className={cn(TH, 'w-8')} />
              <th className={TH}>Equipo</th>
              <th className={TH}>Dónde está</th>
              {data.tipos.map((t) => (
                <th key={t.codigo} className={TH}>
                  {t.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((x) => {
              const clave = `${x.equipo}:${x.id}`;
              const ab = abierto === clave;
              return (
                <Fragment key={clave}>
                  <tr
                    className={cn('cursor-pointer border-b border-borde hover:bg-hover', ab && 'bg-[#e7f0fa] hover:bg-[#e7f0fa]')}
                    onClick={() => setAbierto(ab ? null : clave)}
                    aria-expanded={ab}
                  >
                    <td className={cn(TD, 'text-tinta-suave')}>{ab ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className={TD}>
                      <button type="button" className="font-mono font-semibold tracking-wide text-tinta outline-none focus-visible:underline">
                        {x.patente}
                      </button>
                      <span className="block text-xs text-tinta-suave">
                        {x.equipo === 'tractor' ? 'Tractor' : 'Semi'} · {x.codigo}
                        {x.descripcion && ` · ${x.descripcion}`}
                      </span>
                    </td>
                    <td className={TD}>
                      {x.enZona && (
                        <Chip tono="marca">
                          <MapPin className="size-3" /> Región Metropolitana
                        </Chip>
                      )}
                      <span className="block text-xs text-tinta-suave">
                        {x.ubicacion ?? (x.posicionTs ? 'GPS' : 'Sin ubicación')}
                        {x.tractor && ` · con ${x.tractor}`}
                      </span>
                    </td>
                    {data.tipos.map((t) => (
                      <td key={t.codigo} className={TD}>
                        <CeldaTipo items={x.items.filter((i) => i.tipo === t.codigo)} />
                      </td>
                    ))}
                  </tr>
                  {ab && (
                    <tr className="border-b border-borde bg-[#f5f9fd]">
                      <td colSpan={3 + data.tipos.length} className="p-3">
                        <DetalleEquipo e={x} tipos={data.tipos} carga={carga} anula={anula} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={3 + data.tipos.length} className="px-3 py-6 text-center text-tinta-suave">
                  No hay equipos con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CeldaTipo({ items }: { items: ItemVencimiento[] }) {
  if (items.length === 0) return <span className="text-tinta-suave">—</span>;
  return (
    <div className="space-y-1">
      {items.map((i, k) => (
        <div key={i.id ?? `s${k}`} className="flex flex-wrap items-center gap-1.5">
          <Chip tono={TONO[i.estado]}>{i.estado === 'sin_dato' ? 'Sin cargar' : fechaDia(i.vence)}</Chip>
          {i.detalle && <span className="text-xs text-tinta">{i.detalle}</span>}
          {i.estado !== 'sin_dato' && i.estado !== 'al_dia' && <span className="text-xs text-tinta-suave">{textoDias(i.dias)}</span>}
        </div>
      ))}
    </div>
  );
}

function DetalleEquipo({ e, tipos, carga, anula }: { e: EquipoVencimientos; tipos: TipoVencimiento[]; carga: boolean; anula: boolean }) {
  const { zonaHoraria } = useSesion();
  const [form, setForm] = useState<{ tipo: string; detalle: string } | null>(null);
  const [historial, setHistorial] = useState(false);
  const aplica = tipos.filter((t) => (e.equipo === 'tractor' ? t.aplicaTractor : t.aplicaSemi));

  return (
    <div className={cn(TARJETA, 'max-w-4xl space-y-4 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-tinta">
          <span className="font-mono">{e.patente}</span> · {e.equipo === 'tractor' ? 'Tractor' : 'Semi'} {e.codigo}
        </p>
        <div className="flex flex-wrap gap-2">
          {carga && (
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setForm({ tipo: aplica[0]?.codigo ?? '', detalle: '' })}>
              <Plus className="size-4" /> Cargar vencimiento
            </button>
          )}
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setHistorial(!historial)}>
            <History className="size-4" /> {historial ? 'Ocultar historial' : 'Historial'}
          </button>
        </div>
      </div>

      {form && <FormVencimiento e={e} tipos={aplica} inicial={form} onCerrar={() => setForm(null)} />}

      <ul className="divide-y divide-borde rounded-md border border-borde">
        {e.items.map((i, k) => (
          <ItemDetalle
            key={i.id ?? `s${k}`}
            i={i}
            zona={zonaHoraria}
            carga={carga}
            anula={anula}
            onRenovar={() => setForm({ tipo: i.tipo, detalle: i.detalle ?? '' })}
          />
        ))}
      </ul>

      {historial && <Historial e={e} />}
    </div>
  );
}

function ItemDetalle({ i, zona, carga, anula, onRenovar }: { i: ItemVencimiento; zona: string; carga: boolean; anula: boolean; onRenovar: () => void }) {
  const anular = useAnularVencimiento();
  const adj = useAdjuntarVencimiento();
  const envio = useEnvio();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-tinta">
            {i.tipoNombre}
            {i.detalle && ` · ${i.detalle}`}
          </span>
          <Chip tono={TONO[i.estado]}>{ETIQUETA_ESTADO_VENC[i.estado]}</Chip>
          {i.vence && (
            <span className="text-tinta">
              Vence {fechaDia(i.vence)} <span className="text-tinta-suave">({textoDias(i.dias)})</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {i.archivoRuta && (
            <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => void abrirArchivo(i.archivoRuta!).then(setAviso)}>
              <FileText className="size-3.5" /> Ver certificado
            </button>
          )}
          {carga && i.id !== null && (
            <label className="inline-flex cursor-pointer items-center gap-1 text-marca hover:underline">
              {subiendo ? <LoaderCircle className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
              {i.archivoRuta ? 'Cambiar certificado' : 'Adjuntar certificado (PDF)'}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                disabled={subiendo}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setSubiendo(true);
                  setAviso(await adjuntar(i.id!, f, adj.mutateAsync));
                  setSubiendo(false);
                }}
              />
            </label>
          )}
          {carga && (
            <button type="button" className="text-marca hover:underline" onClick={onRenovar}>
              {i.estado === 'sin_dato' ? 'Cargar' : 'Cargar la nueva'}
            </button>
          )}
          {carga && i.id !== null && (
            <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setCorrigiendo(!corrigiendo)}>
              <Pencil className="size-3.5" /> Corregir fechas
            </button>
          )}
          {anula && i.id !== null && (
            <button type="button" className="text-error hover:underline" onClick={() => setMotivo(motivo === null ? '' : null)}>
              Anular
            </button>
          )}
        </div>
      </div>
      {i.id !== null && (
        <p className="text-xs text-tinta-suave">
          {i.realizado && `Se hizo el ${fechaDia(i.realizado)} · `}
          Cargado por {i.cargadoPor ?? '—'}
          {i.cargadoEn && ` el ${formatearFechaHora(i.cargadoEn, zona)}`}
          {i.observacion && ` · ${i.observacion}`}
        </p>
      )}
      {i.correcciones.map((c, k) => (
        <p key={k} className="text-xs text-alerta">
          Fecha corregida por {c.usuario ?? '—'} el {formatearFechaHora(c.en, zona)}: antes vencía el {fechaDia(c.venceAntes)}
          {c.realizadoAntes !== c.realizado && ` (se hizo el ${fechaDia(c.realizadoAntes)})`} · {c.motivo}
        </p>
      ))}
      {aviso && <p className="text-xs text-error">{aviso}</p>}
      {corrigiendo && i.id !== null && <FormCorregir i={i} onListo={() => setCorrigiendo(false)} />}
      {motivo !== null && i.id !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={cn(CONTROL_FILTRO, 'h-9 min-w-64 flex-1')}
            placeholder="Por qué se anula (vuelve a valer el anterior)"
            value={motivo}
            onChange={(x) => setMotivo(x.target.value)}
          />
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={anular.isPending}
            onClick={() => void envio.enviar(anular.mutateAsync({ id: i.id!, motivo }), () => setMotivo(null))}
          >
            {anular.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Ban className="size-4" />} Anular
          </button>
          <ErrorBase error={envio.error} />
        </div>
      )}
    </li>
  );
}

/** Migración 204: corregir las fechas del vigente (cargado mal). La base valida todo. */
function FormCorregir({ i, onListo }: { i: ItemVencimiento; onListo: () => void }) {
  const corregir = useCorregirVencimiento();
  const envio = useEnvio();
  const [realizado, setRealizado] = useState<string>(i.realizado ?? '');
  const [vence, setVence] = useState<string>(i.vence ?? '');
  const [motivo, setMotivo] = useState<string>('');
  return (
    <div className="space-y-2 rounded-lg border border-borde bg-fondo p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-tinta-suave">
          Se hizo
          <input type="date" className={cn(CONTROL_FILTRO, 'h-9')} value={realizado} onChange={(x) => setRealizado(x.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tinta-suave">
          Vence
          <input type="date" className={cn(CONTROL_FILTRO, 'h-9')} value={vence} onChange={(x) => setVence(x.target.value)} />
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-tinta-suave">
          Por qué se corrige
          <input
            className={cn(CONTROL_FILTRO, 'h-9')}
            placeholder="Por ejemplo: se cargó mal el año"
            value={motivo}
            onChange={(x) => setMotivo(x.target.value)}
          />
        </label>
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={corregir.isPending}
          onClick={() => void envio.enviar(corregir.mutateAsync({ id: i.id!, realizado: realizado || null, vence, motivo }), onListo)}
        >
          {corregir.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar corrección
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
      <p className="text-xs text-tinta-suave">Queda registrado quién lo corrigió, la fecha anterior y el motivo.</p>
      <ErrorBase error={envio.error} />
    </div>
  );
}

function FormVencimiento({ e, tipos, inicial, onCerrar }: { e: EquipoVencimientos; tipos: TipoVencimiento[]; inicial: { tipo: string; detalle: string }; onCerrar: () => void }) {
  const registrar = useRegistrarVencimiento();
  const adj = useAdjuntarVencimiento();
  const envio = useEnvio();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [tipo, setTipo] = useState(inicial.tipo);
  const [detalle, setDetalle] = useState(inicial.detalle);
  const [realizado, setRealizado] = useState('');
  const [vence, setVence] = useState('');
  const [obs, setObs] = useState('');
  const t = tipos.find((x) => x.codigo === tipo);

  return (
    <div className="space-y-3 rounded-md border border-marca/40 bg-panel p-3">
      <p className="text-sm font-medium text-tinta">
        Cargar vencimiento · <span className="font-mono">{e.patente}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Qué vence</span>
          <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={tipo} onChange={(x) => setTipo(x.target.value)}>
            {tipos.map((x) => (
              <option key={x.codigo} value={x.codigo}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        {t?.pideDetalle && (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Cuál (ubicación o número)</span>
            <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} placeholder="Ej.: Cabina, N.º 12345" value={detalle} onChange={(x) => setDetalle(x.target.value)} />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Se hizo el (opcional)</span>
          <input type="date" className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={realizado} onChange={(x) => setRealizado(x.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Vence el</span>
          <input type="date" className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={vence} onChange={(x) => setVence(x.target.value)} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="block text-xs text-tinta-suave">Certificado (PDF o foto, opcional)</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-borde file:bg-panel file:px-3 file:py-1.5"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="block text-xs text-tinta-suave">Observación (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} placeholder="Ej.: planta, número de certificado" value={obs} onChange={(x) => setObs(x.target.value)} />
        </label>
      </div>
      <p className="text-xs text-tinta-suave">Si ya había uno cargado de lo mismo, el nuevo lo reemplaza y el anterior queda en el historial.</p>
      <ErrorBase error={envio.error} />
      {aviso && <p className="text-sm text-error">{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={registrar.isPending || subiendo}
          onClick={async () => {
            setAviso(null);
            const r = await registrar.mutateAsync({
              tipo,
              equipo: e.equipo,
              equipoId: e.id,
              detalle: t?.pideDetalle ? detalle.trim() || null : null,
              realizado: realizado || null,
              vence,
              observacion: obs.trim() || null,
            });
            if (!r.ok) return void envio.enviar(Promise.resolve(r), () => undefined);
            if (archivo) {
              setSubiendo(true);
              const fallo = await adjuntar(r.data, archivo, adj.mutateAsync);
              setSubiendo(false);
              // El vencimiento ya quedó guardado: el certificado se puede volver a adjuntar desde el detalle
              if (fallo) return setAviso(`Se guardó el vencimiento, pero no el certificado: ${fallo}`);
            }
            onCerrar();
          }}
        >
          {registrar.isPending || subiendo ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Historial({ e }: { e: EquipoVencimientos }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending } = useHistorialVencimientos(e.equipo, e.id);
  if (isPending) return <Cargando texto="Cargando el historial…" />;
  if (!data || data.length === 0) return <p className="text-xs text-tinta-suave">Todavía no hay vencimientos cargados de este equipo.</p>;
  return (
    <ul className="space-y-1 border-t border-borde pt-2 text-xs text-tinta-suave">
      {data.map((h) => (
        <li key={h.id} className={cn(h.situacion !== 'vigente' && 'line-through decoration-tinta-suave/40')}>
          <span className="text-tinta">
            {h.tipoNombre}
            {h.detalle && ` · ${h.detalle}`}
          </span>{' '}
          · vence {fechaDia(h.vence)}
          {h.realizado && ` · se hizo ${fechaDia(h.realizado)}`} · {h.cargadoPor ?? '—'} {formatearFechaHora(h.cargadoEn, zonaHoraria)} ·{' '}
          {h.situacion === 'vigente' ? 'vigente' : h.situacion === 'reemplazado' ? 'reemplazado' : `anulado por ${h.anuladoPor ?? '—'}: ${h.motivoAnulacion ?? ''}`}
          {h.correcciones.length > 0 &&
            ` · fecha corregida (antes ${h.correcciones.map((c) => fechaDia(c.venceAntes)).join(', ')}): ${h.correcciones[h.correcciones.length - 1]?.motivo ?? ''}`}
          {h.archivoRuta && (
            <>
              {' '}
              ·{' '}
              <button type="button" className="text-marca no-underline hover:underline" onClick={() => void abrirArchivo(h.archivoRuta!)}>
                certificado
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
