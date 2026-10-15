-- =============================================================================
-- Transportes Calderón — 25 · Ajuste menor de la migración 24
-- -----------------------------------------------------------------------------
-- Para bases donde se aplicó la primera versión del archivo 06 (migración 24).
-- 1. fue.v_saldo_deposito: fue.base_frecuencia_max_horas = 0 significa "sin
--    frecuencia mínima" (no marca el control como vencido).
-- 2. Descripciones de los parámetros: valores PROVISIONALES, pendientes de
--    confirmación operativa (sección 19). No cambia ningún valor.
-- Sin datos, sin cambios de tablas. Se puede ejecutar más de una vez.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

CREATE OR REPLACE VIEW fue.v_saldo_deposito WITH (security_invoker = true) AS
SELECT d.id AS deposito_id, d.codigo, d.nombre, d.tipo, d.camion_id, d.estacion_id, d.tipo_combustible_id,
       d.capacidad_l, d.estado, d.vigente_desde, d.vigente_hasta,
       coalesce(m.saldo_l, 0) AS saldo_l, m.ultimo_movimiento,
       c.id AS ultimo_control_id, c.fecha_hora AS ultimo_control_en, c.litros AS ultimo_control_l,
       c.fuente AS ultimo_control_fuente, c.rol AS ultimo_control_rol,
       (d.tipo = 'tanque_base' AND ref.fn_parametro_num('fue.base_frecuencia_max_horas', 24) > 0
        AND (c.id IS NULL OR c.fecha_hora < now()
             - make_interval(hours => ref.fn_parametro_num('fue.base_frecuencia_max_horas', 24)::integer))) AS control_vencido,
       (SELECT count(*) FROM fue.movimiento_combustible x WHERE x.deposito_id = d.id AND x.estado_aprobacion = 'pendiente') AS movimientos_pendientes,
       r.usuario_id AS responsable_usuario_id
  FROM fue.deposito_combustible d
  LEFT JOIN LATERAL (SELECT sum(litros) AS saldo_l, max(fecha_hora) AS ultimo_movimiento
                       FROM fue.movimiento_combustible WHERE deposito_id = d.id AND eliminado_en IS NULL) m ON true
  LEFT JOIN LATERAL (SELECT id, fecha_hora, litros, fuente, rol FROM fue.control_saldo_deposito
                      WHERE deposito_id = d.id AND estado = 'vigente' AND eliminado_en IS NULL ORDER BY fecha_hora DESC LIMIT 1) c ON true
  LEFT JOIN LATERAL (SELECT usuario_id FROM fue.responsable_deposito
                      WHERE deposito_id = d.id AND eliminado_en IS NULL AND desde_ts < now() AND (hasta_ts IS NULL OR hasta_ts >= now())
                      LIMIT 1) r ON true
 WHERE d.eliminado_en IS NULL;
COMMENT ON VIEW fue.v_saldo_deposito IS 'Depósitos con saldo de libro, vigencia, último control, control vencido (base, si fue.base_frecuencia_max_horas > 0), movimientos con motivo pendientes y responsable actual.';

UPDATE ref.parametro SET descripcion = 'PROVISIONAL (pendiente de confirmación operativa; recalibrar con historial real). Cierre de viaje: tolerancia (L) de la diferencia del tractor. Por encima, en más o en menos, exige justificación.'
 WHERE codigo = 'fue.cierre_tolerancia_tractor_l' AND descripcion IS DISTINCT FROM 'PROVISIONAL (pendiente de confirmación operativa; recalibrar con historial real). Cierre de viaje: tolerancia (L) de la diferencia del tractor. Por encima, en más o en menos, exige justificación.';
UPDATE ref.parametro SET descripcion = 'PROVISIONAL (pendiente de confirmación operativa; recalibrar con historial real). Cierre de viaje: tolerancia (L) de la diferencia de la mochila. Por encima, en más o en menos, exige justificación.'
 WHERE codigo = 'fue.cierre_tolerancia_mochila_l' AND descripcion IS DISTINCT FROM 'PROVISIONAL (pendiente de confirmación operativa; recalibrar con historial real). Cierre de viaje: tolerancia (L) de la diferencia de la mochila. Por encima, en más o en menos, exige justificación.';
UPDATE ref.parametro SET descripcion = 'PROVISIONAL (pendiente de confirmación operativa). Relevo de chofer dentro de un viaje: "avisar" (aviso; el cierre tiene un solo chofer responsable) o "bloquear" (el relevo exige marcar frontera).'
 WHERE codigo = 'fue.cierre_relevo_politica' AND descripcion IS DISTINCT FROM 'PROVISIONAL (pendiente de confirmación operativa). Relevo de chofer dentro de un viaje: "avisar" (aviso; el cierre tiene un solo chofer responsable) o "bloquear" (el relevo exige marcar frontera).';
UPDATE ref.parametro SET descripcion = 'PROVISIONAL (pendiente de confirmación operativa; recalibrar con historial real). Base Mendoza: tolerancia (L) de la diferencia de cada segmento entre controles.'
 WHERE codigo = 'fue.base_tolerancia_l' AND descripcion IS DISTINCT FROM 'PROVISIONAL (pendiente de confirmación operativa; recalibrar con historial real). Base Mendoza: tolerancia (L) de la diferencia de cada segmento entre controles.';
UPDATE ref.parametro SET descripcion = 'PROVISIONAL (pendiente de confirmación operativa). Base Mendoza: horas máximas entre dos controles; después, el saldo figura con control vencido (solo aviso, no bloquea). 0 = sin vencimiento por tiempo.'
 WHERE codigo = 'fue.base_frecuencia_max_horas' AND descripcion IS DISTINCT FROM 'PROVISIONAL (pendiente de confirmación operativa). Base Mendoza: horas máximas entre dos controles; después, el saldo figura con control vencido (solo aviso, no bloquea). 0 = sin vencimiento por tiempo.';
UPDATE ref.parametro SET descripcion = 'PROVISIONAL (pendiente de confirmación operativa). Base Mendoza: un cambio de responsable exige un control en el instante del traspaso. Con un responsable fijo no tiene efecto.'
 WHERE codigo = 'fue.base_traspaso_obligatorio' AND descripcion IS DISTINCT FROM 'PROVISIONAL (pendiente de confirmación operativa). Base Mendoza: un cambio de responsable exige un control en el instante del traspaso. Con un responsable fijo no tiene efecto.';

COMMIT;
NOTIFY pgrst, 'reload schema';
