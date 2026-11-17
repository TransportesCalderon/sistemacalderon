import { digitoCuil, digitoRut } from '@/modules/flota/domain/documento';

/**
 * Identificador fiscal del cliente: CUIT (Argentina), RUT (Chile) o RUT de Uruguay (12 dígitos), según el país.
 * Se normaliza antes de guardar para que el índice único por país (ux_cliente_fiscal)
 * no admita el mismo número escrito de dos formas ("30-71234567-1" y "30712345671").
 * Reutiliza los dígitos verificadores del dominio de Flota (documento del chofer).
 */
export function normalizarIdentificadorFiscal(pais: string, valor: string): string {
  const base = valor.toUpperCase().replace(/[\s.]/g, '');
  if (pais === 'AR' || pais === 'UY') return base.replace(/-/g, '');
  if (pais === 'CL') {
    const limpio = base.replace(/-/g, '');
    return limpio.length > 1 ? `${limpio.slice(0, -1)}-${limpio.slice(-1)}` : limpio;
  }
  return base;
}

/** Nombre del identificador según el país, para etiquetas y mensajes. */
export function nombreIdentificador(pais: string): string {
  return pais === 'AR' ? 'CUIT' : pais === 'CL' ? 'RUT' : pais === 'UY' ? 'RUT de Uruguay' : 'Identificador fiscal';
}

/** Valida el identificador ya normalizado. Devuelve el mensaje de error o null. */
export function errorIdentificadorFiscal(pais: string, numero: string): string | null {
  if (numero === '') return `Ingresá el ${nombreIdentificador(pais)}.`;
  if (pais === 'AR') {
    if (!/^\d{11}$/.test(numero)) return 'El CUIT tiene 11 dígitos.';
    return digitoCuil(numero.slice(0, 10)) === Number(numero[10]) ? null : 'El dígito verificador del CUIT no es correcto.';
  }
  if (pais === 'CL') {
    const m = /^(\d{7,8})-([\dK])$/.exec(numero);
    if (!m) return 'El RUT tiene el formato 76123456-7.';
    return digitoRut(m[1]!) === m[2] ? null : 'El dígito verificador del RUT no es correcto.';
  }
  if (pais === 'UY') {
    if (!/^\d{12}$/.test(numero)) return 'El RUT de Uruguay tiene 12 dígitos.';
    const depto = Number(numero.slice(0, 2));
    if (depto < 1 || depto > 21) return 'El RUT de Uruguay empieza con 01 a 21.';
    return digitoRutUruguay(numero.slice(0, 11)) === Number(numero[11]) ? null : 'El dígito verificador del RUT de Uruguay no es correcto.';
  }
  return /^[A-Z0-9-]{4,20}$/.test(numero) ? null : 'Entre 4 y 20 letras, números o guiones.';
}

/**
 * Dígito verificador del RUT de Uruguay (DGI): módulo 11 sobre los primeros 11 dígitos con los pesos
 * 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2. Si da 11 es 0; si da 10, el número no es válido (null).
 * La base controla lo mismo (mae.fn_rut_uy_valido, migración 272).
 */
export function digitoRutUruguay(primeros11: string): number | null {
  if (!/^\d{11}$/.test(primeros11)) return null;
  const pesos = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(primeros11[i]), 0);
  const dv = 11 - (suma % 11);
  return dv === 11 ? 0 : dv === 10 ? null : dv;
}

/** Formato de lectura: CUIT 30-71234567-1; el RUT ya se guarda con guion. */
export function formatearIdentificadorFiscal(pais: string, numero: string): string {
  if (pais === 'AR' && /^\d{11}$/.test(numero)) return `${numero.slice(0, 2)}-${numero.slice(2, 10)}-${numero.slice(10)}`;
  return numero;
}
