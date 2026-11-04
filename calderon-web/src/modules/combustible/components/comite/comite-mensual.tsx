'use client';

import { useState } from 'react';
import { CalendarCheck, Printer } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { faltanRevisar, primerDia, type ComiteMes, type RevisionEquipo } from '../../domain/comite.types';
import { useCerrarComite, useComite, useRevisarEquipoMes } from '../../queries/hooks';
import { Cargando, Chip, ErrorBase, ErrorLectura, Vacio } from '../comun/ui';

const num = (v: number | null, d = 0) => (v === null ? '—' : formatearNumero(v, d));

/** El mes anterior al de hoy (AAAA-MM), que es el que se revisa en el comité. */
function mesAnterior(hoy: string) {
  const [a, m] = hoy.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Migración 179 · Comité mensual de consumo: cada tractor y genset del mes con sus números, la revisión
 * de cada uno (comentario y acción) y el cierre del mes (Gerencia o TI). Cerrado, queda el acta fija.
 */
export function ComiteMensual() {
  const { zonaHoraria } = useSesion();
  const [mes, setMes] = useState(() => mesAnterior(hoyEnZona(zonaHoraria)));
  const { data, isPending, isError, error, refetch, isFetching } = useComite(primerDia(mes), true);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">
          <span className="block text-xs text-tinta-suave">Mes</span>
          <input type="month" className={CONTROL_FILTRO} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        {data?.estado === 'cerrado' && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir acta
          </button>
        )}
      </div>

      {isPending ? (
        <Cargando texto="Armando el mes…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo armar el comité.'} onReintentar={() => refetch()} />
      ) : (
        <div className={cn('space-y-5', isFetching && 'opacity-70')}>
          <h2 className="text-lg font-semibold text-tinta">
            Comité de consumo · {mes.slice(5, 7)}/{mes.slice(0, 4)}{' '}
            {data.estado === 'cerrado' ? <Chip tono="exito">Cerrado</Chip> : <Chip tono="alerta">Abierto</Chip>}
          </h2>
          {data.estado === 'cerrado' && (
            <div className="rounded-xl border border-borde bg-panel p-4 text-sm">
              <p>
                Cerrado por <strong>{data.cerradoPor}</strong> el {formatearFechaHora(data.cerradoEn, zonaHoraria)}.
              </p>
              <p className="mt-1">
                <span className="text-tinta-suave">Participaron:</span> {data.participantes}
              </p>
              {data.conclusiones && (
                <p className="mt-1 whitespace-pre-line">
                  <span className="text-tinta-suave">Conclusiones:</span> {data.conclusiones}
                </p>
              )}
            </div>
          )}

          <Tractores c={data} mes={primerDia(mes)} />
          <Gensets c={data} mes={primerDia(mes)} />
          {data.estado === 'abierto' && <Cierre c={data} mes={primerDia(mes)} />}
        </div>
      )}
    </div>
  );
}

function Tractores({ c, mes }: { c: ComiteMes; mes: string }) {
  if (c.tractores.length === 0) return <Vacio icono={<CalendarCheck className="size-6" />} texto="No hay viajes de tractores terminados en el mes." />;
  return (
    <section className="overflow-hidden rounded-xl border border-borde bg-panel">
      <h3 className="border-b border-borde px-3 py-2 text-sm font-semibold">Tractores (viajes terminados en el mes)</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-borde bg-fondo">
            <tr>
              <th className={TH}>Tractor</th>
              <th className={cn(TH, 'text-right')}>Viajes</th>
              <th className={cn(TH, 'text-right')}>Km</th>
              <th className={cn(TH, 'text-right')}>Cargado</th>
              <th className={cn(TH, 'text-right')}>Motor</th>
              <th className={cn(TH, 'text-right')} title="Positivo = falta combustible">Diferencia</th>
              <th className={cn(TH, 'text-right')}>L/100 km</th>
              <th className={TH}>A mirar</th>
              <th className={TH}>Revisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {c.tractores.map((t) => (
              <tr key={t.equipoId} className="align-top">
                <td className={cn(TD, 'font-medium')}>{t.nombre}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{t.viajes}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{num(t.km)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{num(t.cargadoL)} L</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{num(t.motorL)} L</td>
                <td className={cn(TD, 'text-right font-semibold tabular-nums', (t.diferenciaL ?? 0) > 0 && 'text-alerta')}>{num(t.diferenciaL)} L</td>
                <td className={cn(TD, 'text-right tabular-nums')}>
                  {num(t.l100Cargado, 1)} / {num(t.l100Motor, 1)}
                  <span className="block text-xs text-tinta-suave">cargado / motor</span>
                </td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1">
                    {t.fueraTolerancia > 0 && <Chip tono="error">{t.fueraTolerancia} fuera de tolerancia</Chip>}
                    {t.sinMotor > 0 && <Chip tono="neutro">{t.sinMotor} sin datos del motor</Chip>}
                    {t.sinAprobar > 0 && <Chip tono="alerta">{t.sinAprobar} sin aprobar</Chip>}
                    {t.alertasAbiertas > 0 && <Chip tono="alerta">{t.alertasAbiertas} alertas abiertas</Chip>}
                  </div>
                </td>
                <td className={TD}>
                  <Revision mes={mes} tipo="tractor" equipoId={t.equipoId} r={t.revision} cerrado={c.estado === 'cerrado'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Gensets({ c, mes }: { c: ComiteMes; mes: string }) {
  if (c.gensets.length === 0) return <p className="text-sm text-tinta-suave">No hay cierres de gensets en el mes.</p>;
  return (
    <section className="overflow-hidden rounded-xl border border-borde bg-panel">
      <h3 className="border-b border-borde px-3 py-2 text-sm font-semibold">Gensets (cierres del mes)</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-borde bg-fondo">
            <tr>
              <th className={TH}>Genset</th>
              <th className={cn(TH, 'text-right')}>Cierres</th>
              <th className={cn(TH, 'text-right')}>Horas</th>
              <th className={cn(TH, 'text-right')}>Consumo</th>
              <th className={cn(TH, 'text-right')}>L/h (objetivo)</th>
              <th className={cn(TH, 'text-right')}>Diferencia</th>
              <th className={TH}>A mirar</th>
              <th className={TH}>Revisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {c.gensets.map((g) => (
              <tr key={g.equipoId} className="align-top">
                <td className={cn(TD, 'font-medium')}>{g.nombre}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{g.cierres}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{num(g.horas, 1)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{num(g.consumoL)} L</td>
                <td className={cn(TD, 'text-right tabular-nums')}>
                  {num(g.consumoLh, 2)} ({num(g.objetivoLh, 2)})
                </td>
                <td className={cn(TD, 'text-right font-semibold tabular-nums', (g.diferenciaL ?? 0) > 0 && 'text-alerta')}>{num(g.diferenciaL)} L</td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1">
                    {g.fueraTolerancia > 0 && <Chip tono="error">{g.fueraTolerancia} fuera de tolerancia</Chip>}
                    {(g.descuentoL ?? 0) > 0 && <Chip tono="alerta">{num(g.descuentoL)} L descontados</Chip>}
                  </div>
                </td>
                <td className={TD}>
                  <Revision mes={mes} tipo="genset" equipoId={g.equipoId} r={g.revision} cerrado={c.estado === 'cerrado'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Revision({ mes, tipo, equipoId, r, cerrado }: { mes: string; tipo: 'tractor' | 'genset'; equipoId: number; r: RevisionEquipo | null; cerrado: boolean }) {
  const { zonaHoraria } = useSesion();
  const revisar = useRevisarEquipoMes();
  const envio = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [comentario, setComentario] = useState(r?.comentario ?? '');
  const [accion, setAccion] = useState(r?.accion ?? '');
  const guardar = (revisado: boolean) =>
    void envio.enviar(
      revisar.mutateAsync({ mes, tipo, equipoId, revisado, comentario: comentario || null, accion: accion || null }),
      () => setAbierto(false),
    );

  if (!abierto) {
    return (
      <div className="min-w-56 space-y-1 text-xs">
        {r ? (
          <>
            <Chip tono="exito">Revisado</Chip>
            {r.comentario && <p className="whitespace-pre-line">{r.comentario}</p>}
            {r.accion && (
              <p>
                <span className="text-tinta-suave">Acción:</span> {r.accion}
              </p>
            )}
            <p className="text-tinta-suave">
              {r.por} · {formatearFechaHora(r.en, zonaHoraria)}
            </p>
          </>
        ) : (
          <Chip tono="neutro">Sin revisar</Chip>
        )}
        {!cerrado && (
          <button type="button" className="block text-marca hover:underline print:hidden" onClick={() => setAbierto(true)}>
            {r ? 'Cambiar' : 'Revisar'}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="min-w-64 space-y-2 text-xs">
      <textarea className={cn(CONTROL_FILTRO, 'w-full')} rows={2} placeholder="Comentario (qué se vio)" value={comentario} maxLength={1000} onChange={(e) => setComentario(e.target.value)} />
      <input className={cn(CONTROL_FILTRO, 'w-full')} placeholder="Acción que se decide (opcional)" value={accion} maxLength={500} onChange={(e) => setAccion(e.target.value)} />
      <ErrorBase error={envio.error} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTON_PRIMARIO} disabled={revisar.isPending} onClick={() => guardar(true)}>
          Revisado
        </button>
        {r && (
          <button type="button" className={BOTON_SECUNDARIO} disabled={revisar.isPending} onClick={() => guardar(false)}>
            Quitar revisión
          </button>
        )}
        <button type="button" className="px-2 text-tinta-suave" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Cierre({ c, mes }: { c: ComiteMes; mes: string }) {
  const cerrar = useCerrarComite();
  const envio = useEnvio();
  const [participantes, setParticipantes] = useState('');
  const [conclusiones, setConclusiones] = useState('');
  const faltan = faltanRevisar(c);
  return (
    <section className="space-y-3 rounded-xl border border-borde bg-panel p-4 print:hidden">
      <h3 className="text-sm font-semibold">Cerrar el mes</h3>
      <p className="text-xs text-tinta-suave">
        Lo cierran Gerencia o TI, con el mes terminado y todos los equipos revisados. Cerrado, el acta queda fija.
        {faltan.length > 0 && ` Faltan revisar ${faltan.length}.`}
        {!c.sePuedeCerrar && ' El mes todavía no terminó.'}
      </p>
      <input className={cn(CONTROL_FILTRO, 'w-full')} placeholder="Quiénes participaron" value={participantes} onChange={(e) => setParticipantes(e.target.value)} />
      <textarea className={cn(CONTROL_FILTRO, 'w-full')} rows={3} placeholder="Conclusiones del comité (opcional)" value={conclusiones} onChange={(e) => setConclusiones(e.target.value)} />
      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={cerrar.isPending}
        onClick={() => void envio.enviar(cerrar.mutateAsync({ mes, participantes, conclusiones: conclusiones || null }), () => undefined)}
      >
        <CalendarCheck className="size-4" /> Cerrar el mes
      </button>
    </section>
  );
}
