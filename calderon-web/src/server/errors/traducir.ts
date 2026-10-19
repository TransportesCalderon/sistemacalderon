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
  // --- mae.tanque_combustible (Flota > Camiones > Tanques, migración 27) ---
  ck_tanque_nominal: 'La capacidad nominal debe ser mayor que cero.',
  ck_tanque_util: 'La capacidad útil debe ser mayor que cero y no puede superar la nominal.',
  ck_tanque_tipo: 'Tipo de tanque no válido: principal, secundario, mochila u otro.',
  ck_tanque_descripcion: 'Un tanque de tipo «otro» necesita una descripción.',
  ck_tanque_vigencia: 'La fecha de baja tiene que ser posterior al inicio de la vigencia del tanque.',
  ex_tanque_principal: 'El camión ya tiene un tanque principal vigente en esas fechas. Cargá este como secundario, o da de baja el principal anterior.',
  ex_tanque_solape: 'Ese tanque ya tiene una vigencia que se superpone con esas fechas.',
  uq_tanque_camion_numero_desde: 'Ese tanque ya tiene una vigencia que empieza ese mismo día.',
  // --- Pizarra Azul (migración 39) ---
  ux_semi_codigo_interno: 'Ya existe un semirremolque con ese código interno.',
  ux_semi_patente: 'Ya existe un semirremolque con esa patente.',
  ck_semi_patente: 'La patente debe ir en mayúsculas y sin espacios.',
  ck_semi_capacidad: 'La capacidad debe ser mayor que cero.',
  ck_semi_tipo: 'Tipo de semirremolque no válido.',
  ck_semi_estado: 'Estado no válido: activo, taller o fuera de servicio.',
  semirremolque_pais_patente_fkey: 'El país de la patente no existe en el catálogo.',
  ux_ubicacion_codigo: 'Ya existe una ubicación con ese código.',
  ck_ubicacion_coords: 'Cargá latitud y longitud, o ninguna.',
  ck_ubicacion_radio: 'El radio debe ser mayor que cero.',
  ux_tacc_nombre: 'Ya existe un accesorio con ese nombre.',
  ux_tacc_sigla: 'Ya existe un accesorio con esa sigla.',
  ck_tacc_sigla: 'La sigla va de 1 a 6 letras o números, sin espacios.',
  ck_sacc_cantidad: 'La cantidad de un accesorio va de 0 a 999.',
  ux_genset_codigo: 'Ya existe un genset con ese código.',
  ex_ginst_genset: 'Ese genset ya está instalado en otro semi en esas fechas.',
  ex_ginst_semi: 'Ese semi ya tiene otro genset instalado en esas fechas.',
  ux_servicio_contenedor_abierto: 'Ese contenedor ya está en otro viaje abierto.',
  ck_servicio_contenedor: 'El contenedor tiene que tener 4 letras y 7 números (por ejemplo MSKU4829130).',
  // --- Catálogos (migración 28) ---
  ux_proveedor_codigo: 'Ya existe un proveedor con ese código.',
  ux_proveedor_fiscal: 'Ya existe un proveedor con ese identificador fiscal en ese país.',
  ck_proveedor_tipo: 'Tipo de proveedor no válido.',
  proveedor_pais_fkey: 'El país no existe en el catálogo.',
  proveedor_moneda_defecto_fkey: 'La moneda no existe en el catálogo.',
  ux_estacion_codigo: 'Ya existe una estación con ese código.',
  ck_estacion_proveedor: 'Una estación que no es surtidor propio necesita su proveedor.',
  estacion_servicio_proveedor_id_fkey: 'El proveedor elegido ya no existe.',
  estacion_servicio_pais_fkey: 'El país no existe en el catálogo.',
  ux_tc_fecha_par_tipo: 'Ya hay una cotización de esa moneda para ese día. Si está mal, eliminala y cargá la correcta.',
  ck_tc_tasa: 'La cotización debe ser mayor que cero.',
  tipo_cambio_moneda_origen_fkey: 'La moneda no existe en el catálogo.',
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
  // --- Combustible (migraciones 22, 24, 25 y 26) ---
  ck_carga_faltante: 'El faltante para quedar lleno va solo en un corte de viaje, no puede ser negativo y, si es mayor que 0, lleva observación.',
  ck_mc_litros: 'Los litros deben ser mayores que cero.',
  ck_mc_contraparte: 'Un camión no se descarga a sí mismo: elegí otro camión.',
  ck_mc_motivo: 'Escribí el motivo del movimiento.',
  ck_mc_evidencia: 'Un robo denunciado necesita la evidencia (número de denuncia o acta).',
  ux_sol_mc_pendiente: 'Ese movimiento ya tiene un pedido de reverso pendiente.',
  ex_cv_solape: 'Este camión ya tiene un cierre que se superpone con ese viaje.',
  ux_cv_carga_salida: 'Ese viaje ya tiene un cierre (borrador o aprobado).',
  ck_cv_programador: 'El programador de velocidad va de 0 a 100 %.',
  ck_cv_test_alcohol: 'Test de alcohol no válido.',
  ck_cv_no_imp_tractor: 'Explicá por qué no se imputa al conductor.',
  ck_cv_no_imp_mochila: 'Explicá por qué no se imputa al conductor (mochila).',
  ck_cv_ajuste: 'Indicá el motivo del ajuste manual de km o consumo.',
  ck_cv_ajuste_pos: 'Los km y el consumo manual no pueden ser negativos.',
  ck_cv_anulado: 'Escribí el motivo de la anulación.',
  ex_carga_duplicada: 'Ya hay una carga del mismo camión, con la misma hora y los mismos litros.',
  ex_carga_llenado_instante: 'Ya hay otro llenado del tractor de ese camión en el mismo instante: indicá la hora real.',
  ck_carga_frontera: 'Solo un llenado a tanque lleno del camión puede ser corte de viaje.',
  ck_carga_aparte: 'Solo una carga de mochila sin parada se confirma como aparte.',
  ck_carga_destino_unico: 'Una carga va al tractor, al equipo de frío o a un depósito, no a varios.',
  ck_carga_deposito_no_lleno: 'Una carga a un depósito no es a tanque lleno.',
  ck_carga_litros: 'Los litros deben ser mayores que cero.',
  ex_dep_mochila_vigencia: 'El camión ya tiene otra mochila vigente en ese período.',
  ux_dep_codigo: 'Ya existe un depósito con ese código.',
  ex_uso_solape: 'El camión ya tiene un uso de mochila que se superpone con ese período.',
  ex_csd_deposito_fecha: 'Ya hay un control vigente de ese depósito en ese instante: para corregirlo, usá «Corregir».',
  ex_csd_frontera: 'Esa parada ya tiene su control de la mochila: para corregirlo, reemplazalo.',
  ex_csd_inicial: 'El depósito ya tiene su control inicial.',
  ck_csd_declarante: 'Una declaración necesita quién la declara (si es el chofer, elegilo).',
  ck_csd_medicion: 'Una medición necesita el método.',
  ck_csd_litros: 'Los litros no pueden ser negativos.',
  ck_csd_reemplazo: 'Indicá el motivo del reemplazo.',
  // --- Ticket de la carga (migración 34) ---
  ux_doc_emisor_tipo_numero: 'Ese número de ticket de esa estación ya está adjunto a otra carga.',
  ck_doc_tipo: 'Tipo de documento no válido.',
  // --- Base Mendoza (migración 30) ---
  ux_dep_base_estacion: 'Ese surtidor propio ya tiene su tanque de base.',
  ck_dep_capacidad: 'La capacidad debe ser mayor que cero.',
  ck_dep_codigo: 'Ingresá el código y el nombre.',
  ex_resp_solape: 'Ya hay un responsable asignado en esas fechas. Para cambiarlo, hacé un traspaso.',
  ck_mov_evidencia: 'La compra a granel y el robo denunciado necesitan la evidencia (remito, factura o denuncia).',
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
  ck_tanque_nominal: 'capacidadNominalL',
  ck_tanque_util: 'capacidadUtilL',
  ck_tanque_tipo: 'tipo',
  ck_tanque_descripcion: 'descripcion',
  ck_tanque_vigencia: 'hasta',
  ex_tanque_principal: 'tipo',
  ux_proveedor_codigo: 'codigo',
  ux_proveedor_fiscal: 'identificadorFiscal',
  ux_estacion_codigo: 'codigo',
  ux_dep_base_estacion: 'estacionId',
  ux_doc_emisor_tipo_numero: 'numero',
  ck_dep_capacidad: 'capacidadL',
  ck_csd_litros: 'litros',
  ex_csd_deposito_fecha: 'fechaHora',
  ck_mov_evidencia: 'evidencia',
  ck_estacion_proveedor: 'proveedorId',
  ux_tc_fecha_par_tipo: 'fecha',
  ck_tc_tasa: 'valor',
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
  ck_cv_no_imp_tractor: 'noImputableMotivo',
  ck_carga_faltante: 'faltanteObservacion',
  ck_mc_motivo: 'motivo',
  ck_mc_evidencia: 'evidencia',
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
