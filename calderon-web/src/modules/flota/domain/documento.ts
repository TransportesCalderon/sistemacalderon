import type { TipoDocumento } from './chofer.types';

/**
 * Normalización y validación del documento del chofer (Argentina y Chile).
 * El DDL no impone formato; normalizar evita duplicados con distinta escritura
 * ("30.123.456" y "30123456") frente al índice único ux_chofer_documento.
 */
export function normalizarDocumento(tipo: string, numero: string): string {
  const base = numero.toUpperCase().replace(/[\s.]/g, '');
  switch (tipo) {
    case 'DNI':
    case 'CUIL':
      return base.replace(/-/g, '');
    case 'RUT': {
      const limpio = base.replace(/-/g, '');
      return limpio.length > 1 ? `${limpio.slice(0, -1)}-${limpio.slice(-1)}` : limpio;
    }
    default:
      return base;
  }
}

/** Dígito verificador de CUIL/CUIT (módulo 11). null si el número no puede ser válido. */
export function digitoCuil(primeros10: string): number | null {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(primeros10[i]), 0);
  const dv = 11 - (suma % 11);
  if (dv === 11) return 0;
  if (dv === 10) return null;
  return dv;
}

/** Dígito verificador de RUT chileno (módulo 11): '0'–'9' o 'K'. */
export function digitoRut(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (suma % 11);
  return dv === 11 ? '0' : dv === 10 ? 'K' : String(dv);
}

/** Valida el número ya normalizado. Devuelve el mensaje de error o null si es válido. */
export function errorDocumento(tipo: TipoDocumento, numero: string): string | null {
  if (numero === '') return 'Ingresá el número de documento.';
  switch (tipo) {
    case 'DNI':
      return /^\d{7,8}$/.test(numero) ? null : 'El DNI tiene 7 u 8 dígitos.';
    case 'CUIL':
      if (!/^\d{11}$/.test(numero)) return 'El CUIL tiene 11 dígitos.';
      return digitoCuil(numero.slice(0, 10)) === Number(numero[10]) ? null : 'El dígito verificador del CUIL no es correcto.';
    case 'RUT': {
      const m = /^(\d{7,8})-([\dK])$/.exec(numero);
      if (!m) return 'El RUT tiene el formato 12345678-9.';
      return digitoRut(m[1]!) === m[2] ? null : 'El dígito verificador del RUT no es correcto.';
    }
    default:
      return /^[A-Z0-9-]{4,20}$/.test(numero) ? null : 'Entre 4 y 20 letras, números o guiones.';
  }
}
