/** Zonas horarias operativas (ref.pais.zona_horaria_operativa) + UTC. Se guarda en UTC; solo cambia la visualización. */
export const ZONAS_HORARIAS = [
  { id: 'America/Argentina/Mendoza', etiqueta: 'Mendoza' },
  { id: 'America/Santiago', etiqueta: 'Santiago' },
  { id: 'UTC', etiqueta: 'UTC' },
] as const;

export type ZonaHoraria = (typeof ZONAS_HORARIAS)[number]['id'];

export const COOKIE_ZONA = 'tc_zona';

export function esZonaValida(valor: string | undefined | null): valor is ZonaHoraria {
  return ZONAS_HORARIAS.some((z) => z.id === valor);
}
