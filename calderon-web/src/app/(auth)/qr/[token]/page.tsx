import type { Metadata } from 'next';
import { AutorizarCarga } from '@/modules/combustible/components/ordenes/autorizar-carga';

export const metadata: Metadata = { title: 'Autorizar carga de combustible', robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

/**
 * Migración 234 · Página del playero (sin usuario): se llega escaneando el QR del chofer. Muestra la orden y pide la
 * palabra de seguridad que la estación recibió por mail. La base decide todo con el código del QR.
 */
export default async function Pagina({ params }: Props) {
  const { token } = await params;
  return <AutorizarCarga token={token} />;
}
