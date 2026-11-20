-- =====================================================================================
-- Migración 295 · Cuánto le falta para llenar a los camiones sin sensor de tanque ni odómetro
-- =====================================================================================
-- Caso (20/11/2026): OC-000033 (SXXV17) → «no se sabe cuántos km hizo desde el último lleno». Los camiones sin el contador
-- del motor (Mercedes, Scania) se estiman por km × consumo desde el último tanque lleno, pero los km salían solo del
-- odómetro (telemetría o foto del tablero). Sin eso, no había número.
--
--   · fue.fn_estimar_llenado (reemplazada; igual que antes con el contador del motor):
--       km desde el último lleno: 1) odómetro; 2) NUEVO: recorrido del GPS (suma de los tramos entre posiciones, sin los
--       saltos imposibles de más de 150 km/h); 3) NUEVO: km de los viajes cerrados o en curso desde ese lleno.
--       consumo: su promedio de cierres (180 días) → NUEVO: fue.fn_rendimiento_camion (tablero, últimos cierres o el
--       consumo de referencia de la ficha del camión) → 35 L/100 km.
--     Resta lo cargado después del lleno y no pasa de la capacidad. El texto dice de dónde sale cada número.
--   · Las cargas pendientes de Finanzas se recalculan con esto.
-- web.version_base = 295.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 294 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 294. La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
END $v$;

-- Km recorridos según el GPS entre dos momentos (null si no hay posiciones suficientes)
CREATE OR REPLACE FUNCTION tel.fn_km_gps(p_camion bigint, p_desde timestamptz, p_hasta timestamptz DEFAULT now())
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH p AS (
        SELECT l.ts, extensions.ST_SetSRID(extensions.ST_MakePoint(l.longitud, l.latitud), 4326)::extensions.geography AS g
          FROM tel.lectura l
         WHERE l.camion_id = p_camion AND l.ts > p_desde AND l.ts <= p_hasta AND l.latitud IS NOT NULL AND l.longitud IS NOT NULL
           AND l.latitud BETWEEN -60 AND 10 AND l.longitud BETWEEN -90 AND -40
    ), t AS (
        SELECT extensions.ST_Distance(g, lag(g) OVER w) / 1000 AS km, extract(epoch FROM ts - lag(ts) OVER w) / 3600 AS h
          FROM p WINDOW w AS (ORDER BY ts)
    )
    SELECT CASE WHEN count(*) FILTER (WHERE km IS NOT NULL) >= 2
                THEN round(sum(km) FILTER (WHERE km IS NOT NULL AND (h > 0 AND km / h <= 150 OR km < 0.5))::numeric, 1) END
      FROM t
$f$;
REVOKE ALL ON FUNCTION tel.fn_km_gps(bigint, timestamptz, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fue.fn_estimar_llenado(p_camion bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    c jsonb := fue.fn_combustible_actual(p_camion); k fue.carga_combustible%ROWTYPE; v_cap numeric; v_odo0 numeric; v_odo1 numeric;
    v_km numeric; v_fuente_km text; v_cons numeric; v_fuente text; v_desp numeric; v_falta numeric;
BEGIN
    -- 1 · Con el contador del motor (como antes)
    IF (c ->> 'litros') IS NOT NULL AND (c ->> 'capacidad_l') IS NOT NULL THEN
        RETURN jsonb_build_object('litros', greatest(round((c ->> 'capacidad_l')::numeric - (c ->> 'litros')::numeric), 0), 'metodo', 'motor',
            'texto', format('según el motor: tiene ≈ %s de %s L', tel.fn_num_ar(round((c ->> 'litros')::numeric)), tel.fn_num_ar(round((c ->> 'capacidad_l')::numeric))));
    END IF;

    -- 2 · Por km desde el último lleno
    SELECT * INTO k FROM fue.carga_combustible
     WHERE camion_id = p_camion AND eliminado_en IS NULL AND coalesce(estado_validacion, '') <> 'anulada'
       AND tanque_lleno AND tanque_reefer_id IS NULL AND deposito_id IS NULL AND fecha_hora <= now()
     ORDER BY fecha_hora DESC LIMIT 1;
    IF k.id IS NULL THEN RETURN jsonb_build_object('litros', NULL, 'texto', 'no hay un llenado a tanque lleno registrado'); END IF;
    v_cap := coalesce((fue.fn_capacidad_camion(p_camion, now()) ->> 'tanques_l')::numeric, (fue.fn_capacidad_camion(p_camion, now()) ->> 'litros')::numeric);
    IF v_cap IS NULL THEN RETURN jsonb_build_object('litros', NULL, 'texto', 'el camión no tiene sus tanques cargados (Flota › Camiones y equipos › Tanques)'); END IF;

    -- Km: odómetro → GPS → viajes
    v_odo0 := coalesce(k.odometro_km, tel.fn_odometro_en(p_camion, k.fecha_hora, k.id));
    v_odo1 := mae.fn_odometro(p_camion, now());
    IF v_odo0 IS NOT NULL AND v_odo1 IS NOT NULL AND v_odo1 >= v_odo0 THEN
        v_km := v_odo1 - v_odo0; v_fuente_km := 'odómetro';
    END IF;
    IF v_km IS NULL THEN
        v_km := tel.fn_km_gps(p_camion, k.fecha_hora, now());
        IF v_km IS NOT NULL THEN v_fuente_km := 'recorrido del GPS'; END IF;
    END IF;
    IF v_km IS NULL THEN
        BEGIN
            SELECT round(sum(it.km)) INTO v_km
              FROM ops.viaje_chofer v JOIN ops.viaje_chofer_item it ON it.viaje_id = v.id AND it.eliminado_en IS NULL
             WHERE v.camion_id = p_camion AND v.eliminado_en IS NULL AND v.estado <> 'anulado' AND v.salida_ts >= k.fecha_hora - interval '6 hours'
               AND it.km > 0;
        EXCEPTION WHEN OTHERS THEN v_km := NULL;
        END;
        IF v_km IS NOT NULL THEN v_fuente_km := 'km de los viajes'; END IF;
    END IF;
    IF v_km IS NULL THEN
        RETURN jsonb_build_object('litros', NULL, 'texto', 'no se sabe cuántos km hizo desde el último lleno (sin odómetro, sin GPS y sin viajes cargados)');
    END IF;

    -- Consumo: sus cierres → rendimiento del camión (tablero, cierres o referencia de la ficha) → parámetro
    SELECT round(avg(v.consumo_l_100km), 1) INTO v_cons FROM fue.cierre_viaje v
     WHERE v.camion_id = p_camion AND v.estado = 'aprobado' AND v.eliminado_en IS NULL
       AND v.consumo_l_100km BETWEEN 15 AND 70 AND v.llegada_ts > now() - interval '180 days';
    v_fuente := 'su promedio';
    IF v_cons IS NULL THEN
        v_cons := fue.fn_rendimiento_camion(p_camion);
        IF v_cons IS NOT NULL AND (v_cons < 15 OR v_cons > 70) THEN v_cons := NULL; END IF;
        v_fuente := 'consumo del camión';
    END IF;
    IF v_cons IS NULL THEN
        v_cons := ref.fn_parametro_num('fue.orden_carga_consumo_defecto_l_100km', 35);
        v_fuente := 'consumo general, sin dato del camión';
    END IF;
    SELECT coalesce(sum(x.litros), 0) INTO v_desp FROM fue.carga_combustible x
     WHERE x.camion_id = p_camion AND x.eliminado_en IS NULL AND coalesce(x.estado_validacion, '') <> 'anulada'
       AND x.tanque_reefer_id IS NULL AND x.deposito_id IS NULL AND x.fecha_hora > k.fecha_hora AND x.id <> k.id;
    v_falta := least(v_cap, greatest(0, round(v_km * v_cons / 100 - v_desp + coalesce(k.faltante_lleno_l, 0))));
    RETURN jsonb_build_object('litros', v_falta, 'metodo', 'km', 'km', round(v_km), 'fuente_km', v_fuente_km, 'l_100km', v_cons,
        'texto', format('estimado: %s km desde el lleno del %s (%s) a %s L/100 km (%s)%s', tel.fn_num_ar(round(v_km)),
                        to_char(k.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM'), v_fuente_km, tel.fn_num_ar(v_cons), v_fuente,
                        CASE WHEN v_desp > 0 THEN ', menos ' || tel.fn_num_ar(round(v_desp)) || ' L cargados después' ELSE '' END));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('litros', NULL, 'texto', 'no se pudo estimar');
END $function$;

-- Las pendientes: litros de nuevo (sin pasar el máximo)
UPDATE fin.pago_carga g
   SET litros = CASE WHEN x.mx IS NOT NULL THEN least(x.lit, x.mx) ELSE x.lit END,
       importe = round(CASE WHEN x.mx IS NOT NULL THEN least(x.lit, x.mx) ELSE x.lit END * g.precio, 0)
  FROM (SELECT g2.id, fin.fn_litros_orden_para_pago(g2.orden_id) AS lit, coalesce(g2.litros_max, fin.fn_litros_max_orden(g2.orden_id)) AS mx
          FROM fin.pago_carga g2 WHERE g2.estado = 'pendiente') x
 WHERE g.id = x.id AND x.lit IS NOT NULL;

UPDATE ref.parametro SET valor = '295' WHERE codigo = 'web.version_base' AND valor::text::int < 295;

COMMIT;

SELECT 'migración 295 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(o.numero || ' ' || m.patente || ': ' || coalesce(g.litros::text || ' L · $' || g.importe::text, 'sin litros')
                          || ' — ' || coalesce(fue.fn_estimar_llenado(o.camion_id) ->> 'texto', ''), ' | ')
          FROM fin.pago_carga g JOIN fue.orden_carga o ON o.id = g.orden_id JOIN mae.camion m ON m.id = o.camion_id
         WHERE g.estado = 'pendiente') AS pendientes;
