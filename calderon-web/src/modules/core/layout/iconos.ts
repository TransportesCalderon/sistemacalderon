import { Building2, CirclePlus, Package, Wallet, ClipboardCheck, Fuel, House, Route, Settings, Truck, type LucideIcon } from 'lucide-react';
import type { IconoGrupo } from '@/modules/core/navigation/navigation';

export const ICONO_GRUPO: Record<IconoGrupo, LucideIcon> = {
  inicio: House,
  chofer: Package,
  cargar: CirclePlus,
  pendientes: ClipboardCheck,
  logistica: Route,
  combustible: Fuel,
  flota: Truck,
  rrhh: Wallet,
  datos: Building2,
  configuracion: Settings,
};
