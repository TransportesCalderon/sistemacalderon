'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Chip, type Tono } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { TARJETA } from '@/shared/ui/clases';
import type { CuentaContable, SituacionGasto } from '../domain/finanzas.types';

/** Piezas chicas compartidas por las pantallas de Finanzas. */
export const MONEDAS = ['CLP', 'USD', 'ARS', 'BRL', 'PYG'] as const;

const TONO_SITUACION: Record<SituacionGasto, Tono> = { pendiente: 'marca', vencido: 'error', pagado: 'exito', anulado: 'neutro' };
const ETIQUETA_SITUACION: Record<SituacionGasto, string> = { pendiente: 'Por pagar', vencido: 'Vencido', pagado: 'Pagado', anulado: 'Anulado' };
export const ChipSituacion = ({ s }: { s: SituacionGasto }) => <Chip tono={TONO_SITUACION[s]}>{ETIQUETA_SITUACION[s]}</Chip>;

export const fecha = (d: string | null | undefined) => (d ? formatearFechaDia(d) : '—');

/** Número grande con su explicación (y a dónde ir). */
export function Indicador({
  titulo,
  valor,
  detalle,
  href,
  tono = 'normal',
}: {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  href?: string;
  tono?: 'normal' | 'alerta' | 'error';
}) {
  const cuerpo = (
    <>
      <p className="text-xs font-medium text-tinta-suave">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-tinta tabular-nums">{valor}</p>
      {detalle && <p className={cn('mt-1 text-xs', tono === 'error' ? 'text-error' : tono === 'alerta' ? 'text-alerta' : 'text-tinta-suave')}>{detalle}</p>}
    </>
  );
  return href ? (
    <Link href={href} className={cn(TARJETA, 'block p-4 hover:bg-hover')}>
      {cuerpo}
    </Link>
  ) : (
    <div className={cn(TARJETA, 'p-4')}>{cuerpo}</div>
  );
}

/** Selector de cuenta contable agrupado por tipo (para gastos, ingresos y egresos). */
export function OpcionesCuentas({ cuentas }: { cuentas: CuentaContable[] }) {
  const grupos: [string, CuentaContable[]][] = [
    ['Costos de operación', cuentas.filter((c) => c.tipo === 'costo')],
    ['Gastos de administración y financieros', cuentas.filter((c) => c.tipo === 'gasto')],
    ['Ingresos', cuentas.filter((c) => c.tipo === 'ingreso')],
    ['Activos (compras de equipos, anticipos…)', cuentas.filter((c) => c.tipo === 'activo')],
    ['Pasivos (préstamos, leasing, impuestos…)', cuentas.filter((c) => c.tipo === 'pasivo')],
    ['Patrimonio (aportes y retiros de socios)', cuentas.filter((c) => c.tipo === 'patrimonio')],
  ];
  return (
    <>
      {grupos
        .filter(([, cs]) => cs.length > 0)
        .map(([g, cs]) => (
          <optgroup key={g} label={g}>
            {cs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
          </optgroup>
        ))}
    </>
  );
}

/** Aviso amarillo con un enlace. */
export function Aviso({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">{children}</div>;
}
