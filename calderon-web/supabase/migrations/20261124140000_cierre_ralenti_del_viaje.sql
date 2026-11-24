-- =====================================================================================
-- Migración 302 · Cierres: ralentí solo del viaje
-- =====================================================================================
-- Resultado de la 301 (24/11/2026): las horas de motor ya salen del viaje (CV-000055: 1,04 h en un viaje de 1,73 h;
-- CV-000053: 9,34 h en 18,85 h), pero el ralentí seguía siendo el del día completo (0,83 h y 1,74 h): estos camiones
-- no mandan el contador de tiempo detenido en las lecturas.
-- Ahora el ralentí sale, en este orden:
--   1) del contador del motor (tiempo detenido), si viene;
--   2) de las lecturas del viaje: el tiempo con el camión detenido (0 km/h) y el motor en marcha (más de 300 rpm),
--      contando hasta 15 minutos entre una lectura y la siguiente;
--   3) si no, el del día repartido según las horas de motor del viaje.
-- Nunca más que las horas de motor. No cambia km ni litros. No toca web.version_base.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fue.fn_consumo_camion_sin_horas_viaje(jsonb, jsonb, jsonb, jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 301';
    END IF;
END $v$;

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
               FROM a, b WHERE b.ts > a.ts),
       -- Migración 302: detenido con el motor en marcha, según las lecturas del viaje
       s AS (SELECT x.ts, x.velocidad_kmh, x.rpm, lead(x.ts) OVER (ORDER BY x.ts) AS sig
               FROM tel.lectura x
              WHERE x.camion_id = p_camion AND x.calidad > 0 AND x.ts BETWEEN p_desde AND p_hasta),
       e AS (SELECT count(*) FILTER (WHERE rpm IS NOT NULL) AS con_rpm,
                    sum(extract(epoch FROM least(sig, p_hasta) - ts)) FILTER (
                        WHERE velocidad_kmh = 0 AND rpm > 300 AND sig IS NOT NULL AND sig - ts <= interval '15 minutes') / 3600.0 AS hr
               FROM s)
    SELECT CASE WHEN d.hm >= 0 AND d.hm <= d.dur + 0.25
                THEN jsonb_build_object('horas_motor', round(d.hm, 2),
                                        'horas_ralenti', CASE WHEN x.hr IS NOT NULL THEN round(least(x.hr, d.hm), 2) END,   -- sin dato: null
                                        'ralenti_de', CASE WHEN d.hr IS NOT NULL THEN 'contador' WHEN e.con_rpm >= 10 THEN 'lecturas' END) END
      FROM d, e, LATERAL (SELECT coalesce(d.hr, CASE WHEN e.con_rpm >= 10 THEN coalesce(e.hr, 0) END) AS hr) x
$f$;

CREATE OR REPLACE FUNCTION fue.fn_consumo_camion(p_hechos jsonb, p_telemetria jsonb, p_contexto jsonb, p_manual jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r jsonb := fue.fn_consumo_camion_sin_horas_viaje(p_hechos, p_telemetria, p_contexto, p_manual);
        v_s timestamptz := (p_hechos ->> 'salida_ts')::timestamptz; v_l timestamptz := (p_hechos ->> 'llegada_ts')::timestamptz;
        v_cam bigint; v_dur numeric; h jsonb; v_hm numeric; v_hr numeric;
        v_dia_hm numeric := (r ->> 'horas_motor')::numeric; v_dia_hr numeric := (r ->> 'horas_ralenti')::numeric;
BEGIN
    IF v_s IS NULL OR v_l IS NULL OR v_l <= v_s THEN RETURN r; END IF;
    SELECT k.camion_id INTO v_cam FROM fue.carga_combustible k WHERE k.id = (p_hechos ->> 'carga_salida_id')::bigint;
    v_dur := round(extract(epoch FROM v_l - v_s) / 3600.0, 2);
    h := CASE WHEN v_cam IS NOT NULL THEN tel.fn_horas_motor_entre(v_cam, v_s, v_l) END;
    v_hm := coalesce((h ->> 'horas_motor')::numeric, CASE WHEN v_dia_hm IS NOT NULL THEN least(v_dia_hm, v_dur) END);
    -- Ralentí: contador o lecturas del viaje; si no, el del día repartido según las horas de motor del viaje (Migración 302)
    v_hr := coalesce((h ->> 'horas_ralenti')::numeric,
                     CASE WHEN v_dia_hm > 0 AND v_hm IS NOT NULL THEN round(v_dia_hr * least(1, v_hm / v_dia_hm), 2) END,
                     CASE WHEN v_dia_hr IS NOT NULL THEN least(v_dia_hr, v_dur) END);
    IF v_hr IS NOT NULL THEN v_hr := least(v_hr, coalesce(v_hm, v_dur)); END IF;   -- least() ignora los null
    RETURN r || jsonb_build_object('horas_motor', v_hm, 'horas_ralenti', v_hr);
END $f$;

COMMIT;

-- Resultado: los cierres 53 y 55 con las horas que darían ahora
SELECT 'migración 302 aplicada' AS que, cv.numero,
       round(extract(epoch FROM cv.llegada_ts - cv.salida_ts) / 3600.0, 2) AS horas_de_viaje,
       fue.fn_telemetria_cierre(cv.id) -> 'horas_motor' AS horas_motor_ahora,
       fue.fn_telemetria_cierre(cv.id) -> 'horas_ralenti' AS ralenti_ahora,
       tel.fn_horas_motor_entre(cv.camion_id, cv.salida_ts, cv.llegada_ts) ->> 'ralenti_de' AS ralenti_sale_de
  FROM fue.cierre_viaje cv
 WHERE cv.numero IN ('CV-000053', 'CV-000055') AND cv.eliminado_en IS NULL
 ORDER BY cv.numero;
