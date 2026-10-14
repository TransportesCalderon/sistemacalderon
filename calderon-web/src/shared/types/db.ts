import type { Database } from './database.generated';

export type { Database, Json } from './database.generated';

/** Esquemas del modelo presentes en los tipos generados. */
export type Esquema = keyof Database;

export type Fila<
  S extends Esquema,
  T extends keyof Database[S]['Tables'],
> = Database[S]['Tables'][T] extends { Row: infer R } ? R : never;
