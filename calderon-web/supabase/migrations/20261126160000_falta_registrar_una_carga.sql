-- =====================================================================================
-- Cambio 362 · Alerta «Falta registrar una carga»: el sensor marca más de lo que calcula el sistema
-- =====================================================================================
-- Pedido (26/11/2026, caso SHXB49 / OC-000036): «debería alertar el sistema si recibe que tiene más combustible en el
-- sensor de lo que dice el sistema que tiene, porque es evidente que falta registrar una carga».
-- El sensor mide solo el tanque principal; el sistema calcula todo el camión (tanques + mochila). Si el principal solo ya
-- tiene más que todo lo que calcula el sistema, falta una carga (o hay un dato mal: el último lleno, los litros de una
-- carga o el sensor). Lo mismo si la cuenta del sistema da negativa («falta registrar alguna carga»).
--
--   1 · fue.fn_sensor_vs_sistema(camión, combustible): la mediana del sensor de la última hora con lecturas (3 o más, la
--       última de menos de 6 h) contra lo que calcula fue.fn_combustible_actual. «Falta» si la diferencia llega a 50 L
--       o al 10 % del tanque principal (lo que sea más), o si la cuenta del sistema ya da negativa. Nombra las órdenes
--       del camión que pueden explicarlo (para registrar, sin ticket o vencidas sin ticket).
--   2 · Regla nueva CARGA_SIN_REGISTRAR («Falta registrar una carga», combustible, productiva), con sus parámetros
--       editables en Alertas. Responsable: el de siempre para combustible (Adm. de combustible).
--   3 · ana.fn_ejecutar_motor (envoltorio; la anterior queda como ana.fn_ejecutar_motor_sin_sensor). Cada hora, con el
--       motor: una alerta por camión y un aviso al teléfono del responsable. No repite mientras haya una abierta del
--       camión, ni para el mismo lleno con las mismas cargas. No avisa si la carga ya está en la fila de siempre (una
--       orden para registrar o una autorizada vigente).
--   4 · tel.fn_mapa_flota (envoltorio; la anterior queda como tel.fn_mapa_flota_sin_sensor): en la ficha del camión,
--       debajo de los litros, «Falta registrar alguna carga: el sensor marca …».
-- Los envoltorios copian exactamente los permisos de la función que envuelven. No cambia web.version_base. No toca datos.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fue.fn_sensor_vs_sistema(bigint,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'El cambio 362 (alerta «Falta registrar una carga») ya está aplicado';
    END IF;
    IF to_regprocedure('fue.fn_combustible_actual(bigint)') IS NULL OR to_regprocedure('mae.fn_capacidad_sensor(bigint,date)') IS NULL
       OR to_regprocedure('fue.fn_orden_tarjeta(fue.orden_carga)') IS NULL OR to_regprocedure('ana.fn_ejecutar_motor(integer)') IS NULL
       OR to_regprocedure('tel.fn_mapa_flota(integer)') IS NULL OR to_regprocedure('ops.fn_avisar(bigint[],text,text,text,text,boolean)') IS NULL
       OR to_regprocedure('tel.fn_chofer_en(bigint,timestamptz,text)') IS NULL OR to_regprocedure('tel.fn_num_ar(numeric,integer)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones que este cambio usa (combustible actual, órdenes de Chile de la 284, motor de alertas o mapa)';
    END IF;
END $v$;

-- Copia exacta de los permisos de ejecución de una función a su envoltorio (los mismos roles, ni uno más)
CREATE FUNCTION pg_temp.fn_copiar_acl(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    IF (SELECT proacl FROM pg_proc WHERE oid = p_de) IS NULL THEN RETURN; END IF;   -- permisos por defecto: quedan iguales
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END
               FROM pg_proc pr CROSS JOIN LATERAL aclexplode(pr.proacl) a LEFT JOIN pg_roles r ON r.oid = a.grantee
              WHERE pr.oid = p_de AND a.privilege_type = 'EXECUTE' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', p_a, g);
    END LOOP;
END $fn$;

-- ------------------------------------------------------------------ 1 · el sensor contra el sistema
CREATE FUNCTION fue.fn_sensor_vs_sistema(p_camion bigint, p_comb jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    c jsonb := coalesce(p_comb, fue.fn_combustible_actual(p_camion));
    p jsonb := coalesce((SELECT r.parametros FROM ana.regla_anomalia r
                          WHERE r.codigo = 'CARGA_SIN_REGISTRAR' AND r.eliminado_en IS NULL AND r.vigente_desde <= current_date
                            AND (r.vigente_hasta IS NULL OR r.vigente_hasta > current_date)
                          ORDER BY r.version DESC LIMIT 1), '{}'::jsonb);
    v_ult timestamptz; v_pct numeric; v_n integer; v_cap numeric; v_sensor numeric; v_sis numeric; v_neg boolean := false;
    v_umbral numeric; v_dif numeric; v_falta boolean; v_pend text; v_texto text;
BEGIN
    -- Lo que calcula el sistema (todo el camión). Si la cuenta dio negativa, el sistema ya sabe que falta una carga.
    v_sis := nullif(c ->> 'litros', '')::numeric;
    IF v_sis IS NULL THEN
        IF coalesce(c ->> 'motivo', '') ILIKE '%falta registrar alguna carga%' THEN
            v_sis := 0; v_neg := true;
        ELSE
            RETURN jsonb_build_object('falta', NULL, 'por_que', coalesce(c ->> 'motivo', 'El sistema no calcula el combustible del camión'));
        END IF;
    END IF;
    -- Lo que mide el sensor del tanque principal: la mediana de la última hora con lecturas (menos ruido en pendientes)
    SELECT max(l.ts) INTO v_ult FROM tel.lectura l
     WHERE l.camion_id = p_camion AND l.nivel_combustible_pct IS NOT NULL AND l.calidad > 0
       AND l.ts > now() - make_interval(hours => coalesce((p ->> 'lectura_max_h')::int, 6));
    IF v_ult IS NOT NULL THEN
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY l.nivel_combustible_pct), count(*) INTO v_pct, v_n
          FROM tel.lectura l
         WHERE l.camion_id = p_camion AND l.nivel_combustible_pct IS NOT NULL AND l.calidad > 0
           AND l.ts BETWEEN v_ult - make_interval(mins => coalesce((p ->> 'sensor_min')::int, 60)) AND v_ult;
    END IF;
    v_cap := mae.fn_capacidad_sensor(p_camion, current_date);
    IF v_pct IS NOT NULL AND v_n >= coalesce((p ->> 'lecturas_min')::int, 3) AND v_cap > 0 THEN
        v_sensor := round(v_pct * v_cap / 100);
        v_umbral := round(greatest(coalesce((p ->> 'litros_min')::numeric, 50), v_cap * coalesce((p ->> 'pct_min')::numeric, 10) / 100));
        v_dif := v_sensor - v_sis;
    END IF;
    v_falta := v_neg OR coalesce(v_dif >= v_umbral, false);
    IF NOT v_falta AND v_sensor IS NULL THEN
        RETURN jsonb_build_object('falta', NULL, 'por_que', 'Sin lecturas recientes del sensor del tanque principal');
    END IF;
    -- Lo que puede explicarlo: órdenes del camión desde el último lleno que todavía no son carga
    SELECT string_agg(o.numero || ' ' || CASE WHEN o.estado = 'cargada' THEN 'para registrar'
                                              WHEN fue.fn_orden_tarjeta(o) AND o.vence_en <= now() THEN 'vencida sin ticket'
                                              ELSE 'sin ticket' END, ', ' ORDER BY o.id)
      INTO v_pend
      FROM fue.orden_carga o
     WHERE o.camion_id = p_camion AND o.genset_id IS NULL AND o.carga_id IS NULL AND o.estado IN ('autorizada', 'cargada')
       AND coalesce(o.cargada_en, o.autorizada_en, o.creada_en) > coalesce(nullif(c ->> 'desde', '')::timestamptz, now() - interval '30 days')
       AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '60 days';
    IF v_falta THEN
        v_texto := CASE WHEN v_sensor IS NOT NULL
                        THEN format('Falta registrar alguna carga: el sensor marca %s L solo en el tanque principal y el sistema calcula %s L para todo el camión.',
                                    tel.fn_num_ar(v_sensor), CASE WHEN v_neg THEN 'menos de 0' ELSE tel.fn_num_ar(v_sis) END)
                        ELSE 'Falta registrar alguna carga: desde el último lleno el motor gastó más de lo que se registró.' END
                   || coalesce(' Puede ser: ' || v_pend || '.', '');
    END IF;
    RETURN jsonb_build_object('falta', v_falta, 'sensor_l', v_sensor, 'sensor_pct', round(v_pct, 1), 'sensor_ts', v_ult, 'lecturas', v_n,
                              'capacidad_sensor_l', v_cap, 'sistema_l', v_sis, 'sistema_negativo', v_neg, 'diferencia_l', v_dif,
                              'umbral_l', v_umbral, 'pendiente', v_pend, 'texto', v_texto);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('falta', NULL, 'por_que', 'No se pudo comparar: ' || SQLERRM);
END $f$;
COMMENT ON FUNCTION fue.fn_sensor_vs_sistema(bigint, jsonb) IS
    'Cambio 362: compara el sensor del tanque principal (mediana de la última hora) con lo que calcula el sistema para todo el camión; «falta» si el principal solo ya tiene más (o la cuenta da negativa).';
REVOKE ALL ON FUNCTION fue.fn_sensor_vs_sistema(bigint, jsonb) FROM PUBLIC;

-- ------------------------------------------------------------------ 2 · la regla
INSERT INTO ana.regla_anomalia (tipo_alerta_id, codigo, version, nombre, descripcion, categoria, severidad_defecto, parametros, alcance, modo, activa, vigente_desde)
SELECT (SELECT t.id FROM ref.tipo_alerta t WHERE t.codigo = 'CARGA_VS_TELEMETRIA'),
       'CARGA_SIN_REGISTRAR', 1, 'Falta registrar una carga',
       'El sensor del tanque principal marca más combustible que todo lo que calcula el sistema para el camión (tanques y mochila), '
       || 'o la cuenta del sistema da negativa desde el último lleno. Casi siempre es una carga sin registrar; si no, hay un dato mal: '
       || 'el último lleno, los litros de una carga o el sensor.',
       'combustible', 'media',
       jsonb_build_object('litros_min', 50, 'pct_min', 10, 'sensor_min', 60, 'lecturas_min', 3, 'lectura_max_h', 6, 'avisar', true),
       'global', 'productivo', true, current_date
 WHERE NOT EXISTS (SELECT 1 FROM ana.regla_anomalia WHERE codigo = 'CARGA_SIN_REGISTRAR');

-- ------------------------------------------------------------------ 3 · el motor de alertas
ALTER FUNCTION ana.fn_ejecutar_motor(integer) RENAME TO fn_ejecutar_motor_sin_sensor;

CREATE FUNCTION ana.fn_ejecutar_motor(p_horas integer DEFAULT 48)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_res jsonb := ana.fn_ejecutar_motor_sin_sensor(p_horas);
    rg ana.regla_anomalia%ROWTYPE; p jsonb; v_ej bigint; v_n integer := 0; v_eval integer := 0; v_err text;
    c record; v_comb jsonb; v_s jsonb; v_huella text; v_sev text; v_id bigint; v_rol text; v_resp bigint; v_dest bigint[];
BEGIN
    SELECT r.* INTO rg FROM ana.regla_anomalia r
     WHERE r.codigo = 'CARGA_SIN_REGISTRAR' AND r.activa AND r.eliminado_en IS NULL AND r.vigente_desde <= current_date
       AND (r.vigente_hasta IS NULL OR r.vigente_hasta > current_date)
     ORDER BY r.version DESC LIMIT 1;
    IF rg.id IS NULL THEN RETURN v_res; END IF;
    p := rg.parametros;
    INSERT INTO ana.ejecucion_regla (regla_id, ventana_desde, ventana_hasta) VALUES (rg.id, now() - interval '1 hour', now()) RETURNING id INTO v_ej;
    BEGIN
        FOR c IN SELECT m.id, m.patente FROM mae.camion m
                  WHERE m.eliminado_en IS NULL AND m.fecha_baja IS NULL
                    AND EXISTS (SELECT 1 FROM tel.lectura l WHERE l.camion_id = m.id
                                   AND l.ts > now() - make_interval(hours => coalesce((p ->> 'lectura_max_h')::int, 6)))
                  ORDER BY m.patente LOOP
            v_eval := v_eval + 1;
            -- Ya hay una abierta para el camión: no se repite
            CONTINUE WHEN EXISTS (SELECT 1 FROM ana.alerta al JOIN ana.regla_anomalia r ON r.id = al.regla_id
                                   WHERE r.codigo = 'CARGA_SIN_REGISTRAR' AND al.camion_id = c.id AND al.estado IN ('nueva', 'en_revision'));
            -- La carga está en la fila de siempre: una orden para registrar o una autorizada vigente
            CONTINUE WHEN EXISTS (SELECT 1 FROM fue.orden_carga o
                                   WHERE o.camion_id = c.id AND o.genset_id IS NULL AND o.carga_id IS NULL
                                     AND (   (o.estado = 'cargada' AND o.cargada_en > now() - interval '60 days')
                                          OR (o.estado = 'autorizada' AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '7 days'
                                              AND NOT (fue.fn_orden_tarjeta(o) AND o.vence_en <= now()))));
            v_comb := fue.fn_combustible_actual(c.id);
            v_s := fue.fn_sensor_vs_sistema(c.id, v_comb);
            CONTINUE WHEN NOT coalesce((v_s ->> 'falta')::boolean, false);
            -- Una vez por lleno y cargas registradas: si se cierra, vuelve a avisar recién cuando cambie algo
            v_huella := md5('CSR|' || c.id || '|' || coalesce(v_comb ->> 'desde', '-') || '|'
                            || coalesce(round((v_comb ->> 'cargado_despues_l')::numeric)::text, '-'));
            CONTINUE WHEN EXISTS (SELECT 1 FROM ana.alerta al WHERE al.huella = v_huella);
            v_sev := CASE WHEN coalesce((v_s ->> 'sistema_negativo')::boolean, false)
                            OR coalesce((v_s ->> 'diferencia_l')::numeric >= 2 * (v_s ->> 'umbral_l')::numeric, false) THEN 'alta' ELSE 'media' END;
            INSERT INTO ana.alerta (regla_id, ejecucion_id, camion_id, chofer_id, ocurrio_desde, ocurrio_hasta, severidad, puntaje,
                                    valor_observado, valor_esperado, unidad, evidencia, huella)
            VALUES (rg.id, v_ej, c.id, (SELECT ch.id FROM mae.chofer ch WHERE ch.id = tel.fn_chofer_en(c.id, now())),
                    nullif(v_comb ->> 'desde', '')::timestamptz, coalesce(nullif(v_s ->> 'sensor_ts', '')::timestamptz, now()),
                    v_sev, least(100, greatest(0, round(coalesce((v_s ->> 'diferencia_l')::numeric, 100)))),
                    (v_s ->> 'sensor_l')::numeric, (v_s ->> 'sistema_l')::numeric, 'l',
                    jsonb_strip_nulls(jsonb_build_object(
                        'sensor_l', (v_s ->> 'sensor_l')::numeric, 'sensor_pct', (v_s ->> 'sensor_pct')::numeric, 'sensor_ts', v_s ->> 'sensor_ts',
                        'capacidad_sensor_l', (v_s ->> 'capacidad_sensor_l')::numeric, 'sistema_l', (v_s ->> 'sistema_l')::numeric,
                        'sistema', CASE WHEN (v_s ->> 'sistema_negativo')::boolean THEN 'La cuenta da menos de 0: el motor gastó más de lo que se registró' END,
                        'diferencia_l', (v_s ->> 'diferencia_l')::numeric, 'umbral_l', (v_s ->> 'umbral_l')::numeric,
                        'ultimo_lleno_ts', v_comb ->> 'desde', 'consumido_l', (v_comb ->> 'consumido_l')::numeric,
                        'cargado_despues_l', (v_comb ->> 'cargado_despues_l')::numeric, 'pendiente', v_s ->> 'pendiente',
                        'que_hacer', 'Buscar la carga que falta (órdenes vencidas sin ticket, cargas pagadas aparte, tickets de Shell Card) y registrarla. '
                                     || 'Si no falta ninguna, revisar el último lleno, los litros de las cargas o el sensor.')),
                    v_huella)
            ON CONFLICT DO NOTHING
            RETURNING id, responsable_rol, responsable_id INTO v_id, v_rol, v_resp;
            IF v_id IS NOT NULL THEN
                v_n := v_n + 1;
                IF coalesce((p ->> 'avisar')::boolean, true) THEN
                    v_dest := CASE WHEN v_resp IS NOT NULL THEN ARRAY[v_resp]
                                   ELSE ARRAY(SELECT DISTINCT ur.usuario_id FROM seg.usuario_rol ur JOIN seg.usuario u ON u.id = ur.usuario_id
                                               WHERE ur.rol_codigo = v_rol AND u.activo) END;
                    IF cardinality(v_dest) > 0 THEN
                        BEGIN
                            PERFORM ops.fn_avisar(v_dest, 'csr:' || v_id, 'Falta registrar una carga · ' || c.patente, v_s ->> 'texto',
                                                  '/anomalias/alertas', v_sev = 'alta');
                        EXCEPTION WHEN OTHERS THEN NULL;   -- el aviso nunca frena la alerta
                        END;
                    END IF;
                END IF;
            END IF;
            v_id := NULL;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    UPDATE ana.ejecucion_regla
       SET fin_ts = clock_timestamp(), alertas_generadas = v_n, registros_evaluados = v_eval,
           estado = CASE WHEN v_err IS NULL THEN 'completada' ELSE 'fallida' END, error = v_err
     WHERE id = v_ej;
    RETURN v_res || jsonb_build_object('CARGA_SIN_REGISTRAR', coalesce(v_err, v_n::text));
END $f$;
COMMENT ON FUNCTION ana.fn_ejecutar_motor(integer) IS
    'Cambio 362: el motor de siempre (ana.fn_ejecutar_motor_sin_sensor) y después la regla CARGA_SIN_REGISTRAR (el sensor marca más de lo que calcula el sistema).';
SELECT pg_temp.fn_copiar_acl('ana.fn_ejecutar_motor_sin_sensor(integer)', 'ana.fn_ejecutar_motor(integer)');

-- ------------------------------------------------------------------ 4 · la ficha del camión en el mapa
ALTER FUNCTION tel.fn_mapa_flota(integer) RENAME TO fn_mapa_flota_sin_sensor;

CREATE FUNCTION tel.fn_mapa_flota(p_minutos integer DEFAULT 120)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(jsonb_agg(
               CASE WHEN jsonb_typeof(x -> 'combustible') = 'object' AND (x #>> '{combustible,litros}') IS NOT NULL
                         AND coalesce((z.s ->> 'falta')::boolean, false)
                    THEN jsonb_set(x, '{combustible,aviso}', to_jsonb(concat_ws(' · ', nullif(x #>> '{combustible,aviso}', ''), z.s ->> 'texto')))
                    ELSE x END
             ORDER BY t.n), '[]'::jsonb)
      FROM jsonb_array_elements(tel.fn_mapa_flota_sin_sensor(p_minutos)) WITH ORDINALITY AS t(x, n)
      LEFT JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(t.x -> 'combustible') = 'object' AND (t.x #>> '{combustible,litros}') IS NOT NULL
                                     THEN fue.fn_sensor_vs_sistema((t.x ->> 'camion_id')::bigint, t.x -> 'combustible') END AS s) z ON true
$f$;
COMMENT ON FUNCTION tel.fn_mapa_flota(integer) IS
    'Cambio 362: el mapa de siempre (tel.fn_mapa_flota_sin_sensor) con el aviso «Falta registrar alguna carga» cuando el sensor marca más de lo que calcula el sistema.';
SELECT pg_temp.fn_copiar_acl('tel.fn_mapa_flota_sin_sensor(integer)', 'tel.fn_mapa_flota(integer)');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Cómo queda hoy (no crea alertas: las crea el motor en la próxima hora)
WITH h AS (
    SELECT m.patente, z.s,
           EXISTS (SELECT 1 FROM fue.orden_carga o
                    WHERE o.camion_id = m.id AND o.genset_id IS NULL AND o.carga_id IS NULL
                      AND (   (o.estado = 'cargada' AND o.cargada_en > now() - interval '60 days')
                           OR (o.estado = 'autorizada' AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '7 days'
                               AND NOT (fue.fn_orden_tarjeta(o) AND o.vence_en <= now())))) AS en_la_fila
      FROM mae.camion m CROSS JOIN LATERAL (SELECT fue.fn_sensor_vs_sistema(m.id) AS s) z
     WHERE m.eliminado_en IS NULL AND m.fecha_baja IS NULL)
SELECT 'cambio 362 aplicado' AS que,
       (SELECT count(*) FROM h WHERE coalesce((s ->> 'falta')::boolean, false)) AS camiones_con_carga_sin_registrar,
       (SELECT count(*) FROM h WHERE coalesce((s ->> 'falta')::boolean, false) AND NOT en_la_fila) AS daran_alerta,
       (SELECT string_agg(patente || CASE WHEN en_la_fila THEN ' (ya está en la fila: sin alerta)' ELSE '' END || ': ' || (s ->> 'texto'), ' | ' ORDER BY patente)
          FROM h WHERE coalesce((s ->> 'falta')::boolean, false)) AS cuales;
