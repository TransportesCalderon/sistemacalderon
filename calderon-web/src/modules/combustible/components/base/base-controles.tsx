'use client';

import { Fragment, useState } from 'react';
import { BadgeCheck, CircleCheck, Gauge, Pencil, SearchCheck, Undo2 } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { conSigno, formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import {
  ETIQUETA_TIPO_MOVIMIENTO_BASE,
  esTipoMovimientoBase,
  etiquetaMetodo,
  type ControlBase,
  type MetodoMedicion,
} from '../../domain/base.types';
import {
  useAnularSegmentoBase,
  useAprobarSegmentoBase,
  useControlesBase,
  useRegistrarControlBase,
  useSegmentoBase,
  useVerificacionBase,
} from '../../queries/hooks';
import { AccionConMotivo, CLASE_TEXTAREA, Cargando, Chip, Dato, DiferenciaL, ErrorBase, ErrorLectura, Seccion, Vacio } from '../comun/ui';
import { CampoMetodo } from './base-comun';

type Abierto = { id: number; modo: 'segmento' | 'corregir' } | null;

/**
 * Controles medidos del tanque. Cada control de base cierra el segmento que empieza en el
 * control anterior: diferencia = físico anterior + entradas − salidas − físico (positiva = faltante).
 * Lo aprueba otro usuario con rol aprobador que no sea el responsable (lo controla la base).
 */
export function ControlesBase({ depositoId }: { depositoId: number }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('combustible.depositos:editar');
  const puedeAprobar = useCan('combustible.depositos:transicionar');
  const { data, isPending, isError, refetch } = useControlesBase(depositoId);
  const [abierto, setAbierto] = useState<Abierto>(null);
  const alternar = (id: number, modo: 'segmento' | 'corregir') =>
    setAbierto(abierto?.id === id && abierto.modo === modo ? null : { id, modo });

  return (
    <Seccion titulo="Controles y segmentos">
      {isPending ? (
        <Cargando texto="Cargando controles…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron cargar los controles." onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Gauge className="size-6" />} texto="Todavía no se midió el tanque. El primer control es el inicial." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-y border-borde bg-fondo">
              <tr>
                <th className={TH}>Fecha y hora</th>
                <th className={cn(TH, 'text-right')}>Medido</th>
                <th className={cn(TH, 'text-right')}>Libro</th>
                <th className={cn(TH, 'text-right')}>Faltante / sobrante</th>
                <th className={TH}>Medición</th>
                <th className={TH}>Responsable</th>
                <th className={TH}>Segmento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{formatearFechaHora(c.fechaHora, zonaHoraria)}</td>
                    <td className={cn(TD, 'text-right font-medium tabular-nums')}>{formatearNumero(c.litros)} L</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {c.rol === 'inicial' ? '—' : `${formatearNumero(c.saldoLibroL)} L`}
                    </td>
                    <td className={cn(TD, 'text-right')}>
                      {c.rol === 'inicial' ? <span className="text-tinta-suave">—</span> : <FaltanteSobrante litros={c.diferenciaL} />}
                    </td>
                    <td className={TD}>
                      {etiquetaMetodo(c.metodo)}
                      {c.medidoPorNombre && <span className="block text-xs text-tinta-suave">{c.medidoPorNombre}</span>}
                      {c.motivoReemplazo && <span className="block text-xs text-tinta-suave">Corregido: {c.motivoReemplazo}</span>}
                      {c.observaciones && <span className="block text-xs text-tinta-suave">{c.observaciones}</span>}
                    </td>
                    <td className={TD}>{c.responsableNombre ?? <span className="text-alerta">Sin responsable</span>}</td>
                    <td className={TD}>
                      <div className="flex flex-col items-start gap-1.5">
                        {c.rol === 'inicial' ? (
                          <Chip tono="neutro">Control inicial</Chip>
                        ) : c.aprobacionId ? (
                          <Chip tono="exito" title={c.aprobadoEn ? formatearFechaHora(c.aprobadoEn, zonaHoraria) : undefined}>
                            <BadgeCheck className="size-3.5" /> Aprobado{c.aprobadoPorNombre ? ` por ${c.aprobadoPorNombre}` : ''}
                          </Chip>
                        ) : (
                          <Chip tono="alerta">Sin aprobar</Chip>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs">
                          {c.rol === 'base' && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-marca hover:underline"
                              onClick={() => alternar(c.id, 'segmento')}
                            >
                              <SearchCheck className="size-3.5" />{' '}
                              {c.aprobacionId ? 'Ver' : puedeAprobar ? 'Revisar y aprobar' : 'Ver segmento'}
                            </button>
                          )}
                          {puedeEditar && !c.aprobacionId && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-marca hover:underline"
                              onClick={() => alternar(c.id, 'corregir')}
                            >
                              <Pencil className="size-3.5" /> Corregir
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {abierto?.id === c.id && (
                    <tr>
                      <td colSpan={7} className="bg-fondo/40 px-3 py-3">
                        {abierto.modo === 'segmento' ? (
                          <Segmento c={c} puedeAprobar={puedeAprobar} onCerrar={() => setAbierto(null)} />
                        ) : (
                          <CorregirControl c={c} onCerrar={() => setAbierto(null)} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

function Segmento({ c, puedeAprobar, onCerrar }: { c: ControlBase; puedeAprobar: boolean; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const { data: s, isPending, isError, error: errLectura, refetch } = useSegmentoBase(c.id);
  const aprobar = useAprobarSegmentoBase();
  const anular = useAnularSegmentoBase();
  const [verificar, setVerificar] = useState(false);
  const verificacion = useVerificacionBase(c.aprobacionId ?? 0, verificar && c.aprobacionId !== null);
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({ justificacion: '', noImputableL: '', noImputableMotivo: '' });

  if (isPending) return <Cargando texto="Calculando el segmento…" />;
  if (isError)
    return (
      <ErrorLectura
        texto={errLectura instanceof Error ? errLectura.message : 'No se pudo calcular el segmento.'}
        onReintentar={() => refetch()}
      />
    );

  // Pendientes que no dependen de lo que se escribe en el formulario
  const bloqueantes = s.pendientes.filter((p) => p.codigo !== 'justificacion' && p.codigo !== 'no_imputable');
  const pideJustificacion = s.pendientes.some((p) => p.codigo === 'justificacion');

  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Dato etiqueta="Desde">{formatearFechaHora(s.desde, zonaHoraria)}</Dato>
        <Dato etiqueta="Medido al inicio">{formatearNumero(s.fisicoAnteriorL)} L</Dato>
        <Dato etiqueta="Entradas y salidas">{conSigno(s.realL)} L</Dato>
        <Dato etiqueta="Teórico">{formatearNumero(s.teoricoL)} L</Dato>
        <Dato etiqueta="Medido al final">{formatearNumero(s.fisicoL)} L</Dato>
        <Dato etiqueta={s.diferenciaL > 0 ? 'Faltante' : s.diferenciaL < 0 ? 'Sobrante' : 'Diferencia'} destacado>
          <DiferenciaL litros={s.diferenciaL} toleranciaL={s.toleranciaL} />
          <span className="block text-xs font-normal text-tinta-suave">Tolerancia ± {formatearNumero(s.toleranciaL)} L</span>
        </Dato>
      </dl>
      {Object.keys(s.realPorTipo).length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-suave">
          {Object.entries(s.realPorTipo).map(([tipo, l]) => (
            <li key={tipo}>
              {esTipoMovimientoBase(tipo) ? ETIQUETA_TIPO_MOVIMIENTO_BASE[tipo] : tipo}:{' '}
              <span className="tabular-nums">{conSigno(l)} L</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-tinta-suave">
        Responsable del segmento: <span className="font-medium text-tinta">{s.responsableNombre ?? '—'}</span>
      </p>

      {c.aprobacionId ? (
        <div className="flex flex-wrap items-start gap-3">
          {c.aprobadoImputableL !== null && (
            <p className="text-sm text-tinta">
              Imputable al responsable: <span className="font-semibold tabular-nums">{formatearNumero(c.aprobadoImputableL)} L</span>
            </p>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-marca hover:underline"
            onClick={() => setVerificar(true)}
          >
            <CircleCheck className="size-4" /> Verificar contra los hechos
          </button>
          {verificar &&
            (verificacion.isPending ? (
              <span className="text-sm text-tinta-suave">Verificando…</span>
            ) : verificacion.data?.ok ? (
              <Chip tono="exito">Coincide con los hechos</Chip>
            ) : verificacion.data ? (
              <Chip tono="error">Cambió: {verificacion.data.defectos.join(', ')}</Chip>
            ) : null)}
          {puedeAprobar && (
            <AccionConMotivo
              etiqueta="Anular la aprobación"
              icono={<Undo2 className="size-4" />}
              titulo="Anular la aprobación del segmento"
              explicacion="El segmento vuelve a quedar abierto: se pueden corregir sus movimientos y controles, y hay que aprobarlo de nuevo."
              ocupado={anular.isPending}
              error={error}
              onConfirmar={async (motivo) => {
                let bien = false;
                await enviar(anular.mutateAsync({ aprobacionId: c.aprobacionId!, motivo }), () => {
                  bien = true;
                  onCerrar();
                });
                return bien;
              }}
            />
          )}
        </div>
      ) : (
        <>
          {bloqueantes.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">
              {bloqueantes.map((p) => (
                <li key={p.codigo}>{p.mensaje}</li>
              ))}
            </ul>
          )}
          {puedeAprobar && (
            <form
              noValidate
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar(aprobar.mutateAsync({ controlId: c.id, ...v }), onCerrar);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1.5 sm:col-span-3">
                  <span className="block text-sm font-medium text-tinta">{pideJustificacion ? 'Justificación *' : 'Justificación'}</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={v.justificacion}
                    onChange={(e) => setV({ ...v, justificacion: e.target.value })}
                    className={CLASE_TEXTAREA}
                  />
                  {campo('justificacion') && <span className="text-xs text-error">{campo('justificacion')}</span>}
                </label>
                <Campo label="No imputable (L)" error={campo('noImputableL')} ayuda="Parte del faltante que no es del responsable.">
                  <input inputMode="decimal" value={v.noImputableL} onChange={(e) => setV({ ...v, noImputableL: e.target.value })} />
                </Campo>
                <div className="sm:col-span-2">
                  <Campo label="Motivo del no imputable" error={campo('noImputableMotivo')}>
                    <input
                      maxLength={500}
                      value={v.noImputableMotivo}
                      onChange={(e) => setV({ ...v, noImputableMotivo: e.target.value })}
                    />
                  </Campo>
                </div>
              </div>
              <ErrorBase error={error} />
              <button type="submit" className={BOTON_PRIMARIO} disabled={aprobar.isPending}>
                <BadgeCheck className="size-4" /> Aprobar el segmento
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function CorregirControl({ c, onCerrar }: { c: ControlBase; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const registrar = useRegistrarControlBase();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    fechaHoraLocal: isoAHoraLocal(c.fechaHora, zonaHoraria),
    litros: String(c.litros),
    metodo: (c.metodo ?? 'varilla') as MetodoMedicion,
    motivo: '',
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  return (
    <Panel
      titulo="Corregir el control"
      explicacion="El control original no se borra: queda reemplazado por este, con el motivo, y el libro se vuelve a conciliar."
      error={error}
      ocupado={registrar.isPending}
      textoBoton="Guardar corrección"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          registrar.mutateAsync({
            depositoId: c.depositoId,
            fechaHora: horaLocalAIso(v.fechaHoraLocal, zonaHoraria) ?? '',
            litros: v.litros,
            metodo: v.metodo,
            observaciones: '',
            reemplazaId: c.id,
            motivoReemplazo: v.motivo,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Fecha y hora *" error={campo('fechaHora')} ayuda={`Hora de ${zonaHoraria}`}>
        <input type="datetime-local" value={v.fechaHoraLocal} onChange={set('fechaHoraLocal')} />
      </Campo>
      <Campo label="Litros medidos *" error={campo('litros')}>
        <input inputMode="decimal" value={v.litros} onChange={set('litros')} />
      </Campo>
      <CampoMetodo valor={v.metodo} error={campo('metodo')} onChange={set('metodo')} />
      <Campo label="Motivo de la corrección *" error={campo('motivoReemplazo')}>
        <input maxLength={500} value={v.motivo} onChange={set('motivo')} />
      </Campo>
    </Panel>
  );
}

/** Libro − medido: positivo = faltan litros en el tanque; negativo = sobran. */
function FaltanteSobrante({ litros }: { litros: number }) {
  if (litros === 0) return <span className="tabular-nums">0 L</span>;
  return (
    <span className={cn('font-semibold whitespace-nowrap tabular-nums', litros > 0 ? 'text-alerta' : 'text-tinta')}>
      {litros > 0 ? 'Faltan' : 'Sobran'} {formatearNumero(Math.abs(litros))} L
    </span>
  );
}
