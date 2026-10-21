/**
 * Tipos de la base de datos.
 *
 * ESTE ARCHIVO SE REGENERA con `npm run gen:types` (Supabase CLI) a partir del proyecto
 * desplegado. Esta versión inicial es un subconjunto escrito a mano con lo que usan el
 * núcleo (sesión y topbar) y los módulos Flota (Camiones, Choferes), Comercial (Clientes) y Combustible (cargas,
 * mochilas, controles, viajes y cierres de la migración 24), con la misma forma que produce
 * la CLI. Al regenerar se reemplaza completo; no editar a mano.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TablaSoloLectura<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};

/** mae.tanque_combustible (migraciones 03 y 27). */
type TanqueCombustibleRow = {
  id: number;
  camion_id: number;
  numero_tanque: number;
  tipo: string;
  descripcion: string | null;
  capacidad_nominal_l: number;
  capacidad_util_l: number;
  tolerancia_sobrecarga_pct: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  creado_en: string;
  creado_por: number | null;
  actualizado_en: string;
  actualizado_por: number | null;
  eliminado_en: string | null;
  eliminado_por: number | null;
  version_fila: number;
};

/** Tabla editable sencilla: Insert y Update parciales sobre la fila (columnas de control las pone la base). */
type TablaEditable<Row, Ins> = {
  Row: Row;
  Insert: Ins;
  Update: Partial<Ins> & { version_fila?: number; eliminado_en?: string | null };
  Relationships: [];
};

/** mae.proveedor (migraciones 03 y 28). */
type ProveedorIns = {
  codigo: string;
  razon_social: string;
  identificador_fiscal?: string | null;
  pais: string;
  tipo: string;
  moneda_defecto?: string | null;
};
/** mae.estacion_servicio. */
type EstacionIns = {
  codigo: string;
  nombre: string;
  proveedor_id?: number | null;
  ubicacion_id?: number | null;
  es_tanque_propio?: boolean;
  pais: string;
};
/** fin.tipo_cambio: tasa = unidades de moneda_destino por 1 de moneda_origen. */
type TipoCambioIns = {
  fecha: string;
  moneda_origen: string;
  moneda_destino: string;
  tasa: number;
  tipo: string;
  fuente?: string | null;
};

type CamionRow = {
  id: number;
  codigo_interno: string;
  patente: string;
  pais_patente: string;
  vin: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  tipo_combustible_id: number;
  fecha_alta: string;
  fecha_baja: string | null;
  estado: string;
  propietario_tipo: string;
  consumo_referencia_l_100km: number | null;
  id_optifleet: string | null;
  creado_en: string;
  creado_por: number | null;
  actualizado_en: string;
  actualizado_por: number | null;
  eliminado_en: string | null;
  eliminado_por: number | null;
  version_fila: number;
};

type ChoferRow = {
  id: number;
  legajo: string;
  nombre: string;
  apellido: string;
  documento_tipo: string;
  documento_numero: string;
  pais_residencia: string;
  base_ubicacion_id: number | null;
  categoria_liquidacion: string | null;
  fecha_ingreso: string;
  fecha_egreso: string | null;
  estado: string;
  id_conductor_optifleet: string | null;
  /** Migración 43: datos de trabajo. */
  telefono: string | null;
  licencia_vencimiento: string | null;
  visa_estado: string | null;
  /** Migración 43: datos reservados (se leen solo registrando el acceso). */
  rut_chile: string | null;
  fecha_nacimiento: string | null;
  contacto_emergencia: string | null;
  creado_en: string;
  creado_por: number | null;
  actualizado_en: string;
  actualizado_por: number | null;
  eliminado_en: string | null;
  eliminado_por: number | null;
  version_fila: number;
};

/** Insert / Update con la forma de la CLI: obligatorias sin default, el resto opcionales. */
type ChoferInsert = {
  legajo: string;
  nombre: string;
  apellido: string;
  documento_tipo: string;
  documento_numero: string;
  pais_residencia: string;
  fecha_ingreso: string;
} & Partial<Omit<ChoferRow, 'id' | 'legajo' | 'nombre' | 'apellido' | 'documento_tipo' | 'documento_numero' | 'pais_residencia' | 'fecha_ingreso'>>;

type ClienteRow = {
  id: number;
  codigo: string;
  razon_social: string;
  identificador_fiscal: string;
  pais: string;
  moneda_facturacion: string;
  condicion_pago_dias: number;
  segmento: string | null;
  estado: string;
  creado_en: string;
  creado_por: number | null;
  actualizado_en: string;
  actualizado_por: number | null;
  eliminado_en: string | null;
  eliminado_por: number | null;
  version_fila: number;
};

type ClienteInsert = {
  codigo: string;
  razon_social: string;
  identificador_fiscal: string;
  pais: string;
  moneda_facturacion: string;
} & Partial<Omit<ClienteRow, 'id' | 'codigo' | 'razon_social' | 'identificador_fiscal' | 'pais' | 'moneda_facturacion'>>;

/** Columnas de control comunes (aud.fn_columnas_control). */
type Control = {
  creado_en: string;
  creado_por: number | null;
  actualizado_en: string;
  actualizado_por: number | null;
  eliminado_en: string | null;
  eliminado_por: number | null;
  version_fila: number;
};

/** fue.cierre_viaje (migración 24: cierre con componentes tractor y mochila). */
type CierreViajeRow = {
  id: number;
  numero: string;
  camion_id: number;
  carga_salida_id: number;
  carga_llegada_id: number;
  salida_ts: string;
  llegada_ts: string;
  estado: string;
  chofer_responsable_id: number | null;
  motivo_chofer: string | null;
  programador_velocidad_pct: number | null;
  test_alcohol: string | null;
  km_manual: number | null;
  consumo_plataforma_manual_l: number | null;
  motivo_ajuste: string | null;
  tractor_no_imputable_l: number;
  tractor_no_imputable_ralenti_h: number;
  tractor_no_imputable_motivo: string | null;
  tractor_justificacion: string | null;
  mochila_no_imputable_l: number;
  mochila_no_imputable_motivo: string | null;
  mochila_justificacion: string | null;
  observaciones: string | null;
  km_recorridos: number | null;
  fuente_km: string | null;
  litros_carga_salida: number | null;
  litros_llenados_l: number | null;
  litros_desde_mochila_l: number | null;
  consumo_llenado_l: number | null;
  consumo_plataforma_l: number | null;
  fuente_consumo_plataforma: string | null;
  horas_motor: number | null;
  horas_ralenti: number | null;
  ralenti_mes_h: number | null;
  dias_parado: number | null;
  capacidad_util_l: number | null;
  consumo_l_100km: number | null;
  tractor_diferencia_l: number | null;
  tractor_tolerancia_l: number | null;
  tractor_imputable_l: number | null;
  usa_mochila: boolean | null;
  deposito_id: number | null;
  control_ancla_id: number | null;
  control_llegada_id: number | null;
  mochila_ancla_l: number | null;
  mochila_entradas_l: number | null;
  mochila_transferencias_entrada_l: number | null;
  mochila_transferencias_salida_l: number | null;
  mochila_a_tractor_l: number | null;
  mochila_con_motivo_l: number | null;
  mochila_real_l: number | null;
  mochila_teorico_l: number | null;
  mochila_fisico_l: number | null;
  mochila_diferencia_l: number | null;
  mochila_tolerancia_l: number | null;
  mochila_imputable_l: number | null;
  imputable_total_l: number | null;
  /** 1 = tractor + mochila (24, historial); 2 = combustible del camión unificado (26). */
  version_calculo: number;
  cargas_l: number | null;
  entradas_l: number | null;
  salidas_l: number | null;
  faltante_salida_l: number | null;
  faltante_llegada_l: number | null;
  libro_l: number | null;
  diferencia_l: number | null;
  tolerancia_l: number | null;
  linea_viaje: string | null;
  huella: string | null;
  detalle: Json | null;
  calculado_en: string | null;
  aprobado_por: number | null;
  aprobado_en: string | null;
  motivo_anulacion: string | null;
  anulado_por: number | null;
  anulado_en: string | null;
} & Control;

/** Columnas que la aplicación escribe en un borrador (permisos por columna de la migración 24). */
type CierreViajeBorrador = Partial<
  Pick<
    CierreViajeRow,
    | 'chofer_responsable_id'
    | 'motivo_chofer'
    | 'programador_velocidad_pct'
    | 'test_alcohol'
    | 'km_manual'
    | 'consumo_plataforma_manual_l'
    | 'motivo_ajuste'
    | 'tractor_no_imputable_l'
    | 'tractor_no_imputable_ralenti_h'
    | 'tractor_no_imputable_motivo'
    | 'tractor_justificacion'
    | 'observaciones'
  >
>;

/** fue.carga_combustible (05, 22 y 24). */
type CargaRow = {
  id: number;
  camion_id: number;
  tanque_id: number | null;
  tanque_reefer_id: number | null;
  chofer_id: number | null;
  estacion_id: number | null;
  fecha_hora: string;
  tipo_combustible_id: number;
  litros: number;
  precio_unitario: number;
  moneda: string;
  importe_original: number;
  tipo_cambio_id: number | null;
  importe_moneda_base: number;
  odometro_km: number | null;
  nivel_antes_pct: number | null;
  nivel_despues_pct: number | null;
  tanque_lleno: boolean;
  medio_pago: string;
  tiene_documento: boolean;
  origen_dato: string;
  estado_validacion: string;
  motivo_observacion: string | null;
  lote_importacion_id: number | null;
  anula_id: number | null;
  motivo_anulacion: string | null;
  deposito_id: number | null;
  carga_principal_id: number | null;
  es_frontera: boolean;
  aparte_confirmada: boolean;
  mismo_ticket: boolean;
  faltante_lleno_l: number;
  faltante_observacion: string | null;
  validada_por: number | null;
  validada_en: string | null;
  motivo_validacion: string | null;
} & Control;

/** fue.documento_carga (05 y 34): ticket, factura, remito o voucher de la carga. Se escribe con funciones. */
type DocumentoCargaRow = {
  id: number;
  carga_id: number;
  tipo: string;
  numero_documento: string;
  emisor_id: number | null;
  fecha_documento: string;
  archivo_uri: string | null;
  hash_archivo: string | null;
} & Control;

type CargaInsert = Pick<
  CargaRow,
  'camion_id' | 'fecha_hora' | 'tipo_combustible_id' | 'litros' | 'precio_unitario' | 'moneda' | 'importe_original' | 'medio_pago' | 'origen_dato'
> &
  Partial<
    Pick<
      CargaRow,
      | 'chofer_id'
      | 'estacion_id'
      | 'odometro_km'
      | 'tanque_lleno'
      | 'es_frontera'
      | 'faltante_lleno_l'
      | 'faltante_observacion'
      | 'anula_id'
    >
  >;

/** fue.deposito_combustible (22 y 24). */
type DepositoRow = {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  camion_id: number | null;
  estacion_id: number | null;
  tipo_combustible_id: number;
  capacidad_l: number;
  estado: string;
  observaciones: string | null;
  parada_desde_id: number | null;
  parada_hasta_id: number | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
} & Control;

/** fue.movimiento_camion (26): descargas y movimientos con motivo del camión. */
type MovimientoCamionRow = {
  id: number;
  camion_id: number;
  fecha_hora: string;
  tipo: string;
  litros: number;
  operacion: string;
  tipo_combustible_id: number;
  deposito_destino_id: number | null;
  camion_contraparte_id: number | null;
  categoria: string | null;
  evidencia: string | null;
  motivo: string | null;
  chofer_id: number | null;
  estado_aprobacion: string | null;
  resuelto_por: number | null;
  resuelto_en: string | null;
  resuelto_roles: string[] | null;
  motivo_resolucion: string | null;
  anula_id: number | null;
} & Control;

/** fue.solicitud_correccion (24). */
type SolicitudRow = {
  id: number;
  tipo: string;
  carga_id: number | null;
  movimiento_id: number | null;
  movimiento_camion_id: number | null;
  motivo: string;
  estado: string;
  resuelto_por: number | null;
  resuelto_en: string | null;
  resuelto_roles: string[] | null;
  motivo_resolucion: string | null;
} & Control;

/** fue.v_viaje (24): viajes entre cortes de viaje consecutivos. */
type ViajeRow = {
  camion_id: number;
  patente: string;
  carga_salida_id: number;
  salida_ts: string;
  carga_llegada_id: number | null;
  llegada_ts: string | null;
  cierre_id: number | null;
  cierre_numero: string | null;
  cierre_estado: string | null;
  situacion: string;
};

/** fue.v_saldo_deposito (24 y 25). */
type SaldoDepositoRow = {
  deposito_id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  camion_id: number | null;
  estacion_id: number | null;
  tipo_combustible_id: number;
  capacidad_l: number;
  estado: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  saldo_l: number;
  ultimo_movimiento: string | null;
  ultimo_control_id: number | null;
  ultimo_control_en: string | null;
  ultimo_control_l: number | null;
  ultimo_control_fuente: string | null;
  ultimo_control_rol: string | null;
  control_vencido: boolean;
  movimientos_pendientes: number;
  responsable_usuario_id: number | null;
};

/** fue.control_saldo_deposito (24). Se escribe con fue.fn_registrar_control_base (30). */
type ControlDepositoRow = {
  id: number;
  deposito_id: number;
  fecha_hora: string;
  litros: number;
  fuente: string;
  metodo: string | null;
  rol: string;
  origen: string;
  saldo_libro_l: number;
  diferencia_l: number | null;
  observaciones: string | null;
  medido_por: number | null;
  estado: string;
  reemplaza_id: number | null;
  motivo_reemplazo: string | null;
} & Control;

/** fue.v_control_base (30): controles vigentes de un tanque de base con su segmento. */
type ControlBaseRow = {
  id: number;
  deposito_id: number;
  fecha_hora: string;
  litros: number;
  rol: string;
  origen: string;
  metodo: string | null;
  observaciones: string | null;
  saldo_libro_l: number;
  diferencia_l: number;
  medido_por: number | null;
  medido_por_nombre: string | null;
  reemplaza_id: number | null;
  motivo_reemplazo: string | null;
  control_anterior_id: number | null;
  control_anterior_en: string | null;
  responsable_usuario_id: number | null;
  responsable_nombre: string | null;
  aprobacion_id: number | null;
  aprobado_diferencia_l: number | null;
  aprobado_imputable_l: number | null;
  aprobado_por: number | null;
  aprobado_por_nombre: string | null;
  aprobado_en: string | null;
  creado_en: string;
};

/** fue.movimiento_combustible (22, 24): libro de un depósito. Solo lo escriben las funciones de la base. */
type MovimientoDepositoRow = {
  id: number;
  deposito_id: number;
  fecha_hora: string;
  tipo: string;
  litros: number;
  operacion: string;
  carga_id: number | null;
  deposito_contraparte_id: number | null;
  camion_id: number | null;
  control_id: number | null;
  chofer_id: number | null;
  motivo: string | null;
  anula_id: number | null;
  categoria: string | null;
  evidencia: string | null;
  estado_aprobacion: string | null;
  resuelto_por: number | null;
  resuelto_en: string | null;
  motivo_resolucion: string | null;
} & Control;

/** fue.responsable_deposito (24): responsable del tanque de base, vigencia (desde, hasta]. */
type ResponsableIns = { deposito_id: number; usuario_id: number; desde_ts: string; observaciones?: string | null };
type ResponsableRow = ResponsableIns & { id: number; hasta_ts: string | null } & Control;

/** fue.aprobacion_control_base (24). */
type AprobacionBaseRow = {
  id: number;
  deposito_id: number;
  control_id: number;
  control_anterior_id: number;
  estado: string;
  diferencia_l: number;
  imputable_l: number;
  aprobado_por: number | null;
  aprobado_en: string;
} & Control;

/** mae.semirremolque (migraciones 03 y 39). */
type SemiIns = {
  codigo_interno: string;
  patente: string;
  pais_patente: string;
  tipo: string;
  capacidad_kg: number;
  tiene_equipo_frio?: boolean;
  estado?: string;
  tara_fecha?: string | null;
  ubicacion_playa_id?: number | null;
  observacion_operativa?: string | null;
};
type SemiRow = Required<SemiIns> &
  Control & { id: number; ubicacion_playa_desde: string | null; observacion_por: number | null; observacion_en: string | null };
/** mae.ubicacion (migración 03). */
type UbicacionIns = {
  codigo: string;
  nombre: string;
  tipo: string;
  pais: string;
  region?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  radio_geocerca_m?: number | null;
};
/** ref.tipo_accesorio y mae.genset (migración 39). */
type TipoAccesorioIns = { nombre: string; sigla: string; orden?: number; activo?: boolean };
type GensetIns = {
  codigo: string;
  marca?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  estado?: string;
  observaciones?: string | null;
  /** Migración 48: capacidad del tanque (L) y consumo promedio (L/h). */
  capacidad_l?: number | null;
  consumo_lh?: number | null;
};
/** ana.fn_bandeja_alertas (migración 49). */
type AlertaRow = {
  id: number;
  codigo: string;
  tipo: string;
  categoria: string;
  severidad: string;
  estado: string;
  resolucion: string | null;
  camion_id: number | null;
  patente: string | null;
  chofer_id: number | null;
  chofer: string | null;
  carga_id: number | null;
  ocurrio_desde: string | null;
  ocurrio_hasta: string | null;
  detectada_en: string;
  valor_observado: number | null;
  valor_esperado: number | null;
  unidad: string | null;
  evidencia: Json;
  descuento_l: number | null;
  descuento_importe: number | null;
  moneda: string | null;
  descuento_chofer: string | null;
  comentarios: number;
};
/** tel.fn_puntaje_choferes (migración 49). */
type PuntajeChoferRow = {
  chofer_id: number;
  chofer: string;
  km: number;
  litros: number | null;
  l_100km: number | null;
  programador_pct: number | null;
  ralenti_pct: number | null;
  sobre_velocidad_min_100km: number | null;
  frenada_fuerte_s_100km: number | null;
  rpm_alta_pct: number | null;
  alertas: number;
  puntaje: number | null;
  dias: number;
  camiones: string | null;
  con_acumulados: boolean;
};
/** tel.conduccion_diaria (migración 49). */
type ConduccionDiariaRow = {
  camion_id: number;
  chofer_id: number | null;
  fecha: string;
  km: number;
  litros: number | null;
  horas_motor: number | null;
  movimiento_h: number | null;
  ralenti_h: number | null;
  ralenti_l: number | null;
  programador_km: number | null;
  programador_h: number | null;
  sobre_velocidad_min: number | null;
  rpm_alta_min: number | null;
  frenada_fuerte_s: number | null;
  frenadas: number | null;
  velocidad_max: number | null;
  peso_medio_kg: number | null;
  lecturas: number;
  acumulados: boolean;
  calculado_en: string;
};
/** ops.fn_costos_viajes (migración 51). */
type CostoViajeRow = {
  viaje_id: number;
  numero: string;
  estado: string;
  salida_ts: string;
  llegada_ts: string | null;
  patente: string;
  chofer: string;
  km_linea: number | null;
  km_reales: number | null;
  litros: number | null;
  combustible: number | null;
  canon: number | null;
  costo_km: number | null;
  gastos: number | null;
  total: number;
  por_km: number | null;
  operaciones: number;
  moneda: string;
  en_curso: boolean;
  incompleto: boolean;
};
/** fue.fn_ralenti_mes (migración 50). */
type RalentiMesRow = {
  chofer_id: number | null;
  chofer: string | null;
  ralenti_l: number;
  ralenti_h: number | null;
  dias: number;
  dias_sin_litros: number;
  camiones: string | null;
  permitido_l: number;
  exceso_l: number;
  precio_promedio: number | null;
  precio_propuesto: number | null;
  moneda: string;
  importe: number | null;
  cierre_id: number | null;
  cierre_numero: string | null;
  cierre_justificado_l: number | null;
  cierre_exceso_l: number | null;
  cierre_precio: number | null;
  cierre_importe: number | null;
};
/** fue.fn_gensets_combustible (migración 48). */
type GensetCombustibleRow = {
  genset_id: number;
  codigo: string;
  semi: string | null;
  capacidad_l: number | null;
  consumo_lh: number | null;
  consumo_real_lh: number | null;
  ultimo_ts: string | null;
  ultimo_horometro_h: number | null;
  vuelta_inicio_id: number | null;
  vuelta_desde: string | null;
  vuelta_chofer: string | null;
  por_cerrar: number;
  descuentos_l: number;
};
/** mae.linea y mae.transportista (migración 41). */
type LineaIns = {
  codigo: string;
  lugar_retiro_id: number;
  lugar_entrega_id: number;
  lugar_aduana_id?: number | null;
  distancia_km?: number | null;
  cruza_frontera?: boolean;
  transit_horas?: number | null;
  activa?: boolean;
  /** Migración 46: canon del chofer por la línea (con su moneda, o ninguno de los dos). */
  canon_chofer?: number | null;
  canon_moneda?: string | null;
};
/** ops.fn_tractores (migración 46). */
type TractorRow = {
  camion_id: number;
  codigo_interno: string;
  patente: string;
  estado_camion: string;
  chofer_id: number | null;
  chofer_nombre: string | null;
  chofer_estado: string | null;
  licencia_vencimiento: string | null;
  asignado_desde: string | null;
  viaje_id: number | null;
  viaje_numero: string | null;
  viaje_salida_ts: string | null;
  viaje_chofer_nombre: string | null;
  situacion: string;
  corte_disponible_id: number | null;
  corte_disponible_ts: string | null;
};
/** ops.fn_viajes_chofer (migración 46). */
type ViajeChoferRow = {
  id: number;
  numero: string;
  camion_id: number;
  patente: string;
  chofer_id: number;
  chofer_nombre: string;
  salida_ts: string;
  llegada_ts: string | null;
  situacion: string;
  operaciones: string | null;
  km: number | null;
  canon: string | null;
  relevo: boolean | null;
  cierre_id: number | null;
  cierre_estado: string | null;
};
type TransportistaIns = { razon_social: string; cuit?: string | null; telefono?: string | null; observaciones?: string | null; activo?: boolean };
/** ops.fn_operaciones (migración 41). */
type OperacionRow = {
  servicio_id: number;
  numero_operacion: number;
  fecha_operacion: string;
  tipo_operacion: string | null;
  estado: string;
  estado_logistica: string;
  cliente_id: number;
  cliente: string;
  linea_id: number | null;
  linea: string | null;
  lugar_retiro_id: number | null;
  lugar_retiro: string | null;
  origen_id: number;
  origen: string | null;
  lugar_aduana_id: number | null;
  lugar_aduana: string | null;
  destino_id: number;
  destino: string | null;
  destino_es_puerto: boolean | null;
  fecha_presentacion: string | null;
  fecha_entrega: string | null;
  inicio_real: string | null;
  fin_real: string | null;
  producto: string | null;
  peso_kg: number | null;
  tipo_contenedor: string | null;
  contenedor: string | null;
  precinto: string | null;
  tara_max_dias: number | null;
  booking: string | null;
  referencia_cliente: string | null;
  buque: string | null;
  crt: string | null;
  mic: string | null;
  observacion: string | null;
  motivo_cancelacion: string | null;
  transportista_id: number | null;
  transportista: string | null;
  tercero_chofer: string | null;
  tercero_tractor: string | null;
  tercero_semi: string | null;
  tramo_id: number | null;
  tramo_estado: string | null;
  paso: string | null;
  semi_id: number | null;
  semi: string | null;
  camion_id: number | null;
  tractor: string | null;
  chofer_id: number | null;
  chofer: string | null;
  hitos: Json;
  version_fila: number;
  /** Migración 42: paso sugerido y pasos posibles (ops.fn_pasos). */
  siguiente: string | null;
  posibles: string[];
};
/** ops.fn_pizarra (migración 39). */
type PizarraRow = {
  semi_id: number;
  patente: string;
  codigo_interno: string;
  tipo: string;
  semi_estado: string;
  estado: string;
  tara_fecha: string | null;
  tara_dias: number | null;
  accesorios: Json;
  genset_id: number | null;
  genset_codigo: string | null;
  genset_desde: string | null;
  tramo_id: number | null;
  camion_id: number | null;
  tractor_patente: string | null;
  chofer_id: number | null;
  chofer_nombre: string | null;
  servicio_id: number | null;
  numero_servicio: string | null;
  cliente_id: number | null;
  cliente: string | null;
  producto: string | null;
  contenedor: string | null;
  tara_max_dias: number | null;
  salida_ts: string | null;
  salida_lugar: string | null;
  destino: string | null;
  descarga_programada: string | null;
  proximo_servicio_id: number | null;
  proxima_cliente: string | null;
  proxima_producto: string | null;
  proxima_fecha: string | null;
  proxima_lugar: string | null;
  proxima_tara_max_dias: number | null;
  ubicacion: string | null;
  ubicacion_fuente: string | null;
  ubicacion_ts: string | null;
  latitud: number | null;
  longitud: number | null;
  observacion: string | null;
  observacion_por: string | null;
  observacion_en: string | null;
  alertas: Json;
  version_fila: number;
};

type Vista<Row> = { Row: { [K in keyof Row]: Row[K] | null }; Relationships: [] };

export type Database = {
  ref: {
    Tables: {
      moneda: TablaSoloLectura<{
        codigo: string;
        nombre: string;
        simbolo: string | null;
        decimales: number;
        es_base: boolean;
        eliminado_en: string | null;
      }>;
      parametro: {
        Row: { codigo: string; valor: Json; descripcion: string; eliminado_en: string | null; actualizado_en: string; actualizado_por: number | null; version_fila: number };
        Insert: never;
        /** Solo valor y descripción (la base controla el tipo del valor; el código no cambia). */
        Update: { valor?: Json; descripcion?: string; version_fila?: number };
        Relationships: [];
      };
      tipo_combustible: TablaSoloLectura<{
        id: number;
        codigo: string;
        nombre: string;
        densidad_kg_l: number | null;
        unidad_codigo: string;
        participa_alertas: boolean;
        eliminado_en: string | null;
      }>;
      tipo_accesorio: TablaEditable<Required<TipoAccesorioIns> & Control & { id: number }, TipoAccesorioIns>;
      pais: TablaSoloLectura<{
        iso2: string;
        nombre: string;
        moneda_defecto: string;
        zona_horaria_operativa: string;
        eliminado_en: string | null;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      fn_moneda_base: { Args: Record<string, never>; Returns: string | null };
      fn_definir_moneda_base: { Args: { p_codigo: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  mae: {
    Tables: {
      camion: {
        Row: CamionRow;
        Insert: {
          codigo_interno: string;
          patente: string;
          pais_patente: string;
          vin?: string | null;
          marca?: string | null;
          modelo?: string | null;
          anio?: number | null;
          tipo_combustible_id: number;
          fecha_alta: string;
          fecha_baja?: string | null;
          estado?: string;
          propietario_tipo?: string;
          consumo_referencia_l_100km?: number | null;
          id_optifleet?: string | null;
          creado_en?: string;
          creado_por?: number | null;
          actualizado_en?: string;
          actualizado_por?: number | null;
          eliminado_en?: string | null;
          eliminado_por?: number | null;
          version_fila?: number;
        };
        Update: {
          codigo_interno?: string;
          patente?: string;
          pais_patente?: string;
          vin?: string | null;
          marca?: string | null;
          modelo?: string | null;
          anio?: number | null;
          tipo_combustible_id?: number;
          fecha_alta?: string;
          fecha_baja?: string | null;
          estado?: string;
          propietario_tipo?: string;
          consumo_referencia_l_100km?: number | null;
          id_optifleet?: string | null;
          creado_en?: string;
          creado_por?: number | null;
          actualizado_en?: string;
          actualizado_por?: number | null;
          eliminado_en?: string | null;
          eliminado_por?: number | null;
          version_fila?: number;
        };
        Relationships: [];
      };
      chofer: {
        Row: ChoferRow;
        Insert: ChoferInsert;
        Update: Partial<Omit<ChoferRow, 'id'>>;
        Relationships: [];
      };
      cliente: {
        Row: ClienteRow;
        Insert: ClienteInsert;
        Update: Partial<Omit<ClienteRow, 'id'>>;
        Relationships: [];
      };
      estacion_servicio: TablaEditable<EstacionIns & Control & { id: number; proveedor_id: number | null; ubicacion_id: number | null; es_tanque_propio: boolean }, EstacionIns>;
      proveedor: TablaEditable<ProveedorIns & Control & { id: number; identificador_fiscal: string | null; moneda_defecto: string | null }, ProveedorIns>;
      ubicacion: TablaEditable<Required<UbicacionIns> & Control & { id: number }, UbicacionIns>;
      semirremolque: TablaEditable<SemiRow, SemiIns>;
      semi_accesorio: TablaSoloLectura<Control & { id: number; semirremolque_id: number; tipo_accesorio_id: number; cantidad: number }>;
      genset: TablaEditable<Required<GensetIns> & Control & { id: number }, GensetIns>;
      linea: TablaEditable<Required<LineaIns> & Control & { id: number }, LineaIns>;
      transportista: TablaEditable<Required<TransportistaIns> & Control & { id: number }, TransportistaIns>;
      genset_instalacion: TablaSoloLectura<Control & { id: number; genset_id: number; semirremolque_id: number; desde: string; hasta: string | null }>;
      tanque_combustible: {
        Row: TanqueCombustibleRow;
        /** numero_tanque lo asigna la base si no se informa (migración 27). */
        Insert: {
          camion_id: number;
          tipo: string;
          descripcion?: string | null;
          numero_tanque?: number;
          capacidad_nominal_l: number;
          capacidad_util_l: number;
          tolerancia_sobrecarga_pct?: number;
          vigente_desde: string;
          vigente_hasta?: string | null;
        };
        /** Solo descripción, cierre de la vigencia y eliminación lógica: el resto es inmutable. */
        Update: {
          descripcion?: string | null;
          vigente_hasta?: string | null;
          eliminado_en?: string | null;
          version_fila?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      v_capacidad_camion: {
        Row: { camion_id: number | null; tanques: number | null; capacidad_util_l: number | null; capacidad_nominal_l: number | null };
        Relationships: [];
      };
      v_cliente: {
        Row: { [K in keyof ClienteRow]: ClienteRow[K] | null };
        Relationships: [];
      };
      v_chofer: {
        Row: { [K in keyof ChoferRow]: ChoferRow[K] | null };
        Relationships: [];
      };
      v_camion: {
        Row: { [K in keyof CamionRow]: CamionRow[K] | null };
        Relationships: [];
      };
    };
    Functions: {
      /** Migración 45: elimina un chofer (borrado si nunca se usó, ocultado si ya se usó). */
      fn_eliminar_chofer: { Args: { p_chofer: number; p_motivo: string }; Returns: string };
      /** Migración 46: chofer fijo del tractor desde una fecha (null = sin chofer). */
      fn_asignar_tractor: { Args: { p_camion: number; p_chofer: number | null; p_desde?: string | null }; Returns: undefined };
      fn_instalar_genset: { Args: { p_genset: number; p_semi: number; p_desde?: string | null }; Returns: number };
      fn_retirar_genset: { Args: { p_semi: number; p_hasta?: string | null }; Returns: number };
      fn_cambiar_capacidad_tanque: {
        Args: { p_tanque: number; p_desde: string; p_capacidad_nominal_l: number; p_capacidad_util_l: number };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  ops: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: {
      fn_pizarra: { Args: Record<string, never>; Returns: PizarraRow[] };
      // Migración 46: viajes de chofer
      fn_tractores: { Args: Record<string, never>; Returns: TractorRow[] };
      fn_viajes_chofer: { Args: { p_desde?: string | null; p_hasta?: string | null }; Returns: ViajeChoferRow[] };
      fn_viaje_chofer: { Args: { p_viaje: number }; Returns: Json };
      fn_iniciar_viaje_chofer: {
        Args: { p_camion: number; p_chofer?: number | null; p_carga?: number | null; p_items?: Json; p_observacion?: string | null };
        Returns: number;
      };
      fn_cambiar_chofer_viaje: { Args: { p_viaje: number; p_chofer: number }; Returns: undefined };
      fn_agregar_item_viaje: { Args: { p_viaje: number; p_servicio?: number | null; p_linea?: number | null }; Returns: number };
      fn_ajustar_item_viaje: {
        Args: { p_item: number; p_canon: number | null; p_moneda: string | null; p_km: number | null; p_motivo?: string | null };
        Returns: undefined;
      };
      fn_quitar_item_viaje: { Args: { p_item: number }; Returns: undefined };
      fn_preparar_cierre_combustible: { Args: { p_viaje: number }; Returns: number };
      fn_cerrar_viaje_chofer: { Args: { p_viaje: number; p_version: number }; Returns: undefined };
      fn_reabrir_viaje_chofer: { Args: { p_viaje: number; p_motivo: string }; Returns: undefined };
      fn_anular_viaje_chofer: { Args: { p_viaje: number; p_motivo: string }; Returns: undefined };
      /** Migración 55: cierra el viaje y aprueba su combustible en un paso. */
      fn_cerrar_y_aprobar: { Args: { p_viaje: number; p_version: number }; Returns: undefined };
      // Migración 51: km reales y costos del viaje
      fn_telemetria_viaje: { Args: { p_viaje: number }; Returns: Json };
      fn_costos_viaje: { Args: { p_viaje: number }; Returns: Json };
      fn_costos_viajes: { Args: { p_desde: string; p_hasta: string }; Returns: CostoViajeRow[] };
      fn_categorias_gasto_viaje: { Args: Record<string, never>; Returns: { codigo: string; nombre: string }[] };
      fn_agregar_gasto_viaje: {
        Args: { p_viaje: number; p_categoria: string; p_fecha: string; p_importe: number; p_moneda: string; p_documento?: string | null; p_observacion?: string | null };
        Returns: number;
      };
      fn_anular_gasto_viaje: { Args: { p_gasto: number; p_motivo: string }; Returns: undefined };
      fn_operaciones: { Args: { p_desde?: string | null; p_hasta?: string | null }; Returns: OperacionRow[] };
      fn_alta_operaciones: { Args: { p_datos: Json; p_cantidad: number }; Returns: number[] };
      fn_avanzar: {
        Args: { p_servicio: number; p_paso: string; p_ts?: string | null; p_odometro_km?: number | null; p_detalle?: string | null };
        Returns: undefined;
      };
      fn_sugerencia_cliente: { Args: { p_cliente: number }; Returns: Json };
      fn_guardar_operacion: { Args: { p_servicio: number | null; p_version: number | null; p_datos: Json }; Returns: number };
      fn_confirmar_operacion: { Args: { p_servicio: number }; Returns: undefined };
      fn_asignar_equipo: {
        Args: { p_servicio: number; p_semi: number; p_camion: number; p_chofer: number; p_observacion?: string | null };
        Returns: number;
      };
      fn_quitar_equipo: { Args: { p_servicio: number; p_motivo?: string | null }; Returns: undefined };
      fn_asignar_tercero: {
        Args: { p_servicio: number; p_transportista: number | null; p_chofer?: string | null; p_tractor?: string | null; p_semi?: string | null };
        Returns: undefined;
      };
      fn_registrar_hito: { Args: { p_servicio: number; p_tipo: string; p_ts?: string | null; p_detalle?: string | null }; Returns: number };
      fn_terminar_demora: { Args: { p_servicio: number; p_hasta?: string | null }; Returns: undefined };
      fn_anular_hito: { Args: { p_hito: number }; Returns: undefined };
      fn_cancelar_operacion: { Args: { p_servicio: number; p_motivo: string }; Returns: undefined };
      fn_pizarra_totales: {
        Args: Record<string, never>;
        Returns: { tipo_accesorio_id: number; nombre: string; sigla: string; orden: number; total: number; semis_con_dato: number }[];
      };
      fn_viajes_abiertos: {
        Args: Record<string, never>;
        Returns: {
          tramo_id: number;
          estado: string;
          paso: string;
          con_carga: boolean;
          semi_id: number | null;
          semi_patente: string | null;
          camion_id: number;
          tractor_patente: string;
          chofer_id: number;
          chofer_nombre: string;
          servicio_id: number | null;
          numero_servicio: string | null;
          cliente_id: number | null;
          cliente: string | null;
          producto: string | null;
          contenedor: string | null;
          tara_max_dias: number | null;
          origen_id: number;
          origen: string | null;
          destino_id: number;
          destino: string | null;
          fecha_carga: string | null;
          fecha_descarga: string | null;
          inicio_real: string | null;
          odometro_inicio_km: number | null;
          observacion: string | null;
          version_fila: number;
          numero_operacion: number | null;
          tipo_operacion: string | null;
        }[];
      };
      fn_asignar_viaje: {
        Args: {
          p_semi: number;
          p_camion: number;
          p_chofer: number;
          p_cliente: number;
          p_producto: string | null;
          p_origen: number;
          p_destino: number;
          p_fecha_carga: string;
          p_fecha_descarga?: string | null;
          p_contenedor?: string | null;
          p_tara_max_dias?: number | null;
          p_observacion?: string | null;
        };
        Returns: number;
      };
      fn_asignar_vuelta_vacia: {
        Args: { p_semi: number; p_camion: number; p_chofer: number; p_origen: number; p_destino: number; p_fecha: string; p_observacion?: string | null };
        Returns: number;
      };
      fn_modificar_viaje: {
        Args: {
          p_tramo: number;
          p_semi: number;
          p_camion: number;
          p_chofer: number;
          p_cliente: number | null;
          p_producto: string | null;
          p_origen: number;
          p_destino: number;
          p_fecha_carga: string;
          p_fecha_descarga?: string | null;
          p_contenedor?: string | null;
          p_tara_max_dias?: number | null;
          p_observacion?: string | null;
        };
        Returns: undefined;
      };
      fn_reprogramar_descarga: { Args: { p_tramo: number; p_fecha_descarga: string | null }; Returns: undefined };
      fn_cambiar_chofer: { Args: { p_tramo: number; p_chofer: number; p_desde?: string | null }; Returns: undefined };
      fn_cancelar_viaje: { Args: { p_tramo: number; p_motivo: string }; Returns: undefined };
      fn_iniciar_viaje: { Args: { p_tramo: number; p_inicio?: string | null; p_odometro_km?: number | null }; Returns: undefined };
      fn_iniciar_carga: { Args: { p_tramo: number; p_ubicacion?: number | null; p_inicio?: string | null; p_odometro_km?: number | null }; Returns: undefined };
      fn_terminar_carga: { Args: { p_tramo: number; p_fin?: string | null }; Returns: undefined };
      fn_iniciar_descarga: { Args: { p_tramo: number; p_ubicacion?: number | null; p_inicio?: string | null }; Returns: undefined };
      fn_terminar_descarga: { Args: { p_tramo: number; p_fin?: string | null; p_odometro_km?: number | null }; Returns: undefined };
      fn_terminar_viaje: { Args: { p_tramo: number; p_fin?: string | null; p_odometro_km?: number | null }; Returns: undefined };
      fn_guardar_semi_pizarra: {
        Args: { p_semi: number; p_version: number; p_ubicacion_playa: number | null; p_observacion: string | null; p_accesorios: Json };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  seg: {
    Tables: {
      usuario: TablaSoloLectura<{ id: number; nombre: string; activo: boolean }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      // Usuarios y roles (34), solo TI
      fn_usuarios: {
        Args: Record<string, never>;
        Returns: {
          id: number;
          nombre: string;
          email: string | null;
          activo: boolean;
          roles: string[];
          chofer_id: number | null;
          ultimo_ingreso: string | null;
          creado_en: string;
        }[];
      };
      fn_cuentas_sin_vincular: { Args: Record<string, never>; Returns: { email: string; creada_en: string }[] };
      fn_guardar_usuario: { Args: { p_email: string; p_nombre: string; p_roles: string[]; p_activo?: boolean }; Returns: number };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  aud: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: {
      fn_registrar_acceso_sensible: {
        Args: {
          p_tipo_acceso: string;
          p_esquema: string;
          p_tabla: string;
          p_fila_ids?: number[];
          p_cantidad?: number;
          p_motivo?: string;
          p_ip?: string;
        };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  fin: {
    Tables: {
      tipo_cambio: TablaEditable<TipoCambioIns & Control & { id: number; fuente: string | null }, TipoCambioIns>;
      importacion_cotizacion: TablaSoloLectura<{
        id: number;
        ejecutado_en: string;
        origen: string;
        desde: string;
        hasta: string;
        ok: boolean;
        insertadas: number;
        detalle: string | null;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      fn_actualizar_cotizaciones: { Args: { p_dias?: number; p_origen?: string; p_bcra?: Json }; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  tel: {
    Tables: {
      registro_api: TablaSoloLectura<{
        id: number;
        ejecutado_en: string;
        marca: string;
        operacion: string;
        url: string;
        formato: string | null;
        http_estado: number | null;
        ok: boolean;
        duracion_ms: number | null;
        detalle: string | null;
      }>;
    };
    Views: {
      v_flota_actual: Vista<{
        camion_id: number;
        codigo_interno: string;
        patente: string;
        vin: string;
        nombre_api: string;
        marca: string;
        ts: string;
        latitud: number;
        longitud: number;
        velocidad_kmh: number;
        rumbo_grados: number;
        odometro_km: number;
        nivel_combustible_pct: number;
        nivel_combustible_l: number;
        consumo_acumulado_l: number;
        horas_motor: number;
        motor_encendido: boolean;
        chofer_externo_id: string;
        chofer_id: number;
        calidad: number;
      }>;
      v_vehiculo_api: Vista<{
        marca: string;
        vin: string;
        nombre: string;
        modelo: string;
        camion_id: number;
        patente: string;
        codigo_interno: string;
        visto_en: string;
      }>;
    };
    Functions: {
      fn_importar_api_camiones: { Args: { p_marca?: string; p_origen?: string }; Returns: Json };
      fn_importar_todas: { Args: { p_origen?: string }; Returns: Json };
      // Migración 49: datos de los camiones, conducción y puntaje
      fn_inventario_campos: {
        Args: { p_dias?: number };
        Returns: { marca: string; seccion: string; campo: string; lecturas: number; total: number; pct: number; ejemplo: string | null }[];
      };
      fn_choferes_sin_enlace: {
        Args: { p_dias?: number };
        Returns: { chofer_externo_id: string; camion_id: number; patente: string; ultimo_ts: string; lecturas: number }[];
      };
      fn_programador_pct: { Args: { p_camion: number; p_desde: string; p_hasta: string }; Returns: number | null };
      fn_puntaje_choferes: { Args: { p_desde: string; p_hasta: string }; Returns: PuntajeChoferRow[] };
      fn_conduccion_chofer: { Args: { p_chofer: number; p_desde: string; p_hasta: string }; Returns: ConduccionDiariaRow[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  /** Migración 49: alertas (motor de anomalías). Solo funciones. */
  ana: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: {
      fn_bandeja_alertas: { Args: { p_vista?: string; p_desde?: string | null; p_hasta?: string | null }; Returns: AlertaRow[] };
      fn_alerta_detalle: { Args: { p_alerta: number }; Returns: Json };
      fn_reglas_vigentes: {
        Args: Record<string, never>;
        Returns: { codigo: string; nombre: string; descripcion: string | null; categoria: string; version: number; parametros: Json; activa: boolean; vigente_desde: string }[];
      };
      fn_tomar_alerta: { Args: { p_alerta: number }; Returns: undefined };
      fn_resolver_alerta: {
        Args: { p_alerta: number; p_decision: string; p_justificacion: string; p_chofer?: number | null; p_litros?: number | null };
        Returns: undefined;
      };
      fn_reabrir_alerta: { Args: { p_alerta: number; p_justificacion: string }; Returns: undefined };
      fn_comentar_alerta: { Args: { p_alerta: number; p_texto: string }; Returns: undefined };
      fn_cambiar_umbrales: { Args: { p_codigo: string; p_parametros: Json; p_activa?: boolean }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  fue: {
    Tables: {
      cierre_viaje: {
        Row: CierreViajeRow;
        Insert: { camion_id: number; carga_salida_id: number } & CierreViajeBorrador;
        Update: CierreViajeBorrador & { version_fila?: number; eliminado_en?: string | null };
        Relationships: [];
      };
      carga_combustible: {
        Row: CargaRow;
        Insert: CargaInsert;
        Update: { version_fila?: number };
        Relationships: [];
      };
      deposito_combustible: {
        Row: DepositoRow;
        Insert: Pick<DepositoRow, 'codigo' | 'nombre' | 'tipo' | 'tipo_combustible_id' | 'capacidad_l'> &
          Partial<Pick<DepositoRow, 'camion_id' | 'estacion_id' | 'parada_desde_id' | 'observaciones'>>;
        Update: Partial<Pick<DepositoRow, 'parada_hasta_id' | 'nombre' | 'capacidad_l' | 'estado' | 'observaciones' | 'version_fila'>>;
        Relationships: [];
      };
      movimiento_camion: TablaSoloLectura<MovimientoCamionRow>;
      documento_carga: TablaSoloLectura<DocumentoCargaRow>;
      movimiento_combustible: TablaSoloLectura<MovimientoDepositoRow>;
      control_saldo_deposito: TablaSoloLectura<ControlDepositoRow>;
      responsable_deposito: TablaEditable<ResponsableRow, ResponsableIns>;
      aprobacion_control_base: TablaSoloLectura<AprobacionBaseRow>;
      solicitud_correccion: TablaSoloLectura<SolicitudRow>;
    };
    Views: {
      v_cierre_viaje: Vista<CierreViajeRow>;
      v_carga_combustible: Vista<CargaRow>;
      v_viaje: Vista<ViajeRow>;
      v_saldo_deposito: Vista<SaldoDepositoRow>;
      v_control_base: Vista<ControlBaseRow>;
      v_movimiento_camion: Vista<MovimientoCamionRow & { revertido: boolean; solicitud_pendiente_id: number | null }>;
    };
    Functions: {
      fn_resultado_cierre: { Args: { p_id: number }; Returns: Json };
      /** Migración 53: lo que toma el sistema de la telemetría para el cierre, sin los ajustes manuales. */
      fn_telemetria_cierre: { Args: { p_cierre: number }; Returns: Json };
      fn_verificar_cierre: { Args: { p_id: number }; Returns: Json };
      fn_aprobar_cierre: { Args: { p_id: number; p_version: number }; Returns: CierreViajeRow };
      fn_anular_cierre: { Args: { p_id: number; p_version: number; p_motivo: string }; Returns: CierreViajeRow };
      fn_solicitar_anulacion_carga: { Args: { p_carga: number; p_motivo: string }; Returns: number };
      /** Migración 44: elimina del todo una carga cargada por error; devuelve los archivos del ticket. */
      fn_eliminar_carga: { Args: { p_carga: number; p_motivo: string }; Returns: string[] };
      /** Migración 47: corrige una carga en el lugar (p_datos con los nombres de columna). */
      fn_editar_carga: { Args: { p_carga: number; p_version: number; p_datos: Json; p_motivo?: string | null }; Returns: undefined };
      // Migración 48: combustible de los gensets
      fn_gensets_combustible: { Args: Record<string, never>; Returns: GensetCombustibleRow[] };
      fn_genset_ficha: { Args: { p_genset: number }; Returns: Json };
      fn_registrar_genset: { Args: { p_datos: Json }; Returns: number };
      fn_eliminar_registro_genset: { Args: { p_registro: number; p_motivo: string }; Returns: undefined };
      fn_cerrar_genset: {
        Args: { p_inicio: number; p_chofer?: number | null; p_motivo_chofer?: string | null; p_ok_tolerancia?: boolean; p_observacion?: string | null };
        Returns: number;
      };
      fn_anular_cierre_genset: { Args: { p_cierre: number; p_motivo: string }; Returns: undefined };
      // Migración 50: ralentí permitido por mes
      fn_ralenti_mes: { Args: { p_mes: string }; Returns: RalentiMesRow[] };
      fn_precio_promedio_mes: { Args: { p_mes: string }; Returns: number | null };
      fn_cerrar_ralenti: {
        Args: { p_chofer: number; p_mes: string; p_justificado_l?: number; p_motivo_justificado?: string | null; p_precio_litro?: number | null; p_observacion?: string | null };
        Returns: number;
      };
      fn_anular_cierre_ralenti: { Args: { p_cierre: number; p_motivo: string }; Returns: undefined };
      /** Migración 47: odómetro de la telemetría más cercano (±6 h): { odometro_km, ts } o null. */
      fn_odometro_telemetria: { Args: { p_camion: number; p_ts: string }; Returns: Json };
      fn_resolver_solicitud: { Args: { p_id: number; p_aprobar: boolean; p_motivo?: string | null }; Returns: SolicitudRow };
      fn_retirar_solicitud: { Args: { p_id: number }; Returns: SolicitudRow };
      fn_descargar_combustible: {
        Args: {
          p_camion: number;
          p_litros: number;
          p_fecha_hora: string;
          p_deposito_base?: number | null;
          p_camion_destino?: number | null;
          p_chofer_id?: number | null;
          p_motivo?: string | null;
        };
        Returns: string;
      };
      fn_movimiento_camion_con_motivo: {
        Args: {
          p_camion: number;
          p_categoria: string;
          p_litros: number;
          p_fecha_hora: string;
          p_motivo: string;
          p_evidencia?: string | null;
          p_chofer_id?: number | null;
        };
        Returns: number;
      };
      fn_resolver_movimiento_camion: { Args: { p_id: number; p_aprobar: boolean; p_motivo?: string | null }; Returns: MovimientoCamionRow };
      fn_solicitar_reverso_camion: { Args: { p_movimiento: number; p_motivo: string }; Returns: number };
      // Base Mendoza (24 y 30)
      fn_registrar_control_base: {
        Args: {
          p_deposito: number;
          p_fecha_hora: string;
          p_litros: number;
          p_metodo: string;
          p_observaciones?: string | null;
          p_reemplaza?: number | null;
          p_motivo_reemplazo?: string | null;
        };
        Returns: number;
      };
      fn_traspasar_responsable: {
        Args: {
          p_deposito: number;
          p_usuario_entrante: number;
          p_fecha_hora: string;
          p_litros: number;
          p_metodo: string;
          p_observaciones?: string | null;
        };
        Returns: number;
      };
      fn_movimiento_con_motivo: {
        Args: {
          p_deposito: number;
          p_categoria: string;
          p_litros: number;
          p_fecha_hora: string;
          p_motivo: string;
          p_evidencia?: string | null;
          p_chofer_id?: number | null;
        };
        Returns: number;
      };
      fn_resolver_movimiento: { Args: { p_movimiento: number; p_aprobar: boolean; p_motivo?: string | null }; Returns: MovimientoDepositoRow };
      fn_resultado_control_base: {
        Args: { p_control: number; p_justificacion?: string | null; p_no_imputable_l?: number; p_no_imputable_motivo?: string | null };
        Returns: Json;
      };
      fn_aprobar_control_base: {
        Args: { p_control: number; p_justificacion?: string | null; p_no_imputable_l?: number; p_no_imputable_motivo?: string | null };
        Returns: AprobacionBaseRow;
      };
      fn_anular_aprobacion_base: { Args: { p_id: number; p_motivo: string }; Returns: AprobacionBaseRow };
      fn_verificar_control_base: { Args: { p_id: number }; Returns: Json };
      // Operación diaria (34)
      fn_validar_carga: { Args: { p_carga: number; p_motivo?: string | null }; Returns: CargaRow };
      fn_agregar_documento_carga: {
        Args: { p_carga: number; p_tipo: string; p_numero: string; p_fecha: string; p_archivo: string | null; p_hash: string | null; p_emisor?: number | null };
        Returns: number;
      };
      fn_quitar_documento_carga: { Args: { p_documento: number }; Returns: undefined };
      // Control del consumo (36)
      fn_conciliacion_viajes: {
        Args: { p_desde: string; p_hasta: string; p_camion?: number | null };
        Returns: {
          camion_id: number;
          patente: string;
          carga_salida_id: number;
          salida_ts: string;
          llegada_ts: string;
          situacion: string;
          cierre_id: number | null;
          cierre_numero: string | null;
          cargado_l: number | null;
          consumo_motor_l: number | null;
          fuente_consumo: string | null;
          diferencia_l: number | null;
          tolerancia_l: number | null;
          km: number | null;
          fuente_km: string | null;
          l_100km_cargado: number | null;
          l_100km_motor: number | null;
          pendientes: number;
        }[];
      };
      fn_consumo_camiones: {
        Args: { p_desde: string; p_hasta: string };
        Returns: {
          camion_id: number;
          patente: string;
          codigo_interno: string;
          cargas: number;
          litros_cargados: number;
          importe_base: number | null;
          moneda_base: string | null;
          costo_litro: number | null;
          km: number | null;
          fuente_km: string | null;
          consumo_motor_l: number | null;
          l_100km_motor: number | null;
          l_100km_cargado: number | null;
          costo_km: number | null;
          ultima_lectura: string | null;
        }[];
      };
      fn_mis_pendientes: {
        Args: Record<string, never>;
        Returns: {
          grupo: string;
          tipo: string;
          ref_id: number | null;
          fecha: string | null;
          titulo: string;
          detalle: string | null;
          ruta: string;
          pantalla: string;
          cantidad: number;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
