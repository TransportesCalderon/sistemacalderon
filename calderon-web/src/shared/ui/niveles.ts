/**
 * Sprint 0 · T04 (docs/DECISIONES.md, regla 2): el semáforo verde / naranja / rojo.
 * El nivel lo decide la base; la web solo lo pinta con estos mapas, que antes estaban
 * copiados en varios archivos. Los valores son los que ya se veían: nada cambia en pantalla.
 * (El acta de cierre de combustible usa otros tonos y por ahora los mantiene en su archivo.)
 */
export type Nivel = 'verde' | 'naranja' | 'rojo';

/** Nivel recibido de la base; null si no es uno de los tres. */
export const nivelDe = (v: unknown): Nivel | null => (v === 'verde' || v === 'naranja' || v === 'rojo' ? v : null);

/** Texto del número (rankings y puntajes). */
export const NIVEL_TEXTO: Record<Nivel, string> = { verde: 'text-exito', naranja: 'text-[#ca8a04]', rojo: 'text-error' };
/** Barras y fondos llenos. */
export const NIVEL_BARRA: Record<Nivel, string> = { verde: 'bg-exito', naranja: 'bg-[#eab308]', rojo: 'bg-error' };
/** Puntos chicos (subpuntuaciones). */
export const NIVEL_PUNTO: Record<Nivel, string> = { verde: 'bg-[#6ee7b7]', naranja: 'bg-[#fde047]', rojo: 'bg-[#fca5a5]' };
/** Chip de color para las celdas de las tablas. */
export const NIVEL_CHIP: Record<Nivel, string> = {
  verde: 'bg-[#dcfce7] text-[#166534]',
  naranja: 'bg-[#fef9c3] text-[#854d0e]',
  rojo: 'bg-[#fee2e2] text-[#991b1b]',
};
/** Colores en hexadecimal, para el HTML que arma el mapa (Leaflet). */
export const NIVEL_HEX: Record<Nivel, string> = { verde: '#15803d', naranja: '#ca8a04', rojo: '#dc2626' };

/** Clase de texto de un nivel (sin nivel: el color de texto común). */
export const textoNivel = (n: Nivel | null | undefined) => (n ? NIVEL_TEXTO[n] : 'text-tinta');
