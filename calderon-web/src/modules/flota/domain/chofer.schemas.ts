import { z } from 'zod';
import { esFechaDiaValida } from '@/shared/lib/fechas';
import type { FechaDia } from '@/shared/types/dominio';
import { ESTADOS_CHOFER, esTipoDocumento, type Chofer, type DocumentoChofer } from './chofer.types';
import { errorDocumento, normalizarDocumento } from './documento';

/**
 * Formulario F-MAE-03 (especificación §9). Entrada: valores del formulario (texto);
 * salida: datos normalizados. Replica los CHECK de mae.chofer; la base sigue decidiendo.
 *
 * Documento:
 *  - En el alta es obligatorio (NOT NULL en el DDL).
 *  - En la edición solo viaja si se marca "Cambiar documento" (requiere el permiso
 *    flota.documento_chofer:editar). Si no, el documento guardado no se lee ni se toca.
 */

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));

/** Nombre propio: sin espacios dobles ni en los extremos. */
const nombrePropio = (campo: string) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, `Ingresá ${campo}.`).max(80, 'Máximo 80 caracteres.'));

const camposChofer = z.object({
  legajo: z.string().trim().min(1, 'Ingresá el legajo.').max(20, 'Máximo 20 caracteres.'),
  nombre: nombrePropio('el nombre'),
  apellido: nombrePropio('el apellido'),
  paisResidencia: z.string().regex(/^[A-Z]{2}$/, 'Elegí el país de residencia.'),
  baseUbicacionId: z
    .string()
    .refine((v) => v === '' || /^\d+$/.test(v), 'Base no válida.')
    .transform((v) => (v === '' ? null : Number(v))),
  categoriaLiquidacion: textoOpcional(40),
  fechaIngreso: z
    .string()
    .refine(esFechaDiaValida, 'Ingresá la fecha de ingreso.')
    .transform((v) => v as FechaDia),
  fechaEgreso: z
    .string()
    .refine((v) => v === '' || esFechaDiaValida(v), 'Fecha no válida.')
    .transform((v) => (v === '' ? null : (v as FechaDia))),
  estado: z.enum(ESTADOS_CHOFER, 'Elegí el estado.'),
  idConductorOptifleet: textoOpcional(60),
  // Documento (ver comentario del archivo)
  cambiarDocumento: z.boolean(),
  documentoTipo: z.string(),
  documentoNumero: z.string().max(30, 'Máximo 30 caracteres.'),
});

type Campos = z.output<typeof camposChofer>;

function reglas(d: Campos, ctx: z.RefinementCtx, exigirDocumento: boolean) {
  if (d.fechaEgreso && d.fechaEgreso < d.fechaIngreso) {
    ctx.addIssue({ code: 'custom', path: ['fechaEgreso'], message: 'La fecha de egreso no puede ser anterior a la de ingreso.' });
  }
  if (d.fechaEgreso && d.estado !== 'baja') {
    ctx.addIssue({ code: 'custom', path: ['estado'], message: 'Con fecha de egreso, el estado debe ser Baja.' });
  }
  if (!exigirDocumento) return;
  if (!esTipoDocumento(d.documentoTipo)) {
    ctx.addIssue({ code: 'custom', path: ['documentoTipo'], message: 'Elegí el tipo de documento.' });
    return;
  }
  const error = errorDocumento(d.documentoTipo, normalizarDocumento(d.documentoTipo, d.documentoNumero));
  if (error) ctx.addIssue({ code: 'custom', path: ['documentoNumero'], message: error });
}

function documentoDe(d: Campos): DocumentoChofer {
  const tipo = d.documentoTipo as DocumentoChofer['tipo'];
  return { tipo, numero: normalizarDocumento(tipo, d.documentoNumero) };
}

/** Datos del chofer sin los campos de control del documento. */
function datosDe(d: Campos) {
  return {
    legajo: d.legajo,
    nombre: d.nombre,
    apellido: d.apellido,
    paisResidencia: d.paisResidencia,
    baseUbicacionId: d.baseUbicacionId,
    categoriaLiquidacion: d.categoriaLiquidacion,
    fechaIngreso: d.fechaIngreso,
    fechaEgreso: d.fechaEgreso,
    estado: d.estado,
    idConductorOptifleet: d.idConductorOptifleet,
  };
}

/**
 * Validación del formulario en el navegador (alta y edición). En el alta
 * cambiarDocumento es siempre true, así que el documento se exige igual que en la action.
 */
export const choferFormSchema = camposChofer.superRefine((d, ctx) => reglas(d, ctx, d.cambiarDocumento));

export const choferAltaSchema = camposChofer
  .superRefine((d, ctx) => reglas(d, ctx, true))
  .transform((d) => ({ ...datosDe(d), documento: documentoDe(d) }));

export const choferEdicionSchema = camposChofer
  .extend({
    id: z.number().int().positive(),
    versionFila: z.number().int().positive(),
  })
  .superRefine((d, ctx) => reglas(d, ctx, d.cambiarDocumento))
  .transform((d) => ({
    id: d.id,
    versionFila: d.versionFila,
    ...datosDe(d),
    documento: d.cambiarDocumento ? documentoDe(d) : null,
  }));

/** Valores crudos del formulario (React Hook Form y entrada de las actions). */
export type ChoferFormInput = z.input<typeof camposChofer>;
export type ChoferFormSalida = z.output<typeof choferFormSchema>;
/** Datos de un chofer sin documento (comunes a alta y edición). */
export type ChoferDatos = ReturnType<typeof datosDe>;
export type ChoferAlta = z.output<typeof choferAltaSchema>;
export type ChoferEdicionInput = z.input<typeof choferEdicionSchema>;
export type ChoferEdicion = z.output<typeof choferEdicionSchema>;

export const revelarDocumentoSchema = z.object({ id: z.number().int().positive() });

export function valoresAltaChofer(hoy: FechaDia, paisPorDefecto = 'AR'): ChoferFormInput {
  return {
    legajo: '',
    nombre: '',
    apellido: '',
    paisResidencia: paisPorDefecto,
    baseUbicacionId: '',
    categoriaLiquidacion: '',
    fechaIngreso: hoy,
    fechaEgreso: '',
    estado: 'activo',
    idConductorOptifleet: '',
    cambiarDocumento: true,
    documentoTipo: paisPorDefecto === 'CL' ? 'RUT' : 'DNI',
    documentoNumero: '',
  };
}

/** Valores de edición: el documento queda vacío y sin cambiar (no se lee para editar). */
export function valoresEdicionChofer(c: Chofer): ChoferFormInput {
  return {
    legajo: c.legajo,
    nombre: c.nombre,
    apellido: c.apellido,
    paisResidencia: c.paisResidencia,
    baseUbicacionId: c.baseUbicacionId === null ? '' : String(c.baseUbicacionId),
    categoriaLiquidacion: c.categoriaLiquidacion ?? '',
    fechaIngreso: c.fechaIngreso,
    fechaEgreso: c.fechaEgreso ?? '',
    estado: c.estado,
    idConductorOptifleet: c.idConductorOptifleet ?? '',
    cambiarDocumento: false,
    documentoTipo: c.paisResidencia === 'CL' ? 'RUT' : 'DNI',
    documentoNumero: '',
  };
}
