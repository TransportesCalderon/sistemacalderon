/**
 * Liquidación en 3 pasos · Paso 1: las novedades del período que se mandan a Colaboradores
 * (con el mismo formato del modelo que usa RRHH: un bloque por chofer).
 */
export interface NovedadChofer {
  chofer: string;
  rut: string | null;
  estado: string;
  basico: number;
  bonoViaje: number;
  otrosImponibles: number;
  viaticos: number;
  dias: number;
  adicionalKm: number;
  bonoDesempeno: number;
  otrosNoImponibles: number;
  totalImponible: number;
  totalNoImponible: number;
}

const entero = (v: number) => String(Math.round(v));
/** Una celda de CSV para Excel (separador «;»). */
const celda = (t: string) => (/[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

/** Las filas del modelo: nombre, «NOVEDADES MES AÑO», imponibles, total imponible, no imponibles, total no imponible. */
export function filasNovedades(novedades: NovedadChofer[], titulo: string): string[][] {
  const filas: string[][] = [];
  for (const n of novedades) {
    filas.push([n.chofer.toLowerCase(), n.rut ? `RUT ${n.rut}` : '']);
    filas.push([`NOVEDADES ${titulo.toUpperCase()}`, '']);
    filas.push(['BONO POR VIAJE', entero(n.bonoViaje)]);
    filas.push(['BASICO', entero(n.basico)]);
    if (n.otrosImponibles > 0) filas.push(['OTROS IMPONIBLES', entero(n.otrosImponibles)]);
    filas.push(['TOTAL IMPONIBLE', entero(n.totalImponible)]);
    filas.push([`VIATICOS (${entero(n.dias)} DIAS)`, entero(n.viaticos)]);
    filas.push(['ADICIONAL POR KM', entero(n.adicionalKm)]);
    if (n.bonoDesempeno > 0) filas.push(['BONO POR DESEMPEÑO', entero(n.bonoDesempeno)]);
    if (n.otrosNoImponibles > 0) filas.push(['OTROS NO IMPONIBLES', entero(n.otrosNoImponibles)]);
    filas.push(['TOTAL NO IMPONIBLE', entero(n.totalNoImponible)]);
    filas.push(['', '']);
  }
  return filas;
}

/** CSV que Excel abre directo (BOM UTF-8 y «;»). */
export function csvNovedades(novedades: NovedadChofer[], titulo: string): string {
  return '\uFEFF' + filasNovedades(novedades, titulo).map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}
