'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRightLeft, ChevronRight, ClipboardCheck, Fuel, Plus, Receipt, Truck, type LucideIcon } from 'lucide-react';
import { Cargando, Chip, Encabezado, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { useAbrirFicha, useFichaDeLaDireccion } from '@/modules/core/fichas/contexto';
import { can } from '@/modules/core/permissions/resolver';
import type { Permiso } from '@/modules/core/permissions/types';
import { useSesion } from '@/modules/core/session/session-provider';
import { PendientesPantalla } from '@/modules/pendientes/components/pendientes-pantalla';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { accionDe, agruparTareas, ETIQUETA_GRUPO_HOY, type Tarea } from '../hoy';
import { useHoy } from '../use-hoy';

// Sprint 4: las tarjetas se cargan solo para los roles que las ven (no suman peso a los demás)
const TarjetasFinanzas = dynamic(() => import('@/modules/finanzas/components/tablero').then((m) => ({ default: m.TarjetasFinanzas })), {
  loading: () => <Cargando texto="Leyendo los números…" />,
});
const TarjetaTanqueBase = dynamic(() => import('@/modules/combustible/components/base/base-pantalla').then((m) => ({ default: m.TarjetaTanqueBase })), {
  loading: () => <Cargando texto="Cargando el tanque de base…" />,
});

interface Atajo {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  permiso: Permiso;
}

/** La franja de altas de Hoy (Plan de migración UX, ítem 20): los formularios de siempre, según el rol. */
const ATAJOS: readonly Atajo[] = [
  { href: '/combustible/cargas/nueva', etiqueta: 'Carga', icono: Fuel, permiso: 'combustible.cargas:editar' },
  { href: '/combustible/movimientos/nuevo', etiqueta: 'Movimiento', icono: ArrowRightLeft, permiso: 'combustible.movimientos:editar' },
  { href: '/operacion/operaciones?nueva=1', etiqueta: 'Operación', icono: Truck, permiso: 'operacion.servicios:editar' },
  { href: '/finanzas/gastos/nuevo', etiqueta: 'Gasto', icono: Receipt, permiso: 'finanzas.gastos:editar' },
];

/**
 * Sprint 3 · «Hoy»: lo que le toca a cada uno en una sola lista (seg.fn_lo_mio_de_hoy).
 * Cada renglón abre su ficha en el panel de la derecha, donde están las mismas acciones de
 * siempre (aprobar el cierre, adjuntar el ticket, resolver la anulación), sin salir de acá.
 * Mientras la base no tenga la migración 116, se muestra Mis pendientes como antes.
 */
export function HoyPantalla() {
  const { data, isPending, isError, error, refetch, activo } = useHoy();
  if (!activo) {
    return (
      <div className="space-y-5">
        <Franja />
        <Tarjetas />
        <PendientesPantalla />
      </div>
    );
  }
  const grupos = agruparTareas(data ?? []);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Hoy" subtitulo="Lo que te toca, en una sola lista" />
      <Franja />
      <Tarjetas />
      {isPending ? (
        <Cargando texto="Buscando lo que te toca…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo cargar la lista de hoy." onReintentar={() => void refetch()} error={error} />
      ) : grupos.length === 0 ? (
        <Vacio icono={<ClipboardCheck className="size-6" />} texto="No tenés nada pendiente. ¡Al día!" />
      ) : (
        grupos.map((g) => (
          <Seccion key={g.grupo} titulo={`${ETIQUETA_GRUPO_HOY[g.grupo].titulo} (${g.tareas.reduce((n, t) => n + t.cantidad, 0)})`}>
            <p className="-mt-2 text-xs text-tinta-suave">{ETIQUETA_GRUPO_HOY[g.grupo].ayuda}</p>
            <ul className="divide-y divide-borde">
              {g.tareas.map((t, i) => (
                // Varias tareas pueden llevar a la misma lista (por ejemplo, varios pagos): la posición desempata
                <RenglonTarea key={`${t.tipo}-${t.objeto ? `${t.objeto.tipo}:${t.objeto.id}` : t.ruta}-${i}`} t={t} />
              ))}
            </ul>
          </Seccion>
        ))
      )}
    </div>
  );
}

/**
 * Sprint 4: tarjetas arriba de la lista, según el rol (las mismas de sus pantallas):
 * los números de Finanzas para Finanzas y Gerencia, y el tanque para Base Mendoza.
 */
function Tarjetas() {
  const { rolesApp, permisos } = useSesion();
  const numeros = can(permisos, 'finanzas.resumen:ver') && rolesApp.some((r) => r === 'finanzas' || r === 'gerencia');
  const tanque = can(permisos, 'combustible.depositos:ver') && rolesApp.includes('base_mendoza');
  if (!numeros && !tanque) return null;
  return (
    <div className="space-y-4">
      {numeros && <TarjetasFinanzas />}
      {tanque && <TarjetaTanqueBase />}
    </div>
  );
}

/** Altas rápidas según el rol. Si el rol no puede dar de alta nada, no se muestra. */
function Franja() {
  const { permisos } = useSesion();
  const permitidos = ATAJOS.filter((a) => can(permisos, a.permiso));
  if (permitidos.length === 0) return null;
  return (
    <nav aria-label="Cargar nuevo" className="flex flex-wrap gap-2">
      {permitidos.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-panel px-3 py-2 text-sm font-medium text-tinta hover:border-marca hover:text-marca"
        >
          <Plus className="size-4" />
          <a.icono className="size-4 text-tinta-suave" />
          {a.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

/** Un renglón: qué es, desde cuándo y el botón que lo abre (la ficha en el panel o su lista). */
function RenglonTarea({ t }: { t: Tarea }) {
  const { zonaHoraria } = useSesion();
  const abrirFicha = useAbrirFicha();
  const { ficha } = useFichaDeLaDireccion();
  const abierta = !!t.objeto && ficha?.tipo === t.objeto.tipo && ficha.id === t.objeto.id;

  const contenido = (
    <>
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', t.tipo === 'error_seccion' ? 'text-error' : 'text-tinta')}>
          {t.titulo} {t.cantidad > 1 && <Chip tono="alerta">{t.cantidad}</Chip>}
        </p>
        {(t.detalle || t.fecha) && (
          <p className="text-sm text-tinta-suave">
            {[t.detalle, t.fecha && formatearFechaHora(t.fecha, zonaHoraria)].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-marca">
        {accionDe(t)}
        <ChevronRight className="size-4" />
      </span>
    </>
  );
  const clase = 'flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-hover';

  return (
    <li data-ficha-abierta={abierta || undefined} className={cn(abierta && 'bg-marca-suave')}>
      {t.objeto ? (
        <button type="button" onClick={() => t.objeto && abrirFicha(t.objeto.tipo, t.objeto.id)} className={clase}>
          {contenido}
        </button>
      ) : (
        <Link href={t.ruta ?? '/hoy'} className={clase}>
          {contenido}
        </Link>
      )}
    </li>
  );
}
