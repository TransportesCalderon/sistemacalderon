'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ban, CircleAlert, FilePlus2, FileText, LoaderCircle, RefreshCw, ShieldCheck, Stamp, TriangleAlert } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conUnidad, formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import type { CierreViajeId } from '@/shared/types/dominio';
import { ETIQUETA_TEST_ALCOHOL, resultadoVerificacion, type CierreViaje, type ResultadoCierre } from '../../domain/cierre.types';
import {
  useActualizarLimites,
  useAnularCierre,
  useAprobarCierre,
  useCamionesCombustible,
  useChoferesCombustible,
  useCierre,
  useCrearBorrador,
  useResultadoCierre,
  useVerificacion,
} from '../../queries/hooks';
import { AccionConMotivo, Cargando, Dato, DiferenciaL, ErrorBase, ErrorLectura, Seccion } from '../comun/ui';
import { BorradorForm } from './borrador-form';
import { EstadoCierreChip, VerificacionChip } from './estado-cierre';

/**
 * Ficha del cierre de viaje. Todo número sale de la base: en el borrador, de
 * fue.fn_resultado_cierre (en vivo); aprobado o anulado, de las columnas congeladas.
 * La verificación (fue.fn_verificar_cierre) es una comprobación, no un estado.
 */
export function CierreFicha({ id }: { id: CierreViajeId }) {
  const { data: cierre, isPending, isError, refetch } = useCierre(id);
  const esBorrador = cierre?.estado === 'borrador';
  const vivo = useResultadoCierre(id, esBorrador);

  if (isPending) return <Cargando texto="Cargando el cierre…" />;
  if (isError || !cierre) return <ErrorLectura texto={isError ? 'No se pudo cargar el cierre.' : 'El cierre no existe.'} onReintentar={() => refetch()} />;

  const resultado = esBorrador ? (vivo.data ?? null) : cierre.congelado;

  return (
    <div className="space-y-5">
      <Link href="/combustible/cierres" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> Cierres de viaje
      </Link>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-tinta">Cierre {cierre.numero}</h1>
        <EstadoCierreChip estado={cierre.estado} />
        {esBorrador && <span className="text-sm text-tinta-suave">Resultado en vivo: cambia si cambian las cargas o los controles del viaje.</span>}
        {cierre.aprobadoEn && (
          <a href={`/combustible/cierres/${cierre.id}/acta`} target="_blank" rel="noopener" className={`${BOTON_SECUNDARIO} ml-auto`}>
            <FileText className="size-4" /> Acta para firmar
          </a>
        )}
      </header>

      <Identificacion cierre={cierre} resultado={resultado} />

      {esBorrador && vivo.isPending ? (
        <Cargando texto="Calculando el resultado…" />
      ) : esBorrador && vivo.isError ? (
        <div className="space-y-2">
          <ErrorBase error={{ codigo: 'regla_negocio', mensaje: vivo.error.message }} />
          <button type="button" className="text-sm text-marca hover:underline" onClick={() => vivo.refetch()}>
            Reintentar
          </button>
        </div>
      ) : resultado ? (
        <>
          {esBorrador && <Pendientes resultado={resultado} />}
          {resultado.versionCalculo === 1 ? <CalculoAnterior resultado={resultado} /> : <CombustibleCamion resultado={resultado} />}
          <Resultado cierre={cierre} resultado={resultado} />
        </>
      ) : (
        <p className="text-sm text-tinta-suave">El cierre no tiene resultado congelado (se anuló sin haberse aprobado).</p>
      )}

      {cierre.estado === 'aprobado' && <VerificacionCierre id={cierre.id} />}
      {esBorrador && <BorradorForm cierre={cierre} />}
      <Acciones cierre={cierre} onRecargar={() => refetch()} />
    </div>
  );
}

function Identificacion({ cierre, resultado }: { cierre: CierreViaje; resultado: ResultadoCierre | null }) {
  const { zonaHoraria, usuarioId } = useSesion();
  const { data: camiones } = useCamionesCombustible();
  const { data: choferes } = useChoferesCombustible();
  const puedeEditar = useCan('combustible.cierre_viaje:editar');
  const puedeTransicionar = useCan('combustible.cierre_viaje:transicionar');
  const veSensibles = puedeEditar || puedeTransicionar;
  const camion = camiones?.find((c) => c.id === cierre.camionId);
  const chofer = (id: number | null) => (id ? (choferes?.find((c) => c.id === id)?.nombre ?? `Chofer #${id}`) : null);
  const responsable = chofer(cierre.datos.choferResponsableId ?? resultado?.choferResponsableId ?? null);
  const propuesto = chofer(resultado?.choferPropuestoId ?? null);
  const usuario = (u: number | null) => (u === null ? '—' : u === usuarioId ? 'vos' : `usuario #${u}`);

  return (
    <Seccion titulo="Identificación">
      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Dato etiqueta="Número">
          <span className="font-mono">{cierre.numero}</span>
        </Dato>
        <Dato etiqueta="Camión">{camion ? `${camion.codigoInterno} · ${camion.patente}` : `#${cierre.camionId}`}</Dato>
        <Dato etiqueta="Responsable">
          {responsable ?? <span className="text-tinta-suave">Sin asignar</span>}
          {!cierre.datos.choferResponsableId && propuesto && <span className="block text-xs text-tinta-suave">Propuesto por la base: {propuesto}</span>}
        </Dato>
        <Dato etiqueta="Línea">{resultado?.lineaViaje ?? '—'}</Dato>
        <Dato etiqueta="Salida (corte inicial)">
          <Link href={`/combustible/cargas/${cierre.cargaSalidaId}`} className="text-marca hover:underline">
            {formatearFechaHora(cierre.salidaTs, zonaHoraria)}
          </Link>
        </Dato>
        <Dato etiqueta="Llegada (corte final)">
          <Link href={`/combustible/cargas/${cierre.cargaLlegadaId}`} className="text-marca hover:underline">
            {formatearFechaHora(cierre.llegadaTs, zonaHoraria)}
          </Link>
        </Dato>
        <Dato etiqueta="Creado">{formatearFechaHora(cierre.creadoEn, zonaHoraria)}</Dato>
        {cierre.aprobadoEn && (
          <Dato etiqueta="Aprobado">
            {formatearFechaHora(cierre.aprobadoEn, zonaHoraria)} por {usuario(cierre.aprobadoPor)}
          </Dato>
        )}
        {cierre.anuladoEn && (
          <Dato etiqueta="Anulado">
            {formatearFechaHora(cierre.anuladoEn, zonaHoraria)} por {usuario(cierre.anuladoPor)}
            {cierre.motivoAnulacion && <span className="block text-xs text-tinta-suave">{cierre.motivoAnulacion}</span>}
          </Dato>
        )}
        {veSensibles && cierre.estado !== 'borrador' && (
          <>
            <Dato etiqueta="Test de alcohol">{cierre.datos.testAlcohol ? ETIQUETA_TEST_ALCOHOL[cierre.datos.testAlcohol] : '—'}</Dato>
            <Dato etiqueta="Programador de velocidad">{cierre.datos.programadorVelocidadPct === null ? '—' : `${formatearNumero(cierre.datos.programadorVelocidadPct)} %`}</Dato>
          </>
        )}
      </dl>
    </Seccion>
  );
}

function Pendientes({ resultado }: { resultado: ResultadoCierre }) {
  if (resultado.pendientes.length === 0) {
    return <p className="flex items-center gap-2 text-sm text-exito"><ShieldCheck className="size-4" /> La base no informa pendientes.</p>;
  }
  return (
    <section role="status" className="space-y-2 rounded-xl border border-alerta/30 bg-alerta-suave p-4 text-sm">
      <h2 className="flex items-center gap-2 font-medium text-alerta">
        <CircleAlert className="size-4" /> Pendientes para aprobar
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        {resultado.pendientes.map((p) => (
          <li key={p.codigo + p.mensaje}>{p.mensaje}</li>
        ))}
      </ul>
    </section>
  );
}

const FUENTES: Record<string, string> = {
  telemetria: 'telemetría',
  agregado_diario: 'resumen diario de la telemetría',
  manual: 'cargado a mano',
  cargas: 'odómetro de las cargas',
  tramos: 'tramos operativos',
};
const fuente = (f: string | null) => (f ? (FUENTES[f] ?? f) : '—');

/** La diferencia en palabras (el signo lo da la base; si se descuenta o no lo dice el resultado). */
function explicacionDiferencia(d: number | null): string {
  if (d === null) return 'Falta el consumo del motor para comparar.';
  if (d > 0) return `Se cargaron ${formatearNumero(d)} L más de lo que consumió el motor: ese combustible no aparece.`;
  if (d < 0) return `El motor consumió ${formatearNumero(-d)} L más de lo que se cargó.`;
  return 'Lo cargado coincide con lo que consumió el motor.';
}

/** Cuatro cifras principales de un componente (libro, físico, diferencia, tolerancia). */
function Cuatro({ libro, fisico, etiquetaLibro, etiquetaFisico, diferencia, tolerancia }: { libro: number | null; fisico: number | null; etiquetaLibro: string; etiquetaFisico: string; diferencia: number | null; tolerancia: number | null }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-4">
      <Dato etiqueta={etiquetaLibro} destacado>
        {conUnidad(libro, 'L')}
      </Dato>
      <Dato etiqueta={etiquetaFisico} destacado>
        {conUnidad(fisico, 'L')}
      </Dato>
      <Dato etiqueta="Diferencia" destacado>
        <DiferenciaL litros={diferencia} toleranciaL={tolerancia} />
      </Dato>
      <Dato etiqueta="Tolerancia" destacado>
        {tolerancia === null ? '—' : `± ${formatearNumero(tolerancia)} L`}
      </Dato>
    </dl>
  );
}

function Detalle({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 border-t border-borde pt-3 sm:grid-cols-3 lg:grid-cols-5">{children}</dl>;
}

/**
 * Combustible del camión (migración 26): todos los tanques, mochila incluida, como un solo volumen.
 * Libro = cargas + entradas − salidas + faltante al llegar − faltante al salir (lo calcula la base).
 */
function CombustibleCamion({ resultado: { camion: c } }: { resultado: ResultadoCierre }) {
  return (
    <Seccion titulo="Combustible del camión">
      <Cuatro
        etiquetaLibro="Libro (todos los tanques)"
        etiquetaFisico="Medido (plataforma)"
        libro={c.libroL}
        fisico={c.consumoPlataformaL}
        diferencia={c.diferenciaL}
        tolerancia={c.toleranciaL}
      />
      <p className="text-sm text-tinta">{explicacionDiferencia(c.diferenciaL)}</p>
      <Detalle>
        <Dato etiqueta="Cargas del viaje">{conUnidad(c.cargasL, 'L')}</Dato>
        <Dato etiqueta="Entradas (bidón, otro camión)">{conUnidad(c.entradasL, 'L')}</Dato>
        <Dato etiqueta="Salidas (descargas, con motivo)">{conUnidad(c.salidasL, 'L')}</Dato>
        <Dato etiqueta="Faltó llenar al salir">{conUnidad(c.faltanteSalidaL, 'L')}</Dato>
        <Dato etiqueta="Faltó llenar al llegar">{conUnidad(c.faltanteLlegadaL, 'L')}</Dato>
        <Dato etiqueta="Consumo del motor, de">{fuente(c.fuenteConsumo)}</Dato>
        <Dato etiqueta="Km recorridos">
          {conUnidad(c.kmRecorridos, 'km', 1)}
          {c.fuenteKm && <span className="ml-1 text-xs text-tinta-suave">({fuente(c.fuenteKm)})</span>}
        </Dato>
        <Dato etiqueta="Consumo">{c.consumoL100km === null ? '—' : `${formatearNumero(c.consumoL100km)} L/100 km`}</Dato>
        <Dato etiqueta="Horas motor / ralentí">
          {formatearNumero(c.horasMotor, 1)} / {formatearNumero(c.horasRalenti, 1)}
        </Dato>
        <Dato etiqueta="Días parado">{formatearNumero(c.diasParado, 0)}</Dato>
      </Detalle>
    </Seccion>
  );
}

/** Cierre aprobado antes de la migración 26 (tractor + mochila): solo lo que quedó congelado. */
function CalculoAnterior({ resultado }: { resultado: ResultadoCierre }) {
  return (
    <Seccion titulo="Cálculo anterior (tractor + mochila)">
      <p className="text-sm text-tinta-suave">Este cierre se aprobó con el modelo anterior a la unificación del combustible del camión.</p>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Dato etiqueta="Diferencia del tractor">
          <DiferenciaL litros={resultado.anterior?.tractorDiferenciaL ?? null} />
        </Dato>
        <Dato etiqueta="Diferencia de la mochila">
          <DiferenciaL litros={resultado.anterior?.mochilaDiferenciaL ?? null} />
        </Dato>
        <Dato etiqueta="Medido (plataforma)">{conUnidad(resultado.camion.consumoPlataformaL, 'L')}</Dato>
      </dl>
    </Seccion>
  );
}

function Resultado({ cierre, resultado }: { cierre: CierreViaje; resultado: ResultadoCierre }) {
  const { zonaHoraria } = useSesion();
  return (
    <Seccion titulo="Resultado">
      <dl className="grid gap-4 sm:grid-cols-3">
        <Dato etiqueta="A descontar al chofer" destacado>
          {conUnidad(resultado.imputableTotalL, 'L')}
          {resultado.versionCalculo === 2 && (
            <span className="block text-xs font-normal text-tinta-suave">
              {(resultado.imputableTotalL ?? 0) > 0
                ? `Diferencia ${conUnidad(resultado.camion.diferenciaL, 'L')} − justificados ${conUnidad(resultado.camion.noImputableL, 'L')}.`
                : 'Nada para descontar.'}
            </span>
          )}
        </Dato>
        <Dato etiqueta="Observaciones">{cierre.datos.observaciones ?? '—'}</Dato>
        <Dato etiqueta={cierre.estado === 'borrador' ? 'Calculado' : 'Congelado al aprobar'}>
          {formatearFechaHora(resultado.calculadoEn ?? cierre.aprobadoEn, zonaHoraria)}
          {cierre.huella && <span className="block truncate font-mono text-xs text-tinta-suave" title={cierre.huella}>huella {cierre.huella.slice(0, 16)}…</span>}
        </Dato>
      </dl>
      {resultado.avisos.length > 0 && (
        <div className="space-y-1 rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-alerta">
            <TriangleAlert className="size-4" /> Avisos
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {resultado.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </Seccion>
  );
}

/** Verificación desde los hechos (fue.fn_verificar_cierre): resultado, no estado. */
function VerificacionCierre({ id }: { id: CierreViajeId }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, error, refetch, isFetching } = useVerificacion(id, true);
  return (
    <Seccion
      titulo="Verificación"
      acciones={
        <button type="button" className={BOTON_SECUNDARIO} disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Verificar
        </button>
      }
    >
      <p className="text-xs text-tinta-suave">Recalcula el cierre desde las cargas y los controles y lo compara con lo congelado al aprobar.</p>
      {isPending ? (
        <Cargando texto="Verificando…" />
      ) : isError ? (
        <ErrorBase error={{ codigo: 'regla_negocio', mensaje: error.message }} />
      ) : (
        <div className="space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <VerificacionChip resultado={resultadoVerificacion(data)} />
            {data.verificadoEn && <span className="text-tinta-suave">{formatearFechaHora(data.verificadoEn, zonaHoraria)}</span>}
          </p>
          {data.defectos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-error">
              {data.defectos.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {data.avisos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-alerta">
              {data.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Seccion>
  );
}

/** Acciones del ciclo de vida. Quién puede y cuándo lo decide la base; acá solo se muestra su error. */
function Acciones({ cierre, onRecargar }: { cierre: CierreViaje; onRecargar: () => void }) {
  const router = useRouter();
  const puedeEditar = useCan('combustible.cierre_viaje:editar');
  const puedeTransicionar = useCan('combustible.cierre_viaje:transicionar');
  const limites = useActualizarLimites();
  const aprobar = useAprobarCierre();
  const anular = useAnularCierre();
  const crear = useCrearBorrador();
  const [error, setError] = useState<ErrorAccion | null>(null);

  const ejecutar = async (p: Promise<{ ok: true } | { ok: false; error: ErrorAccion }>) => {
    setError(null);
    const r = await p;
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  const botones: ReactNode[] = [];
  if (cierre.estado === 'borrador' && puedeEditar) {
    botones.push(
      <button
        key="limites"
        type="button"
        className={BOTON_SECUNDARIO}
        disabled={limites.isPending}
        onClick={() => ejecutar(limites.mutateAsync({ id: cierre.id, versionFila: cierre.versionFila }))}
      >
        {limites.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Actualizar límites del viaje
      </button>,
    );
  }
  if (cierre.estado === 'borrador' && puedeTransicionar) {
    botones.push(
      <AccionConMotivo
        key="aprobar"
        etiqueta="Aprobar"
        icono={<Stamp className="size-4" />}
        primario
        titulo="Aprobar el cierre"
        explicacion="Al aprobar, la base congela el resultado. Lo aprueba un usuario distinto del que preparó el borrador."
        pideMotivo={false}
        ocupado={aprobar.isPending}
        error={null}
        onConfirmar={() => ejecutar(aprobar.mutateAsync({ id: cierre.id, versionFila: cierre.versionFila }))}
      />,
    );
  }
  if (cierre.estado !== 'anulado' && puedeTransicionar) {
    botones.push(
      <AccionConMotivo
        key="anular"
        etiqueta="Anular"
        icono={<Ban className="size-4" />}
        titulo="Anular el cierre"
        explicacion="El viaje vuelve a figurar sin cierre y se puede crear un borrador nuevo."
        ocupado={anular.isPending}
        error={null}
        onConfirmar={(motivo) => ejecutar(anular.mutateAsync({ id: cierre.id, versionFila: cierre.versionFila, motivo }))}
      />,
    );
  }
  if (cierre.estado === 'anulado' && puedeEditar) {
    botones.push(
      <button
        key="crear"
        type="button"
        className={BOTON_SECUNDARIO}
        disabled={crear.isPending}
        onClick={async () => {
          setError(null);
          const r = await crear.mutateAsync({ camionId: cierre.camionId, cargaSalidaId: cierre.cargaSalidaId });
          if (r.ok) router.push(`/combustible/cierres/${r.data}`);
          else setError(r.error);
        }}
      >
        {crear.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} Crear borrador nuevo para este viaje
      </button>,
    );
  }
  if (botones.length === 0) return null;

  return (
    <Seccion titulo="Acciones">
      <ErrorBase error={error} onRecargar={onRecargar} />
      <div className="flex flex-wrap gap-3">{botones}</div>
    </Seccion>
  );
}
