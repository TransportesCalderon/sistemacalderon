'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, LoaderCircle, LogOut, Plus, Satellite, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCamionesCombustible, useChoferesCombustible } from '@/modules/combustible/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { ETIQUETA_ORIGEN, VERSION_LIBRO_SALIDAS, type Salida } from '../domain/salidas.types';
import { useDatosSalida, useDescartarSalida, useGensets, useGuardarSalida, useLibroSalidas, useSemis } from '../queries/hooks';

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const horaDe = (ts: string | null, zona: string) =>
  ts ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: zona }).format(new Date(ts)) : '—';

/**
 * Migración 196 · Libro de salidas de la base operativa: qué camiones salieron de la base cada día y
 * con qué (chofer, semi, genset, producto, destino). Las salidas que detecta el GPS quedan arriba para
 * confirmarlas o descartarlas; también se cargan a mano. Todo lo valida la base.
 */
export function LibroSalidas() {
  const { zonaHoraria } = useSesion();
  const hay = useBaseTiene(VERSION_LIBRO_SALIDAS);
  const puede = useCan('flota.pizarra:editar');
  const hoy = hoyEnZona(zonaHoraria);
  const [desde, setDesde] = useState<string>(sumarDias(hoy, -6));
  const [hasta, setHasta] = useState<string>(hoy);
  const [nueva, setNueva] = useState(false);
  const { data, isPending, isError, error, refetch, isFetching } = useLibroSalidas(desde, hasta, hay);

  if (!hay) return <Vacio icono={<LogOut className="size-6" />} texto="Falta aplicar en la base el cambio del libro de salidas." />;
  const detectadas = (data?.salidas ?? []).filter((s) => s.estado === 'detectada');
  const libro = (data?.salidas ?? []).filter((s) => s.estado !== 'detectada');
  const dias = [...new Set(libro.map((s) => s.fecha))];

  return (
    <div className="space-y-5">
      <Encabezado titulo="Libro de salidas" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Los camiones que salen de la base {data?.base ? `(${data.base}) ` : ''}hacia su siguiente destino. El GPS detecta las salidas y las deja para
        confirmar; también se cargan a mano.{' '}
        <Link href="/pizarra" className="text-marca hover:underline">
          Volver a la Pizarra
        </Link>
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-tinta-suave">Desde</span>
          <input id="salidas-desde" type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-tinta-suave">Hasta</span>
          <input id="salidas-hasta" type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} />
        </label>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => (setDesde(hoy), setHasta(hoy))}>
          Hoy
        </button>
        {puede && !nueva && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNueva(true)}>
            <Plus className="size-4" /> Anotar una salida
          </button>
        )}
        {isFetching && !isPending && <LoaderCircle className="mb-2 size-4 animate-spin text-tinta-suave" />}
      </div>

      {nueva && <FormSalida s={null} hoy={hoy} onListo={() => setNueva(false)} />}

      {isPending ? (
        <Cargando texto="Leyendo el libro…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo leer.'} onReintentar={() => refetch()} />
      ) : (
        <>
          {detectadas.length > 0 && (
            <section className={cn(TARJETA, 'space-y-3 border-alerta/40 p-4')}>
              <h2 className="flex items-center gap-2 font-medium text-tinta">
                <Satellite className="size-4 text-alerta" /> Detectadas por GPS, para confirmar ({detectadas.length})
              </h2>
              <ul className="space-y-3">
                {detectadas.map((s) => (
                  <Detectada key={s.id} s={s} hoy={hoy} puede={puede} />
                ))}
              </ul>
            </section>
          )}
          {dias.length === 0 ? (
            <Vacio icono={<LogOut className="size-6" />} texto="No hay salidas anotadas en el período." />
          ) : (
            dias.map((d) => <Dia key={d} fecha={d} salidas={libro.filter((s) => s.fecha === d)} hoy={hoy} puede={puede} />)
          )}
        </>
      )}
    </div>
  );
}

function Detectada({ s, hoy, puede }: { s: Salida; hoy: string; puede: boolean }) {
  const { zonaHoraria } = useSesion();
  const [confirmar, setConfirmar] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const quitar = useDescartarSalida();
  const envio = useEnvio();
  return (
    <li className="space-y-2 rounded-md border border-borde p-3 text-sm">
      <p>
        <strong className="font-mono">{s.tractor}</strong> salió el {formatearFechaDia(s.fecha)} a las {horaDe(s.salidaTs, zonaHoraria)} ·{' '}
        {s.chofer ?? 'sin chofer'} · {s.semi ?? 'sin semi'}
        {s.genset && ` / ${s.genset}`} · {s.producto ?? 'sin producto'}
        {s.destino && ` → ${s.destino}`}
      </p>
      {puede && !confirmar && !descartar && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setConfirmar(true)}>
            <Check className="size-4" /> Confirmar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setDescartar(true)}>
            <X className="size-4" /> No salió (descartar)
          </button>
        </div>
      )}
      {confirmar && <FormSalida s={s} hoy={hoy} onListo={() => setConfirmar(false)} />}
      {descartar && (
        <div className="flex flex-wrap items-center gap-2">
          <input className={cn(CONTROL_FILTRO, 'min-w-0 flex-1')} placeholder="Motivo (por ejemplo: salió a cargar gasoil y volvió)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={quitar.isPending}
            onClick={() => void envio.enviar(quitar.mutateAsync({ id: s.id, motivo }), () => setDescartar(false))}
          >
            Descartar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setDescartar(false)}>
            Cancelar
          </button>
        </div>
      )}
      <ErrorBase error={envio.error} />
    </li>
  );
}

function Dia({ fecha, salidas, hoy, puede }: { fecha: string; salidas: Salida[]; hoy: string; puede: boolean }) {
  const { zonaHoraria } = useSesion();
  const [editando, setEditando] = useState<number | null>(null);
  const validas = salidas.filter((s) => s.estado === 'confirmada');
  return (
    <section className="overflow-hidden rounded-xl border border-borde bg-panel">
      <h2 className="border-b border-borde bg-fondo px-3 py-2 text-sm font-medium text-tinta">
        Salidas del {formatearFechaDia(fecha)} · {validas.length} camión{validas.length === 1 ? '' : 'es'}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-borde">
            <tr>
              <th className={TH}>Hora</th>
              <th className={TH}>Tractor</th>
              <th className={TH}>Chofer</th>
              <th className={TH}>Semi / genset</th>
              <th className={TH}>Producto</th>
              <th className={TH}>Destino</th>
              <th className={TH}>Origen</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {salidas.map((s) => (
              <FilaSalida
                key={s.id}
                s={s}
                zona={zonaHoraria}
                puede={puede}
                editando={editando === s.id}
                onEditar={() => setEditando(editando === s.id ? null : s.id)}
                hoy={hoy}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilaSalida({ s, zona, puede, editando, onEditar, hoy }: { s: Salida; zona: string; puede: boolean; editando: boolean; onEditar: () => void; hoy: string }) {
  const descartada = s.estado === 'descartada';
  return (
    <>
      <tr className={cn(descartada && 'text-tinta-suave line-through')}>
        <td className={cn(TD, 'tabular-nums')}>{horaDe(s.salidaTs, zona)}</td>
        <td className={cn(TD, 'font-mono font-medium')}>
          {s.tractor ?? '—'}
          {s.camionId === null && <span className="block text-xs font-sans text-alerta no-underline">no reconocido</span>}
        </td>
        <td className={TD}>{s.chofer ?? <span className="text-alerta">sin chofer</span>}</td>
        <td className={TD}>
          {s.semi ?? '—'}
          {s.genset && <span className="block text-xs text-tinta-suave">{s.genset}</span>}
        </td>
        <td className={TD}>{s.producto ?? '—'}</td>
        <td className={TD}>{s.destino ?? '—'}</td>
        <td className={TD}>
          <Chip tono={s.origen === 'gps' ? 'marca' : 'neutro'}>{ETIQUETA_ORIGEN[s.origen]}</Chip>
          {descartada && <span className="block text-xs no-underline">Descartada: {s.motivoDescarte}</span>}
          {!descartada && s.faltan.length > 0 && <span className="block text-xs text-alerta">Falta: {s.faltan.join(', ')}</span>}
        </td>
        <td className={cn(TD, 'text-right')}>
          {puede && !descartada && s.camionId !== null && (
            <button type="button" className="text-xs text-marca hover:underline" onClick={onEditar}>
              {editando ? 'Cerrar' : 'Corregir'}
            </button>
          )}
        </td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={8} className="bg-fondo px-3 py-3">
            <FormSalida s={s} hoy={hoy} onListo={onEditar} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Confirmar una detectada, corregir una anotada o anotar una nueva (con lo que el tractor tiene en la Pizarra). */
function FormSalida({ s, hoy, onListo }: { s: Salida | null; hoy: string; onListo: () => void }) {
  const { zonaHoraria } = useSesion();
  const { data: camiones } = useCamionesCombustible();
  const { data: choferes } = useChoferesCombustible();
  const { data: semis } = useSemis();
  const { data: gensets } = useGensets();
  const guardar = useGuardarSalida();
  const envio = useEnvio();
  const [camion, setCamion] = useState<number | null>(s?.camionId ?? null);
  const [fecha, setFecha] = useState<string>(s?.fecha ?? hoy);
  const [hora, setHora] = useState(s?.salidaTs ? horaDe(s.salidaTs, zonaHoraria) : '');
  const [chofer, setChofer] = useState<number | null>(s?.choferId ?? null);
  const [semi, setSemi] = useState<number | null>(s?.semiId ?? null);
  const [genset, setGenset] = useState<number | null>(s?.gensetId ?? null);
  const [producto, setProducto] = useState(s?.producto ?? '');
  const [destino, setDestino] = useState(s?.destino ?? '');
  const [obs, setObs] = useState(s?.observacion ?? '');
  // Salida nueva: al elegir el tractor se completa con lo que tiene en la Pizarra
  const { data: datos } = useDatosSalida(s === null ? camion : null);
  useEffect(() => {
    if (!datos) return;
    setChofer(datos.choferId);
    setSemi(datos.semiId);
    setGenset(datos.gensetId);
    setProducto(datos.producto ?? '');
    setDestino(datos.destino ?? '');
  }, [datos]);
  const sel = (v: number | null, set: (x: number | null) => void, ops: { id: number; t: string }[] | undefined, vacio: string, etiqueta: string) => (
    <label className="text-xs text-tinta-suave">
      {etiqueta}
      <select className={cn(CONTROL_FILTRO, 'mt-0.5 w-full')} value={v ?? ''} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{vacio}</option>
        {ops?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.t}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-2 rounded-md border border-borde bg-panel p-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sel(camion, setCamion, camiones?.map((c) => ({ id: c.id, t: c.patente })).sort((a, b) => a.t.localeCompare(b.t)), 'Elegí…', 'Tractor')}
        <label className="text-xs text-tinta-suave">
          Día
          <input type="date" className={cn(CONTROL_FILTRO, 'mt-0.5 w-full')} value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="text-xs text-tinta-suave">
          Hora (opcional)
          <input type="time" className={cn(CONTROL_FILTRO, 'mt-0.5 w-full')} value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
        {sel(chofer, setChofer, choferes?.map((c) => ({ id: c.id, t: c.nombre })), 'Sin chofer', 'Chofer')}
        {sel(semi, setSemi, semis?.map((x) => ({ id: x.id, t: x.patente })), 'Sin semi', 'Semi')}
        {sel(genset, setGenset, gensets?.map((g) => ({ id: g.id, t: g.codigo })), 'Sin genset', 'Genset')}
        <label className="text-xs text-tinta-suave">
          Producto / cliente
          <input className={cn(CONTROL_FILTRO, 'mt-0.5 w-full')} value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="COTO / ACEITE, VACÍO…" />
        </label>
        <label className="text-xs text-tinta-suave">
          Destino
          <input className={cn(CONTROL_FILTRO, 'mt-0.5 w-full')} value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Buenos Aires, Chile…" />
        </label>
      </div>
      <input className={cn(CONTROL_FILTRO, 'w-full')} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observación (opcional)" />
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(
              guardar.mutateAsync({
                id: s?.id ?? null,
                camionId: camion ?? 0,
                fecha,
                hora: hora || null,
                choferId: chofer,
                semiId: semi,
                gensetId: genset,
                producto: producto.trim() || null,
                destino: destino.trim() || null,
                observacion: obs.trim() || null,
              }),
              onListo,
            )
          }
        >
          {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {s?.estado === 'detectada' ? 'Confirmar salida' : 'Guardar'}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
