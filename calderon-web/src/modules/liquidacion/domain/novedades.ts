import { armarXlsx, type Celda, type Hoja } from '@/shared/lib/xlsx-simple';

/**
 * Liquidación en 3 pasos · Paso 1: las novedades del período que se mandan a Colaboradores
 * (un .xlsx con el formato exacto del modelo de RRHH: un bloque por chofer).
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

const entero = (v: number) => Math.round(v);

/** «Aguero, Ezequiel» → «AGUERO EZEQUIEL» (como lo escribe RRHH en el modelo). */
export const nombreModelo = (chofer: string) =>
  chofer
    .replace(',', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('es');

/**
 * La hoja exactamente como el modelo que se manda a Colaboradores (corregido por RRHH, 25/11/2026):
 *   A1 «CHOFER»; por chofer, un bloque de 8 filas:
 *   nombre · «NOVEDADES MES AÑO» (A:B combinadas, con borde y centrado) · BONO POR VIAJE · BASICO ·
 *   TOTAL IMPONIBLE · fila vacía con borde · TOTAL NO IMPONIBLE · fila en blanco.
 * El bono por viaje es el bono por tramo; el total imponible y el no imponible son los de las novedades
 * (el no imponible ya suma viáticos, adicional por km y bono por desempeño, sin el reintegro del fondo).
 */
export function hojaNovedades(novedades: NovedadChofer[], titulo: string): Hoja {
  const celdas: Celda[] = [{ fila: 1, col: 1, valor: 'CHOFER' }];
  const combinadas: string[] = [];
  let f = 2;
  for (const n of novedades) {
    celdas.push({ fila: f, col: 1, valor: nombreModelo(n.chofer) });
    celdas.push({ fila: f + 1, col: 1, valor: `NOVEDADES ${titulo.toLocaleUpperCase('es')}`, estilo: 'borde_centro' });
    celdas.push({ fila: f + 1, col: 2, valor: '', estilo: 'borde' });
    combinadas.push(`A${f + 1}:B${f + 1}`);
    const filas: [string, number | ''][] = [
      ['BONO POR VIAJE', entero(n.bonoViaje)],
      ['BASICO', entero(n.basico)],
      ['TOTAL IMPONIBLE', entero(n.totalImponible)],
      ['', ''],
      ['TOTAL NO IMPONIBLE', entero(n.totalNoImponible)],
    ];
    filas.forEach(([t, v], i) => {
      celdas.push({ fila: f + 2 + i, col: 1, valor: t, estilo: 'borde' });
      celdas.push({ fila: f + 2 + i, col: 2, valor: v, estilo: 'borde' });
    });
    f += 8;
  }
  return { nombre: 'Hoja1', celdas, combinadas, anchos: { 1: 21.43 } };
}

/** El .xlsx para Colaboradores. */
export const xlsxNovedades = (novedades: NovedadChofer[], titulo: string): Uint8Array => armarXlsx(hojaNovedades(novedades, titulo));
