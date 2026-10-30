/**
 * Migración 143: lee un punto (latitud, longitud) de lo que se pega para ubicar una estación:
 * coordenadas sueltas («-32.89, -68.84») o un link de Google Maps de un lugar. Función pura.
 * Un link corto (maps.app.goo.gl) primero lo abre el servidor.
 */
export interface Coordenadas {
  lat: number;
  lng: number;
}

const valido = (lat: number, lng: number): Coordenadas | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

const decodificar = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function coordenadasDeTexto(texto: string): Coordenadas | null {
  const t = decodificar(texto.trim());
  if (!t) return null;
  // Coordenadas sueltas: «-32.8895, -68.8458» (también con espacio en lugar de coma)
  const suelta = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
  if (suelta) return valido(Number(suelta[1]), Number(suelta[2]));
  // El punto exacto del lugar: «!3d<lat>!4d<lng>» (va antes que la vista «@lat,lng»)
  const lugar = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t);
  if (lugar) return valido(Number(lugar[1]), Number(lugar[2]));
  // «?q=lat,lng», «query=lat,lng», «ll=lat,lng», «destination=lat,lng»
  const param = /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t);
  if (param) return valido(Number(param[1]), Number(param[2]));
  // «/search/lat,+lng» o «/place/lat,lng»
  const ruta = /\/(?:search|place)\/(-?\d+(?:\.\d+)?),\s*\+?(-?\d+(?:\.\d+)?)/.exec(t);
  if (ruta) return valido(Number(ruta[1]), Number(ruta[2]));
  // La vista del mapa: «@lat,lng,17z»
  const vista = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t);
  if (vista) return valido(Number(vista[1]), Number(vista[2]));
  return null;
}
