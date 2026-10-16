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
      ubicacion: TablaSoloLectura<{
        id: number;
        codigo: string;
        nombre: string;
        tipo: string;
        pais: string;
        region: string | null;
        eliminado_en: string | null;
      }>;
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
      fn_cambiar_capacidad_tanque: {
        Args: { p_tanque: number; p_desde: string; p_capacidad_nominal_l: number; p_capacidad_util_l: number };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  seg: {
    Tables: {
      usuario: TablaSoloLectura<{ id: number; nombre: string }>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
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
      solicitud_correccion: TablaSoloLectura<SolicitudRow>;
    };
    Views: {
      v_cierre_viaje: Vista<CierreViajeRow>;
      v_carga_combustible: Vista<CargaRow>;
      v_viaje: Vista<ViajeRow>;
      v_saldo_deposito: Vista<SaldoDepositoRow>;
      v_movimiento_camion: Vista<MovimientoCamionRow & { revertido: boolean; solicitud_pendiente_id: number | null }>;
    };
    Functions: {
      fn_resultado_cierre: { Args: { p_id: number }; Returns: Json };
      fn_verificar_cierre: { Args: { p_id: number }; Returns: Json };
      fn_aprobar_cierre: { Args: { p_id: number; p_version: number }; Returns: CierreViajeRow };
      fn_anular_cierre: { Args: { p_id: number; p_version: number; p_motivo: string }; Returns: CierreViajeRow };
      fn_solicitar_anulacion_carga: { Args: { p_carga: number; p_motivo: string }; Returns: number };
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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
