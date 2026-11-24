-- =====================================================================================
-- Migración 301 · Cierres: horas de motor y de ralentí solo del viaje
-- =====================================================================================
-- Caso (24/11/2026): CV-000055 (SRYR55, 20/11 09:51 → 11:35, 1 h 44 min) mostraba 5,6 h de motor. El cierre sumaba
-- las horas de motor y de ralentí de los DÍAS COMPLETOS que tocaba el viaje, no las del viaje.
--   · Ahora salen de los contadores del motor (horas totales y tiempo detenido) entre la primera y la última lectura del
--     viaje, si esas lecturas están a menos de 30 minutos de la salida y de la llegada.
--   · Si no hay lecturas así, queda la cuenta por días, pero nunca más que lo que duró el viaje (y el ralentí nunca más
--     que las horas de motor).
-- No cambia los km ni los litros. Los cierres ya aprobados conservan lo que guardaron; los nuevos y los que se recalculen
-- salen bien. No toca web.version_base.
-- =====================================================================================
BEGIN;

DO $r$
BEGIN
    IF to_regprocedure('fue.fn_consumo_camion_sin_horas_viaje(jsonb, jsonb, jsonb, jsonb)') IS NULL THEN
        ALTER FUNCTION fue.fn_consumo_camion(jsonb, jsonb, jsonb, jsonb) RENAME TO fn_consumo_camion_sin_horas_viaje;
    END IF;
END $r$;

-- Horas de motor y de ralentí entre dos momentos, por los contadores del motor (null si no hay lecturas cerca de las puntas)
CREATE OR REPLACE FUNCTION tel.fn_horas_motor_entre(p_camion bigint, p_desde timestamptz, p_hasta timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH l AS (
        SELECT x.ts, x.horas_motor, x.ralenti_s FROM tel.lectura x
         WHERE x.camion_id = p_camion AND x.calidad > 0 AND x.ts BETWEEN p_desde - interval '30 minutes' AND p_hasta + interval '30 minutes'
           AND x.horas_motor IS NOT NULL
    ), a AS (SELECT * FROM l ORDER BY abs(extract(epoch FROM ts - p_desde)) LIMIT 1),
       b AS (SELECT * FROM l ORDER BY abs(extract(epoch FROM ts - p_hasta)) LIMIT 1),
       d AS (SELECT b.horas_motor - a.horas_motor AS hm,
                    CASE WHEN b.ralenti_s >= a.ralenti_s THEN (b.ralenti_s - a.ralenti_s) / 3600.0 END AS hr,
                    extract(epoch FROM b.ts - a.ts) / 3600.0 AS dur
               FROM a, b WHERE b.ts > a.ts)
    SELECT CASE WHEN d.hm >= 0 AND d.hm <= d.dur + 0.25
                THEN jsonb_build_object('horas_motor', round(d.hm, 2),
                                        'horas_ralenti', CASE WHEN d.hr IS NOT NULL THEN round(least(d.hr, d.hm), 2) END) END
      FROM d
$f$;
REVOKE ALL ON FUNCTION tel.fn_horas_motor_entre(bigint, timestamptz, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fue.fn_consumo_camion(p_hechos jsonb, p_telemetria jsonb, p_contexto jsonb, p_manual jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r jsonb := fue.fn_consumo_camion_sin_horas_viaje(p_hechos, p_telemetria, p_contexto, p_manual);
        v_s timestamptz := (p_hechos ->> 'salida_ts')::timestamptz; v_l timestamptz := (p_hechos ->> 'llegada_ts')::timestamptz;
        v_cam bigint; v_dur numeric; h jsonb; v_hm numeric; v_hr numeric;
BEGIN
    IF v_s IS NULL OR v_l IS NULL OR v_l <= v_s THEN RETURN r; END IF;
    SELECT k.camion_id INTO v_cam FROM fue.carga_combustible k WHERE k.id = (p_hechos ->> 'carga_salida_id')::bigint;
    v_dur := round(extract(epoch FROM v_l - v_s) / 3600.0, 2);
    h := CASE WHEN v_cam IS NOT NULL THEN tel.fn_horas_motor_entre(v_cam, v_s, v_l) END;
    IF h IS NOT NULL THEN
        v_hm := (h ->> 'horas_motor')::numeric;
        v_hr := coalesce((h ->> 'horas_ralenti')::numeric, least((r ->> 'horas_ralenti')::numeric, v_hm));
    ELSE
        v_hm := least((r ->> 'horas_motor')::numeric, v_dur);
        v_hr := least((r ->> 'horas_ralenti')::numeric, v_dur, coalesce(v_hm, v_dur));
    END IF;
    RETURN r || jsonb_build_object('horas_motor', v_hm, 'horas_ralenti', v_hr);
END $f$;
REVOKE ALL ON FUNCTION fue.fn_consumo_camion(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
DO $g$
DECLARE r record;
BEGIN
    FOR r IN SELECT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'fue' AND a.routine_name = 'fn_consumo_camion_sin_horas_viaje' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fue.fn_consumo_camion(jsonb, jsonb, jsonb, jsonb) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION tel.fn_horas_motor_entre(bigint, timestamptz, timestamptz) TO %I', r.grantee);
    END LOOP;
END $g$;

COMMIT;

-- Resultado: lo que guardaron los cierres 53 y 55 y lo que darían ahora
SELECT 'migración 301 aplicada' AS que, cv.numero,
       round(extract(epoch FROM cv.llegada_ts - cv.salida_ts) / 3600.0, 2) AS horas_de_viaje,
       cv.horas_motor AS horas_motor_guardadas, cv.horas_ralenti AS ralenti_guardado,
       fue.fn_telemetria_cierre(cv.id) -> 'horas_motor' AS horas_motor_ahora,
       fue.fn_telemetria_cierre(cv.id) -> 'horas_ralenti' AS ralenti_ahora
  FROM fue.cierre_viaje cv
 WHERE cv.numero IN ('CV-000053', 'CV-000055') AND cv.eliminado_en IS NULL
 ORDER BY cv.numero;
