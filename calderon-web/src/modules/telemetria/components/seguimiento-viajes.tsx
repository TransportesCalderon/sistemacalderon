'use client';

import { useState } from 'react';
import { Check, Fuel, History, LoaderCircle, Radar } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  ETIQUETA_RESULTADO,
  VERSION_PEDIDO_CARGA,
  VERSION_SEGUIMIENTO,
  VERSION_SEGUIMIENTO_DESDE,
  type Estado,
  type Evaluacion,
  type Resultado,
  type ViajeEnCurso,
} from '../domain/seguimiento.types';
import { useControlesViaje, useRegistrarSeguimiento, useSeguimientoDesde, useViajesEnCurso } from '../queries/hooks';
import { BotonCopiar } from './boton-copiar';
import { PedidoCarga } from './pedido-carga';

const TONO_RESULTADO: Record<Resultado, Tono> = { bien: 'exito', a_mejorar: 'alerta', mal: 'error', sin_datos: 'neutro' };
const COLOR_ESTADO: Record<NonNullable<Estado>, string> = { verde: 'text-exito', naranja: 'text-alerta', rojo: 'text-error' };
const num = (v: number | null, d = 1) => (v === null ? '—' : formatearNumero(v, d));
type Desde = 'salida' | 'control' | 'otro';
const decimal = (s: string) => {
  const t = s.trim().replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};

/**
 * Migración 194 · Telemetría › Seguimiento de viajes: cada viaje en curso con cómo viene (consumo
 * contra el objetivo del viaje y programador). La base interpreta el resultado y escribe el mensaje;
 * «Registrar control» lo guarda y «Copiar» lo deja listo para pegar en WhatsApp.
 */
export function SeguimientoViajes() {
  const { rolesApp } = useSesion();
  const hay = useBaseTiene(VERSION_SEGUIMIENTO);
  const registra = rolesApp.includes('analista_control') || rolesApp.includes('ti');
  const { data, isPending, isError, error, refetch, isFetching } = useViajesEnCurso(hay);
  // Lista desplegable por patente (A → Z); al elegir una se abre su tarjeta
  const [elegido, setElegido] = useState<number | null>(null);
  const lista = [...(data ?? [])].sort((a, b) => a.patente.localeCompare(b.patente, 'es', { numeric: true }));
  const viaje = lista.find((v) => v.viajeId === elegido) ?? null;

  if (!hay) return <Vacio icono={<Radar className="size-6" />} texto="Falta aplicar en la base el cambio del seguimiento de viajes." />;
  return (
    <div className="space-y-5">
      <Encabezado titulo="Seguimiento de viajes" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Cómo viene cada viaje desde la salida: consumo contra el objetivo del viaje (el mismo del cierre) y uso del programador. El sistema arma el mensaje
        para el chofer; registrá el control y copialo para mandarlo por WhatsApp.
      </p>
      {isPending ? (
        <Cargando texto="Leyendo los viajes en curso…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo leer.'} onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Radar className="size-6" />} texto="No hay viajes en curso." />
      ) : (
        <div className={cn('space-y-3', isFetching && 'opacity-80')}>
          <label className="block max-w-md space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Tractor ({lista.length} en viaje)</span>
            <select
              id="seguimiento-patente"
              className={cn(CONTROL_FILTRO, 'h-10 w-full')}
              value={elegido ?? ''}
              onChange={(e) => setElegido(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Elegí la patente…</option>
              {lista.map((v) => (
                <option key={v.viajeId} value={v.viajeId}>
                  {v.patente} · {v.chofer ?? 'Sin chofer'} · {ETIQUETA_RESULTADO[v.evaluacion.resultado]}
                </option>
              ))}
            </select>
          </label>
          {viaje && (
            <ul className="max-w-2xl">
              <TarjetaViaje key={viaje.viajeId} v={viaje} registra={registra} />
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaViaje({ v, registra }: { v: ViajeEnCurso; registra: boolean }) {
  const { zonaHoraria } = useSesion();
  const registrar = useRegistrarSeguimiento();
  const envio = useEnvio();
  const [manual, setManual] = useState(!v.conTelemetria);
  const [km, setKm] = useState('');
  const [litros, setLitros] = useState('');
  const [prog, setProg] = useState('');
  const [hecho, setHecho] = useState<Evaluacion | null>(null);
  const [historial, setHistorial] = useState(false);
  // Migración 195: pedido de carga de combustible para Gerencia
  const conPedido = useBaseTiene(VERSION_PEDIDO_CARGA);
  const [pedido, setPedido] = useState(false);
  // Migración 197: desde qué momento se mide (salida, último control u otro momento)
  const conDesde = useBaseTiene(VERSION_SEGUIMIENTO_DESDE);
  const [modo, setModo] = useState<Desde>('salida');
  const [otro, setOtro] = useState(() => isoAHoraLocal(v.salidaTs, zonaHoraria));
  const desde = modo === 'salida' ? null : modo === 'control' ? (v.ultimoControl?.en ?? null) : horaLocalAIso(otro, zonaHoraria);
  const tramo = useSeguimientoDesde(v.viajeId, conDesde ? desde : null);
  const n = tramo.data ?? v;
  const e = hecho ?? (desde && !tramo.data ? null : n.evaluacion);
  const elegir = (m: Desde) => {
    setModo(m);
    setHecho(null);
  };

  return (
    <li className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-tinta">
            <span className="font-mono">{v.patente}</span> · {v.chofer ?? 'Sin chofer'}
          </p>
          <p className="text-xs text-tinta-suave">
            {v.marca ?? ''} · salió {formatearFechaHora(v.salidaTs, zonaHoraria)}
            {v.linea && ` · ${v.linea}`}
          </p>
        </div>
        {e && <Chip tono={TONO_RESULTADO[e.resultado]}>{ETIQUETA_RESULTADO[e.resultado]}</Chip>}
      </div>

      {conDesde && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-tinta-suave">Medir desde</span>
          {(
            [
              ['salida', 'La salida'],
              ['control', 'El último control'],
              ['otro', 'Otro momento'],
            ] as const
          ).map(([m, t]) =>
            m === 'control' && !v.ultimoControl ? null : (
              <button
                key={m}
                type="button"
                className={cn('rounded-full border px-3 py-1', modo === m ? 'border-marca bg-marca/10 text-marca' : 'border-borde text-tinta-suave hover:bg-hover')}
                onClick={() => elegir(m)}
              >
                {t}
              </button>
            ),
          )}
          {modo === 'otro' && (
            <input
              type="datetime-local"
              aria-label="Desde"
              className={cn(CONTROL_FILTRO, 'h-8')}
              value={otro}
              onChange={(x) => {
                setOtro(x.target.value);
                setHecho(null);
              }}
            />
          )}
          {desde && tramo.data && <span className="text-tinta-suave">desde {formatearFechaHora(tramo.data.desde, zonaHoraria)}</span>}
        </div>
      )}

      {tramo.isError ? (
        <ErrorLectura texto="No se pudo medir desde ese momento." error={tramo.error} onReintentar={() => void tramo.refetch()} />
      ) : !e ? (
        <Cargando texto="Calculando desde ese momento…" />
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-2 text-sm">
            <Dato etiqueta="Km">{num(n.km, 0)}</Dato>
            <Dato etiqueta="Litros">{num(n.litros, 0)}</Dato>
            <Dato etiqueta="L/100 km">
              <span className={e.estadoConsumo ? COLOR_ESTADO[e.estadoConsumo] : undefined}>{num(e.l100km)}</span>
              {e.objetivoL100km !== null && <span className="block text-xs text-tinta-suave">objetivo {num(e.objetivoL100km)}</span>}
            </Dato>
            <Dato etiqueta="Programador">
              <span className={e.estadoProgramador ? COLOR_ESTADO[e.estadoProgramador] : undefined}>
                {n.programadorPct === null ? '—' : `${num(n.programadorPct, 0)} %`}
              </span>
            </Dato>
          </dl>
          {!n.conTelemetria && (
            <p className="text-xs text-alerta">{n.motivoSinLitros ?? 'La telemetría de esta marca no da el consumo: cargá los números de su plataforma.'}</p>
          )}

          <div className="space-y-2 rounded-md bg-hover p-3">
            <p className="whitespace-pre-line text-sm text-tinta">{e.mensaje}</p>
            <BotonCopiar texto={e.mensaje} />
          </div>
        </>
      )}

      {registra && (
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-xs text-tinta-suave">
            <input type="checkbox" className="accent-marca" checked={manual} onChange={(x) => setManual(x.target.checked)} /> Cargar los números a mano (de la
            plataforma de la marca)
          </label>
          {manual && (
            <div className="grid grid-cols-3 gap-2">
              <input className={CONTROL_FILTRO} inputMode="decimal" placeholder="Km" value={km} onChange={(x) => setKm(x.target.value)} />
              <input className={CONTROL_FILTRO} inputMode="decimal" placeholder="Litros" value={litros} onChange={(x) => setLitros(x.target.value)} />
              <input className={CONTROL_FILTRO} inputMode="decimal" placeholder="% programador" value={prog} onChange={(x) => setProg(x.target.value)} />
            </div>
          )}
          <ErrorBase error={envio.error} />
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={registrar.isPending}
            onClick={() =>
              void envio.enviar(
                registrar
                  .mutateAsync({
                    viajeId: v.viajeId,
                    km: manual ? decimal(km) : null,
                    litros: manual ? decimal(litros) : null,
                    programador: manual ? decimal(prog) : null,
                    ...(conDesde && desde ? { desde } : {}),
                  })
                  .then((r) => {
                    if (r.ok) setHecho(r.data);
                    return r;
                  }),
                () => undefined,
              )
            }
          >
            {registrar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Registrar control
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tinta-suave">
        <span>
          {v.ultimoControl
            ? `Último control: ${formatearFechaHora(v.ultimoControl.en, zonaHoraria)} por ${v.ultimoControl.por ?? '—'} (${ETIQUETA_RESULTADO[v.ultimoControl.resultado]})`
            : 'Sin controles todavía'}
          {v.controlesHoy > 0 && ` · ${v.controlesHoy} hoy`}
        </span>
        <span className="flex items-center gap-3">
          {conPedido && (
            <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setPedido(!pedido)}>
              <Fuel className="size-3.5" /> {pedido ? 'Cerrar pedido de carga' : 'Pedir carga'}
            </button>
          )}
          <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setHistorial(!historial)}>
            <History className="size-3.5" /> {historial ? 'Ocultar historial' : 'Historial'}
          </button>
        </span>
      </div>
      {pedido && <PedidoCarga viajeId={v.viajeId} registra={registra} />}
      {historial && <Historial viajeId={v.viajeId} />}
    </li>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="font-semibold tabular-nums text-tinta">{children}</dd>
    </div>
  );
}

function Historial({ viajeId }: { viajeId: number }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending } = useControlesViaje(viajeId);
  if (isPending) return <Cargando texto="Cargando…" />;
  if (!data || data.length === 0) return <p className="text-xs text-tinta-suave">Todavía no hay controles de este viaje.</p>;
  return (
    <ul className="space-y-2 border-t border-borde pt-2 text-sm">
      {data.map((c) => (
        <li key={c.id} className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-tinta-suave">
            <Chip tono={TONO_RESULTADO[c.resultado]}>{ETIQUETA_RESULTADO[c.resultado]}</Chip>
            {formatearFechaHora(c.en, zonaHoraria)} · {c.por ?? '—'} · {num(c.km, 0)} km · {num(c.l100km)} L/100 km
            {c.programadorPct !== null && ` · ${num(c.programadorPct, 0)} % programador`}
            {c.fuente === 'manual' && ' · cargado a mano'}
            {c.desde && ` · desde ${formatearFechaHora(c.desde, zonaHoraria)}`}
          </p>
          <p className="text-tinta">{c.mensaje}</p>
        </li>
      ))}
    </ul>
  );
}
