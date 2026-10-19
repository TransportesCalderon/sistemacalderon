'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Route, Search } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { diaHora } from '@/modules/pizarra/components/formato';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import { cn } from '@/shared/lib/cn';
import { horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { PasoViaje } from '../domain/viaje.schemas';
import { PASO_INFO, type Opcion, type ViajeAbierto } from '../domain/viaje.types';
import {
  useAsignarViaje,
  useAsignarVueltaVacia,
  useCambiarChofer,
  useCancelarViaje,
  useModificarViaje,
  useOpcionesViaje,
  usePasoViaje,
  useReprogramarDescarga,
  useViajesAbiertos,
  useViajesEnVivo,
} from '../queries/hooks';

type Accion = PasoViaje | 'modificar' | 'reprogramar' | 'chofer' | 'cancelar';
type Abierto = { tipo: 'nuevo'; semiId: string } | { tipo: 'vuelta'; semiId: string } | { tipo: Accion; v: ViajeAbierto } | null;

/** Botones de cada paso: qué se puede hacer según dónde está el viaje. */
function accionesDe(v: ViajeAbierto): { accion: Accion; etiqueta: string; principal?: boolean }[] {
  switch (v.paso) {
    case 'planificado':
      return [
        v.conCarga
          ? { accion: 'iniciar_carga', etiqueta: 'Empezar carga', principal: true }
          : { accion: 'salir', etiqueta: 'Salir', principal: true },
        ...(v.conCarga ? [{ accion: 'salir' as const, etiqueta: 'Salir a cargar' }] : []),
        { accion: 'modificar', etiqueta: 'Modificar' },
        { accion: 'chofer', etiqueta: 'Cambiar chofer' },
        { accion: 'cancelar', etiqueta: 'Cancelar' },
      ];
    case 'yendo_a_cargar':
      return [
        { accion: 'iniciar_carga', etiqueta: 'Empezar carga', principal: true },
        { accion: 'reprogramar', etiqueta: 'Reprogramar descarga' },
        { accion: 'chofer', etiqueta: 'Relevo de chofer' },
      ];
    case 'cargando':
      return [{ accion: 'terminar_carga', etiqueta: 'Terminar carga', principal: true }];
    case 'en_viaje':
      return [
        { accion: 'iniciar_descarga', etiqueta: 'Empezar descarga', principal: true },
        { accion: 'reprogramar', etiqueta: 'Reprogramar descarga' },
        { accion: 'chofer', etiqueta: 'Relevo de chofer' },
      ];
    case 'descargando':
      return [{ accion: 'terminar_descarga', etiqueta: 'Terminar descarga', principal: true }];
    case 'vuelta_vacia':
      return [
        { accion: 'terminar_viaje', etiqueta: 'Llegó', principal: true },
        { accion: 'chofer', etiqueta: 'Relevo de chofer' },
      ];
  }
}

/**
 * Operación > Viajes (Logística, migración 40). Asignar viajes y marcar sus pasos; la Pizarra Azul
 * se arma sola con esto. Cada paso lo valida la base y su mensaje se muestra tal cual.
 */
export function ViajesPantalla({ semiInicial, tramoInicial }: { semiInicial?: string; tramoInicial?: number }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('operacion.tramos:editar');
  const puedePasos = useCan('operacion.tramos:transicionar');
  const vivo = useViajesEnVivo();
  const { data, isPending, isError, refetch } = useViajesAbiertos();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState<Abierto>(semiInicial && puedeEditar ? { tipo: 'nuevo', semiId: semiInicial } : null);

  const filas = useMemo(() => {
    const t = normalizar(texto);
    return (data ?? []).filter(
      (v) =>
        !t || [v.semi, v.tractor, v.chofer, v.cliente, v.contenedor, v.numeroServicio, v.destino].some((c) => normalizar(c).includes(t)),
    );
  }, [data, texto]);
  const enCurso = filas.filter((v) => v.enCurso);
  const planificados = filas.filter((v) => !v.enCurso);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Viajes" subtitulo="Operación · Logística">
        <span className="flex items-center gap-1.5 text-xs text-tinta-suave">
          <span className={cn('size-2 rounded-full', vivo === 'en_vivo' ? 'bg-exito' : 'bg-[#fdb022]')} />
          {vivo === 'en_vivo' ? 'En vivo' : 'Actualiza cada minuto'}
        </span>
        <Link href="/flota/pizarra" className={BOTON_SECUNDARIO}>
          Pizarra Azul
        </Link>
        {puedeEditar && (
          <>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto({ tipo: 'vuelta', semiId: '' })}>
              Vuelta vacía
            </button>
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ tipo: 'nuevo', semiId: '' })}>
              <Plus className="size-4" /> Asignar viaje
            </button>
          </>
        )}
      </Encabezado>

      {abierto?.tipo === 'nuevo' && <FormViaje semiId={abierto.semiId} zona={zonaHoraria} onCerrar={() => setAbierto(null)} />}
      {abierto?.tipo === 'vuelta' && <FormVuelta semiId={abierto.semiId} zona={zonaHoraria} onCerrar={() => setAbierto(null)} />}

      <label className="relative block w-full max-w-sm">
        <span className="sr-only">Buscar</span>
        <Search className="absolute top-2.5 left-2.5 size-4 text-tinta-suave" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Semi, tractor, chofer, cliente o contenedor"
          className="h-9 w-full rounded-md border border-borde bg-panel pr-3 pl-8 text-sm outline-none focus:border-marca"
        />
      </label>

      {isPending ? (
        <Cargando texto="Cargando viajes…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron cargar los viajes." onReintentar={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <div className={TARJETA}>
          <Vacio icono={<Route className="size-5" />} texto="No hay viajes planificados ni en curso." />
        </div>
      ) : (
        <>
          <Tabla
            titulo={`En curso (${enCurso.length})`}
            viajes={enCurso}
            zona={zonaHoraria}
            abierto={abierto}
            resaltado={tramoInicial}
            puedeEditar={puedeEditar}
            puedePasos={puedePasos}
            onAbrir={setAbierto}
          />
          <Tabla
            titulo={`Planificados (${planificados.length})`}
            viajes={planificados}
            zona={zonaHoraria}
            abierto={abierto}
            resaltado={tramoInicial}
            puedeEditar={puedeEditar}
            puedePasos={puedePasos}
            onAbrir={setAbierto}
          />
        </>
      )}
    </div>
  );
}

function Tabla({
  titulo,
  viajes,
  zona,
  abierto,
  resaltado,
  puedeEditar,
  puedePasos,
  onAbrir,
}: {
  titulo: string;
  viajes: ViajeAbierto[];
  zona: string;
  abierto: Abierto;
  resaltado?: number;
  puedeEditar: boolean;
  puedePasos: boolean;
  onAbrir: (a: Abierto) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {viajes.length === 0 ? (
          <p className="p-4 text-sm text-tinta-suave">Ninguno.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Semi</th>
                <th className={TH}>Paso</th>
                <th className={TH}>Tractor · chofer</th>
                <th className={TH}>Carga</th>
                <th className={TH}>Contenedor</th>
                <th className={TH}>Recorrido</th>
                <th className={TH}>Salida / carga</th>
                <th className={TH}>Descarga</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {viajes.map((v) => {
                const accion = abierto && 'v' in abierto && abierto.v.tramoId === v.tramoId ? abierto.tipo : null;
                const vencida = v.fechaDescarga && v.conCarga && new Date(v.fechaDescarga).getTime() < Date.now();
                const acciones = accionesDe(v).filter((a) =>
                  ['modificar', 'reprogramar', 'chofer', 'cancelar'].includes(a.accion) ? puedeEditar : puedePasos,
                );
                return (
                  <FilaViaje
                    key={v.tramoId}
                    v={v}
                    zona={zona}
                    vencida={!!vencida}
                    resaltado={resaltado === v.tramoId}
                    acciones={acciones}
                    accion={accion as Accion | null}
                    onAbrir={onAbrir}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function FilaViaje({
  v,
  zona,
  vencida,
  resaltado,
  acciones,
  accion,
  onAbrir,
}: {
  v: ViajeAbierto;
  zona: string;
  vencida: boolean;
  resaltado: boolean;
  acciones: ReturnType<typeof accionesDe>;
  accion: Accion | null;
  onAbrir: (a: Abierto) => void;
}) {
  const cerrar = () => onAbrir(null);
  return (
    <>
      <tr className={cn(resaltado && 'bg-[#fff8d6]', accion && 'bg-marca-suave/50')}>
        <td className={cn(TD, 'font-mono font-semibold text-tinta')}>{v.semi ?? '—'}</td>
        <td className={TD}>
          <span
            className={cn(
              'inline-flex h-5 items-center rounded-[3px] px-1.5 text-xs font-semibold whitespace-nowrap',
              PASO_INFO[v.paso].clase,
            )}
          >
            {PASO_INFO[v.paso].etiqueta}
          </span>
        </td>
        <td className={TD}>
          <span className="font-mono">{v.tractor}</span> · {v.chofer}
        </td>
        <td className={TD}>
          {v.conCarga ? (
            <>
              <span className="font-semibold">{v.cliente}</span>
              {v.producto && ` · ${v.producto}`}
              {v.taraMaxDias && <span className="block text-xs text-tinta-suave">Pide tara de {v.taraMaxDias} d</span>}
            </>
          ) : (
            <span className="text-tinta-suave">Sin carga</span>
          )}
        </td>
        <td className={cn(TD, 'font-mono text-xs')}>{v.contenedor ?? '—'}</td>
        <td className={TD}>
          {v.origen} → {v.destino}
        </td>
        <td className={cn(TD, 'whitespace-nowrap')}>
          {v.enCurso && v.inicioReal ? `salió ${diaHora(v.inicioReal, zona)}` : diaHora(v.fechaCarga, zona)}
        </td>
        <td className={cn(TD, 'whitespace-nowrap', vencida && 'font-semibold text-error')}>
          {v.conCarga ? diaHora(v.fechaDescarga, zona) : '—'}
        </td>
        <td className={cn(TD, 'text-right whitespace-nowrap')}>
          {acciones.map((a) => (
            <button
              key={a.accion}
              type="button"
              onClick={() => onAbrir(accion === a.accion ? null : { tipo: a.accion, v })}
              className={cn(
                'ml-2 inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium',
                a.principal ? 'bg-marca text-white hover:bg-marca/90' : 'text-marca hover:underline',
              )}
            >
              {a.etiqueta}
            </button>
          ))}
        </td>
      </tr>
      {accion && (
        <tr>
          <td colSpan={9} className="px-3 pb-3">
            {accion === 'modificar' ? (
              <FormViaje v={v} zona={zona} onCerrar={cerrar} />
            ) : accion === 'reprogramar' ? (
              <PanelReprogramar v={v} zona={zona} onCerrar={cerrar} />
            ) : accion === 'chofer' ? (
              <PanelChofer v={v} zona={zona} onCerrar={cerrar} />
            ) : accion === 'cancelar' ? (
              <PanelCancelar v={v} onCerrar={cerrar} />
            ) : (
              <PanelPaso v={v} paso={accion} zona={zona} onCerrar={cerrar} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** <select> de una lista de opciones; lo no disponible se muestra pero no se puede elegir. */
function Lista({
  valor,
  opciones,
  onCambiar,
  vacio = 'Elegí…',
  ...resto
}: { valor: string; opciones: Opcion[] | undefined; onCambiar: (v: string) => void; vacio?: string } & Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange'
>) {
  // `resto` trae id, clase y aria-* que pone <Campo>.
  return (
    <select {...resto} value={valor} onChange={(e) => onCambiar(e.target.value)}>
      <option value="">{vacio}</option>
      {opciones?.map((o) => (
        <option key={o.id} value={o.id} disabled={!!o.noDisponible && String(o.id) !== valor}>
          {o.nombre}
          {o.noDisponible ? ` (${o.noDisponible})` : ''}
        </option>
      ))}
    </select>
  );
}

const aIso = (local: string, zona: string) => (local ? (horaLocalAIso(local, zona) ?? local) : '');
const aLocal = (iso: string | null, zona: string) => (iso ? isoAHoraLocal(iso, zona) : '');

function FormViaje({ v, semiId, zona, onCerrar }: { v?: ViajeAbierto; semiId?: string; zona: string; onCerrar: () => void }) {
  const asignar = useAsignarViaje();
  const modificar = useModificarViaje();
  const { data: op } = useOpcionesViaje();
  const { error, enviar, campo } = useEnvio();
  const vacia = v && !v.conCarga;
  const [f, setF] = useState({
    semiId: v?.semiId ? String(v.semiId) : (semiId ?? ''),
    camionId: v ? String(v.camionId) : '',
    choferId: v ? String(v.choferId) : '',
    clienteId: v?.clienteId ? String(v.clienteId) : '',
    producto: v?.producto ?? '',
    contenedor: v?.contenedor ?? '',
    taraMaxDias: v?.taraMaxDias ? String(v.taraMaxDias) : '',
    origenId: v ? String(v.origenId) : '',
    destinoId: v ? String(v.destinoId) : '',
    fechaCarga: aLocal(v?.fechaCarga ?? null, zona),
    fechaDescarga: aLocal(v?.fechaDescarga ?? null, zona),
    observacion: v?.observacion ?? '',
  });
  const set = (k: keyof typeof f) => (val: string) => setF({ ...f, [k]: val });
  const ev = (k: keyof typeof f) => (e: { target: { value: string } }) => set(k)(e.target.value);
  const datos = { ...f, fechaCarga: aIso(f.fechaCarga, zona), fechaDescarga: aIso(f.fechaDescarga, zona) };
  const ocupado = asignar.isPending || modificar.isPending;
  return (
    <Panel
      titulo={v ? `Modificar el viaje de ${v.semi}` : 'Asignar viaje'}
      explicacion={
        v
          ? 'Solo mientras no salió. Para la descarga de un viaje en curso, usá «Reprogramar descarga».'
          : 'Queda planificado y se ve en la Pizarra como «Asignado». Un semi puede tener varios viajes en cola.'
      }
      error={error}
      ocupado={ocupado}
      textoBoton={v ? 'Guardar cambios' : 'Asignar'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(v ? modificar.mutateAsync({ ...datos, tramoId: v.tramoId }) : asignar.mutateAsync(datos), onCerrar)}
    >
      <Campo label="Semi *" error={campo('semiId')}>
        <Lista valor={f.semiId} opciones={op?.semis} onCambiar={set('semiId')} />
      </Campo>
      <Campo label="Tractor *" error={campo('camionId')}>
        <Lista valor={f.camionId} opciones={op?.tractores} onCambiar={set('camionId')} />
      </Campo>
      <Campo label="Chofer *" error={campo('choferId')}>
        <Lista valor={f.choferId} opciones={op?.choferes} onCambiar={set('choferId')} />
      </Campo>
      {!vacia && (
        <>
          <Campo label="Cliente *" error={campo('clienteId')}>
            <Lista valor={f.clienteId} opciones={op?.clientes} onCambiar={set('clienteId')} />
          </Campo>
          <Campo label="Producto" error={campo('producto')}>
            <input maxLength={200} value={f.producto} onChange={ev('producto')} placeholder="Arroz, banana, madera…" />
          </Campo>
          <Campo label="Contenedor" error={campo('contenedor')} ayuda="4 letras y 7 números (MSKU4829130).">
            <input className="uppercase" maxLength={20} value={f.contenedor} onChange={ev('contenedor')} />
          </Campo>
          <Campo label="Tara que pide (días)" error={campo('taraMaxDias')} ayuda="Vacío si la carga no pide.">
            <input inputMode="numeric" value={f.taraMaxDias} onChange={ev('taraMaxDias')} placeholder="30, 90…" />
          </Campo>
        </>
      )}
      <Campo label="Origen *" error={campo('origenId')}>
        <Lista valor={f.origenId} opciones={op?.lugares} onCambiar={set('origenId')} />
      </Campo>
      <Campo label="Destino *" error={campo('destinoId')}>
        <Lista valor={f.destinoId} opciones={op?.lugares} onCambiar={set('destinoId')} />
      </Campo>
      <Campo label={vacia ? 'Salida *' : 'Fecha de carga *'} error={campo('fechaCarga')}>
        <input type="datetime-local" value={f.fechaCarga} onChange={ev('fechaCarga')} />
      </Campo>
      {!vacia && (
        <Campo label="Descarga programada" error={campo('fechaDescarga')}>
          <input type="datetime-local" value={f.fechaDescarga} onChange={ev('fechaDescarga')} />
        </Campo>
      )}
      <Campo label="Observación" error={campo('observacion')}>
        <input maxLength={500} value={f.observacion} onChange={ev('observacion')} />
      </Campo>
    </Panel>
  );
}

function FormVuelta({ semiId, zona, onCerrar }: { semiId: string; zona: string; onCerrar: () => void }) {
  const asignar = useAsignarVueltaVacia();
  const { data: op } = useOpcionesViaje();
  const { error, enviar, campo } = useEnvio();
  const [f, setF] = useState({ semiId, camionId: '', choferId: '', origenId: '', destinoId: '', fecha: '', observacion: '' });
  const set = (k: keyof typeof f) => (val: string) => setF({ ...f, [k]: val });
  return (
    <Panel
      titulo="Vuelta vacía"
      explicacion="Se decidió que el semi vuelve sin carga. En la Pizarra se ve como «Vacío»."
      error={error}
      ocupado={asignar.isPending}
      textoBoton="Asignar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(asignar.mutateAsync({ ...f, fecha: aIso(f.fecha, zona) }), onCerrar)}
    >
      <Campo label="Semi *" error={campo('semiId')}>
        <Lista valor={f.semiId} opciones={op?.semis} onCambiar={set('semiId')} />
      </Campo>
      <Campo label="Tractor *" error={campo('camionId')}>
        <Lista valor={f.camionId} opciones={op?.tractores} onCambiar={set('camionId')} />
      </Campo>
      <Campo label="Chofer *" error={campo('choferId')}>
        <Lista valor={f.choferId} opciones={op?.choferes} onCambiar={set('choferId')} />
      </Campo>
      <Campo label="Desde *" error={campo('origenId')}>
        <Lista valor={f.origenId} opciones={op?.lugares} onCambiar={set('origenId')} />
      </Campo>
      <Campo label="Hasta *" error={campo('destinoId')}>
        <Lista valor={f.destinoId} opciones={op?.lugares} onCambiar={set('destinoId')} />
      </Campo>
      <Campo label="Salida *" error={campo('fecha')}>
        <input type="datetime-local" value={f.fecha} onChange={(e) => set('fecha')(e.target.value)} />
      </Campo>
      <Campo label="Observación" error={campo('observacion')}>
        <input maxLength={500} value={f.observacion} onChange={(e) => set('observacion')(e.target.value)} />
      </Campo>
    </Panel>
  );
}

const TEXTO_PASO: Record<
  PasoViaje,
  { titulo: string; explicacion: string; boton: string; lugar?: 'origen' | 'destino'; odometro?: boolean }
> = {
  salir: {
    titulo: 'Salir',
    explicacion: 'El viaje queda en curso. Tractor, chofer y semi no pueden estar en otro viaje en curso.',
    boton: 'Salió',
    odometro: true,
  },
  iniciar_carga: {
    titulo: 'Empezar carga',
    explicacion: 'En la Pizarra: «Cargando». Si el viaje no había salido, sale en ese momento.',
    boton: 'Empezó a cargar',
    lugar: 'origen',
    odometro: true,
  },
  terminar_carga: { titulo: 'Terminar carga', explicacion: 'En la Pizarra: «En viaje».', boton: 'Terminó de cargar' },
  iniciar_descarga: {
    titulo: 'Empezar descarga',
    explicacion: 'En la Pizarra: «Descargando».',
    boton: 'Empezó a descargar',
    lugar: 'destino',
  },
  terminar_descarga: {
    titulo: 'Terminar descarga',
    explicacion: 'Cierra el viaje: el servicio queda entregado y el semi pasa a su próximo viaje (o a Disponible).',
    boton: 'Terminó de descargar',
    odometro: true,
  },
  terminar_viaje: { titulo: 'Llegó', explicacion: 'Cierra la vuelta vacía.', boton: 'Llegó', odometro: true },
};

function PanelPaso({ v, paso, zona, onCerrar }: { v: ViajeAbierto; paso: PasoViaje; zona: string; onCerrar: () => void }) {
  const hacer = usePasoViaje();
  const { data: op } = useOpcionesViaje();
  const { error, enviar, campo } = useEnvio();
  const t = TEXTO_PASO[paso];
  const pideOdometro = t.odometro && (paso !== 'iniciar_carga' || !v.enCurso);
  const [f, setF] = useState({
    momento: '',
    lugarId: t.lugar === 'origen' ? String(v.origenId) : t.lugar === 'destino' ? String(v.destinoId) : '',
    odometroKm: '',
  });
  return (
    <Panel
      titulo={`${t.titulo} · ${v.semi}`}
      explicacion={t.explicacion}
      error={error}
      ocupado={hacer.isPending}
      textoBoton={t.boton}
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          hacer.mutateAsync({
            tramoId: v.tramoId,
            paso,
            momento: aIso(f.momento, zona),
            lugarId: f.lugarId,
            odometroKm: pideOdometro ? f.odometroKm : '',
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Fecha y hora" error={campo('momento')} ayuda="Vacío = ahora.">
        <input type="datetime-local" value={f.momento} onChange={(e) => setF({ ...f, momento: e.target.value })} />
      </Campo>
      {t.lugar && (
        <Campo label="Lugar" error={campo('lugarId')}>
          <Lista valor={f.lugarId} opciones={op?.lugares} onCambiar={(x) => setF({ ...f, lugarId: x })} />
        </Campo>
      )}
      {pideOdometro && (
        <Campo label="Odómetro del tractor (km)" error={campo('odometroKm')} ayuda="Vacío = el de la telemetría a esa hora.">
          <input inputMode="decimal" value={f.odometroKm} onChange={(e) => setF({ ...f, odometroKm: e.target.value })} />
        </Campo>
      )}
    </Panel>
  );
}

function PanelReprogramar({ v, zona, onCerrar }: { v: ViajeAbierto; zona: string; onCerrar: () => void }) {
  const hacer = useReprogramarDescarga();
  const { error, enviar, campo } = useEnvio();
  const [fecha, setFecha] = useState(aLocal(v.fechaDescarga, zona));
  return (
    <Panel
      titulo={`Reprogramar descarga · ${v.semi}`}
      error={error}
      ocupado={hacer.isPending}
      textoBoton="Guardar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(hacer.mutateAsync({ tramoId: v.tramoId, fechaDescarga: aIso(fecha, zona) }), onCerrar)}
    >
      <Campo label="Descarga programada" error={campo('fechaDescarga')}>
        <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
    </Panel>
  );
}

function PanelChofer({ v, zona, onCerrar }: { v: ViajeAbierto; zona: string; onCerrar: () => void }) {
  const hacer = useCambiarChofer();
  const { data: op } = useOpcionesViaje();
  const { error, enviar, campo } = useEnvio();
  const [f, setF] = useState({ choferId: '', desde: '' });
  return (
    <Panel
      titulo={`${v.enCurso ? 'Relevo de chofer' : 'Cambiar chofer'} · ${v.semi}`}
      explicacion={v.enCurso ? 'Queda registrado quién manejó cada parte del viaje.' : 'Reemplaza al chofer del viaje planificado.'}
      error={error}
      ocupado={hacer.isPending}
      textoBoton="Cambiar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(hacer.mutateAsync({ tramoId: v.tramoId, choferId: f.choferId, desde: aIso(f.desde, zona) }), onCerrar)}
    >
      <Campo label="Chofer nuevo *" error={campo('choferId')}>
        <Lista
          valor={f.choferId}
          opciones={op?.choferes.filter((c) => c.id !== v.choferId)}
          onCambiar={(x) => setF({ ...f, choferId: x })}
        />
      </Campo>
      {v.enCurso && (
        <Campo label="Desde" error={campo('desde')} ayuda="Vacío = ahora.">
          <input type="datetime-local" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
        </Campo>
      )}
    </Panel>
  );
}

function PanelCancelar({ v, onCerrar }: { v: ViajeAbierto; onCerrar: () => void }) {
  const hacer = useCancelarViaje();
  const { error, enviar, campo } = useEnvio();
  const [motivo, setMotivo] = useState('');
  return (
    <Panel
      titulo={`Cancelar el viaje de ${v.semi}`}
      explicacion="Queda anulado con su motivo; si el servicio no tiene otro viaje, se cancela también."
      error={error}
      ocupado={hacer.isPending}
      textoBoton="Cancelar viaje"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(hacer.mutateAsync({ tramoId: v.tramoId, motivo }), onCerrar)}
    >
      <Campo label="Motivo *" error={campo('motivo')}>
        <input maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
    </Panel>
  );
}
