'use client';

import { useState } from 'react';
import { CalendarClock, Check, ClipboardList, LoaderCircle, Repeat, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Chip, CLASE_TEXTAREA, ErrorBase } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { EQUIPOS, ETIQUETA_EVENTO, type GestionAlerta, type HistorialGestion } from '../domain/gestion.types';
import { useAvanceAlerta, usePedirProrrogaAlerta, useReasignarAlerta, useResolverProrrogaAlerta, useResponsablesAlertas } from '../queries/hooks';

/** Migración 189 · Chips de la fila: responsable, vence/vencida, días abierta y reasignaciones. */
export function ChipsGestion({ g, abierta }: { g: GestionAlerta | undefined; abierta: boolean }) {
  const { zonaHoraria } = useSesion();
  if (!g) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      {g.responsable && <Chip tono={g.esMia ? 'marca' : 'neutro'}>{g.esMia ? `A mi cargo · ${g.responsable}` : g.responsable}</Chip>}
      {abierta && g.venceEn && (
        <Chip tono={g.vencida ? 'error' : 'neutro'} title={formatearFechaHora(g.venceEn, zonaHoraria)}>
          {g.vencida ? (g.escalada ? 'Vencida · escalada' : 'Vencida') : `Vence ${formatearFechaHora(g.venceEn, zonaHoraria)}`}
        </Chip>
      )}
      <Chip tono={g.diasAbierta >= 3 ? 'alerta' : 'neutro'} title="Días abierta">
        {g.diasAbierta} día{g.diasAbierta === 1 ? '' : 's'}
      </Chip>
      {g.reasignaciones > 0 && (
        <Chip tono={g.reasignaciones >= 2 ? 'alerta' : 'neutro'} title="Cantidad de reasignaciones">
          <Repeat className="size-3" /> {g.reasignaciones}
        </Chip>
      )}
      {g.prorrogaPendiente && <Chip tono="alerta">Prórroga pedida</Chip>}
    </span>
  );
}

/** Historial de gestión: avances (qué se hizo / qué falta), reasignaciones, prórrogas y escalamiento. */
export function HistorialGestionLista({ h }: { h: HistorialGestion }) {
  const { zonaHoraria } = useSesion();
  const items = [
    ...h.avances.map((v) => ({ en: v.en, quien: v.usuario, avance: true, texto: v.hecho, falta: v.falta })),
    ...h.eventos.map((e) => ({ en: e.en, quien: e.usuario, avance: false, texto: `${ETIQUETA_EVENTO[e.tipo] ?? e.tipo}${e.detalle ? `: ${e.detalle}` : ''}`, falta: null })),
  ].sort((a, b) => a.en.localeCompare(b.en));
  return (
    <div className="space-y-2 text-sm">
      <p className="text-tinta-suave">
        A cargo de <strong className="text-tinta">{h.responsable ?? '—'}</strong>
        {h.creada && ` · creada ${formatearFechaHora(h.creada, zonaHoraria)}`}
        {h.venceEn && ` · ${h.vencida ? 'venció' : 'vence'} ${formatearFechaHora(h.venceEn, zonaHoraria)}`}
        {` · ${h.diasAbierta} día(s) abierta · ${h.reasignaciones} reasignación(es) · ${h.prorrogas} prórroga(s)`}
      </p>
      {items.length === 0 ? (
        <p className="text-tinta-suave">Todavía no hay avances.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-xs text-tinta-suave tabular-nums">{formatearFechaHora(x.en, zonaHoraria)}</span>
              <span className={x.avance ? 'text-tinta' : 'text-tinta-suave'}>
                <span className="font-medium">{x.quien ?? 'Sistema'}</span>: {x.avance ? <>Hizo: {x.texto}</> : x.texto}
                {x.falta && <span className="block text-tinta-suave">Falta: {x.falta}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Responder un pedido de prórroga (lo puede hacer quien recibe escalamientos, no quien la pidió). */
export function ResolverProrroga({ p }: { p: NonNullable<HistorialGestion['prorroga']> }) {
  const { zonaHoraria } = useSesion();
  const resolver = useResolverProrrogaAlerta();
  const envio = useEnvio();
  const [motivo, setMotivo] = useState('');
  return (
    <div className="space-y-2 rounded-md border border-alerta/40 bg-alerta-suave/40 p-3 text-sm">
      <p>
        <strong>{p.pedidaPor ?? '—'}</strong> pidió más plazo, hasta <strong>{formatearFechaHora(p.hasta, zonaHoraria)}</strong>:
      </p>
      <p className="text-tinta">{p.motivo}</p>
      {p.puedoResolver ? (
        <>
          <input className={cn(CONTROL_FILTRO, 'w-full')} placeholder="Comentario (obligatorio para rechazar)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={resolver.isPending}
              onClick={() => void envio.enviar(resolver.mutateAsync({ prorrogaId: p.id, aprobar: true, motivo: motivo.trim() || null }), () => setMotivo(''))}
            >
              <Check className="size-4" /> Aprobar la prórroga
            </button>
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={resolver.isPending}
              onClick={() => void envio.enviar(resolver.mutateAsync({ prorrogaId: p.id, aprobar: false, motivo: motivo.trim() || null }), () => setMotivo(''))}
            >
              <X className="size-4" /> Rechazar
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-tinta-suave">La resuelve quien recibe los escalamientos.</p>
      )}
      <ErrorBase error={envio.error} />
    </div>
  );
}

type Form = '' | 'avance' | 'reasignar' | 'prorroga';

/** Gestión dentro de la ficha de la alerta abierta: historial + avance, reasignar, prórroga. */
export function GestionAlertaPanel({ alertaId, h, abierta }: { alertaId: number; h: HistorialGestion; abierta: boolean }) {
  const puedeRevisar = useCan('anomalias.alertas:transicionar');
  const [form, setForm] = useState<Form>('');
  const gestiona = puedeRevisar || h.reciboEscalamiento;
  return (
    <div className="space-y-3 rounded-lg border border-borde p-4">
      <h3 className="flex items-center gap-2 font-medium text-tinta">
        <ClipboardList className="size-4" /> Seguimiento
      </h3>
      <HistorialGestionLista h={h} />
      {h.prorroga && <ResolverProrroga p={h.prorroga} />}
      {abierta && gestiona && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <BotonForm actual={form} valor="avance" setForm={setForm} texto="Cargar avance" />
            <BotonForm actual={form} valor="reasignar" setForm={setForm} texto="Reasignar" />
            {h.esMia && !h.prorroga && <BotonForm actual={form} valor="prorroga" setForm={setForm} texto="Pedir prórroga" />}
          </div>
          {form === 'avance' && <Avance alertaId={alertaId} onListo={() => setForm('')} />}
          {form === 'reasignar' && <Reasignar alertaId={alertaId} h={h} onListo={() => setForm('')} />}
          {form === 'prorroga' && <PedirProrroga alertaId={alertaId} onListo={() => setForm('')} />}
        </>
      )}
    </div>
  );
}

function BotonForm({ actual, valor, setForm, texto }: { actual: Form; valor: Form; setForm: (f: Form) => void; texto: string }) {
  return (
    <button
      type="button"
      aria-pressed={actual === valor}
      className={cn('rounded-md border px-3 py-1.5', actual === valor ? 'border-marca bg-marca-suave text-tinta' : 'border-borde text-tinta-suave hover:bg-hover')}
      onClick={() => setForm(actual === valor ? '' : valor)}
    >
      {texto}
    </button>
  );
}

function Avance({ alertaId, onListo }: { alertaId: number; onListo: () => void }) {
  const avance = useAvanceAlerta();
  const envio = useEnvio();
  const [hecho, setHecho] = useState('');
  const [falta, setFalta] = useState('');
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <textarea rows={2} maxLength={2000} className={CLASE_TEXTAREA} placeholder="Qué se hizo *" value={hecho} onChange={(e) => setHecho(e.target.value)} />
        <textarea rows={2} maxLength={2000} className={CLASE_TEXTAREA} placeholder="Qué falta hacer" value={falta} onChange={(e) => setFalta(e.target.value)} />
      </div>
      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={avance.isPending || hecho.trim() === ''}
        onClick={() => void envio.enviar(avance.mutateAsync({ alertaId, hecho: hecho.trim(), falta: falta.trim() || null }), onListo)}
      >
        {avance.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar avance
      </button>
    </div>
  );
}

function Reasignar({ alertaId, h, onListo }: { alertaId: number; h: HistorialGestion; onListo: () => void }) {
  const reasignar = useReasignarAlerta();
  const { data } = useResponsablesAlertas(true);
  const envio = useEnvio();
  const [rol, setRol] = useState(h.responsableRol ?? '');
  const [usuario, setUsuario] = useState('');
  const [motivo, setMotivo] = useState('');
  const personas = (data?.usuarios ?? []).filter((u) => u.roles.includes(rol));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select
          className={CONTROL_FILTRO}
          value={rol}
          onChange={(e) => {
            setRol(e.target.value);
            setUsuario('');
          }}
        >
          {EQUIPOS.map((e) => (
            <option key={e.rol} value={e.rol}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select className={CONTROL_FILTRO} value={usuario} onChange={(e) => setUsuario(e.target.value)}>
          <option value="">Todo el equipo</option>
          {personas.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </div>
      <input className={cn(CONTROL_FILTRO, 'w-full')} placeholder="Motivo de la reasignación *" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <p className="text-xs text-tinta-suave">La fecha límite no cambia al reasignar.</p>
      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={reasignar.isPending || !rol || motivo.trim() === ''}
        onClick={() =>
          void envio.enviar(reasignar.mutateAsync({ alertaId, rol, usuarioId: usuario ? Number(usuario) : null, motivo: motivo.trim() }), onListo)
        }
      >
        <Repeat className="size-4" /> Reasignar
      </button>
    </div>
  );
}

const HORAS = [12, 24, 48, 72, 168];

function PedirProrroga({ alertaId, onListo }: { alertaId: number; onListo: () => void }) {
  const pedir = usePedirProrrogaAlerta();
  const envio = useEnvio();
  const [horas, setHoras] = useState(24);
  const [motivo, setMotivo] = useState('');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-tinta-suave">Más plazo:</span>
        <select className={CONTROL_FILTRO} value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
          {HORAS.map((x) => (
            <option key={x} value={x}>
              {x < 48 ? `${x} horas` : `${x / 24} días`}
            </option>
          ))}
        </select>
      </div>
      <input className={cn(CONTROL_FILTRO, 'w-full')} placeholder="Por qué hace falta más plazo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <p className="text-xs text-tinta-suave">La aprueba o rechaza quien recibe los escalamientos (Gerencia). Hasta entonces, el plazo no cambia.</p>
      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={pedir.isPending || motivo.trim() === ''}
        onClick={() => void envio.enviar(pedir.mutateAsync({ alertaId, horas, motivo: motivo.trim() }), onListo)}
      >
        <CalendarClock className="size-4" /> Pedir prórroga
      </button>
    </div>
  );
}
