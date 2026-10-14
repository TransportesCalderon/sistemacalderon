/**
 * Tipos de la base de datos.
 *
 * ESTE ARCHIVO SE REGENERA con `npm run gen:types` (Supabase CLI) a partir del proyecto
 * desplegado. Esta versión inicial es un subconjunto escrito a mano con lo que usan el
 * núcleo (sesión y topbar) y el módulo Flota > Camiones, con la misma forma que produce
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
    };
    Views: {
      v_camion: {
        Row: { [K in keyof CamionRow]: CamionRow[K] | null };
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
