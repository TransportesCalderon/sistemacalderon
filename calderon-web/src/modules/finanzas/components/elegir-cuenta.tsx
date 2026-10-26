'use client';

import { Campo } from '@/shared/ui/campo';
import { useCuentasParaElegir } from '../queries/hooks';

/**
 * «¿De qué banco o caja salió (o entró) la plata?» para pantallas de otros módulos (fondos, sueldos).
 * Solo aparece si quien usa la pantalla puede ver las cuentas (Finanzas, RR.HH., TI); si se deja
 * vacío, la contabilidad lo deja en «Dinero sin cuenta bancaria asignada» hasta que se aclare.
 */
export function ElegirCuentaDinero({ valor, onCambio, etiqueta = 'Sale de (banco o caja)' }: { valor: number | null; onCambio: (v: number | null) => void; etiqueta?: string }) {
  const { data } = useCuentasParaElegir();
  if (!data || data.length === 0) return null;
  return (
    <Campo label={etiqueta}>
      <select value={valor ?? ''} onChange={(e) => onCambio(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— Sin decir —</option>
        {data.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({c.moneda})
          </option>
        ))}
      </select>
    </Campo>
  );
}
