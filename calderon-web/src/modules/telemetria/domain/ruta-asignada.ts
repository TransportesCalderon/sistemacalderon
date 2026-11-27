/**
 * Migración 385 · Mapa de flota: la ruta que Telemetría le asignó al chofer (Logística › Rutas de choferes, la misma
 * que le llega al teléfono). Se pinta en azul al elegir un tractor. La base manda las rutas por hacer, en orden:
 * la que está siguiendo ahora y las que vienen después. Acá solo se convierten tipos y se arma la línea.
 */
export interface PuntoAsignado {
  nombre: string;
  lat: number | null;
  lng: number | null;
}

export interface RutaAsignada {
  id: number;
  /** 1 = la primera por hacer. */
  orden: number;
  /** La que está siguiendo ahora. */
  enCurso: boolean;
  numeroOperacion: number | null;
  notas: string | null;
  puntos: PuntoAsignado[];
  km: number | null;
  /** El camino por las rutas ([lat, lng]), si la base ya lo calculó; si no, null. */
  camino: [number, number][] | null;
}

type Obj = Record<string, unknown>;
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function parsearRutasAsignadas(raw: unknown): RutaAsignada[] {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Obj;
  return (Array.isArray(j.rutas) ? (j.rutas as Obj[]) : []).map((r, i) => {
    const camino = Array.isArray(r.camino)
      ? (r.camino as unknown[])
          .map((c) => (Array.isArray(c) ? ([numN(c[0]), numN(c[1])] as const) : ([null, null] as const)))
          .filter((c): c is readonly [number, number] => c[0] !== null && c[1] !== null)
          .map(([lat, lng]) => [lat, lng] as [number, number])
      : null;
    return {
      id: Number(r.id),
      orden: Number(r.orden ?? i + 1),
      enCurso: r.en_curso === true,
      numeroOperacion: numN(r.numero),
      notas: typeof r.notas === 'string' && r.notas ? r.notas : null,
      puntos: (Array.isArray(r.puntos) ? (r.puntos as Obj[]) : []).map((p, k) => ({
        nombre: typeof p?.nombre === 'string' && p.nombre ? p.nombre : `Punto ${k + 1}`,
        lat: numN(p?.lat),
        lng: numN(p?.lng),
      })),
      km: numN(r.km),
      camino: camino && camino.length >= 2 ? camino : null,
    };
  });
}

/** La línea a pintar: el camino por las rutas si está; si no, los puntos ubicados unidos en recta. */
export function lineaDeRuta(r: RutaAsignada): { linea: [number, number][]; porCamino: boolean } {
  if (r.camino) return { linea: r.camino, porCamino: true };
  return { linea: r.puntos.filter((p) => p.lat !== null && p.lng !== null).map((p) => [p.lat!, p.lng!] as [number, number]), porCamino: false };
}

/** La que se pinta fuerte: la que está siguiendo ahora o, si no hay, la primera por hacer. */
export const rutaPrincipal = (rutas: readonly RutaAsignada[]): RutaAsignada | null => rutas.find((r) => r.enCurso) ?? rutas[0] ?? null;
