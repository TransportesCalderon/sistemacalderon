'use client';

import { useFicha, useNombreFicha } from '@/modules/core/fichas/contexto';
import { useFactura } from '../queries/hooks';
import { FichaFactura } from './facturacion-pantalla';

/**
 * Sprint 1 · S1-05: la ficha de una factura en el panel lateral. Es la misma ficha de
 * Facturación y cobranzas; «cerrar» cierra el panel.
 */
export function FacturaFicha({ id }: { id: number }) {
  const ctx = useFicha();
  const { data: f } = useFactura(id);
  useNombreFicha(f ? f.numeroFiscal || f.numero : null);
  return <FichaFactura id={id} onCerrar={() => ctx?.cerrar()} />;
}
