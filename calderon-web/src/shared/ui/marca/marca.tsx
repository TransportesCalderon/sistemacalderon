import Image from 'next/image';
import { cn } from '@/shared/lib/cn';
import icono from './irontrack-icono.png';
import logo from './irontrack-logo.png';

/**
 * Marca del sistema: IronTrack · Gestión de flotas (30/10/2026).
 * El escudo y el logo completo vienen sobre su fondo oscuro original (se ven bien en el tema claro).
 */
export function IconoIronTrack({ className }: { className?: string }) {
  return <Image src={icono} alt="" aria-hidden className={cn('shrink-0 rounded-md', className)} />;
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
  return <Image src={logo} alt="IronTrack · Gestión de flotas" priority className={cn('h-auto w-full rounded-xl', className)} />;
}
