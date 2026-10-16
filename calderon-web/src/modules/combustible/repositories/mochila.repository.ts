import { ConflictoVersion, RepoError, type Db, type Versionado } from '@/shared/repository/types';
import type { Database } from '@/shared/types/db';
import type { CamionId, CargaId, ChoferId, ControlSaldoId, DepositoId, FechaISO, UsoMochilaId } from '@/shared/types/dominio';
import { num } from '../domain/comun';
import type { ControlAlta } from '../domain/mochila.schemas';
import { esRolControl, type CamionMochila, type ControlSaldo, type Mochila, type UsoMochila } from '../domain/mochila.types';
import { catalogoCombustibleRepository } from './catalogo-combustible.repository';

/**
 * Repositorio de mochilas y controles:
 *  - fue.uso_mochila (alta y cierre por paradas frontera);
 *  - fue.deposito_combustible tipo 'mochila' (puesta en marcha y cierre de vigencia: tc_admin);
 *  - fue.control_saldo_deposito (alta y reemplazo; la conciliación la hace la base);
 *  - fue.v_saldo_deposito (saldo de libro y último control).
 * Las vigencias, superposiciones y fronteras las valida la base.
 */
type FilaUso = Database['fue']['Tables']['uso_mochila']['Row'];
type FilaDeposito = Database['fue']['Tables']['deposito_combustible']['Row'];
type FilaControl = Database['fue']['Tables']['control_saldo_deposito']['Row'];

const COLS_USO = 'id, camion_id, parada_desde_id, parada_hasta_id, desde_ts, hasta_ts, version_fila';
const COLS_DEPOSITO =
  'id, codigo, nombre, camion_id, tipo_combustible_id, capacidad_l, estado, parada_desde_id, parada_hasta_id, vigente_desde, vigente_hasta, version_fila';
const COLS_CONTROL =
  'id, deposito_id, fecha_hora, litros, fuente, metodo, rol, origen, carga_parada_id, chofer_id, declarante_tipo, medido_por, estado, reemplaza_id, motivo_reemplazo, saldo_libro_l, diferencia_l, observaciones, creado_en';

const aUso = (f: Pick<FilaUso, 'id' | 'camion_id' | 'parada_desde_id' | 'parada_hasta_id' | 'desde_ts' | 'hasta_ts' | 'version_fila'>): UsoMochila => ({
  id: f.id as UsoMochilaId,
  camionId: f.camion_id as CamionId,
  paradaDesdeId: f.parada_desde_id as CargaId,
  paradaHastaId: f.parada_hasta_id as CargaId | null,
  desdeTs: f.desde_ts as FechaISO,
  hastaTs: f.hasta_ts as FechaISO | null,
  versionFila: f.version_fila,
});

type FilaMochila = Pick<
  FilaDeposito,
  | 'id'
  | 'codigo'
  | 'nombre'
  | 'camion_id'
  | 'tipo_combustible_id'
  | 'capacidad_l'
  | 'estado'
  | 'parada_desde_id'
  | 'parada_hasta_id'
  | 'vigente_desde'
  | 'vigente_hasta'
  | 'version_fila'
>;

type Saldo = { saldo_l: number | null; ultimo_control_en: string | null; ultimo_control_l: number | null };

const aMochila = (f: FilaMochila, s: Saldo | undefined): Mochila => ({
  id: f.id as DepositoId,
  codigo: f.codigo,
  nombre: f.nombre,
  camionId: f.camion_id as CamionId,
  tipoCombustibleId: f.tipo_combustible_id,
  capacidadL: Number(f.capacidad_l),
  estado: f.estado,
  paradaDesdeId: f.parada_desde_id as CargaId | null,
  paradaHastaId: f.parada_hasta_id as CargaId | null,
  vigenteDesde: f.vigente_desde as FechaISO | null,
  vigenteHasta: f.vigente_hasta as FechaISO | null,
  saldoL: num(s?.saldo_l),
  ultimoControlEn: (s?.ultimo_control_en ?? null) as FechaISO | null,
  ultimoControlL: num(s?.ultimo_control_l),
  versionFila: f.version_fila,
});

const aControl = (f: Omit<FilaControl, 'actualizado_en' | 'actualizado_por' | 'eliminado_en' | 'eliminado_por' | 'version_fila' | 'creado_por' | 'declarante_usuario_id'>): ControlSaldo => ({
  id: f.id as ControlSaldoId,
  depositoId: f.deposito_id as DepositoId,
  fechaHora: f.fecha_hora as FechaISO,
  litros: Number(f.litros),
  fuente: f.fuente,
  metodo: f.metodo,
  rol: esRolControl(f.rol) ? f.rol : 'intermedio',
  origen: f.origen,
  cargaParadaId: f.carga_parada_id as CargaId | null,
  choferId: f.chofer_id as ChoferId | null,
  declaranteTipo: f.declarante_tipo,
  medidoPor: f.medido_por,
  estado: f.estado,
  reemplazaId: f.reemplaza_id as ControlSaldoId | null,
  motivoReemplazo: f.motivo_reemplazo,
  saldoLibroL: Number(f.saldo_libro_l),
  diferenciaL: Number(f.diferencia_l),
  observaciones: f.observaciones,
  creadoEn: f.creado_en as FechaISO,
});

async function saldos(db: Db, ids: number[]): Promise<Map<number, Saldo>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db.schema('fue').from('v_saldo_deposito').select('deposito_id, saldo_l, ultimo_control_en, ultimo_control_l').in('deposito_id', ids);
  if (error) throw new RepoError(error);
  return new Map(data.map((s) => [s.deposito_id as number, s]));
}

export const mochilaRepository = (db: Db) => ({
  /** Camiones activos con su uso de mochila y su mochila vigentes (vigencia abierta). */
  async camiones(): Promise<CamionMochila[]> {
    const [camiones, usos, mochilas] = await Promise.all([
      catalogoCombustibleRepository(db).camiones(),
      db.schema('fue').from('uso_mochila').select(COLS_USO).is('eliminado_en', null).is('hasta_ts', null),
      db.schema('fue').from('deposito_combustible').select(COLS_DEPOSITO).eq('tipo', 'mochila').is('eliminado_en', null).is('vigente_hasta', null),
    ]);
    if (usos.error) throw new RepoError(usos.error);
    if (mochilas.error) throw new RepoError(mochilas.error);
    const s = await saldos(
      db,
      mochilas.data.map((m) => m.id),
    );
    const uso = new Map(usos.data.map((u) => [u.camion_id, aUso(u)]));
    const mochila = new Map(mochilas.data.map((m) => [m.camion_id as number, aMochila(m, s.get(m.id))]));
    return camiones.map((c) => ({
      camionId: c.id,
      codigoInterno: c.codigoInterno,
      patente: c.patente,
      usoVigente: uso.get(c.id) ?? null,
      mochila: mochila.get(c.id) ?? null,
    }));
  },

  async usos(camionId: number): Promise<UsoMochila[]> {
    const { data, error } = await db.schema('fue').from('uso_mochila').select(COLS_USO).eq('camion_id', camionId).is('eliminado_en', null).order('desde_ts', { ascending: false });
    if (error) throw new RepoError(error);
    return data.map(aUso);
  },

  /** Historial de mochilas del camión (vigentes y cerradas). */
  async mochilas(camionId: number): Promise<Mochila[]> {
    const { data, error } = await db
      .schema('fue')
      .from('deposito_combustible')
      .select(COLS_DEPOSITO)
      .eq('tipo', 'mochila')
      .eq('camion_id', camionId)
      .is('eliminado_en', null)
      .order('vigente_desde', { ascending: false });
    if (error) throw new RepoError(error);
    const s = await saldos(
      db,
      data.map((m) => m.id),
    );
    return data.map((m) => aMochila(m, s.get(m.id)));
  },

  async controles(depositoId: number): Promise<ControlSaldo[]> {
    const { data, error } = await db
      .schema('fue')
      .from('control_saldo_deposito')
      .select(COLS_CONTROL)
      .eq('deposito_id', depositoId)
      .is('eliminado_en', null)
      .order('fecha_hora', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);
    if (error) throw new RepoError(error);
    return data.map(aControl);
  },

  async crearUso(camionId: number, paradaDesdeId: number): Promise<UsoMochilaId> {
    const { data, error } = await db.schema('fue').from('uso_mochila').insert({ camion_id: camionId, parada_desde_id: paradaDesdeId }).select('id').single();
    if (error) throw new RepoError(error);
    return data.id as UsoMochilaId;
  },

  async cerrarUso({ id, versionFila }: Versionado, paradaHastaId: number): Promise<void> {
    const { data, error } = await db
      .schema('fue')
      .from('uso_mochila')
      .update({ parada_hasta_id: paradaHastaId, version_fila: versionFila })
      .eq('id', id)
      .eq('version_fila', versionFila)
      .select('id')
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('fue.uso_mochila', id);
  },

  async crearMochila(d: { camionId: number; tipoCombustibleId: number; paradaDesdeId: number; codigo: string; nombre: string; capacidadL: number; observaciones: string | null }): Promise<DepositoId> {
    const { data, error } = await db
      .schema('fue')
      .from('deposito_combustible')
      .insert({
        codigo: d.codigo,
        nombre: d.nombre,
        tipo: 'mochila',
        camion_id: d.camionId,
        tipo_combustible_id: d.tipoCombustibleId,
        capacidad_l: d.capacidadL,
        parada_desde_id: d.paradaDesdeId,
        observaciones: d.observaciones,
      })
      .select('id')
      .single();
    if (error) throw new RepoError(error);
    return data.id as DepositoId;
  },

  /** Mochila del camión que empieza en esa parada (para retomar una puesta en marcha a medias). */
  async mochilaDesde(camionId: number, paradaDesdeId: number): Promise<DepositoId | null> {
    const { data, error } = await db
      .schema('fue')
      .from('deposito_combustible')
      .select('id')
      .eq('tipo', 'mochila')
      .eq('camion_id', camionId)
      .eq('parada_desde_id', paradaDesdeId)
      .is('eliminado_en', null)
      .maybeSingle();
    if (error) throw new RepoError(error);
    return (data?.id as DepositoId | undefined) ?? null;
  },

  async tieneControlInicial(depositoId: number): Promise<boolean> {
    const { count, error } = await db
      .schema('fue')
      .from('control_saldo_deposito')
      .select('id', { count: 'exact', head: true })
      .eq('deposito_id', depositoId)
      .eq('rol', 'inicial')
      .eq('estado', 'vigente');
    if (error) throw new RepoError(error);
    return (count ?? 0) > 0;
  },

  async cerrarVigencia({ id, versionFila }: Versionado, paradaHastaId: number): Promise<void> {
    const { data, error } = await db
      .schema('fue')
      .from('deposito_combustible')
      .update({ parada_hasta_id: paradaHastaId, version_fila: versionFila })
      .eq('id', id)
      .eq('version_fila', versionFila)
      .select('id')
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('fue.deposito_combustible', id);
  },

  async crearControl(d: ControlAlta & { declaranteUsuarioId: number | null }): Promise<ControlSaldoId> {
    const { data, error } = await db
      .schema('fue')
      .from('control_saldo_deposito')
      .insert({
        deposito_id: d.depositoId,
        // En un control de frontera o inicial la base fija la hora (parada − 1 µs): se envía la de la parada como referencia.
        fecha_hora: d.fechaHora ?? new Date(0).toISOString(),
        litros: d.litros,
        fuente: d.fuente,
        metodo: d.fuente === 'medicion' ? d.metodo : null,
        rol: d.rol,
        origen: d.rol === 'inicial' ? 'puesta_en_marcha' : 'cierre',
        carga_parada_id: d.cargaParadaId,
        declarante_tipo: d.fuente === 'declaracion' ? d.declaranteTipo : null,
        declarante_usuario_id: d.fuente === 'declaracion' && d.declaranteTipo !== 'chofer' ? d.declaranteUsuarioId : null,
        chofer_id: d.choferId,
        observaciones: d.observaciones,
        reemplaza_id: d.reemplazaId,
        motivo_reemplazo: d.motivoReemplazo,
      })
      .select('id')
      .single();
    if (error) throw new RepoError(error);
    return data.id as ControlSaldoId;
  },
});
