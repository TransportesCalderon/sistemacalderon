import Image from 'next/image';
import { cn } from '@/shared/lib/cn';
import icono from './irontrack-icono.png';
import logo from './irontrack-logo.png';

/**
 * Marca del sistema: IronTrack · Gestión de flotas (30/10/2026).
 * El escudo y el logo van sin fondo, con las partes plateadas en gris oscuro para que se lean sobre el fondo claro.
 */
export function IconoIronTrack({ className }: { className?: string }) {
  return <Image src={icono} alt="" aria-hidden className={cn('shrink-0', className)} />;
}

/** «IronTrack» con «Track» en el naranja del logo. */
export function NombreIronTrack({ className }: { className?: string }) {
  return (
    <span className={cn('font-bold tracking-tight', className)}>
      Iron<span className="text-[#f07b08]">Track</span>
    </span>
  );
}

/** Logo completo (escudo, nombre y «Gestión de flotas»), para la pantalla de ingreso. */
export function LogoIronTrack({ className }: { className?: string }) {
  return <Image src={logo} alt="IronTrack · Gestión de flotas" priority className={cn('h-auto w-full', className)} />;
}

/**
 * 10/11/2026 · Logo de IronTrack de fondo en las pantallas: centrado, grande y muy tenue (marca de agua),
 * detrás del contenido; no se puede tocar ni seleccionar y no sale al imprimir.
 */
export function MarcaDeAguaIronTrack({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-0 z-0 flex items-center justify-center select-none print:hidden', className)}>
      <Image src={logo} alt="" className="h-auto w-[min(70%,56rem)] opacity-[0.08]" />
    </div>
  );
}
