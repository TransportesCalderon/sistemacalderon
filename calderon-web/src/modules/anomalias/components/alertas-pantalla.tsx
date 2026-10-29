'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellRing, ChevronDown, ChevronUp, FileWarning, Hand, LoaderCircle, MapPin, MessageSquare, Undo2 } from 'lucide-react';
import { VERSION_ACTAS } from '@/modules/actas/domain/acta.types';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useCamionesCombustible, useChoferesCombustible } from '@/modules/combustible/queries/hooks';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { AccionConMotivo, Cargando, Chip, CLASE_TEXTAREA, Dato, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  DATOS_OCULTOS,
  ETIQUETA_DATO,
  ETIQUETA_ESTADO,
  ETIQUETA_RESOLUCION,
  ETIQUETA_SEVERIDAD,
  estaAbierta,
  etiquetaUnidad,
  SEVERIDADES,
  VERSION_FILTROS_ALERTAS,
  type Severidad,
  type Alerta,
  type Decision,
  type Vista,
} from '../domain/alerta.types';
import { useBandejaAlertas, useComentarAlerta, useDetalleAlerta, useReabrirAlerta, useResolverAlerta, useTomarAlerta } from '../queries/hooks';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';

const TONO_SEVERIDAD: Record<string, Tono> = { alta: 'error', media: 'alerta', baja: 'neutro' };
const TONO_ESTADO: Record<string, Tono> = { nueva: 'marca', en_revision: 'alerta', explicada: 'exito', descartada: 'neutro', confirmada_operativa: 'error' };
const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'abiertas', etiqueta: 'Abiertas' },
  { id: 'cerradas', etiqueta: 'Cerradas' },
  { id: 'todas', etiqueta: 'Todas' },
];
const DECISIONES: { id: Decision; etiqueta: string; ayuda: string }[] = [
  { id: 'justificada', etiqueta: 'Justificada', ayuda: 'Pasó, pero tiene explicación (trasvase, taller, espera en aduana…).' },
  { id: 'descartada', etiqueta: 'Falsa alarma', ayuda: 'El dato de la telemetría estaba mal o no pasó nada.' },
  { id: 'confirmada', etiqueta: 'Confirmada', ayuda: 'Pasó y no tiene explicación, sin descuento.' },
  { id: 'a_descontar', etiqueta: 'A descontar', ayuda: 'Faltan litros y se le descuentan al chofer.' },
];

const valor = (v: number | null, unidad: string | null) => (v === null ? '—' : `${formatearNumero(v, unidad === 'km' ? 1 : 0)} ${etiquetaUnidad(unidad)}`.trim());

/**
 * Combustible > Alertas (migración 49): lo que detecta el motor cada 30 minutos con la
 * telemetría (descenso del tanque con el camión detenido, carga que no aparece en el tanque,
 * carga lejos de la estación, ralentí, consumo y velocidad). Se revisa acá: tomar,
 * justificar, descartar, confirmar o descontar al chofer. Todo lo decide la base.
 */
export function AlertasPantalla() {
  const [vista, setVista] = useState<Vista>('abiertas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [camion, setCamion] = useState('');
  const [severidad, setSeveridad] = useState<Severidad | ''>('');
  const conFiltros = useBaseTiene(VERSION_FILTROS_ALERTAS);
  const { data: camiones } = useCamionesCombustible();
  const filtros = conFiltros ? { camionId: camion ? Number(camion) : null, severidad: severidad || null } : undefined;
  const { data, isPending, isError, error, isFetching, refetch } = useBandejaAlertas(vista, desde || null, hasta || null, filtros);
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Alertas" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Las detecta el sistema con la telemetría de los camiones. Una alerta no acusa a nadie: es algo para mirar. Cada una se cierra con una explicación.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg border border-borde bg-panel p-1" role="group" aria-label="Vista">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={vista === v.id}
              onClick={() => setVista(v.id)}
              className={cn('rounded-md px-3 py-1.5 text-sm', vista === v.id ? 'bg-marca text-white' : 'text-tinta-suave hover:text-tinta')}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Desde</span>
          <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Hasta</span>
          <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {conFiltros && (
          <>
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Tractor</span>
              <select className={CONTROL_FILTRO} value={camion} onChange={(e) => setCamion(e.target.value)}>
                <option value="">Todos</option>
                {camiones?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patente}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Gravedad</span>
              <select className={CONTROL_FILTRO} value={severidad} onChange={(e) => setSeveridad(e.target.value as Severidad | '')}>
                <option value="">Todas</option>
                {SEVERIDADES.map((s) => (
                  <option key={s} value={s}>
                    {ETIQUETA_SEVERIDAD[s]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {isFetching && !isPending && <LoaderCircle className="mb-2 size-4 animate-spin text-tinta-suave" />}
      </div>

      {isPending ? (
        <Cargando texto="Cargando las alertas…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudieron cargar las alertas.'} onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<BellRing className="size-6" />} texto={camion || severidad ? 'No hay alertas con esos filtros.' : vista === 'abiertas' ? 'No hay alertas abiertas.' : 'No hay alertas en el período.'} />
      ) : (
        <ul className="space-y-3">
          {data.map((a) => (
            <FilaAlerta key={a.id} a={a} abierta={abierta === a.id} onAlternar={() => setAbierta(abierta === a.id ? null : a.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaAlerta({ a, abierta, onAlternar }: { a: Alerta; abierta: boolean; onAlternar: () => void }) {
  const { zonaHoraria } = useSesion();
  const cuando = a.desde ?? a.detectada;
  return (
    <li className={cn(TARJETA, 'p-4')}>
      <button type="button" className="flex w-full flex-wrap items-start justify-between gap-3 text-left" onClick={onAlternar} aria-expanded={abierta}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={TONO_SEVERIDAD[a.severidad] ?? 'neutro'}>{ETIQUETA_SEVERIDAD[a.severidad] ?? a.severidad}</Chip>
            <span className="font-medium text-tinta">{a.tipo}</span>
            <Chip tono={TONO_ESTADO[a.estado] ?? 'neutro'}>{ETIQUETA_ESTADO[a.estado] ?? a.estado}</Chip>
            {a.comentarios > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-tinta-suave">
                <MessageSquare className="size-3.5" /> {a.comentarios}
              </span>
            )}
          </div>
          <p className="text-sm text-tinta-suave">
            <span className="font-mono text-tinta">{a.patente ?? 'Sin camión'}</span>
            {' · '}
            {a.chofer ?? 'Chofer sin identificar'}
            {' · '}
            {formatearFechaHora(cuando, zonaHoraria)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <p className="font-semibold text-tinta tabular-nums">{valor(a.observado, a.unidad)}</p>
            {a.esperado !== null && <p className="text-xs text-tinta-suave">referencia {valor(a.esperado, a.unidad)}</p>}
          </div>
          {abierta ? <ChevronUp className="size-5 text-tinta-suave" /> : <ChevronDown className="size-5 text-tinta-suave" />}
        </div>
      </button>
      {abierta && <DetalleFila a={a} />}
    </li>
  );
}

function DetalleFila({ a }: { a: Alerta }) {
  const { zonaHoraria } = useSesion();
  const { data: d, isPending, isError, refetch } = useDetalleAlerta(a.id);
  const puede = useCan('anomalias.alertas:transicionar');
  // Migración 122: de una alerta confirmada se hace el acta de infracción (la base valida todo)
  const puedeActa = useCan('operacion.actas:editar');
  const hayActas = useBaseTiene(VERSION_ACTAS);
  const hacerActa = puedeActa && hayActas && a.estado === 'confirmada_operativa';
  const datos = Object.entries(a.evidencia).filter(([k, v]) => !DATOS_OCULTOS.has(k) && v !== null && typeof v !== 'object');
  const lat = Number(a.evidencia.latitud);
  const lon = Number(a.evidencia.longitud);
  const hayPosicion = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && a.evidencia.latitud != null;

  return (
    <div className="mt-4 space-y-4 border-t border-borde pt-4">
      {d?.regla.descripcion && <p className="text-sm text-tinta-suave">{d.regla.descripcion}</p>}
      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {a.desde && a.hasta && a.hasta !== a.desde && (
          <Dato etiqueta="Entre">
            {formatearFechaHora(a.desde, zonaHoraria)}
            <span className="block">{formatearFechaHora(a.hasta, zonaHoraria)}</span>
          </Dato>
        )}
        {datos.map(([k, v]) => (
          <Dato key={k} etiqueta={ETIQUETA_DATO[k] ?? k}>
            {typeof v === 'number'
              ? formatearNumero(v, Number.isInteger(v) ? 0 : 1)
              : k === 'dia'
                ? formatearFechaDia(String(v))
                : k.endsWith('_ts')
                  ? formatearFechaHora(String(v), zonaHoraria)
                  : String(v)}
          </Dato>
        ))}
        {d?.carga && (
          <Dato etiqueta="Carga">
            <NombreEnlazado tipo="carga" id={d.carga.id} className="text-marca hover:underline">
              {formatearNumero(d.carga.litros, 0)} L · {formatearFechaHora(d.carga.fechaHora, zonaHoraria)}
            </NombreEnlazado>
            {d.carga.estacion && <span className="block text-xs text-tinta-suave">{d.carga.estacion}</span>}
          </Dato>
        )}
      </dl>
      {hayPosicion && (
        <a className="inline-flex items-center gap-1 text-sm text-marca hover:underline" href={`https://www.google.com/maps?q=${lat},${lon}`} target="_blank" rel="noreferrer">
          <MapPin className="size-4" /> Ver dónde estaba el camión
        </a>
      )}
      {Array.isArray(a.evidencia.detalle) && a.evidencia.detalle.length > 0 && (
        <ul className="space-y-0.5 text-sm text-tinta-suave">
          {(a.evidencia.detalle as { desde?: string; hasta?: string; minutos?: number }[]).map((x, i) => (
            <li key={i}>
              {x.desde ? formatearFechaHora(x.desde, zonaHoraria) : '—'} → {x.hasta ? formatearFechaHora(x.hasta, zonaHoraria) : '—'} · {x.minutos ?? '—'} min
            </li>
          ))}
        </ul>
      )}

      {a.resolucion && (
        <div className="rounded-lg bg-hover p-3 text-sm">
          <p className="font-medium text-tinta">{ETIQUETA_RESOLUCION[a.resolucion] ?? a.resolucion}</p>
          {hacerActa && (
            <Link href={`/actas?alerta=${a.id}`} className="mt-2 inline-flex items-center gap-1 font-medium text-marca hover:underline">
              <FileWarning className="size-4" /> Hacer el acta de infracción
            </Link>
          )}
          {a.resolucion === 'a_descontar' && (
            <p className="text-tinta-suave">
              {a.descuentoChofer ?? '—'} · {formatearNumero(a.descuentoL, 2)} L
              {a.descuentoImporte !== null && ` · ${a.moneda ?? ''} ${formatearNumero(a.descuentoImporte, 2)}`}
              {a.descuentoImporte === null && ' · sin precio de referencia en los últimos 60 días'}
            </p>
          )}
        </div>
      )}

      {isPending ? (
        <Cargando texto="Cargando el historial…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo cargar el historial." onReintentar={() => refetch()} />
      ) : (
        (d.historial.length > 0 || d.comentarios.length > 0) && (
          <ul className="space-y-1.5 text-sm">
            {[
              ...d.historial
                .filter((h) => h.anterior !== null)
                .map((h) => ({ en: h.en, quien: h.usuario, texto: `${ETIQUETA_ESTADO[h.estado] ?? h.estado}${h.justificacion ? `: ${h.justificacion}` : ''}`, comentario: false })),
              ...d.comentarios.map((c) => ({ en: c.en, quien: c.usuario, texto: c.texto, comentario: true })),
            ]
              .sort((x, y) => x.en.localeCompare(y.en))
              .map((x, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-xs text-tinta-suave tabular-nums">{formatearFechaHora(x.en, zonaHoraria)}</span>
                  <span className={cn(x.comentario ? 'text-tinta' : 'text-tinta-suave')}>
                    <span className="font-medium">{x.quien ?? 'Sistema'}</span>: {x.texto}
                  </span>
                </li>
              ))}
          </ul>
        )
      )}

      {puede && <Acciones a={a} />}
    </div>
  );
}

function Acciones({ a }: { a: Alerta }) {
  const tomar = useTomarAlerta();
  const reabrir = useReabrirAlerta();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [errorReabrir, setErrorReabrir] = useState<ErrorAccion | null>(null);
  const abierta = estaAbierta(a);

  return (
    <div className="space-y-4">
      {abierta ? (
        <>
          {a.estado === 'nueva' && (
            <div className="space-y-2">
              <ErrorBase error={error} />
              <button
                type="button"
                className={BOTON_SECUNDARIO}
                disabled={tomar.isPending}
                onClick={async () => {
                  setError(null);
                  const r = await tomar.mutateAsync({ alertaId: a.id });
                  if (!r.ok) setError(r.error);
                }}
              >
                {tomar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Hand className="size-4" />} La reviso yo
              </button>
            </div>
          )}
          <Resolver a={a} />
        </>
      ) : (
        <AccionConMotivo
          etiqueta="Reabrir"
          icono={<Undo2 className="size-4" />}
          titulo="Reabrir la alerta"
          explicacion="Vuelve a «En revisión» y se borra la decisión (y el descuento, si lo había)."
          ocupado={reabrir.isPending}
          error={errorReabrir}
          onConfirmar={async (motivo) => {
            setErrorReabrir(null);
            const r = await reabrir.mutateAsync({ alertaId: a.id, justificacion: motivo });
            if (!r.ok) setErrorReabrir(r.error);
            return r.ok;
          }}
        />
      )}
      <Comentar alertaId={a.id} />
    </div>
  );
}

function Resolver({ a }: { a: Alerta }) {
  const resolver = useResolverAlerta();
  const { data: choferes } = useChoferesCombustible();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [texto, setTexto] = useState('');
  const [choferId, setChoferId] = useState<string>(a.choferId ? String(a.choferId) : '');
  const [litros, setLitros] = useState<string>(a.unidad === 'l' && a.observado !== null ? String(a.observado) : '');
  const [error, setError] = useState<ErrorAccion | null>(null);

  return (
    <div className="space-y-3 rounded-lg border border-borde p-4">
      <h3 className="font-medium text-tinta">Cerrar la alerta</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DECISIONES.map((o) => (
          <label
            key={o.id}
            className={cn('cursor-pointer rounded-lg border p-3 text-sm', decision === o.id ? 'border-marca bg-marca-suave' : 'border-borde hover:bg-hover')}
          >
            <input type="radio" name={`decision-${a.id}`} className="sr-only" checked={decision === o.id} onChange={() => setDecision(o.id)} />
            <span className="block font-medium text-tinta">{o.etiqueta}</span>
            <span className="block text-xs text-tinta-suave">{o.ayuda}</span>
          </label>
        ))}
      </div>
      {decision === 'a_descontar' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="block font-medium text-tinta">Chofer</span>
            <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={choferId} onChange={(e) => setChoferId(e.target.value)}>
              <option value="">Elegí…</option>
              {choferes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block font-medium text-tinta">Litros a descontar</span>
            <input inputMode="decimal" className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={litros} onChange={(e) => setLitros(e.target.value)} />
            <span className="block text-xs text-tinta-suave">El importe sale del precio promedio del litro de ese camión en los últimos 60 días.</span>
          </label>
        </div>
      )}
      {decision && (
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-tinta">Explicación *</span>
          <textarea rows={3} maxLength={1000} className={CLASE_TEXTAREA} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      )}
      <ErrorBase error={error} />
      {decision && (
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={resolver.isPending || texto.trim() === ''}
          onClick={async () => {
            setError(null);
            const l = litros.trim().replace(',', '.');
            const r = await resolver.mutateAsync({
              alertaId: a.id,
              decision,
              justificacion: texto.trim(),
              choferId: decision === 'a_descontar' && choferId ? Number(choferId) : null,
              litros: decision === 'a_descontar' && l !== '' && Number.isFinite(Number(l)) && Number(l) > 0 ? Number(l) : null,
            });
            if (!r.ok) setError(r.error);
          }}
        >
          {resolver.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar decisión
        </button>
      )}
    </div>
  );
}

function Comentar({ alertaId }: { alertaId: number }) {
  const comentar = useComentarAlerta();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <textarea
          rows={1}
          maxLength={2000}
          placeholder="Agregar un comentario…"
          className={cn(CLASE_TEXTAREA, 'min-w-0 flex-1')}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={comentar.isPending || texto.trim() === ''}
          onClick={async () => {
            setError(null);
            const r = await comentar.mutateAsync({ alertaId, texto: texto.trim() });
            if (!r.ok) setError(r.error);
            else setTexto('');
          }}
        >
          {comentar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <MessageSquare className="size-4" />} Comentar
        </button>
      </div>
      <ErrorBase error={error} />
    </div>
  );
}
