import { z } from 'zod';
import { esFechaDiaValida } from '@/shared/lib/fechas';
import type { DecimalStr, FechaDia } from '@/shared/types/dominio';
import { ESTADOS_CAMION, PROPIETARIOS_CAMION, type Camion } from './camion.types';

/**
 * Formulario F-MAE-01 (especificación §9). Los valores de entrada son los del formulario
 * (todo texto); la salida es el dato normalizado que se guarda. Las reglas replican los
 * CHECK de mae.camion para avisar antes de ir a la base; la base sigue siendo la que decide.
 */

/** Patente: mayúsculas y sin espacios (ck_camion_patente). */
export function normalizarPatente(valor: string): string {
  return valor.toUpperCase().replace(/\s+/g, '');
}

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));

const camposCamion = z.object({
  codigoInterno: z.string().trim().min(1, 'Ingresá el código interno.').max(30, 'Máximo 30 caracteres.'),
  patente: z
    .string()
    .transform(normalizarPatente)
    .pipe(
      z
        .string()
        .min(1, 'Ingresá la patente.')
        .max(12, 'Máximo 12 caracteres.')
        .regex(/^[A-Z0-9Ñ-]+$/, 'Solo letras, números y guion.'),
    ),
  paisPatente: z.string().regex(/^[A-Z]{2}$/, 'Elegí el país de la patente.'),
  vin: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .pipe(
      z
        .string()
        .max(20, 'Máximo 20 caracteres.')
        .regex(/^[A-Z0-9]*$/, 'Solo letras y números.'),
    )
    .transform((v) => (v === '' ? null : v)),
  marca: textoOpcional(60),
  modelo: textoOpcional(60),
  anio: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= 2100), 'El año debe estar entre 1990 y 2100.')
    .transform((v) => (v === '' ? null : Number(v))),
  tipoCombustibleId: z
    .string()
    .regex(/^\d+$/, 'Elegí el tipo de combustible.')
    .transform((v) => Number(v)),
  fechaAlta: z
    .string()
    .refine(esFechaDiaValida, 'Ingresá la fecha de alta.')
    .transform((v) => v as FechaDia),
  fechaBaja: z
    .string()
    .refine((v) => v === '' || esFechaDiaValida(v), 'Fecha no válida.')
    .transform((v) => (v === '' ? null : (v as FechaDia))),
  estado: z.enum(ESTADOS_CAMION, 'Elegí el estado.'),
  propietarioTipo: z.enum(PROPIETARIOS_CAMION, 'Elegí el propietario.'),
  consumoReferencia: z
    .string()
    .trim()
    .transform((v) => v.replace(',', '.'))
    .refine((v) => v === '' || /^\d{1,4}(\.\d{1,2})?$/.test(v), 'Número con hasta 2 decimales (máximo 9999,99).')
    .refine((v) => v === '' || Number(v) > 0, 'Debe ser mayor que cero.')
    .transform((v) => (v === '' ? null : (v as DecimalStr))),
  idOptifleet: textoOpcional(60),
});

type Campos = z.output<typeof camposCamion>;

/** Reglas entre campos (ck_camion_fechas y baja operativa, especificación §9). */
function reglasCruzadas(d: Pick<Campos, 'fechaAlta' | 'fechaBaja' | 'estado'>, ctx: z.RefinementCtx) {
  if (d.fechaBaja && d.fechaBaja < d.fechaAlta) {
    ctx.addIssue({ code: 'custom', path: ['fechaBaja'], message: 'La fecha de baja no puede ser anterior a la de alta.' });
  }
  if (d.fechaBaja && d.estado !== 'inactivo') {
    ctx.addIssue({ code: 'custom', path: ['estado'], message: 'Con fecha de baja, el estado debe ser Inactivo.' });
  }
}

export const camionAltaSchema = camposCamion.superRefine(reglasCruzadas);

export const camionEdicionSchema = camposCamion
  .extend({
    id: z.number().int().positive(),
    versionFila: z.number().int().positive(),
  })
  .superRefine(reglasCruzadas);

/** Valores crudos del formulario (lo que maneja React Hook Form y recibe la action). */
export type CamionFormInput = z.input<typeof camionAltaSchema>;
/** Datos normalizados listos para guardar. */
export type CamionDatos = z.output<typeof camionAltaSchema>;
export type CamionEdicionInput = z.input<typeof camionEdicionSchema>;
export type CamionEdicion = z.output<typeof camionEdicionSchema>;

/** Valores iniciales del formulario de alta. */
export function valoresAltaCamion(hoy: FechaDia, paisPorDefecto = 'AR'): CamionFormInput {
  return {
    codigoInterno: '',
    patente: '',
    paisPatente: paisPorDefecto,
    vin: '',
    marca: '',
    modelo: '',
    anio: '',
    tipoCombustibleId: '',
    fechaAlta: hoy,
    fechaBaja: '',
    estado: 'activo',
    propietarioTipo: 'propio',
    consumoReferencia: '',
    idOptifleet: '',
  };
}

/** Valores del formulario de edición a partir de la ficha. */
export function valoresEdicionCamion(c: Camion): CamionFormInput {
  return {
    codigoInterno: c.codigoInterno,
    patente: c.patente,
    paisPatente: c.paisPatente,
    vin: c.vin ?? '',
    marca: c.marca ?? '',
    modelo: c.modelo ?? '',
    anio: c.anio === null ? '' : String(c.anio),
    tipoCombustibleId: String(c.tipoCombustibleId),
    fechaAlta: c.fechaAlta,
    fechaBaja: c.fechaBaja ?? '',
    estado: c.estado,
    propietarioTipo: c.propietarioTipo,
    consumoReferencia: c.consumoReferencia?.replace('.', ',') ?? '',
    idOptifleet: c.idOptifleet ?? '',
  };
}
