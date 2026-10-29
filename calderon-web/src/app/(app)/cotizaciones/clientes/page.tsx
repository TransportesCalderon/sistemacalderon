import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { EmpresasPantalla } from '@/modules/ventas/components/empresas-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_COTIZACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Clientes y prospectos' };

/** Cotizaciones › Clientes y prospectos (Sprint 7: antes /ventas/empresas). La ficha se abre en el panel. */
export default async function Pagina() {
  await requirePermiso('ventas.empresas:ver');
  return (
    <>
      <Pestanas items={PESTANAS_COTIZACIONES} />
      <EmpresasPantalla />
    </>
  );
}
