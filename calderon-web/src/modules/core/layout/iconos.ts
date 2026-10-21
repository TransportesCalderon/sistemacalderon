import { Building2, CirclePlus, ClipboardCheck, Fuel, House, Route, Settings, Truck, type LucideIcon } from 'lucide-react';
import type { IconoGrupo } from '@/modules/core/navigation/navigation';

export const ICONO_GRUPO: Record<IconoGrupo, LucideIcon> = {
  inicio: House,
  cargar: CirclePlus,
  pendientes: ClipboardCheck,
  logistica: Route,
  combustible: Fuel,
  flota: Truck,
  datos: Building2,
  configuracion: Settings,
};
