import { Building2, Handshake, Landmark, CirclePlus, Package, Wallet, ClipboardCheck, Fuel, House, Route, Settings, Truck, type LucideIcon } from 'lucide-react';
import type { IconoGrupo } from '@/modules/core/navigation/navigation';

export const ICONO_GRUPO: Record<IconoGrupo, LucideIcon> = {
  inicio: House,
  chofer: Package,
  cargar: CirclePlus,
  pendientes: ClipboardCheck,
  ventas: Handshake,
  logistica: Route,
  combustible: Fuel,
  flota: Truck,
  rrhh: Wallet,
  finanzas: Landmark,
  datos: Building2,
  configuracion: Settings,
};
