-- =====================================================================================
-- Iris 17 · Corrección del control de Gerencia con los datos reales (consulta 330, 20/11/2026)
-- =====================================================================================
-- 1 · «Viajes con diferencia sin decidir» contaba cierres ya aprobados (22 de 38). No corresponde: la base no deja
--     aprobar un cierre con litros a cargo del chofer sin decidir. Ahora cuenta solo borradores con litros a cargo
--     y sin decisión, y los litros son los que quedarían a cargo.
-- 2 · Nuevo dato: alertas de combustible CONFIRMADAS sin descuento (pasó, no tiene explicación y no se descuenta).
--     En 60 días hubo 19 «carga que no aparece en el tanque» y 5 «carga sobre lo sugerido» confirmadas, con un solo
--     descuento (90 L). La consulta 331 mostró que casi todas eran cargas repartidas en el tanque secundario y la
--     mochila (el sensor solo ve el tanque principal), mal cerradas como «confirmada». Va a «para_decidir_hoy» con ese aviso.
-- Reemplazo con ancla sobre la definición viva de ia.fn_lectura_control_gerencia (iris_14). Se puede correr dos veces.
-- No cambia datos. Numeración propia de Iris: no toca web.version_base.
-- =====================================================================================
BEGIN;

DO $do$
DECLARE
    v_def text;
    a1 CONSTANT text := $a$'fuera_de_tolerancia_sin_decidir', count(*) FILTER (WHERE cv.estado <> 'anulado' AND abs(coalesce(cv.diferencia_l, 0)) > coalesce(cv.tolerancia_l, 0) AND cv.decision_diferencia IS NULL),$a$;
    n1 CONSTANT text := $a$'fuera_de_tolerancia_sin_decidir', count(*) FILTER (WHERE cv.estado = 'borrador' AND coalesce(cv.imputable_total_l, 0) > 0 AND cv.decision_diferencia IS NULL),$a$;
    a2 CONSTANT text := $a$'litros_sin_decidir', round(coalesce(sum(abs(cv.diferencia_l)) FILTER (WHERE cv.estado <> 'anulado' AND abs(coalesce(cv.diferencia_l, 0)) > coalesce(cv.tolerancia_l, 0) AND cv.decision_diferencia IS NULL), 0)),$a$;
    n2 CONSTANT text := $a$'litros_sin_decidir', round(coalesce(sum(cv.imputable_total_l) FILTER (WHERE cv.estado = 'borrador' AND coalesce(cv.imputable_total_l, 0) > 0 AND cv.decision_diferencia IS NULL), 0)),$a$;
    a3 CONSTANT text := $a$'litros_a_descontar_decididos',$a$;
    n3 CONSTANT text := $a$'combustible_confirmado_sin_descuento', count(*) FILTER (WHERE a.cerrada_en >= v_desde AND a.resolucion = 'confirmada'
                     AND a.regla_id IN (SELECT rr.id FROM ana.regla_anomalia rr WHERE rr.codigo IN ('DETENIDO_CON_DESCENSO', 'CARGA_VS_TELEMETRIA', 'CARGA_SOBRE_SUGERIDO', 'EXCESO_CAPACIDAD'))),
                 'litros_confirmados_sin_descuento', round(coalesce(sum(a.valor_observado) FILTER (WHERE a.cerrada_en >= v_desde AND a.resolucion = 'confirmada' AND a.unidad = 'l'
                     AND a.regla_id IN (SELECT rr.id FROM ana.regla_anomalia rr WHERE rr.codigo IN ('DETENIDO_CON_DESCENSO', 'CARGA_VS_TELEMETRIA', 'CARGA_SOBRE_SUGERIDO', 'EXCESO_CAPACIDAD'))), 0)),
                 'litros_a_descontar_decididos',$a$;
    a4 CONSTANT text := $a$n := coalesce((v_al ->> 'vencidas')::int, 0);$a$;
    n4 CONSTANT text := $a$n := coalesce((v_al ->> 'combustible_confirmado_sin_descuento')::int, 0); l := coalesce((v_al ->> 'litros_confirmados_sin_descuento')::numeric, 0);
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('Combustible: %s alerta(s) de combustible cerradas como «confirmada» sin descuento (%s L). Si la carga fue al tanque secundario o a la mochila, van como «justificada»; si no tienen explicación, falta decidir si se descuenta.', n, l)); END IF;
    n := coalesce((v_al ->> 'vencidas')::int, 0);$a$;
BEGIN
    IF to_regprocedure('ia.fn_lectura_control_gerencia(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que aplicar iris_14 (control de Gerencia)';
    END IF;
    v_def := pg_get_functiondef('ia.fn_lectura_control_gerencia(jsonb)'::regprocedure);
    IF v_def LIKE '%combustible_confirmado_sin_descuento%' THEN RETURN; END IF;   -- ya está aplicada
    IF position(a1 IN v_def) = 0 OR position(a2 IN v_def) = 0 OR position(a3 IN v_def) = 0 OR position(a4 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_lectura_control_gerencia no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := replace(replace(replace(replace(v_def, a1, n1), a2, n2), a3, n3), a4, n4);
    EXECUTE v_def;
END $do$;

COMMIT;

SELECT 'iris 17 aplicada' AS que;
