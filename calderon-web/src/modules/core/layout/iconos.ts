import { Building2, ClipboardCheck, Fuel, House, Route, Settings, Truck, type LucideIcon } from 'lucide-react';
import type { IconoGrupo } from '@/modules/core/navigation/navigation';

export const ICONO_GRUPO: Record<IconoGrupo, LucideIcon> = {
  inicio: House,
  pendientes: ClipboardCheck,
  logistica: Route,
  combustible: Fuel,
  flota: Truck,
  datos: Building2,
  configuracion: Settings,
};
