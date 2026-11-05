'use client';

import { useState } from 'react';
import { Check, ClipboardCopy, History, LoaderCircle, Radar } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { ETIQUETA_RESULTADO, VERSION_SEGUIMIENTO, type Estado, type Evaluacion, type Resultado, type ViajeEnCurso } from '../domain/seguimiento.types';
import { useControlesViaje, useRegistrarSeguimiento, useViajesEnCurso } from '../queries/hooks';

const TONO_RESULTADO: Record<Resultado, Tono> = { bien: 'exito', a_mejorar: 'alerta', mal: 'error', sin_datos: 'neutro' };
const COLOR_ESTADO: Record<NonNullable<Estado>, string> = { verde: 'text-exito', naranja: 'text-alerta', rojo: 'text-error' };
const num = (v: number | null, d = 1) => (v === null ? '—' : formatearNumero(v, d));
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
        <ul className={cn('grid gap-3 lg:grid-cols-2', isFetching && 'opacity-80')}>
          {data.map((v) => (
            <TarjetaViaje key={v.viajeId} v={v} registra={registra} />
          ))}
        </ul>
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
  const e = hecho ?? v.evaluacion;

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
        <Chip tono={TONO_RESULTADO[e.resultado]}>{ETIQUETA_RESULTADO[e.resultado]}</Chip>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-sm">
        <Dato etiqueta="Km">{num(v.km, 0)}</Dato>
        <Dato etiqueta="Litros">{num(v.litros, 0)}</Dato>
        <Dato etiqueta="L/100 km">
          <span className={e.estadoConsumo ? COLOR_ESTADO[e.estadoConsumo] : undefined}>{num(e.l100km)}</span>
          {e.objetivoL100km !== null && <span className="block text-xs text-tinta-suave">objetivo {num(e.objetivoL100km)}</span>}
        </Dato>
        <Dato etiqueta="Programador">
          <span className={e.estadoProgramador ? COLOR_ESTADO[e.estadoProgramador] : undefined}>{v.programadorPct === null ? '—' : `${num(v.programadorPct, 0)} %`}</span>
        </Dato>
      </dl>
      {!v.conTelemetria && <p className="text-xs text-alerta">La telemetría de esta marca no da el consumo: cargá los números de su plataforma.</p>}

      <div className="space-y-2 rounded-md bg-hover p-3">
        <p className="whitespace-pre-line text-sm text-tinta">{e.mensaje}</p>
        <BotonCopiar texto={e.mensaje} />
      </div>

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
        <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setHistorial(!historial)}>
          <History className="size-3.5" /> {historial ? 'Ocultar historial' : 'Historial'}
        </button>
      </div>
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

function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={BOTON_SECUNDARIO}
      onClick={() =>
        void navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        })
      }
    >
      {copiado ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copiado ? 'Copiado' : 'Copiar mensaje'}
    </button>
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
          </p>
          <p className="text-tinta">{c.mensaje}</p>
        </li>
      ))}
    </ul>
  );
}
