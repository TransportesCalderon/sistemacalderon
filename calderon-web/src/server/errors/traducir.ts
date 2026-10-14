import type { ErrorAccion } from '@/server/actions/result';
import { ErrorNegocio } from '@/shared/lib/errores';

interface ErrorConCodigo {
  code?: string;
  message?: string;
}

/**
 * Traduce un error de PostgREST / PostgreSQL (SQLSTATE) al lenguaje de negocio
 * (especificación §17). Los mensajes por restricción se agregan con cada módulo.
 */
export const MENSAJES_RESTRICCION: Record<string, string> = {
  // --- mae.camion (Flota > Camiones) ---
  ux_camion_codigo_interno: 'Ya existe un camión con ese código interno.',
  ux_camion_patente: 'Ya existe un camión con esa patente.',
  ux_camion_vin: 'Ya existe un camión con ese VIN.',
  ux_camion_id_optifleet: 'Ese identificador Optifleet ya está asignado a otro camión.',
  ck_camion_patente: 'La patente debe ir en mayúsculas y sin espacios.',
  ck_camion_anio: 'El año debe estar entre 1990 y 2100.',
  ck_camion_fechas: 'La fecha de baja no puede ser anterior a la fecha de alta.',
  ck_camion_estado: 'Estado no válido: activo, taller o inactivo.',
  ck_camion_propietario: 'Propietario no válido: propio, tercero o leasing.',
  ck_camion_consumo_ref: 'El consumo de referencia debe ser mayor que cero.',
  camion_pais_patente_fkey: 'El país de la patente no existe en el catálogo.',
  camion_tipo_combustible_id_fkey: 'El tipo de combustible no existe en el catálogo.',
  // --- mae.chofer (Flota > Choferes) ---
  ux_chofer_legajo: 'Ya existe un chofer con ese legajo.',
  ux_chofer_documento: 'Ya existe un chofer con ese documento.',
  ux_chofer_optifleet: 'Ese identificador de conductor Optifleet ya está asignado a otro chofer.',
  ck_chofer_documento_tipo: 'Tipo de documento no válido.',
  ck_chofer_fechas: 'La fecha de egreso no puede ser anterior a la fecha de ingreso.',
  ck_chofer_estado: 'Estado no válido: activo, licencia o baja.',
  chofer_pais_residencia_fkey: 'El país de residencia no existe en el catálogo.',
  chofer_base_ubicacion_id_fkey: 'La base elegida ya no existe.',
};

/** Campo del formulario al que se asocia cada restricción (para marcarlo en rojo). */
export const CAMPO_RESTRICCION: Record<string, string> = {
  ux_camion_codigo_interno: 'codigoInterno',
  ux_camion_patente: 'patente',
  ux_camion_vin: 'vin',
  ux_camion_id_optifleet: 'idOptifleet',
  ck_camion_patente: 'patente',
  ck_camion_anio: 'anio',
  ck_camion_fechas: 'fechaBaja',
  ck_camion_estado: 'estado',
  ck_camion_propietario: 'propietarioTipo',
  ck_camion_consumo_ref: 'consumoReferencia',
  camion_pais_patente_fkey: 'paisPatente',
  camion_tipo_combustible_id_fkey: 'tipoCombustibleId',
  ux_chofer_legajo: 'legajo',
  ux_chofer_documento: 'documentoNumero',
  ux_chofer_optifleet: 'idConductorOptifleet',
  ck_chofer_documento_tipo: 'documentoTipo',
  ck_chofer_fechas: 'fechaEgreso',
  ck_chofer_estado: 'estado',
  chofer_pais_residencia_fkey: 'paisResidencia',
  chofer_base_ubicacion_id_fkey: 'baseUbicacionId',
};

export function traducirErrorDb(error: unknown): ErrorAccion {
  if (error instanceof ErrorNegocio) return { codigo: error.codigo, mensaje: error.message };
  const base = traducirSinCampo(error);
  const restriccion = restriccionDe(error);
  const campo = restriccion ? CAMPO_RESTRICCION[restriccion] : undefined;
  return campo && base.codigo !== 'desconocido' ? { ...base, campos: { [campo]: base.mensaje } } : base;
}

function restriccionDe(error: unknown): string | undefined {
  const e = (error ?? {}) as ErrorConCodigo;
  return /constraint "([^"]+)"/.exec(e.message ?? '')?.[1];
}

function traducirSinCampo(error: unknown): ErrorAccion {
  const e = (error ?? {}) as ErrorConCodigo;
  const restriccion = restriccionDe(error);
  const especifico = restriccion ? MENSAJES_RESTRICCION[restriccion] : undefined;

  switch (e.code) {
    case '40001':
      return { codigo: 'conflicto_version', mensaje: 'Este registro cambió mientras lo editabas. Recargá para ver la versión actual.' };
    case '23505':
      return { codigo: 'duplicado', mensaje: especifico ?? 'Ya existe un registro con ese código.' };
    case '23P01':
      return { codigo: 'solapamiento', mensaje: especifico ?? 'Se superpone con otro registro en el mismo período.' };
    case '23514':
      return { codigo: 'regla_negocio', mensaje: especifico ?? e.message ?? 'El dato no cumple una regla del sistema.' };
    case '23503':
      return { codigo: 'referencia', mensaje: especifico ?? 'Falta un dato relacionado.' };
    case '55000':
      return { codigo: 'inmutable', mensaje: 'Este dato ya no se modifica: usá Anular y reemplazar o Nueva versión.' };
    case '22001':
      return { codigo: 'validacion', mensaje: 'Uno de los textos es demasiado largo.' };
    case '42501':
      return { codigo: 'sin_permiso', mensaje: 'No tenés permiso para esta acción.' };
    default:
      return { codigo: 'desconocido', mensaje: 'Ocurrió un error inesperado. Intentá de nuevo.' };
  }
}
