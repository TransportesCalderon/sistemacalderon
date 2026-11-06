'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, LoaderCircle, Pencil, Plus, Wrench } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  ETIQUETA_ESTADO_PLAN,
  ETIQUETA_PRIORIDAD,
  SUGERENCIAS_TAREA,
  VERSION_MANTENIMIENTO,
  textoFrecuencia,
  type EquipoPlan,
  type EstadoPlan,
  type Prioridad,
  type TareaPlan,
  type Zona,
} from '../../domain/mantenimiento.types';
import { fechaDia, type Equipo } from '../../domain/vencimientos.types';
import { useCargarBaseTarea, useGuardarTarea, usePlanMantenimiento, useZonasEquipo } from '../../queries/hooks';
import { SelectorZonas } from './ordenes-pantalla';

const TONO: Record<EstadoPlan, Tono> = { vencida: 'error', proxima: 'alerta', al_dia: 'exito', sin_km: 'neutro' };
const km = (v: number | null) => (v === null ? null : `${formatearNumero(v, 0)} km`);
const entero = (s: string) => {
  const t = s.trim().replace(/\./g, '');
  return t === '' || !Number.isFinite(Number(t)) ? null : Math.round(Number(t));
};

/**
 * Migración 199 · Mantenimiento › Plan de mantenimiento: tareas que se repiten por fecha y/o km y cómo viene
 * cada equipo. La base calcula cuándo toca y genera la orden de trabajo sola.
 */
export function PlanPantalla() {
  const hay = useBaseTiene(VERSION_MANTENIMIENTO);
  const edita = useCan('mantenimiento.plan:editar');
  const { data, isPending, isError, error, refetch } = usePlanMantenimiento(hay);
  const zonas = useZonasEquipo(hay).data ?? [];
  const [form, setForm] = useState<TareaPlan | 'nueva' | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  if (!hay) return <Vacio icono={<Wrench className="size-6" />} texto="Falta aplicar en la base el cambio de Mantenimiento (plan y órdenes)." />;
  if (isPending) return <Cargando texto="Leyendo el plan de mantenimiento…" />;
  if (isError) return <ErrorLectura texto="No se pudo leer el plan." error={error} onReintentar={() => void refetch()} />;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Plan de mantenimiento" subtitulo="Mantenimiento">
        {edita && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setForm('nueva')}>
            <Plus className="size-4" /> Nueva tarea
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Tareas que se repiten cada tantos días o cada tantos km (con el odómetro de la telemetría). Cuando a un equipo le toca, el sistema genera la orden de
        trabajo sola. La próxima se cuenta desde la última orden terminada.
      </p>

      {form && <FormTarea t={form === 'nueva' ? null : form} zonas={zonas} onCerrar={() => setForm(null)} />}

      {data.length === 0 ? (
        <Vacio icono={<Wrench className="size-6" />} texto="Todavía no hay tareas en el plan." />
      ) : (
        <ul className="space-y-3">
          {data.map((t) => {
            const ab = abierta === t.id;
            const c = (e: EstadoPlan) => t.equipos.filter((x) => x.estado === e).length;
            return (
              <li key={t.id} className={cn(TARJETA, 'p-4', !t.activo && 'opacity-60')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" className="flex items-start gap-2 text-left" onClick={() => setAbierta(ab ? null : t.id)} aria-expanded={ab}>
                    {ab ? <ChevronDown className="mt-0.5 size-4 text-tinta-suave" /> : <ChevronRight className="mt-0.5 size-4 text-tinta-suave" />}
                    <span>
                      <span className="font-medium text-tinta">{t.nombre}</span>
                      <span className="block text-xs text-tinta-suave">
                        {t.aplica === 'tractor' ? `Tractores${t.marca ? ` ${t.marca}` : ''}` : `Semis${t.tipoSemi ? ` ${t.tipoSemi}` : ''}`} · {textoFrecuencia(t)} ·
                        avisa {[t.cadaDias !== null ? `${t.avisoDias} días` : null, t.cadaKm !== null ? `${formatearNumero(t.avisoKm, 0)} km` : null].filter(Boolean).join(' / ')} antes
                        {!t.activo && ' · inactiva'}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c('vencida') > 0 && <Chip tono="error">{c('vencida')} toca ya</Chip>}
                    {c('proxima') > 0 && <Chip tono="alerta">{c('proxima')} se acerca</Chip>}
                    <Chip tono="neutro">{t.equipos.length} equipos</Chip>
                    {t.prioridad !== 'normal' && <Chip tono="alerta">{ETIQUETA_PRIORIDAD[t.prioridad]}</Chip>}
                    {edita && (
                      <button type="button" className="ml-1 text-sm text-marca hover:underline" onClick={() => setForm(t)}>
                        <Pencil className="mr-1 inline size-3.5" />
                        Editar
                      </button>
                    )}
                  </div>
                </div>
                {ab && <EquiposTarea t={t} edita={edita} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EquiposTarea({ t, edita }: { t: TareaPlan; edita: boolean }) {
  const [base, setBase] = useState<EquipoPlan | null>(null);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-borde text-left text-xs text-tinta-suave uppercase">
          <tr>
            <th className="px-2 py-2">Equipo</th>
            <th className="px-2 py-2">Última vez</th>
            <th className="px-2 py-2">Próxima</th>
            {t.cadaKm !== null && <th className="px-2 py-2 text-right">Km hoy</th>}
            <th className="px-2 py-2">Estado</th>
            <th className="px-2 py-2">OT</th>
            {edita && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {t.equipos.map((e) => (
            <tr key={`${e.equipo}${e.equipoId}`} className="border-b border-borde last:border-0">
              <td className="px-2 py-2 font-mono font-semibold">{e.patente}</td>
              <td className="px-2 py-2">
                {[fechaDia(e.baseFecha), km(e.baseKm)].filter(Boolean).join(' · ')}
                <span className="block text-xs text-tinta-suave">
                  {e.baseOrigen === 'ot' ? 'orden terminada' : e.baseOrigen === 'cargada' ? 'cargada a mano' : 'desde que se creó la tarea'}
                </span>
              </td>
              <td className="px-2 py-2">{[e.proximaFecha ? fechaDia(e.proximaFecha) : null, km(e.proximoKm)].filter(Boolean).join(' o ') || '—'}</td>
              {t.cadaKm !== null && <td className="px-2 py-2 text-right tabular-nums">{km(e.kmActual) ?? '—'}</td>}
              <td className="px-2 py-2">
                <Chip tono={TONO[e.estado]}>{ETIQUETA_ESTADO_PLAN[e.estado]}</Chip>
              </td>
              <td className="px-2 py-2 font-mono text-xs">{e.otNumero ?? '—'}</td>
              {edita && (
                <td className="px-2 py-2 text-right">
                  <button type="button" className="text-xs text-marca hover:underline" onClick={() => setBase(base === e ? null : e)}>
                    Última vez…
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {base && <FormBase t={t} e={base} onCerrar={() => setBase(null)} />}
    </div>
  );
}

function FormBase({ t, e, onCerrar }: { t: TareaPlan; e: EquipoPlan; onCerrar: () => void }) {
  const cargar = useCargarBaseTarea();
  const envio = useEnvio();
  const [fecha, setFecha] = useState(e.baseFecha ?? '');
  const [k, setK] = useState(e.baseKm !== null ? String(Math.round(e.baseKm)) : '');
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-marca/40 p-3">
      <p className="w-full text-sm text-tinta">
        Última vez que se hizo «{t.nombre}» en <span className="font-mono">{e.patente}</span>
      </p>
      <label className="space-y-1 text-sm">
        <span className="block text-xs text-tinta-suave">Fecha</span>
        <input type="date" className={cn(CONTROL_FILTRO, 'h-9')} value={fecha} onChange={(x) => setFecha(x.target.value)} />
      </label>
      {e.equipo === 'tractor' && (
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Km (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-9 w-32')} inputMode="numeric" value={k} onChange={(x) => setK(x.target.value)} />
        </label>
      )}
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={cargar.isPending}
        onClick={() => void envio.enviar(cargar.mutateAsync({ tarea: t.id, equipo: e.equipo, equipoId: e.equipoId, fecha, km: entero(k) }), onCerrar)}
      >
        {cargar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
      </button>
      <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
        Cancelar
      </button>
      <div className="w-full">
        <ErrorBase error={envio.error} />
      </div>
    </div>
  );
}

function FormTarea({ t, zonas, onCerrar }: { t: TareaPlan | null; zonas: Zona[]; onCerrar: () => void }) {
  const guardar = useGuardarTarea();
  const envio = useEnvio();
  const [aplica, setAplica] = useState<Equipo>(t?.aplica ?? 'tractor');
  const [nombre, setNombre] = useState(t?.nombre ?? '');
  const [desc, setDesc] = useState(t?.descripcion ?? '');
  const [marca, setMarca] = useState(t?.marca ?? '');
  const [tipoSemi, setTipoSemi] = useState(t?.tipoSemi ?? '');
  const [dias, setDias] = useState(t?.cadaDias != null ? String(t.cadaDias) : '');
  const [kmC, setKmC] = useState(t?.cadaKm != null ? String(t.cadaKm) : '');
  const [avD, setAvD] = useState(String(t?.avisoDias ?? 7));
  const [avK, setAvK] = useState(String(t?.avisoKm ?? 1000));
  const [zs, setZs] = useState<string[]>(t?.zonas ?? []);
  const [prio, setPrio] = useState<Prioridad>(t?.prioridad ?? 'normal');
  const [activo, setActivo] = useState(t?.activo ?? true);

  return (
    <div className={cn(TARJETA, 'max-w-3xl space-y-3 p-4')}>
      <p className="font-medium text-tinta">{t ? 'Editar tarea' : 'Nueva tarea del plan'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Para</span>
          <select
            className={cn(CONTROL_FILTRO, 'h-10 w-full')}
            value={aplica}
            disabled={t !== null}
            onChange={(e) => {
              setAplica(e.target.value as Equipo);
              setZs([]);
            }}
          >
            <option value="tractor">Tractores</option>
            <option value="semi">Semis</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Tarea</span>
          <input list="sugerencias-tarea" className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <datalist id="sugerencias-tarea">
            {SUGERENCIAS_TAREA[aplica].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        {aplica === 'tractor' ? (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Solo la marca (opcional)</span>
            <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} placeholder="Ej.: Renault, Mercedes, Scania" value={marca} onChange={(e) => setMarca(e.target.value)} />
          </label>
        ) : (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Solo el tipo de semi (opcional)</span>
            <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={tipoSemi} onChange={(e) => setTipoSemi(e.target.value)}>
              <option value="">Todos</option>
              <option value="refrigerado">Refrigerado</option>
              <option value="plataforma">Plataforma</option>
              <option value="furgon">Furgón</option>
              <option value="cisterna">Cisterna</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Prioridad de la orden</span>
          <select className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={prio} onChange={(e) => setPrio(e.target.value as Prioridad)}>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Cada cuántos días (vacío = no va por fecha)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="numeric" placeholder="Ej.: 30, 60, 180" value={dias} onChange={(e) => setDias(e.target.value)} />
        </label>
        {aplica === 'tractor' && (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Cada cuántos km (vacío = no va por km)</span>
            <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="numeric" placeholder="Ej.: 10.000, 30.000" value={kmC} onChange={(e) => setKmC(e.target.value)} />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Avisar con cuántos días antes</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="numeric" value={avD} onChange={(e) => setAvD(e.target.value)} />
        </label>
        {aplica === 'tractor' && (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Avisar con cuántos km antes</span>
            <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} inputMode="numeric" value={avK} onChange={(e) => setAvK(e.target.value)} />
          </label>
        )}
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="block text-xs text-tinta-suave">Detalle para el mecánico (opcional)</span>
          <input className={cn(CONTROL_FILTRO, 'h-10 w-full')} placeholder="Ej.: aceite 15W40, 38 litros" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
      </div>
      <div className="space-y-1">
        <span className="block text-xs text-tinta-suave">Qué revisar (se marca en amarillo)</span>
        <SelectorZonas zonas={zonas} equipo={aplica} valor={zs} onCambiar={setZs} />
      </div>
      {t && (
        <label className="inline-flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" className="accent-marca" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activa
        </label>
      )}
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(
              guardar.mutateAsync({
                id: t?.id ?? null,
                version: t?.version ?? null,
                nombre,
                descripcion: desc.trim() || null,
                aplica,
                marca: aplica === 'tractor' ? marca.trim() || null : null,
                tipoSemi: aplica === 'semi' ? tipoSemi || null : null,
                cadaDias: entero(dias),
                cadaKm: aplica === 'tractor' ? entero(kmC) : null,
                avisoDias: entero(avD) ?? 7,
                avisoKm: entero(avK) ?? 1000,
                zonas: zs,
                prioridad: prio,
                activo,
              }),
              onCerrar,
            )
          }
        >
          {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
