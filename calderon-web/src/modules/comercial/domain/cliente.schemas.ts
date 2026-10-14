import { z } from 'zod';
import { CONDICION_PAGO_MAX, ESTADOS_CLIENTE, type Cliente } from './cliente.types';
import { errorIdentificadorFiscal, normalizarIdentificadorFiscal } from './identificador-fiscal';

/**
 * Formulario de cliente (especificación §9, P-CLI-01). Entrada: valores del formulario
 * (texto); salida: datos normalizados. Replica los CHECK e índices de mae.cliente para
 * avisar antes de guardar; la base sigue siendo la que decide.
 */

/** Razón social: sin espacios dobles ni en los extremos. */
export function normalizarRazonSocial(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}

const camposCliente = z.object({
  codigo: z.string().trim().min(1, 'Ingresá el código.').max(30, 'Máximo 30 caracteres.'),
  razonSocial: z
    .string()
    .transform(normalizarRazonSocial)
    .pipe(z.string().min(1, 'Ingresá la razón social.').max(200, 'Máximo 200 caracteres.')),
  pais: z.string().regex(/^[A-Z]{2}$/, 'Elegí el país.'),
  identificadorFiscal: z.string().max(30, 'Máximo 30 caracteres.'),
  monedaFacturacion: z.string().regex(/^[A-Z]{3}$/, 'Elegí la moneda de facturación.'),
  condicionPagoDias: z
    .string()
    .trim()
    .refine(
      (v) => /^\d{1,3}$/.test(v) && Number(v) <= CONDICION_PAGO_MAX,
      `Entre 0 y ${CONDICION_PAGO_MAX} días (0 = contado).`,
    )
    .transform((v) => Number(v)),
  segmento: z
    .string()
    .trim()
    .max(60, 'Máximo 60 caracteres.')
    .transform((v) => (v === '' ? null : v)),
  estado: z.enum(ESTADOS_CLIENTE, 'Elegí el estado.'),
  /**
   * Solo en edición: "país|identificador" tal como está guardado. Si no cambian, no se
   * revalida el dígito verificador (datos históricos importados). El servicio lo
   * vuelve a comprobar contra la base, así que no sirve para saltear la validación.
   */
  identificadorGuardado: z.string().optional(),
});

type Campos = z.output<typeof camposCliente>;

/** El identificador fiscal se valida según el país elegido (CUIT o RUT). */
export function claveIdentificador(pais: string, identificador: string): string {
  return `${pais}|${identificador}`;
}

function reglas(d: Campos, ctx: z.RefinementCtx) {
  const normalizado = normalizarIdentificadorFiscal(d.pais, d.identificadorFiscal);
  if (d.identificadorGuardado !== undefined && d.identificadorGuardado === claveIdentificador(d.pais, normalizado)) return;
  const error = errorIdentificadorFiscal(d.pais, normalizado);
  if (error) ctx.addIssue({ code: 'custom', path: ['identificadorFiscal'], message: error });
}

const normalizar = <T extends Campos>(d: T): Omit<T, 'identificadorGuardado'> => {
  const salida: T = { ...d, identificadorFiscal: normalizarIdentificadorFiscal(d.pais, d.identificadorFiscal) };
  delete salida.identificadorGuardado;
  return salida;
};

export const clienteAltaSchema = camposCliente.superRefine(reglas).transform(normalizar);

export const clienteEdicionSchema = camposCliente
  .extend({
    id: z.number().int().positive(),
    versionFila: z.number().int().positive(),
  })
  .superRefine(reglas)
  .transform(normalizar);

/** Valores crudos del formulario (React Hook Form y entrada de las actions). */
export type ClienteFormInput = z.input<typeof clienteAltaSchema>;
/** Datos normalizados listos para guardar. */
export type ClienteDatos = z.output<typeof clienteAltaSchema>;
export type ClienteEdicionInput = z.input<typeof clienteEdicionSchema>;
export type ClienteEdicion = z.output<typeof clienteEdicionSchema>;

export function valoresAltaCliente(pais = 'AR', moneda = 'ARS'): ClienteFormInput {
  return {
    codigo: '',
    razonSocial: '',
    pais,
    identificadorFiscal: '',
    monedaFacturacion: moneda,
    condicionPagoDias: '0',
    segmento: '',
    estado: 'activo',
  };
}

export function valoresEdicionCliente(c: Cliente): ClienteFormInput {
  return {
    codigo: c.codigo,
    razonSocial: c.razonSocial,
    pais: c.pais,
    identificadorFiscal: c.identificadorFiscal,
    monedaFacturacion: c.monedaFacturacion,
    condicionPagoDias: String(c.condicionPagoDias),
    segmento: c.segmento ?? '',
    estado: c.estado,
    identificadorGuardado: claveIdentificador(c.pais, c.identificadorFiscal),
  };
}
