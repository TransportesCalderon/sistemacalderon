import type { ErrorAccion } from '@/server/actions/result';
import { ErrorNegocio } from '@/shared/lib/errores';

interface ErrorConCodigo {
  code?: string;
  message?: string;
}

/**
 * Traduce un error de PostgREST / PostgreSQL (SQLSTATE) al lenguaje de negocio
 * (especificación §17). Los mensajes por restricción se agregan con cada módulo; los
 * mensajes que escribe la base para el usuario se muestran sin reinterpretar.
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
  // --- mae.cliente (Comercial > Clientes) ---
  ux_cliente_codigo: 'Ya existe un cliente con ese código.',
  ux_cliente_fiscal: 'Ya existe un cliente con ese identificador fiscal en ese país.',
  ck_cliente_condicion_pago: 'La condición de pago debe estar entre 0 y 365 días.',
  ck_cliente_estado: 'Estado no válido: activo, inactivo o bloqueado.',
  cliente_pais_fkey: 'El país no existe en el catálogo.',
  cliente_moneda_facturacion_fkey: 'La moneda no existe en el catálogo.',
  // --- Combustible (migraciones 22, 24 y 25) ---
  ex_cv_solape: 'Este camión ya tiene un cierre que se superpone con ese viaje.',
  ux_cv_carga_salida: 'Ese viaje ya tiene un cierre (borrador o aprobado).',
  ck_cv_programador: 'El programador de velocidad va de 0 a 100 %.',
  ck_cv_test_alcohol: 'Test de alcohol no válido.',
  ck_cv_no_imp_tractor: 'Explicá por qué no se imputa al conductor (tractor).',
  ck_cv_no_imp_mochila: 'Explicá por qué no se imputa al conductor (mochila).',
  ck_cv_ajuste: 'Indicá el motivo del ajuste manual de km o consumo.',
  ck_cv_ajuste_pos: 'Los km y el consumo manual no pueden ser negativos.',
  ck_cv_anulado: 'Escribí el motivo de la anulación.',
  ex_carga_duplicada: 'Ya hay una carga del mismo camión, con la misma hora y los mismos litros.',
  ex_carga_llenado_instante: 'Ya hay otro llenado del tractor de ese camión en el mismo instante: indicá la hora real.',
  ck_carga_frontera: 'Solo un llenado a tanque lleno del tractor, sin parada, puede ser frontera.',
  ck_carga_aparte: 'Solo una carga de mochila sin parada se confirma como aparte.',
  ck_carga_destino_unico: 'Una carga va al tractor, al equipo de frío o a un depósito, no a varios.',
  ck_carga_deposito_no_lleno: 'Una carga a un depósito no es a tanque lleno.',
  ck_carga_litros: 'Los litros deben ser mayores que cero.',
  ex_dep_mochila_vigencia: 'El camión ya tiene otra mochila vigente en ese período.',
  ux_dep_codigo: 'Ya existe un depósito con ese código.',
  ex_uso_solape: 'El camión ya tiene un uso de mochila que se superpone con ese período.',
  ex_csd_deposito_fecha: 'Ya hay un control vigente de ese depósito en ese instante: reemplazalo.',
  ex_csd_frontera: 'Esa parada ya tiene su control de la mochila: para corregirlo, reemplazalo.',
  ex_csd_inicial: 'La mochila ya tiene su control inicial.',
  ck_csd_declarante: 'Una declaración necesita quién la declara (si es el chofer, elegilo).',
  ck_csd_medicion: 'Una medición necesita el método.',
  ck_csd_litros: 'Los litros no pueden ser negativos.',
  ck_csd_reemplazo: 'Indicá el motivo del reemplazo.',
  ux_sol_carga_pendiente: 'Esa carga ya tiene una solicitud de anulación pendiente.',
  ck_sol_motivo: 'Escribí el motivo de la solicitud.',
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
  ux_cliente_codigo: 'codigo',
  ux_cliente_fiscal: 'identificadorFiscal',
  ck_cliente_condicion_pago: 'condicionPagoDias',
  ck_cliente_estado: 'estado',
  cliente_pais_fkey: 'pais',
  cliente_moneda_facturacion_fkey: 'monedaFacturacion',
  ck_cv_programador: 'programadorVelocidadPct',
  ck_cv_no_imp_tractor: 'tractorNoImputableMotivo',
  ck_cv_no_imp_mochila: 'mochilaNoImputableMotivo',
  ck_cv_ajuste: 'motivoAjuste',
  ck_cv_anulado: 'motivo',
  ck_carga_litros: 'litros',
  ex_carga_llenado_instante: 'fechaHora',
  ex_carga_duplicada: 'fechaHora',
  ck_csd_declarante: 'choferId',
  ck_csd_medicion: 'metodo',
  ck_csd_reemplazo: 'motivoReemplazo',
  ux_dep_codigo: 'codigo',
  ck_sol_motivo: 'motivo',
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

/**
 * Mensajes técnicos de PostgreSQL que no se muestran tal cual (se traducen por restricción).
 * Todo otro mensaje lo escribió la base para el usuario (reglas de negocio de los triggers y
 * funciones: período cerrado, aprobación pendiente, frontera inválida…) y se muestra sin cambios.
 */
const MENSAJE_TECNICO =
  /^(duplicate key value|new row for relation|conflicting key value|permission denied|null value in column|insert or update on table|update or delete on table|value too long|invalid input syntax|JSON object requested|Could not find|column .* does not exist|relation .* does not exist)/i;

/** Mensaje de la base apto para el usuario (null si es técnico). */
export function mensajeDeLaBase(error: unknown): string | null {
  const m = ((error ?? {}) as ErrorConCodigo).message?.trim();
  return m && !MENSAJE_TECNICO.test(m) ? m : null;
}

function traducirSinCampo(error: unknown): ErrorAccion {
  const e = (error ?? {}) as ErrorConCodigo;
  const restriccion = restriccionDe(error);
  const especifico = restriccion ? MENSAJES_RESTRICCION[restriccion] : undefined;
  const base = mensajeDeLaBase(error);

  switch (e.code) {
    case '40001':
      return { codigo: 'conflicto_version', mensaje: 'Este registro cambió mientras lo editabas. Recargá para ver la versión actual.' };
    case '23505':
      return { codigo: 'duplicado', mensaje: especifico ?? base ?? 'Ya existe un registro con ese código.' };
    case '23P01':
      return { codigo: 'solapamiento', mensaje: especifico ?? base ?? 'Se superpone con otro registro en el mismo período.' };
    case '23514':
      return { codigo: 'regla_negocio', mensaje: especifico ?? base ?? 'El dato no cumple una regla del sistema.' };
    case '23503':
      return { codigo: 'referencia', mensaje: especifico ?? base ?? 'Falta un dato relacionado.' };
    case '55000':
      return { codigo: 'inmutable', mensaje: base ?? 'Este dato ya no se modifica: usá Anular y reemplazar o Nueva versión.' };
    case '22001':
      return { codigo: 'validacion', mensaje: 'Uno de los textos es demasiado largo.' };
    case '42501':
      return { codigo: 'sin_permiso', mensaje: base ?? 'No tenés permiso para esta acción.' };
    case 'P0001':
    case '55P03':
      return { codigo: 'regla_negocio', mensaje: base ?? 'La operación no cumple una regla del sistema.' };
    case 'P0002':
      return { codigo: 'referencia', mensaje: base ?? 'El registro no existe.' };
    default:
      return { codigo: 'desconocido', mensaje: 'Ocurrió un error inesperado. Intentá de nuevo.' };
  }
}
