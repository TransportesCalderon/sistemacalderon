-- Iris 10 · Consumo de un camión entre dos horas («¿cuántos litros gastó el SHXB49 desde las 12:17 hasta ahora?»)
-- Pedido del 17/11/2026: Iris contestó que solo podía dar el consumo por día completo. El dato sí está:
-- la telemetría guarda, en cada lectura, el contador de litros del motor y el odómetro. NO cambia web.version_base.
-- Necesita Iris 09. Se puede correr más de una vez.

BEGIN;

DO $do$
BEGIN
    IF pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%«tipo_cambio»%' THEN
        RAISE EXCEPTION 'Primero hay que correr iris_09_tipo_de_cambio.sql (y las anteriores)';
    END IF;
END $do$;

-- Convierte lo que manda Iris («12:17», «2026-11-17 12:17», «2026-11-17T12:17») a un momento, en hora de Mendoza
CREATE OR REPLACE FUNCTION ia.fn_momento_local(p_texto text, p_defecto timestamptz)
 RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE s text := btrim(coalesce(p_texto, '')); v_zona constant text := 'America/Argentina/Mendoza';
BEGIN
    IF s = '' OR lower(s) IN ('ahora', 'hoy') THEN RETURN p_defecto; END IF;
    IF s ~ '^\d{1,2}[:.]\d{2}$' THEN
        RETURN ((now() AT TIME ZONE v_zona)::date + replace(s, '.', ':')::time) AT TIME ZONE v_zona;
    ELSIF s ~ '^\d{4}-\d{2}-\d{2}$' THEN
        RETURN (s::date)::timestamp AT TIME ZONE v_zona;
    ELSIF s ~ '^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(:\d{2})?$' THEN
        RETURN replace(s, 'T', ' ')::timestamp AT TIME ZONE v_zona;
    END IF;
    RAISE EXCEPTION 'No entiendo la hora «%»: mandala como HH:MM (de hoy) o AAAA-MM-DD HH:MM', s USING ERRCODE = '22023';
END $function$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_consumo_horas(p_entrada jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    e jsonb := coalesce(p_entrada, '{}'); v_zona constant text := 'America/Argentina/Mendoza';
    v_pat text := upper(regexp_replace(coalesce(e ->> 'patente', ''), '[^A-Za-z0-9]', '', 'g'));
    v_cam bigint; v_patente text; v_desde timestamptz; v_hasta timestamptz;
    b record; u record; t record; v_aviso text := NULL;
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    IF v_pat = '' THEN RAISE EXCEPTION 'Falta la patente del camión' USING ERRCODE = '22023'; END IF;
    SELECT c.id, c.patente INTO v_cam, v_patente FROM mae.camion c
     WHERE c.eliminado_en IS NULL AND (upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = v_pat OR upper(c.codigo_interno) = v_pat)
     ORDER BY (upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = v_pat) DESC LIMIT 1;
    IF v_cam IS NULL THEN RAISE EXCEPTION 'No encuentro el camión «%»', e ->> 'patente' USING ERRCODE = 'P0002'; END IF;
    v_hasta := least(ia.fn_momento_local(e ->> 'hasta', now()), now());
    v_desde := ia.fn_momento_local(e ->> 'desde', NULL);
    IF v_desde IS NULL THEN RAISE EXCEPTION 'Falta desde qué hora (HH:MM de hoy, o AAAA-MM-DD HH:MM)' USING ERRCODE = '22023'; END IF;
    IF v_desde >= v_hasta THEN RAISE EXCEPTION 'La hora de inicio tiene que ser anterior a la de fin' USING ERRCODE = '22023'; END IF;
    IF v_hasta - v_desde > interval '31 days' THEN RAISE EXCEPTION 'El período no puede pasar de 31 días: para más, usar «consumo_camiones»' USING ERRCODE = '22023'; END IF;

    -- Punto de partida: la última lectura del contador antes de la hora pedida (hasta 3 h antes); si no hay, la primera de después
    SELECT l.ts, l.consumo_acumulado_l AS c, l.odometro_km AS o, l.nivel_combustible_l AS n INTO b FROM tel.lectura l
     WHERE l.camion_id = v_cam AND l.calidad > 0 AND l.consumo_acumulado_l IS NOT NULL AND l.ts <= v_desde AND l.ts > v_desde - interval '3 hours'
     ORDER BY l.ts DESC LIMIT 1;
    IF NOT FOUND THEN
        SELECT l.ts, l.consumo_acumulado_l AS c, l.odometro_km AS o, l.nivel_combustible_l AS n INTO b FROM tel.lectura l
         WHERE l.camion_id = v_cam AND l.calidad > 0 AND l.consumo_acumulado_l IS NOT NULL AND l.ts > v_desde AND l.ts <= v_hasta
         ORDER BY l.ts LIMIT 1;
        IF FOUND THEN v_aviso := 'No hay lectura justo antes de la hora pedida: la cuenta arranca en la primera lectura de después.'; END IF;
    END IF;
    IF b.ts IS NULL THEN
        RETURN jsonb_build_object('camion', v_patente, 'sin_datos', true,
            'aviso', 'El camión no mandó lecturas del contador de combustible en ese rato (puede estar apagado o sin señal).',
            'desde', to_char(v_desde AT TIME ZONE v_zona, 'DD/MM/YYYY HH24:MI'), 'hasta', to_char(v_hasta AT TIME ZONE v_zona, 'DD/MM/YYYY HH24:MI'));
    END IF;

    -- Suma tramo a tramo (así un salto raro del contador no arruina la cuenta)
    SELECT round(coalesce(sum(x.c - x.pc) FILTER (WHERE x.c - x.pc BETWEEN 0 AND 400), 0), 1) AS litros,
           round(coalesce(sum(x.o - x.po) FILTER (WHERE x.o - x.po BETWEEN 0 AND 800), 0), 1) AS km,
           count(*) AS lecturas, max(x.ts) AS ultima, max(x.v) AS vel_max,
           round(coalesce(sum(extract(epoch FROM x.ts - x.pts)) FILTER (WHERE x.enc AND x.ts - x.pts <= interval '30 minutes'), 0) / 3600.0, 1) AS horas_motor
      INTO t
      FROM (SELECT l.ts, l.consumo_acumulado_l AS c, l.odometro_km AS o, l.velocidad_kmh AS v, coalesce(l.motor_encendido, false) AS enc,
                   lag(l.ts) OVER w AS pts, lag(l.consumo_acumulado_l) OVER w AS pc, lag(l.odometro_km) OVER w AS po
              FROM tel.lectura l
             WHERE l.camion_id = v_cam AND l.calidad > 0 AND l.ts >= b.ts AND l.ts <= v_hasta
               AND (l.consumo_acumulado_l IS NOT NULL OR l.odometro_km IS NOT NULL)
            WINDOW w AS (ORDER BY l.ts)) x
     WHERE x.pts IS NOT NULL;
    SELECT l.nivel_combustible_l AS n, l.nivel_combustible_pct AS p INTO u FROM tel.lectura l
     WHERE l.camion_id = v_cam AND l.calidad > 0 AND l.ts >= b.ts AND l.ts <= v_hasta AND (l.nivel_combustible_l IS NOT NULL OR l.nivel_combustible_pct IS NOT NULL)
     ORDER BY l.ts DESC LIMIT 1;

    RETURN jsonb_build_object(
        'camion', v_patente,
        'pedido_desde', to_char(v_desde AT TIME ZONE v_zona, 'DD/MM/YYYY HH24:MI'),
        'pedido_hasta', to_char(v_hasta AT TIME ZONE v_zona, 'DD/MM/YYYY HH24:MI'),
        'primera_lectura_usada', to_char(b.ts AT TIME ZONE v_zona, 'DD/MM/YYYY HH24:MI'),
        'ultima_lectura_usada', to_char(coalesce(t.ultima, b.ts) AT TIME ZONE v_zona, 'DD/MM/YYYY HH24:MI'),
        'litros_usados_por_el_motor', t.litros,
        'km_recorridos', t.km,
        'litros_cada_100_km', CASE WHEN t.km >= 5 THEN round(t.litros / t.km * 100, 1) END,
        'horas_con_motor_encendido', t.horas_motor,
        'velocidad_maxima_kmh', round(t.vel_max),
        'litros_en_el_tanque_al_inicio', round(b.n), 'litros_en_el_tanque_al_final', round(u.n), 'tanque_al_final_pct', round(u.p),
        'lecturas', t.lecturas,
        'aviso', coalesce(v_aviso, CASE WHEN t.lecturas = 0 THEN 'Solo hay una lectura en ese rato: todavía no se puede medir el consumo.'
                                        WHEN t.km < 5 AND t.litros > 0 THEN 'Casi no se movió: lo gastado es motor en marcha parado (ralentí).' END),
        'de_donde_sale', 'Contador de litros del motor y odómetro que el camión manda por telemetría, lectura a lectura. Es lo mismo que muestra el tablero del camión; no incluye lo que se cargó en estaciones.');
END $function$;
REVOKE ALL ON FUNCTION ia.fn_lectura_consumo_horas(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_consumo_horas(jsonb) TO tc_app, tc_admin, tc_lectura;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('consumo_entre_horas', 35,
        'Cuántos litros gastó el motor de UN camión entre dos momentos (con hora y minuto), cuántos km hizo, su rendimiento, horas de motor y cuánto le queda en el tanque. '
        || 'Usala SIEMPRE que pregunten por el consumo «desde las 12:17», «entre las 8 y las 14», «en las últimas 3 horas», «desde ayer a la tarde hasta ahora» o cualquier franja que no sea de días completos. '
        || 'Las horas son de Mendoza. Para días completos o toda la flota seguí usando «consumo_camiones».',
        'Consumo entre horas', 'Mirando el contador de combustible del camión…', '/telemetria/datos',
        '{"type": "object", "required": ["patente", "desde"], "properties": {
            "patente": {"type": "string", "description": "Patente o código interno del tractor (ej. SHXB49)."},
            "desde": {"type": "string", "description": "Desde cuándo, hora de Mendoza: HH:MM si es de hoy (ej. 12:17) o AAAA-MM-DD HH:MM."},
            "hasta": {"type": "string", "description": "Hasta cuándo, mismo formato. Si no se manda: ahora."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- El despacho de lecturas conoce la nueva
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%consumo_entre_horas%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''consumo_entre_horas'')');
    v_def := replace(v_def, v_a2, 'WHEN ''consumo_entre_horas'' THEN ia.fn_lectura_consumo_horas(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- Regla 27
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := '«mejor dicho»), vale lo último que dijo.''';
    v_nuevo constant text := $t$
        || ' 27) Si preguntan cuánto consumió o cuántos km hizo un camión entre dos horas, desde una hora «hasta ahora» o en las últimas horas, usá «consumo_entre_horas» (horas de Mendoza). '
        || 'Nunca contestes que solo hay datos por día completo: el contador del motor se lee a cada momento. Respondé primero los litros, después km y rendimiento, y aclará desde qué lectura arranca la cuenta si no coincide con la hora pedida.'$t$;
BEGIN
    IF v_def LIKE '%«consumo_entre_horas»%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 09): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

COMMIT;
