'use client';

import { useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Ellipsis, Fuel, LoaderCircle, Play, Plus, Undo2 } from 'lucide-react';
import { useAbrirFicha } from '@/modules/core/fichas/contexto';
import { useSesion } from '@/modules/core/session/session-provider';
import { PASO_OPERACION_ETIQUETA, PASOS_CON_ODOMETRO, type PasoOperacion } from '@/modules/logistica/domain/operacion.types';
import { useAvanzarOperacion, useContinuarOperacionViaje, useIniciarViajeChofer, useVolverPaso } from '@/modules/logistica/queries/hooks';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, horaLocalAIso } from '@/shared/lib/fechas';
import { ErrorBase } from '@/shared/ui/errores';
import { CampoGlobo, ENTRADA_GLOBO, Globo } from '@/shared/ui/globo';
import type { FilaPizarra } from '../domain/pizarra.types';
import { botonesPaso, puedeIniciarViaje, type SigueFila } from '../domain/pizarra.sigue';

export interface PermisosSigue {
  /** Avanzar y volver pasos: la acción de Operaciones (operacion.servicios:editar). */
  pasos: boolean;
  /** Iniciar el viaje del chofer y «Continúa a…» (operacion.tramos:editar). */
  viajes: boolean;
}

type Abierto = { que: 'paso'; paso: PasoOperacion; error: ErrorAccion | null } | { que: 'mas' } | { que: 'iniciar' } | null;

const BOTON = 'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold whitespace-nowrap disabled:opacity-60';
const PRINCIPAL = 'bg-marca text-white hover:bg-marca/90';
const SECUNDARIO = 'border border-borde bg-panel text-tinta hover:bg-hover';

/**
 * Sprint 6 · «Lo que sigue» de una fila de la Pizarra: el próximo paso de la operación (lo dice la
 * base con ops.fn_pasos), iniciar el viaje del chofer y «Continúa a…». Cada botón llama a la acción
 * de siempre; si la base pide algo más o no lo permite, se abre el globo con su mensaje tal cual.
 */
export function LoQueSigue({ f, s, permisos }: { f: FilaPizarra; s: SigueFila | undefined; permisos: PermisosSigue }) {
  const { zonaHoraria } = useSesion();
  const abrirFicha = useAbrirFicha();
  const avanzar = useAvanzarOperacion();
  const continuar = useContinuarOperacionViaje();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const celda = useRef<HTMLSpanElement>(null);
  const [enCurso, setEnCurso] = useState<PasoOperacion | 'continuar' | null>(null);
  const [error, setError] = useState<ErrorAccion | null>(null);

  if (!s) return <span className="text-tinta-suave">—</span>;
  const { principal, otros } = permisos.pasos ? botonesPaso(s) : { principal: null, otros: [] };
  const iniciar = permisos.viajes && puedeIniciarViaje(s);
  const sigueContinua = permisos.viajes && s.continua !== null && s.itemId !== null;
  const hayMas = otros.length > 0 || (permisos.pasos && s.puedeVolver);

  const hacer = async (paso: PasoOperacion) => {
    if (!s.servicioId) return;
    setError(null);
    // El motivo de la demora siempre se pide
    if (paso === 'demora') return setAbierto({ que: 'paso', paso, error: null });
    setEnCurso(paso);
    const r = await avanzar.mutateAsync({ servicioId: s.servicioId, paso, momento: '', odometroKm: '', detalle: '' });
    setEnCurso(null);
    // Si la base pide algo más (el odómetro sin telemetría…) o no lo permite, el globo muestra su mensaje
    if (r.ok) setAbierto(null);
    else setAbierto({ que: 'paso', paso, error: r.error });
  };

  const nada = !principal && !hayMas && !iniciar && !sigueContinua && !s.viajeId;
  if (nada) return <span className="text-tinta-suave">—</span>;

  return (
    <span ref={celda} className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {principal && (
        <button type="button" className={cn(BOTON, PRINCIPAL)} disabled={enCurso !== null} onClick={() => void hacer(principal)}>
          {enCurso === principal && <LoaderCircle className="size-3.5 animate-spin" />}
          {PASO_OPERACION_ETIQUETA[principal]}
        </button>
      )}
      {sigueContinua && s.continua && (
        <button
          type="button"
          className={cn(BOTON, 'border border-marca text-marca hover:bg-marca-suave')}
          disabled={enCurso !== null}
          title={s.continua.linea ? `Agrega el tramo ${s.continua.linea} al viaje ${s.viajeNumero ?? ''}` : 'Falta la línea de ese tramo'}
          onClick={async () => {
            setError(null);
            setEnCurso('continuar');
            const r = await continuar.mutateAsync({ itemId: s.itemId! });
            setEnCurso(null);
            if (!r.ok) setError(r.error);
          }}
        >
          {enCurso === 'continuar' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Continúa a {s.continua.hasta}
        </button>
      )}
      {iniciar && (
        <button type="button" className={cn(BOTON, principal ? SECUNDARIO : PRINCIPAL)} onClick={() => setAbierto({ que: 'iniciar' })}>
          <Play className="size-3.5" /> Iniciar viaje
        </button>
      )}
      {s.viajeId && s.situacionTractor === 'en_viaje' && (
        <button type="button" className="text-xs text-marca hover:underline" onClick={() => abrirFicha('viaje', s.viajeId!)}>
          Viaje {s.viajeNumero}
        </button>
      )}
      {hayMas && (
        <button
          type="button"
          aria-label="Más pasos"
          title="Más pasos"
          className={cn(BOTON, SECUNDARIO, 'px-1.5')}
          onClick={() => setAbierto(abierto?.que === 'mas' ? null : { que: 'mas' })}
        >
          <Ellipsis className="size-4" />
        </button>
      )}
      {error && !abierto && (
        <span role="alert" className="block w-full max-w-64 text-xs whitespace-normal text-error">
          {error.mensaje}
        </span>
      )}

      {abierto?.que === 'paso' && s.servicioId && (
        <GloboPaso
          ancla={celda}
          f={f}
          servicioId={s.servicioId}
          numero={s.numeroOperacion}
          paso={abierto.paso}
          errorInicial={abierto.error}
          zona={zonaHoraria}
          onCerrar={() => setAbierto(null)}
        />
      )}
      {abierto?.que === 'mas' && (
        <GloboMas ancla={celda} s={s} otros={otros} volver={permisos.pasos && s.puedeVolver} enCurso={enCurso} onPaso={(p) => void hacer(p)} onCerrar={() => setAbierto(null)} />
      )}
      {abierto?.que === 'iniciar' && (
        <GloboIniciar
          ancla={celda}
          f={f}
          s={s}
          zona={zonaHoraria}
          onCerrar={() => setAbierto(null)}
          onIniciado={(id) => {
            setAbierto(null);
            abrirFicha('viaje', id);
          }}
        />
      )}
    </span>
  );
}

/** El paso con lo que pide la base: fecha y hora, odómetro (sin telemetría) y nota o motivo. */
function GloboPaso({
  ancla,
  f,
  servicioId,
  numero,
  paso,
  errorInicial,
  zona,
  onCerrar,
}: {
  ancla: RefObject<HTMLElement | null>;
  f: FilaPizarra;
  servicioId: number;
  numero: number | null;
  paso: PasoOperacion;
  errorInicial: ErrorAccion | null;
  zona: string;
  onCerrar: () => void;
}) {
  const avanzar = useAvanzarOperacion();
  const [error, setError] = useState<ErrorAccion | null>(errorInicial);
  const [momento, setMomento] = useState('');
  const [odometro, setOdometro] = useState('');
  const [detalle, setDetalle] = useState('');
  const pideOdometro = !!f.tramoId && PASOS_CON_ODOMETRO.includes(paso);
  return (
    <Globo ancla={ancla} titulo={`${PASO_OPERACION_ETIQUETA[paso]}${numero ? ` · Op. ${numero}` : ''}`} onCerrar={onCerrar}>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const r = await avanzar.mutateAsync({
            servicioId,
            paso,
            momento: momento ? (horaLocalAIso(momento, zona) ?? momento) : '',
            odometroKm: odometro,
            detalle,
          });
          if (r.ok) onCerrar();
          else setError(r.error);
        }}
      >
        <ErrorBase error={error} />
        <CampoGlobo etiqueta="Fecha y hora" ayuda="Vacío = ahora.">
          <input type="datetime-local" className={ENTRADA_GLOBO} value={momento} onChange={(e) => setMomento(e.target.value)} />
        </CampoGlobo>
        {error?.campos?.momento && <p className="text-xs text-error">{error.campos.momento}</p>}
        {pideOdometro && (
          <CampoGlobo etiqueta="Odómetro del tractor (km)" ayuda="Solo si no hay telemetría.">
            <input inputMode="decimal" className={ENTRADA_GLOBO} value={odometro} onChange={(e) => setOdometro(e.target.value)} />
          </CampoGlobo>
        )}
        {error?.campos?.odometroKm && <p className="text-xs text-error">{error.campos.odometroKm}</p>}
        <CampoGlobo etiqueta={paso === 'demora' ? 'Motivo' : 'Nota'}>
          <input maxLength={500} className={ENTRADA_GLOBO} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        </CampoGlobo>
        <div className="flex gap-2 pt-1">
          <button type="submit" data-principal className={cn(BOTON, PRINCIPAL, 'h-8')} disabled={avanzar.isPending}>
            {avanzar.isPending && <LoaderCircle className="size-3.5 animate-spin" />} Registrar
          </button>
          <button type="button" className={cn(BOTON, SECUNDARIO, 'h-8')} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Globo>
  );
}

/** Los otros pasos posibles y deshacer el último (la base decide cuál y si se puede). */
function GloboMas({
  ancla,
  s,
  otros,
  volver,
  enCurso,
  onPaso,
  onCerrar,
}: {
  ancla: RefObject<HTMLElement | null>;
  s: SigueFila;
  otros: PasoOperacion[];
  volver: boolean;
  enCurso: PasoOperacion | 'continuar' | null;
  onPaso: (p: PasoOperacion) => void;
  onCerrar: () => void;
}) {
  const deshacer = useVolverPaso();
  const [seguro, setSeguro] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <Globo ancla={ancla} titulo={s.numeroOperacion ? `Operación ${s.numeroOperacion}` : 'Más pasos'} onCerrar={onCerrar}>
      {otros.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {otros.map((p) => (
            <button key={p} type="button" className={cn(BOTON, SECUNDARIO)} disabled={enCurso !== null} onClick={() => onPaso(p)}>
              {enCurso === p && <LoaderCircle className="size-3.5 animate-spin" />}
              {PASO_OPERACION_ETIQUETA[p]}
            </button>
          ))}
        </div>
      )}
      {volver && s.servicioId && (
        <div className="space-y-1 border-t border-borde pt-2 text-xs">
          {!seguro ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-tinta-suave hover:text-tinta hover:underline"
              onClick={() => {
                setHecho(null);
                setError(null);
                setSeguro(true);
              }}
            >
              <Undo2 className="size-3.5" /> Volver al paso anterior
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span>¿Deshacer el último paso?</span>
              <button
                type="button"
                data-principal
                className={cn(BOTON, PRINCIPAL)}
                disabled={deshacer.isPending}
                onClick={async () => {
                  const r = await deshacer.mutateAsync({ servicioId: s.servicioId! });
                  setSeguro(false);
                  if (!r.ok) return setError(r.error);
                  setHecho(r.data);
                }}
              >
                {deshacer.isPending && <LoaderCircle className="size-3.5 animate-spin" />} Sí, volver
              </button>
              <button type="button" className="text-tinta-suave hover:underline" onClick={() => setSeguro(false)}>
                No
              </button>
            </span>
          )}
          {hecho && <p className="text-exito">Se deshizo «{hecho}».</p>}
          <ErrorBase error={error} />
        </div>
      )}
    </Globo>
  );
}

/** Iniciar el viaje del chofer del tractor: sale con la carga a tanque lleno que ya tiene (la elige la base). */
function GloboIniciar({
  ancla,
  f,
  s,
  zona,
  onCerrar,
  onIniciado,
}: {
  ancla: RefObject<HTMLElement | null>;
  f: FilaPizarra;
  s: SigueFila;
  zona: string;
  onCerrar: () => void;
  onIniciado: (id: number) => void;
}) {
  const iniciar = useIniciarViajeChofer();
  const [llevaOperacion, setLlevaOperacion] = useState(s.servicioId !== null);
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (s.camionId === null) return null;
  const camionId = s.camionId;
  return (
    <Globo ancla={ancla} titulo={`Iniciar el viaje de ${f.tractor ?? 'el tractor'}`} onCerrar={onCerrar}>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const r = await iniciar.mutateAsync({
            camionId,
            choferId: '',
            items: llevaOperacion && s.servicioId ? [{ servicioId: s.servicioId, lineaId: null }] : [],
            observacion: '',
          });
          if (r.ok) onIniciado(r.data);
          else setError(r.error);
        }}
      >
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-tinta-suave">Sale con la carga a tanque lleno</p>
          {s.cargaSalida ? (
            <p className="flex items-center gap-1.5 font-medium">
              <Fuel className="size-4 text-marca" /> {formatearFechaHora(s.cargaSalida, zona)}
            </p>
          ) : (
            <p className="rounded-md bg-alerta-suave px-2 py-1.5 text-xs text-alerta">
              El tractor no tiene una carga a tanque lleno sin usar.{' '}
              <Link href="/combustible/cargas/nueva" className="underline">
                Registrala
              </Link>{' '}
              marcando «corte de viaje».
            </p>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-tinta-suave">Chofer</p>
          <p className="font-medium">{s.choferFijo ?? 'Sin chofer fijo'}</p>
        </div>
        {s.servicioId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={llevaOperacion} onChange={(e) => setLlevaOperacion(e.target.checked)} />
            Lleva la operación {s.numeroOperacion ?? ''}
          </label>
        )}
        <ErrorBase error={error} />
        <div className="flex gap-2 pt-1">
          <button type="submit" data-principal className={cn(BOTON, PRINCIPAL, 'h-8')} disabled={iniciar.isPending}>
            {iniciar.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Iniciar viaje
          </button>
          <button type="button" className={cn(BOTON, SECUNDARIO, 'h-8')} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
        <p className="text-xs text-tinta-suave">El chofer y lo que lleva se cambian después en la ficha del viaje.</p>
      </form>
    </Globo>
  );
}
