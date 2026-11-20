-- =====================================================================================
-- Iris 13 · Comparar el consumo semana a semana, y no quedarse sin responder
-- =====================================================================================
-- Caso (20/11/2026): «Dame una comparativa de consumo entre las últimas semanas y dime si hemos
-- mejorado» → «Iris no dio una respuesta: probá preguntar de otra forma».
--
--   1 · Lectura nueva «consumo_semanal»: el consumo de la flota y de cada camión, semana por semana
--       (lunes a domingo, hora de Mendoza), con la comparación ya hecha. Antes Iris tenía que pedir
--       «consumo_camiones» una vez por semana y armar la cuenta sola.
--   2 · Más lugar para responder: el tope de la respuesta pasa de 1.500 a ia.asistente_max_tokens (4.000).
--   3 · Si el modelo devuelve una respuesta vacía, la base lo pide una vez más antes de dar error,
--       y guarda por qué falló (columna «diagnostico») para poder mirarlo después.
--   4 · Regla 29 en las instrucciones.
--
-- Numeración propia de Iris: no toca web.version_base. No cambia datos.
-- =====================================================================================
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_proyeccion(jsonb)') IS NULL
       OR pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%«cuotas_vencidas_sin_pagar»%' THEN
        RAISE EXCEPTION 'Primero hay que aplicar iris_12 (proyección de caja)';
    END IF;
END $do$;

-- ------------------------------------------------------------------ 1 · consumo semana a semana
CREATE OR REPLACE FUNCTION ia.fn_lectura_consumo_semanal(p_entrada jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_hoy   date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
    v_lunes date := date_trunc('week', v_hoy::timestamp)::date;
    v_n     int := least(greatest(coalesce(nullif(p_entrada ->> 'semanas', '')::int, 6), 2), 12);
    v_min_km CONSTANT numeric := 200;      -- menos que esto en la semana: el rendimiento del camión no dice nada
    i int; v_d date; v_h date;
    v_sem jsonb := '[]'; v_cam jsonb := '{}'; s jsonb; r record;
    u jsonb; a jsonb; v_prom_km numeric := 0; v_prom_l numeric := 0; v_prom numeric;
    v_comp jsonb := NULL; v_mov jsonb;
BEGIN
    FOR i IN 0 .. v_n LOOP                 -- 0 = la semana en curso (incompleta); 1 = la última completa
        v_d := v_lunes - 7 * i; v_h := least(v_d + 6, v_hoy);
        SELECT jsonb_build_object(
                   'semana', to_char(v_d, 'DD/MM') || ' al ' || to_char(v_h, 'DD/MM'), 'desde', v_d, 'hasta', v_h, 'en_curso', i = 0,
                   'camiones_con_datos', count(*) FILTER (WHERE x.km > 0 AND x.consumo_motor_l > 0),
                   'km', round(coalesce(sum(x.km) FILTER (WHERE x.km > 0 AND x.consumo_motor_l > 0), 0)),
                   'litros_motor', round(coalesce(sum(x.consumo_motor_l) FILTER (WHERE x.km > 0 AND x.consumo_motor_l > 0), 0)),
                   'l_100km', round(sum(x.consumo_motor_l) FILTER (WHERE x.km > 0 AND x.consumo_motor_l > 0)
                                    / nullif(sum(x.km) FILTER (WHERE x.km > 0 AND x.consumo_motor_l > 0), 0) * 100, 2),
                   'litros_cargados', round(coalesce(sum(x.litros_cargados), 0)))
          INTO s
          FROM fue.fn_consumo_camiones(v_d, v_h) x;
        v_sem := v_sem || s;
        FOR r IN SELECT x.patente, round(x.consumo_motor_l / x.km * 100, 2) AS l100, round(x.km) AS km
                   FROM fue.fn_consumo_camiones(v_d, v_h) x WHERE x.km >= v_min_km AND x.consumo_motor_l > 0 LOOP
            v_cam := jsonb_set(v_cam, ARRAY[r.patente],
                               coalesce(v_cam -> r.patente, '{}') || jsonb_build_object(i::text, jsonb_build_object('l_100km', r.l100, 'km', r.km)));
        END LOOP;
    END LOOP;

    -- La comparación: última semana completa contra la anterior y contra el promedio de las anteriores
    u := v_sem -> 1; a := v_sem -> 2;
    FOR i IN 2 .. v_n LOOP
        v_prom_km := v_prom_km + coalesce((v_sem -> i ->> 'km')::numeric, 0);
        v_prom_l := v_prom_l + coalesce((v_sem -> i ->> 'litros_motor')::numeric, 0);
    END LOOP;
    v_prom := round(v_prom_l / nullif(v_prom_km, 0) * 100, 2);
    IF (u ->> 'l_100km') IS NOT NULL THEN
        v_comp := jsonb_build_object(
            'ultima_semana_completa', u ->> 'semana', 'l_100km', (u ->> 'l_100km')::numeric,
            'semana_anterior', a ->> 'semana', 'l_100km_anterior', (a ->> 'l_100km')::numeric,
            'cambio_contra_la_anterior_pct', round(((u ->> 'l_100km')::numeric / nullif((a ->> 'l_100km')::numeric, 0) - 1) * 100, 1),
            'promedio_de_las_anteriores_l_100km', v_prom,
            'cambio_contra_el_promedio_pct', round(((u ->> 'l_100km')::numeric / nullif(v_prom, 0) - 1) * 100, 1),
            'mejoro', CASE WHEN v_prom IS NULL THEN NULL ELSE (u ->> 'l_100km')::numeric < v_prom END,
            'litros_de_diferencia_contra_el_promedio',
                round(((u ->> 'l_100km')::numeric - v_prom) * (u ->> 'km')::numeric / 100));
    END IF;

    -- Los camiones que más cambiaron entre las dos últimas semanas completas
    SELECT jsonb_agg(jsonb_build_object('patente', q.patente, 'l_100km', q.ahora, 'l_100km_anterior', q.antes, 'cambio_pct', q.pct, 'km', q.km)
                     ORDER BY q.pct)
      INTO v_mov
      FROM (SELECT k.key AS patente, (k.value #>> '{1,l_100km}')::numeric AS ahora, (k.value #>> '{2,l_100km}')::numeric AS antes,
                   (k.value #>> '{1,km}')::numeric AS km,
                   round(((k.value #>> '{1,l_100km}')::numeric / nullif((k.value #>> '{2,l_100km}')::numeric, 0) - 1) * 100, 1) AS pct
              FROM jsonb_each(v_cam) k WHERE k.value ? '1' AND k.value ? '2') q
     WHERE q.pct IS NOT NULL;

    RETURN jsonb_build_object(
        'semanas', v_sem,
        'comparacion', v_comp,
        'camiones_ultima_contra_anterior', coalesce(v_mov, '[]'),
        'como_leerlo', 'L/100 km del motor: MENOS es mejor. «cambio» negativo = mejoró (gastó menos por km). '
            || 'La semana «en_curso» está incompleta: no la uses para decir si se mejoró.',
        'aviso', CASE WHEN v_comp IS NULL THEN 'No hay km y litros de motor medidos en la última semana completa: no se puede comparar.'
                      WHEN coalesce((u ->> 'camiones_con_datos')::int, 0) < 3 THEN 'La última semana tiene muy pocos camiones con datos: la comparación es poco firme.' END,
        'de_donde_sale', 'Contador de litros del motor y km de la telemetría de cada camión, de lunes a domingo (hora de Mendoza). '
            || 'El total de la flota es litros ÷ km de los camiones que tienen las dos cosas. Por camión solo se compara si hizo ' || v_min_km || ' km o más en la semana. '
            || 'No separa cargado de vacío ni tiene en cuenta el viento o la ruta: si la mezcla de viajes cambió, el número cambia aunque se maneje igual.');
END $function$;
REVOKE ALL ON FUNCTION ia.fn_lectura_consumo_semanal(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_consumo_semanal(jsonb) TO tc_app, tc_admin, tc_lectura;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('consumo_semanal', 36,
        'El consumo de la flota y de cada camión SEMANA POR SEMANA (lunes a domingo), con la comparación ya hecha: última semana completa contra la anterior y contra el promedio de las anteriores, y qué camiones mejoraron o empeoraron. '
        || 'Usala SIEMPRE que pidan comparar el consumo entre semanas, la evolución o la tendencia del consumo, o pregunten «¿mejoramos?», «¿estamos gastando más?», «¿cómo venimos de consumo?». '
        || 'Una sola lectura alcanza: no pidas «consumo_camiones» una vez por semana.',
        'Consumo semana a semana', 'Comparando el consumo de las últimas semanas…', '/combustible/consumo',
        '{"type": "object", "properties": {
            "semanas": {"type": "integer", "description": "Cuántas semanas completas mirar hacia atrás (2 a 12). Si no se manda: 6."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- El despacho de lecturas conoce la nueva
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%consumo_semanal%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''consumo_semanal'')');
    v_def := replace(v_def, v_a2, 'WHEN ''consumo_semanal'' THEN ia.fn_lectura_consumo_semanal(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- ------------------------------------------------------------------ 2 · más lugar para responder
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ia.asistente_max_tokens', '4000'::jsonb, 'Iris 13: largo máximo de cada respuesta de Iris, en tokens (antes fijo en 1.500).'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ia.asistente_max_tokens');

DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_cuerpo_api(jsonb, boolean)'::regprocedure);
        v_a constant text := '''max_tokens'', 1500,';
BEGIN
    IF v_def LIKE '%ia.asistente_max_tokens%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_cuerpo_api no es la que esperaba esta migración (no está el tope de 1500): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_a, '''max_tokens'', least(greatest(coalesce(ref.fn_parametro_num(''ia.asistente_max_tokens'', 4000), 4000), 1000), 8000)::integer,');
END $do$;

-- ------------------------------------------------------------------ 3 · respuesta vacía: un intento más y el motivo guardado
ALTER TABLE ia.asistente_turno ADD COLUMN IF NOT EXISTS reintentos smallint NOT NULL DEFAULT 0;
ALTER TABLE ia.asistente_turno ADD COLUMN IF NOT EXISTS diagnostico text;
COMMENT ON COLUMN ia.asistente_turno.diagnostico IS 'Iris 13: por qué el modelo no dio texto (motivo de corte y qué mandó). Para revisar fallas.';

-- Los mensajes para el intento de más: los que había antes de la respuesta vacía, con el pedido explícito de contestar
CREATE OR REPLACE FUNCTION ia.fn_mensajes_reintento(p_mensajes jsonb, p_ya_leyo boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE n int := jsonb_array_length(coalesce(p_mensajes, '[]')); v_ult jsonb; v_cont jsonb;
        v_txt constant jsonb := jsonb_build_object('type', 'text', 'text', CASE WHEN p_ya_leyo
            THEN 'Respondé ahora, en texto, con lo que ya leíste. Si te falta un dato, decí cuál y contestá igual con lo que hay.'
            ELSE 'No llegó tu respuesta. Pedí las lecturas que necesites (pocas, las justas) y después respondé en texto.' END);
BEGIN
    IF n = 0 THEN RETURN p_mensajes; END IF;
    v_ult := p_mensajes -> (n - 1);
    IF v_ult ->> 'role' <> 'user' THEN
        RETURN p_mensajes || jsonb_build_array(jsonb_build_object('role', 'user', 'content', jsonb_build_array(v_txt)));
    END IF;
    v_cont := CASE WHEN jsonb_typeof(v_ult -> 'content') = 'array' THEN v_ult -> 'content'
                   ELSE jsonb_build_array(jsonb_build_object('type', 'text', 'text', v_ult ->> 'content')) END;
    RETURN jsonb_set(p_mensajes, ARRAY[(n - 1)::text, 'content'], v_cont || v_txt);
END $function$;
REVOKE ALL ON FUNCTION ia.fn_mensajes_reintento(jsonb, boolean) FROM PUBLIC;

DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_asistente_leer(bigint)'::regprocedure);
        v_a1 constant text := 'IF nullif(btrim(v_texto), '''') IS NULL THEN';
        v_a2 constant text := 'error = ''Iris no dio una respuesta: probá preguntar de otra forma'',';
        v_diag constant text := 'left(coalesce(b ->> ''stop_reason'', ''?'') || '' · '' || coalesce((SELECT string_agg(c ->> ''type'', '','') FROM jsonb_array_elements(coalesce(b -> ''content'', ''[]''::jsonb)) c), ''sin contenido'') || '' · paso '' || t.paso, 300)';
BEGIN
    IF v_def LIKE '%fn_mensajes_reintento%' THEN RETURN; END IF;
    IF position(v_a1 IN v_def) = 0 OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_asistente_leer no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := replace(v_def, v_a1,
        'IF nullif(btrim(v_texto), '''') IS NULL AND t.reintentos < 1 THEN
        -- Iris 13: respuesta vacía. Se saca esa respuesta y se pide una vez más (sin lecturas nuevas si ya leyó algo)
        UPDATE ia.asistente_turno
           SET mensajes = ia.fn_mensajes_reintento(t.mensajes, jsonb_array_length(t.usadas) > 0), reintentos = t.reintentos + 1, diagnostico = ' || v_diag || ',
               request_id = ia.fn_api_enviar(ia.fn_cuerpo_api(ia.fn_mensajes_reintento(t.mensajes, jsonb_array_length(t.usadas) > 0), jsonb_array_length(t.usadas) > 0)),
               paso_en = now(), leyendo = ''Armando la respuesta…''
         WHERE id = p_turno;
        RETURN jsonb_build_object(''estado'', ''esperando'', ''pendientes'', ''[]''::jsonb);
    END IF;
    ' || v_a1);
    v_def := replace(v_def, v_a2, v_a2 || ' diagnostico = ' || v_diag || ',');
    EXECUTE v_def;
END $do$;

-- ------------------------------------------------------------------ 4 · regla 29
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'no las sumes a lo que hay que cubrir por mes.''';
    v_nuevo constant text := $t$
        || ' 29) Si piden comparar el consumo entre semanas, la evolución o si «mejoramos», usá «consumo_semanal» (una sola lectura). '
        || 'Respondé primero, en una frase, si se mejoró o no y por cuánto (L/100 km de la última semana completa contra el promedio de las anteriores; menos es mejor), y cuántos litros significa. '
        || 'Después una tabla chica con las semanas (semana, km, L/100 km) y, si ayuda, los dos o tres camiones que más mejoraron y los que más empeoraron. '
        || 'No uses la semana en curso para la conclusión. Decí una sola vez que no separa cargado de vacío ni viento. '
        || 'Regla general: nunca termines sin texto; si una lectura no alcanza o da error, decí qué falta y contestá con lo que tengas.'$t$;
BEGIN
    IF v_def LIKE '%«consumo_semanal»%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta el agregado de iris_12): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

DO $do$
BEGIN
    IF NOT has_function_privilege('tc_lectura', 'ia.fn_lectura_consumo_semanal(jsonb)', 'EXECUTE') OR NOT has_function_privilege('tc_app', 'ia.fn_lectura_consumo_semanal(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'La lectura quedó sin el permiso de la web: avisar antes de seguir';
    END IF;
END $do$;

COMMIT;

SELECT 'iris 13 aplicada' AS que,
       (SELECT count(*) FROM ia.asistente_herramienta WHERE activa) AS lecturas_activas,
       (SELECT valor::text FROM ref.parametro WHERE codigo = 'ia.asistente_max_tokens') AS max_tokens;
