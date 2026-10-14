/**
 * Tipos de la base de datos.
 *
 * ESTE ARCHIVO SE REGENERA con `npm run gen:types` (Supabase CLI) a partir del proyecto
 * desplegado. Esta versión inicial es un subconjunto escrito a mano con lo que usan el
 * núcleo (sesión y topbar) y los módulos Flota > Camiones y Flota > Choferes, con la misma forma que produce
 * la CLI. Al regenerar se reemplaza completo; no editar a mano.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TablaSoloLectura<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
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
      parametro: TablaSoloLectura<{
        codigo: string;
        valor: Json;
        descripcion: string;
        eliminado_en: string | null;
      }>;
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
      ubicacion: TablaSoloLectura<{
        id: number;
        codigo: string;
        nombre: string;
        tipo: string;
        pais: string;
        region: string | null;
        eliminado_en: string | null;
      }>;
    };
    Views: {
      v_chofer: {
        Row: { [K in keyof ChoferRow]: ChoferRow[K] | null };
        Relationships: [];
      };
      v_camion: {
        Row: { [K in keyof CamionRow]: CamionRow[K] | null };
        Relationships: [];
      };
    };
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
};
