'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronRight, CircleDashed, Lightbulb, Trophy, X } from 'lucide-react';
import { Cargando, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { browserDb } from '@/shared/supabase/browser';
import { TARJETA } from '@/shared/ui/clases';
import { numero, parsearMiManejo, posicionConsumo, type MiManejo, type Nivel } from '../domain/mi-manejo';

/**
 * Migración 387 · «Cómo voy manejando»: el chofer ve cómo viene con el bono por desempeño, el consumo, el ralentí y su
 * manejo, para alentarlo a mejorar. La base hace las cuentas y escribe el mensaje y los consejos; acá solo se muestran.
 */
const FUNCION_INEXISTENTE = new Set(['PGRST202', '42883']);

export function useMiManejo() {
  return useQuery({
    queryKey: ['chofer', 'mi-manejo'],
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('tel').rpc('fn_mi_manejo');
      if (error) {
        if (FUNCION_INEXISTENTE.has(error.code ?? '')) return null;
        throw error;
      }
      return parsearMiManejo(data);
    },
  });
}

const TONO_ESTADO: Record<MiManejo['estado'], string> = {
  en_camino: 'border-exito/40 bg-exito/10',
  cerca: 'border-alerta/40 bg-alerta/10',
  lejos: 'border-alerta/40 bg-alerta/10',
  faltante: 'border-error/40 bg-error/10',
  sin_datos: 'border-borde bg-panel',
  no_aplica: 'border-borde bg-panel',
};
const COLOR_NIVEL: Record<Nivel, string> = { bien: 'text-exito', regular: 'text-alerta', mejorar: 'text-error' };
const FONDO_NIVEL: Record<Nivel, string> = { bien: 'bg-exito', regular: 'bg-alerta', mejorar: 'bg-error' };
const TEXTO_NIVEL: Record<Nivel, string> = { bien: 'Bien', regular: 'Atento', mejorar: 'A mejorar' };

/** La tarjeta de Mi viaje: el mensaje y el medidor de consumo; abre el detalle. */
export function TarjetaManejo() {
  const { data } = useMiManejo();
  if (!data) return null;
  return (
    <Link href="/mi-viaje?ver=manejo" className={cn(TARJETA, 'block space-y-3 border p-4 active:bg-hover', TONO_ESTADO[data.estado])}>
      <span className="flex items-center justify-between text-xs font-semibold text-tinta-suave uppercase">
        <span className="flex items-center gap-1.5">
          <Trophy className="size-4 text-marca" /> Cómo voy manejando
        </span>
        <ChevronRight className="size-4" />
      </span>
      <p className="text-base font-medium text-tinta">{data.titulo}</p>
      {data.bono.consumo !== null && <Medidor consumo={data.bono.consumo} objetivo={data.bono.consumoMax} />}
      <ResumenNiveles m={data} />
    </Link>
  );
}

/** El detalle (Mi viaje › Cómo voy manejando). */
export function MiManejoPantalla() {
  const q = useMiManejo();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/mi-viaje" className="inline-flex items-center gap-1 text-sm text-marca">
        <ArrowLeft className="size-4" /> Mi viaje
      </Link>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-tinta">
        <Trophy className="size-6 text-marca" /> Cómo voy manejando
      </h1>
      {q.isPending ? (
        <Cargando texto="Mirando cómo venís…" />
      ) : q.isError ? (
        <ErrorLectura texto="No se pudo leer cómo venís manejando." onReintentar={() => void q.refetch()} />
      ) : !q.data ? (
        <p className="text-sm text-tinta-suave">Todavía no está disponible.</p>
      ) : (
        <Detalle m={q.data} />
      )}
    </div>
  );
}

function Detalle({ m }: { m: MiManejo }) {
  const b = m.bono;
  return (
    <>
      <section className={cn(TARJETA, 'space-y-3 border p-4', TONO_ESTADO[m.estado])}>
        <p className="text-lg font-semibold text-tinta">{m.titulo}</p>
        {b.consumo !== null && <Medidor consumo={b.consumo} objetivo={b.consumoMax} />}
        <p className="text-xs text-tinta-suave">
          Período del {fecha(m.periodo.desde)} al {fecha(m.periodo.hasta)} · van {m.periodo.diasPasados} de {m.periodo.dias} días
        </p>
      </section>

      {m.consejos.length > 0 && (
        <section className={cn(TARJETA, 'space-y-2 p-4')}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
            <Lightbulb className="size-4 text-marca" /> Para mejorar
          </h2>
          <ul className="space-y-2 text-sm text-tinta">
            {m.consejos.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marca" />
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.aplica && (
        <section className={cn(TARJETA, 'space-y-2 p-4')}>
          <h2 className="text-sm font-semibold text-tinta">Bono por desempeño · ${numero(b.importe, 0)} por mes</h2>
          <p className="text-xs text-tinta-suave">Se cobra si se cumplen las cuatro cosas en el mes.</p>
          <ul className="divide-y divide-borde text-sm">
            <Requisito
              ok={b.consumo === null ? null : b.consumo <= b.consumoMax}
              texto={`Consumo de ${numero(b.consumoMax)} L/100 km o menos`}
              detalle={b.consumo === null ? 'Todavía sin km suficientes' : `Venís en ${numero(b.consumo)}`}
            />
            <Requisito
              ok={b.sinFaltantes}
              texto="Sin faltantes de combustible"
              detalle={b.sinFaltantes === null ? 'Se ve con los cierres aprobados' : b.sinFaltantes ? 'Sin faltantes en los cierres' : `${numero(b.faltanteL)} L de faltante`}
            />
            <Requisito ok={b.cuidadoUnidad} texto="Cuidado de la unidad" detalle={b.cuidadoUnidad === null ? 'Lo evalúa RRHH a fin de mes' : undefined} />
            <Requisito ok={b.limpieza} texto="Limpieza e higiene" detalle={b.limpieza === null ? 'Lo evalúa RRHH a fin de mes' : undefined} />
          </ul>
        </section>
      )}

      <section className={cn(TARJETA, 'space-y-3 p-4')}>
        <h2 className="text-sm font-semibold text-tinta">Consumo</h2>
        <div className="grid grid-cols-2 gap-3">
          <Cifra
            titulo="Lo que cuenta para el bono"
            valor={m.consumo.cierres.l100 === null ? '—' : `${numero(m.consumo.cierres.l100)} L/100 km`}
            nota={
              m.consumo.cierres.aprobados === 0
                ? 'Todavía sin cierres aprobados este período'
                : `${m.consumo.cierres.aprobados} cierre${m.consumo.cierres.aprobados === 1 ? '' : 's'} aprobado${m.consumo.cierres.aprobados === 1 ? '' : 's'} · ${numero(m.consumo.cierres.km, 0)} km`
            }
          />
          <Cifra
            titulo="Cómo venís ahora (motor)"
            valor={m.consumo.motor.l100 === null ? '—' : `${numero(m.consumo.motor.l100)} L/100 km`}
            nota={
              m.consumo.motor.ultimos7 === null
                ? `${numero(m.consumo.motor.km, 0)} km en ${m.consumo.motor.dias} días`
                : `Últimos 7 días: ${numero(m.consumo.motor.ultimos7)}`
            }
          />
        </div>
        {m.consumo.cierres.pendientes > 0 && (
          <p className="text-xs text-tinta-suave">
            {m.consumo.cierres.pendientes} cierre{m.consumo.cierres.pendientes === 1 ? '' : 's'} sin aprobar todavía: cuentan cuando se aprueban.
          </p>
        )}
      </section>

      <section className={cn(TARJETA, 'space-y-2 p-4')}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-tinta">Ralentí del mes</h2>
          {m.estilo.niveles.ralenti && <NivelChip n={m.estilo.niveles.ralenti} />}
        </div>
        <Barra valor={m.ralenti.litros} maximo={m.ralenti.permitidoL} nivel={m.estilo.niveles.ralenti ?? 'bien'} />
        <p className="text-sm text-tinta tabular-nums">
          {numero(m.ralenti.litros)} L de {numero(m.ralenti.permitidoL)} L permitidos
          {m.ralenti.litros <= m.ralenti.permitidoL ? ` · te quedan ${numero(m.ralenti.quedanL)} L` : ''}
        </p>
        <p className="text-xs text-tinta-suave">
          {numero(m.ralenti.horas)} h con el motor en marcha y parado
          {m.ralenti.pctMotor !== null ? ` (${numero(m.ralenti.pctMotor)} % del tiempo de motor)` : ''} · a este ritmo cerrás el mes con{' '}
          {numero(m.ralenti.ritmoFinDeMesL)} L
        </p>
      </section>

      <section className={cn(TARJETA, 'space-y-2 p-4')}>
        <h2 className="text-sm font-semibold text-tinta">Cómo manejás</h2>
        <ul className="divide-y divide-borde text-sm">
          <Indicador
            texto="Programador de velocidad"
            valor={m.estilo.programadorPct === null ? null : `${numero(m.estilo.programadorPct, 0)} % de los km`}
            nota={`Lo ideal: más del ${numero(m.estilo.programadorObjetivoPct, 0)} %`}
            nivel={m.estilo.niveles.programador}
          />
          <Indicador
            texto="Exceso de velocidad"
            valor={m.estilo.excesoVelocidadMin === null ? null : `${numero(m.estilo.excesoVelocidadMin, 0)} min`}
            nota={m.estilo.velocidadMax === null ? undefined : `Máxima: ${numero(m.estilo.velocidadMax, 0)} km/h`}
            nivel={m.estilo.niveles.velocidad}
          />
          <Indicador
            texto="RPM altas"
            valor={m.estilo.rpmPct === null ? null : `${numero(m.estilo.rpmPct)} % del tiempo en marcha`}
            nivel={m.estilo.niveles.rpm}
          />
          <Indicador
            texto="Frenadas fuertes"
            valor={m.estilo.frenadas100 === null ? null : `${numero(m.estilo.frenadas100)} s cada 100 km`}
            nivel={m.estilo.niveles.frenadas}
          />
        </ul>
        <p className="text-xs text-tinta-suave">Datos del motor del camión en el período de liquidación.</p>
      </section>
    </>
  );
}

/** El medidor del consumo: verde hasta el objetivo, naranja y rojo de ahí para arriba. */
function Medidor({ consumo, objetivo }: { consumo: number; objetivo: number }) {
  const p = posicionConsumo(consumo, objetivo);
  return (
    <div className="space-y-1">
      <div className="relative h-3 rounded-full bg-gradient-to-r from-exito from-45% via-alerta via-60% to-error" role="meter" aria-label="Consumo contra el objetivo" aria-valuenow={consumo}>
        <div className="absolute inset-y-[-3px] left-1/2 w-0.5 bg-tinta" title={`Objetivo ${numero(objetivo)}`} />
        <div
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-tinta shadow"
          style={{ left: `${p}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-tinta-suave tabular-nums">
        <span>Mejor</span>
        <span className="font-medium text-tinta">Objetivo {numero(objetivo)} L/100 km</span>
        <span>Peor</span>
      </div>
    </div>
  );
}

function ResumenNiveles({ m }: { m: MiManejo }) {
  const items: [string, Nivel | undefined][] = [
    ['Consumo', m.estilo.niveles.consumo],
    ['Ralentí', m.estilo.niveles.ralenti],
    ['Programador', m.estilo.niveles.programador],
    ['Velocidad', m.estilo.niveles.velocidad],
  ];
  const con = items.filter((x): x is [string, Nivel] => x[1] !== undefined);
  if (con.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {con.map(([t, n]) => (
        <span key={t} className="inline-flex items-center gap-1 text-tinta">
          <span className={cn('size-2 rounded-full', FONDO_NIVEL[n])} /> {t}
        </span>
      ))}
    </div>
  );
}

function Requisito({ ok, texto, detalle }: { ok: boolean | null; texto: string; detalle?: string }) {
  return (
    <li className="flex items-start gap-2 py-2">
      {ok === null ? (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-tinta-suave" />
      ) : ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-exito" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-error" />
      )}
      <span className="flex-1">
        <span className="text-tinta">{texto}</span>
        {detalle && <span className="block text-xs text-tinta-suave">{detalle}</span>}
      </span>
    </li>
  );
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <p className="text-xs text-tinta-suave">{titulo}</p>
      <p className="text-xl font-semibold text-tinta tabular-nums">{valor}</p>
      {nota && <p className="text-xs text-tinta-suave">{nota}</p>}
    </div>
  );
}

function Barra({ valor, maximo, nivel }: { valor: number; maximo: number; nivel: Nivel }) {
  const p = maximo > 0 ? Math.min(Math.round((valor / maximo) * 100), 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-borde/60" role="meter" aria-valuemin={0} aria-valuemax={maximo} aria-valuenow={valor}>
      <div className={cn('h-full rounded-full', FONDO_NIVEL[nivel])} style={{ width: `${p}%` }} />
    </div>
  );
}

function Indicador({ texto, valor, nota, nivel }: { texto: string; valor: string | null; nota?: string; nivel?: Nivel }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span>
        <span className="text-tinta">{texto}</span>
        {nota && <span className="block text-xs text-tinta-suave">{nota}</span>}
      </span>
      <span className="text-right">
        <span className="block font-medium text-tinta tabular-nums">{valor ?? 'Sin dato'}</span>
        {nivel && <span className={cn('text-xs font-semibold', COLOR_NIVEL[nivel])}>{TEXTO_NIVEL[nivel]}</span>}
      </span>
    </li>
  );
}

function NivelChip({ n }: { n: Nivel }) {
  return <span className={cn('text-xs font-semibold', COLOR_NIVEL[n])}>{TEXTO_NIVEL[n]}</span>;
}

const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);
