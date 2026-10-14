import { digitoCuil, digitoRut } from '@/modules/flota/domain/documento';

/**
 * Identificador fiscal del cliente: CUIT (Argentina) o RUT (Chile), según el país.
 * Se normaliza antes de guardar para que el índice único por país (ux_cliente_fiscal)
 * no admita el mismo número escrito de dos formas ("30-71234567-1" y "30712345671").
 * Reutiliza los dígitos verificadores del dominio de Flota (documento del chofer).
 */
export function normalizarIdentificadorFiscal(pais: string, valor: string): string {
  const base = valor.toUpperCase().replace(/[\s.]/g, '');
  if (pais === 'AR') return base.replace(/-/g, '');
  if (pais === 'CL') {
    const limpio = base.replace(/-/g, '');
    return limpio.length > 1 ? `${limpio.slice(0, -1)}-${limpio.slice(-1)}` : limpio;
  }
  return base;
}

/** Nombre del identificador según el país, para etiquetas y mensajes. */
export function nombreIdentificador(pais: string): string {
  return pais === 'AR' ? 'CUIT' : pais === 'CL' ? 'RUT' : 'Identificador fiscal';
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
  return /^[A-Z0-9-]{4,20}$/.test(numero) ? null : 'Entre 4 y 20 letras, números o guiones.';
}

/** Formato de lectura: CUIT 30-71234567-1; el RUT ya se guarda con guion. */
export function formatearIdentificadorFiscal(pais: string, numero: string): string {
  if (pais === 'AR' && /^\d{11}$/.test(numero)) return `${numero.slice(0, 2)}-${numero.slice(2, 10)}-${numero.slice(10)}`;
  return numero;
}
