/**
 * Tipos de la base de datos.
 *
 * ESTE ARCHIVO SE REGENERA con `npm run gen:types` (Supabase CLI) a partir del proyecto
 * desplegado. Esta versión inicial es un subconjunto escrito a mano con solo lo que usa
 * el núcleo (sesión y topbar). Al regenerar se reemplaza completo; no editar a mano.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TablaSoloLectura<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
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
};
