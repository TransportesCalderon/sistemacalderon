import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardCheck, ClipboardList, Fuel, LayoutGrid, MapPin, Plus, SearchCheck, Truck, UsersRound, type LucideIcon } from 'lucide-react';
import { requirePermiso } from '@/modules/core/auth/guards';
import { can } from '@/modules/core/permissions/resolver';
import type { Permiso } from '@/modules/core/permissions/types';
import { TARJETA } from '@/shared/ui/clases';

export const metadata: Metadata = { title: 'Inicio' };

interface Tarea {
  href: string;
  titulo: string;
  detalle: string;
  icono: LucideIcon;
  permiso: Permiso;
  principal?: boolean;
}

/** Lo que más se hace en el día, en botones grandes. Cada uno se ve solo si el rol lo puede usar. */
const TAREAS: readonly Tarea[] = [
  { href: '/operacion/operaciones?nueva=1', titulo: 'Nueva operación', detalle: 'Cargar un pedido de un cliente', icono: Plus, permiso: 'operacion.servicios:editar', principal: true },
  { href: '/operacion/operaciones', titulo: 'Operaciones', detalle: 'Ver y avanzar los viajes de Logística', icono: ClipboardList, permiso: 'operacion.servicios:ver' },
  { href: '/operacion/tractores', titulo: 'Tractores y viajes', detalle: 'Iniciar y cerrar los viajes de los choferes', icono: Truck, permiso: 'operacion.tramos:ver' },
  { href: '/flota/pizarra', titulo: 'Pizarra Azul', detalle: 'Dónde está cada semi y qué hace', icono: LayoutGrid, permiso: 'flota.pizarra:ver' },
  { href: '/combustible/cargas/nueva', titulo: 'Registrar carga', detalle: 'Una carga de combustible con su ticket', icono: Fuel, permiso: 'combustible.cargas:editar', principal: true },
  { href: '/combustible/observadas', titulo: 'Cargas por revisar', detalle: 'Validar contra el ticket', icono: SearchCheck, permiso: 'combustible.bandejas:ver' },
  { href: '/pendientes', titulo: 'Mis pendientes', detalle: 'Lo que espera una acción tuya', icono: ClipboardCheck, permiso: 'inicio.pendientes:ver' },
  { href: '/telemetria/mapa', titulo: 'Mapa de flota', detalle: 'Los tractores en el mapa, en vivo', icono: MapPin, permiso: 'telemetria.mapa:ver' },
  { href: '/flota/choferes', titulo: 'Choferes', detalle: 'Datos, licencia y visa', icono: UsersRound, permiso: 'flota.choferes:ver' },
];

/** Inicio: accesos directos a las tareas del día según el rol. */
export default async function InicioPage() {
  const ctx = await requirePermiso('inicio.dashboard:ver');
  const tareas = TAREAS.filter((t) => can(ctx.permisos, t.permiso));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-tinta">¿Qué querés hacer?</h1>
        <p className="mt-1 text-sm text-tinta-suave">Los accesos más usados. Todo lo demás está en el menú de la izquierda.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tareas.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className={
                t.principal
                  ? 'flex h-full items-start gap-3 rounded-xl bg-marca p-4 text-white hover:bg-marca/90'
                  : `${TARJETA} flex h-full items-start gap-3 p-4 hover:border-marca hover:bg-hover`
              }
            >
              <t.icono className="mt-0.5 size-6 shrink-0" />
              <span>
                <span className="block font-semibold">{t.titulo}</span>
                <span className={t.principal ? 'text-sm text-white/85' : 'text-sm text-tinta-suave'}>{t.detalle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
