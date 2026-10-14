import {
  Building2,
  Fuel,
  House,
  Landmark,
  RadioTower,
  Route,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { IconoGrupo } from '@/modules/core/navigation/navigation';

export const ICONO_GRUPO: Record<IconoGrupo, LucideIcon> = {
  inicio: House,
  combustible: Fuel,
  operacion: Route,
  anomalias: TriangleAlert,
  telemetria: RadioTower,
  flota: Truck,
  comercial: Building2,
  liquidacion: Wallet,
  finanzas: Landmark,
  configuracion: Settings,
  auditoria: ShieldCheck,
};
