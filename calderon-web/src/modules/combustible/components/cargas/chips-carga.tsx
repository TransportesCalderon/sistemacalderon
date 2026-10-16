import { ETIQUETA_DESTINO, ETIQUETA_SITUACION_CARGA, type CargaResumen, type RolEnViaje, type SituacionCarga } from '../../domain/carga.types';
import { Chip, type Tono } from '../comun/ui';

const TONO_SITUACION: Record<SituacionCarga, Tono> = { normal: 'neutro', anulacion_pendiente: 'alerta', anulada: 'error' };

export function SituacionCargaChip({ situacion }: { situacion: SituacionCarga }) {
  return <Chip tono={TONO_SITUACION[situacion]}>{ETIQUETA_SITUACION_CARGA[situacion]}</Chip>;
}

/** Si la frontera inicia o termina un viaje (según fue.v_viaje). */
export function RolViajeChips({ rol }: { rol: RolEnViaje }) {
  if (!rol.inicia && !rol.termina) return <Chip tono="neutro">Sin viaje</Chip>;
  return (
    <>
      {rol.termina && <Chip tono="marca">Termina viaje</Chip>}
      {rol.inicia && <Chip tono="marca">Inicia viaje</Chip>}
    </>
  );
}

export function DestinoCarga({ carga }: { carga: Pick<CargaResumen, 'destino' | 'depositoCodigo' | 'cargaPrincipalId'> }) {
  return (
    <span className="whitespace-nowrap">
      {ETIQUETA_DESTINO[carga.destino]}
      {carga.depositoCodigo && <span className="ml-1 font-mono text-xs text-tinta-suave">{carga.depositoCodigo}</span>}
      {carga.cargaPrincipalId && <span className="ml-1 text-xs text-tinta-suave">· parada #{carga.cargaPrincipalId}</span>}
    </span>
  );
}
