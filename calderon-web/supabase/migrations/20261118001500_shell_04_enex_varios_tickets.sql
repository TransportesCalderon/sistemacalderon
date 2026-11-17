-- Shell 04 · Enex: una carga hecha en varios tickets (la bomba corta por monto) es UNA carga
-- Primera prueba real (17/11/2026): el SHXB49 cargó 1.306,23 L en 4 transacciones seguidas (631,78 + 11,79 + 631,78 + 30,88)
-- y en el sistema está registrada como una sola carga. El cruce comparaba de a una: marcaba «difiere» y «falta registrar».
-- NO cambia web.version_base. Necesita shell_02_enex_comanda.sql. Se puede correr más de una vez.
--  · Las transacciones del mismo camión en la misma estación, con menos de 45 minutos entre una y otra, forman un grupo.
--  · El grupo se compara con la carga registrada por la SUMA de litros. «Registrar» crea una sola carga por el grupo.
--  · «Corregir con Enex» pone en la carga la suma del grupo. La diferencia de litros se avisa desde 0,02 L.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fue.fn_enex_pendientes()') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr shell_02_enex_comanda.sql'; END IF;
END $do$;

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fue.enex_grupo_min', '45', 'Shell 04: minutos como máximo entre dos transacciones de Enex del mismo camión y estación para tomarlas como una sola carga.')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS grupo_id bigint;
COMMENT ON COLUMN fue.enex_transaccion.grupo_id IS 'Transacciones de una misma carga (varios tickets seguidos): el id de la primera del grupo.';
CREATE INDEX IF NOT EXISTS ix_enex_grupo ON fue.enex_transaccion (grupo_id);

CREATE OR REPLACE FUNCTION fue.fn_enex_vincular()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE g record; e record; v_k bigint; n integer := 0; v_dif text; v_min interval := make_interval(mins => ref.fn_parametro_num('fue.enex_grupo_min', 45)::integer);
BEGIN
    UPDATE fue.enex_transaccion t SET camion_id = c.id
      FROM mae.camion c
     WHERE t.camion_id IS NULL AND c.eliminado_en IS NULL AND upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = t.patente;

    -- 1) Grupos: mismo camión y estación, con menos de «fue.enex_grupo_min» minutos entre una y otra
    UPDATE fue.enex_transaccion t SET grupo_id = x.grupo
      FROM (SELECT b.id, min(b.id) OVER (PARTITION BY b.patente, b.est, b.isla) AS grupo
              FROM (SELECT a.id, a.patente, a.est, sum(a.nuevo) OVER (PARTITION BY a.patente, a.est ORDER BY a.fecha_hora, a.id) AS isla
                      FROM (SELECT z.id, z.patente, coalesce(z.estacion_codigo, '') AS est, z.fecha_hora,
                                   CASE WHEN z.fecha_hora - lag(z.fecha_hora) OVER (PARTITION BY z.patente, coalesce(z.estacion_codigo, '') ORDER BY z.fecha_hora, z.id) <= v_min THEN 0 ELSE 1 END AS nuevo
                              FROM fue.enex_transaccion z
                             WHERE z.descartada_en IS NULL AND z.fecha_hora > now() - interval '45 days') a) b) x
     WHERE t.id = x.id AND t.grupo_id IS DISTINCT FROM x.grupo;

    -- 2) Grupo de varios tickets: si hay una carga del camión cuyos litros son la SUMA, todo el grupo va con esa carga
    FOR g IN SELECT t.grupo_id, min(t.camion_id) AS camion, sum(t.litros) AS litros, min(t.fecha_hora) AS desde, max(t.fecha_hora) AS hasta
               FROM fue.enex_transaccion t
              WHERE t.descartada_en IS NULL AND t.camion_id IS NOT NULL AND t.grupo_id IS NOT NULL AND t.fecha_hora > now() - interval '45 days'
              GROUP BY t.grupo_id
             HAVING count(*) > 1 AND bool_or(t.carga_id IS NULL) AND NOT bool_or(t.registrada_por_enex) LOOP
        SELECT x.id INTO v_k FROM fue.carga_combustible x
         WHERE x.camion_id = g.camion AND x.eliminado_en IS NULL AND coalesce(x.estado_validacion, '') <> 'anulada'
           AND x.tanque_reefer_id IS NULL AND x.deposito_id IS NULL
           AND x.fecha_hora BETWEEN g.desde - interval '6 hours' AND g.hasta + interval '6 hours'
           AND abs(x.litros - g.litros) <= greatest(2, g.litros * 0.02)
           AND NOT EXISTS (SELECT 1 FROM fue.enex_transaccion o WHERE o.carga_id = x.id AND o.grupo_id IS DISTINCT FROM g.grupo_id)
         ORDER BY abs(x.litros - g.litros), abs(extract(epoch FROM x.fecha_hora - g.desde)) LIMIT 1;
        IF v_k IS NOT NULL THEN
            UPDATE fue.enex_transaccion SET carga_id = v_k, revisado_en = now() WHERE grupo_id = g.grupo_id AND descartada_en IS NULL AND carga_id IS DISTINCT FROM v_k;
            n := n + 1;
        END IF;
        v_k := NULL;
    END LOOP;

    -- 3) De a una: la carga del camión con los mismos litros (2 % o 2 L), a 6 horas o menos
    FOR e IN SELECT * FROM fue.enex_transaccion WHERE carga_id IS NULL AND camion_id IS NOT NULL AND descartada_en IS NULL
                AND fecha_hora > now() - interval '45 days' ORDER BY fecha_hora LOOP
        SELECT x.id INTO v_k FROM fue.carga_combustible x
         WHERE x.camion_id = e.camion_id AND x.eliminado_en IS NULL AND coalesce(x.estado_validacion, '') <> 'anulada'
           AND x.tanque_reefer_id IS NULL AND x.deposito_id IS NULL
           AND x.fecha_hora BETWEEN e.fecha_hora - interval '6 hours' AND e.fecha_hora + interval '6 hours'
           AND abs(x.litros - e.litros) <= greatest(2, e.litros * 0.02)
           AND NOT EXISTS (SELECT 1 FROM fue.enex_transaccion o WHERE o.carga_id = x.id)
         ORDER BY abs(x.litros - e.litros), abs(extract(epoch FROM x.fecha_hora - e.fecha_hora)) LIMIT 1;
        IF v_k IS NOT NULL THEN
            UPDATE fue.enex_transaccion SET carga_id = v_k, revisado_en = now() WHERE id = e.id;
            n := n + 1;
        END IF;
        v_k := NULL;
    END LOOP;

    -- 4) Lo que queda suelto de un grupo que ya tiene carga va con esa carga (un ticket más de la misma carga)
    UPDATE fue.enex_transaccion t SET carga_id = o.carga_id, revisado_en = now()
      FROM (SELECT grupo_id, min(carga_id) AS carga_id FROM fue.enex_transaccion
             WHERE carga_id IS NOT NULL AND descartada_en IS NULL AND grupo_id IS NOT NULL GROUP BY grupo_id HAVING count(DISTINCT carga_id) = 1) o
     WHERE t.grupo_id = o.grupo_id AND t.carga_id IS NULL AND t.descartada_en IS NULL AND t.fecha_hora > now() - interval '45 days';

    -- 5) Grupos enteros sin carga: la carga del camión más cercana en la hora, aunque no coincidan los litros (queda como «difiere»)
    FOR g IN SELECT t.grupo_id, min(t.camion_id) AS camion, sum(t.litros) AS litros, min(t.fecha_hora) AS desde, max(t.fecha_hora) AS hasta
               FROM fue.enex_transaccion t
              WHERE t.descartada_en IS NULL AND t.camion_id IS NOT NULL AND t.grupo_id IS NOT NULL AND t.fecha_hora > now() - interval '45 days'
              GROUP BY t.grupo_id HAVING bool_and(t.carga_id IS NULL) LOOP
        SELECT x.id INTO v_k FROM fue.carga_combustible x
         WHERE x.camion_id = g.camion AND x.eliminado_en IS NULL AND coalesce(x.estado_validacion, '') <> 'anulada'
           AND x.tanque_reefer_id IS NULL AND x.deposito_id IS NULL
           AND x.fecha_hora BETWEEN g.desde - interval '6 hours' AND g.hasta + interval '6 hours'
           AND NOT EXISTS (SELECT 1 FROM fue.enex_transaccion o WHERE o.carga_id = x.id)
         ORDER BY abs(x.litros - g.litros), abs(extract(epoch FROM x.fecha_hora - g.desde)) LIMIT 1;
        IF v_k IS NOT NULL THEN
            UPDATE fue.enex_transaccion SET carga_id = v_k, revisado_en = now() WHERE grupo_id = g.grupo_id AND descartada_en IS NULL;
            n := n + 1;
        END IF;
        v_k := NULL;
    END LOOP;

    -- 6) Por cada carga unida: ¿lo registrado dice lo mismo que la SUMA de Enex? El aviso queda en el primer ticket del grupo
    FOR e IN SELECT x.id AS carga, min(t.id) AS primero, count(*) AS tickets, sum(t.litros) AS litros,
                    CASE WHEN min(t.precio_clp) = max(t.precio_clp) THEN max(t.precio_clp) WHEN bool_and(t.monto_clp IS NOT NULL) AND sum(t.litros) > 0 THEN round(sum(t.monto_clp) / sum(t.litros), 4) ELSE max(t.precio_clp) END AS precio,
                    x.litros AS k_litros, x.precio_unitario AS k_precio, x.moneda AS k_moneda
               FROM fue.enex_transaccion t JOIN fue.carga_combustible x ON x.id = t.carga_id
              WHERE t.descartada_en IS NULL AND t.fecha_hora > now() - interval '45 days'
              GROUP BY x.id, x.litros, x.precio_unitario, x.moneda LOOP
        v_dif := concat_ws(' · ',
            CASE WHEN abs(e.k_litros - round(e.litros, 2)) >= 0.02
                 THEN format('litros: registrado %s, Enex %s%s', round(e.k_litros, 2), round(e.litros, 2), CASE WHEN e.tickets > 1 THEN format(' (suma de %s tickets)', e.tickets) ELSE '' END) END,
            CASE WHEN e.k_moneda <> 'CLP' THEN format('moneda: registrado %s, Enex CLP', e.k_moneda)
                 WHEN e.precio IS NOT NULL AND abs(e.k_precio - e.precio) > 1 THEN format('precio: registrado %s, Enex %s', round(e.k_precio), round(e.precio)) END);
        UPDATE fue.enex_transaccion SET difiere = (id = e.primero AND v_dif <> ''), diferencia = CASE WHEN id = e.primero THEN nullif(v_dif, '') END
         WHERE carga_id = e.carga AND descartada_en IS NULL
           AND (difiere IS DISTINCT FROM (id = e.primero AND v_dif <> '') OR diferencia IS DISTINCT FROM CASE WHEN id = e.primero THEN nullif(v_dif, '') END);
    END LOOP;
    RETURN n;
END $function$;

-- Registrar: una sola carga por todo el grupo (los tickets que todavía no tienen carga)
CREATE OR REPLACE FUNCTION fue.fn_enex_registrar(p_trx bigint, p_estacion bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE t fue.enex_transaccion%ROWTYPE; s record; v_est bigint; v_id bigint; v_precio numeric;
BEGIN
    PERFORM fue.fn_enex_exigir();
    SELECT * INTO t FROM fue.enex_transaccion WHERE id = p_trx FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esa carga de Enex no existe' USING ERRCODE = 'P0002'; END IF;
    IF t.carga_id IS NOT NULL THEN RAISE EXCEPTION 'Esa carga ya está registrada' USING ERRCODE = '55000'; END IF;
    IF t.descartada_en IS NOT NULL THEN RAISE EXCEPTION 'Esa carga fue descartada' USING ERRCODE = '55000'; END IF;
    IF t.camion_id IS NULL THEN RAISE EXCEPTION 'La patente % no es de un tractor del sistema: no se puede registrar como carga del tractor', t.patente USING ERRCODE = '22023'; END IF;
    v_est := coalesce(p_estacion, (SELECT m.estacion_id FROM fue.enex_estacion m WHERE m.codigo = t.estacion_codigo));
    IF v_est IS NULL THEN
        RAISE EXCEPTION 'Elegí la estación de servicio (la primera vez; después el sistema la recuerda): %', coalesce(t.direccion, t.ciudad, 'estación ' || coalesce(t.estacion_codigo, '?')) USING ERRCODE = '23502';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM mae.estacion_servicio e WHERE e.id = v_est AND e.eliminado_en IS NULL AND e.pais = 'CL') THEN
        RAISE EXCEPTION 'La estación elegida no existe o no es de Chile' USING ERRCODE = '22023';
    END IF;
    -- Todos los tickets del grupo que todavía no tienen carga
    SELECT count(*) AS tickets, sum(o.litros) AS litros, sum(o.monto_clp) AS monto, bool_and(o.monto_clp IS NOT NULL) AS con_monto, CASE WHEN min(o.precio_clp) = max(o.precio_clp) THEN max(o.precio_clp) WHEN bool_and(o.monto_clp IS NOT NULL) AND sum(o.litros) > 0 THEN round(sum(o.monto_clp) / sum(o.litros), 4) ELSE max(o.precio_clp) END AS precio,
           min(o.fecha_hora) AS desde, string_agg(o.trx, ', ' ORDER BY o.fecha_hora, o.id) AS trxs, array_agg(o.id) AS ids
      INTO s
      FROM fue.enex_transaccion o
     WHERE o.carga_id IS NULL AND o.descartada_en IS NULL AND (o.id = t.id OR (t.grupo_id IS NOT NULL AND o.grupo_id = t.grupo_id));
    v_precio := s.precio;   -- el precio del ticket si es el mismo en todos; si no, el promedio por litro
    IF v_precio IS NULL THEN RAISE EXCEPTION 'Enex no informó el precio de esa carga' USING ERRCODE = '23502'; END IF;
    INSERT INTO fue.carga_combustible (camion_id, chofer_id, estacion_id, fecha_hora, tipo_combustible_id, litros, precio_unitario, moneda,
                                       importe_original, medio_pago, odometro_km, origen_dato, tanque_lleno, es_frontera, motivo_observacion)
    VALUES (t.camion_id, fue.fn_chofer_actual(t.camion_id), v_est, s.desde, (SELECT tipo_combustible_id FROM mae.camion WHERE id = t.camion_id),
            round(s.litros, 2), v_precio, 'CLP', round(round(s.litros, 2) * v_precio, 2), 'tarjeta', NULL, 'tarjeta', false, false,
            left('Shell Card (Enex) · ' || CASE WHEN s.tickets > 1 THEN s.tickets || ' tickets · transacciones ' ELSE 'transacción ' END || s.trxs, 480))
    RETURNING id INTO v_id;
    IF t.estacion_codigo IS NOT NULL THEN
        INSERT INTO fue.enex_estacion (codigo, estacion_id, creado_por) VALUES (t.estacion_codigo, v_est, aud.fn_usuario_actual())
        ON CONFLICT (codigo) DO UPDATE SET estacion_id = EXCLUDED.estacion_id;
    END IF;
    UPDATE fue.enex_transaccion SET carga_id = v_id, registrada_por_enex = true, difiere = false, diferencia = NULL, revisado_en = now(), resuelta_por = aud.fn_usuario_actual()
     WHERE id = ANY (s.ids);
    RETURN jsonb_build_object('carga_id', v_id, 'tickets', s.tickets, 'litros', round(s.litros, 2));
END $function$;

-- Corregir: la carga queda con la suma de todos los tickets de Enex unidos a ella
CREATE OR REPLACE FUNCTION fue.fn_enex_corregir(p_trx bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE t record; s record; v_ver integer; v_precio numeric;
BEGIN
    PERFORM fue.fn_enex_exigir();
    SELECT x.* INTO t FROM fue.fn_enex_una(p_trx) x;
    IF t.id IS NULL THEN RAISE EXCEPTION 'Esa carga de Enex no existe' USING ERRCODE = 'P0002'; END IF;
    IF t.carga_id IS NULL THEN RAISE EXCEPTION 'Esa carga todavía no está registrada: registrala primero' USING ERRCODE = '55000'; END IF;
    IF NOT t.difiere THEN RAISE EXCEPTION 'Lo registrado ya coincide con Enex' USING ERRCODE = '55000'; END IF;
    SELECT * INTO s FROM fue.fn_enex_suma_carga(t.carga_id);
    v_precio := s.precio;
    SELECT k.version_fila INTO v_ver FROM fue.carga_combustible k WHERE k.id = t.carga_id;
    PERFORM fue.fn_editar_carga(t.carga_id, v_ver,
                jsonb_strip_nulls(jsonb_build_object('litros', round(s.litros, 2), 'precio_unitario', v_precio, 'moneda', 'CLP', 'medio_pago', 'tarjeta')),
                left('Corregido con lo que informó Enex (Shell Card, ' || CASE WHEN s.tickets > 1 THEN s.tickets || ' tickets, transacciones ' ELSE 'transacción ' END || s.trxs || '): ' || coalesce(t.diferencia, ''), 480));
    PERFORM fue.fn_enex_marcar_corregida(p_trx);
    RETURN jsonb_build_object('carga_id', t.carga_id, 'antes', t.diferencia);
END $function$;

CREATE OR REPLACE FUNCTION fue.fn_enex_suma_carga(p_carga bigint, OUT tickets bigint, OUT litros numeric, OUT monto numeric, OUT con_monto boolean, OUT precio numeric, OUT trxs text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT count(*), sum(o.litros), sum(o.monto_clp), bool_and(o.monto_clp IS NOT NULL), CASE WHEN min(o.precio_clp) = max(o.precio_clp) THEN max(o.precio_clp) WHEN bool_and(o.monto_clp IS NOT NULL) AND sum(o.litros) > 0 THEN round(sum(o.monto_clp) / sum(o.litros), 4) ELSE max(o.precio_clp) END, string_agg(o.trx, ', ' ORDER BY o.fecha_hora, o.id)
      FROM fue.enex_transaccion o
     WHERE o.carga_id = p_carga AND o.descartada_en IS NULL AND fue.fn_puede_registrar_cargas()
$f$;
REVOKE ALL ON FUNCTION fue.fn_enex_suma_carga(bigint) FROM PUBLIC;
DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname LIKE 'tc\_%' AND has_function_privilege(oid, 'fue.fn_enex_una(bigint)', 'EXECUTE') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fue.fn_enex_suma_carga(bigint) TO %I', r.rolname);
    END LOOP;
END $do$;

-- Lo pendiente se muestra por carga (grupo de tickets), no por ticket
CREATE OR REPLACE FUNCTION fue.fn_enex_pendientes()
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    IF NOT (fue.fn_puede_registrar_cargas() OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo = 'gerencia')) THEN
        RAISE EXCEPTION 'Sin permiso para ver las cargas de Shell' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'puede_resolver', fue.fn_puede_registrar_cargas(),
        'ultima_consulta', (SELECT jsonb_build_object('cuando', c.creado_en, 'ok', c.ok, 'mensaje', c.mensaje) FROM fue.enex_consulta c ORDER BY c.id DESC LIMIT 1),
        'estaciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre), '[]') FROM mae.estacion_servicio s WHERE s.eliminado_en IS NULL AND s.pais = 'CL'),
        'cargas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', q.id, 'fecha_hora', q.fecha_hora, 'patente', q.patente, 'es_tractor', q.es_tractor, 'litros', q.litros, 'precio_clp', q.precio_clp, 'monto_clp', q.monto_clp,
                'producto', q.producto, 'donde', concat_ws(' · ', q.donde, CASE WHEN q.tickets > 1 THEN q.tickets || ' tickets seguidos' END), 'documento', q.documento,
                'estacion_id', (SELECT m.estacion_id FROM fue.enex_estacion m WHERE m.codigo = q.estacion_codigo),
                'situacion', q.situacion, 'carga_id', q.carga_id, 'diferencia', q.diferencia, 'tickets', q.tickets) ORDER BY q.fecha_hora DESC), '[]')
              FROM (
                -- Falta registrar: un renglón por grupo de tickets sin carga
                SELECT min(t.id) AS id, min(t.fecha_hora) AS fecha_hora, min(t.patente) AS patente, bool_and(t.camion_id IS NOT NULL) AS es_tractor,
                       round(sum(t.litros), 2) AS litros,
                       CASE WHEN min(t.precio_clp) = max(t.precio_clp) THEN max(t.precio_clp) WHEN bool_and(t.monto_clp IS NOT NULL) AND sum(t.litros) > 0 THEN round(sum(t.monto_clp) / sum(t.litros), 4) ELSE max(t.precio_clp) END AS precio_clp,
                       CASE WHEN bool_and(t.monto_clp IS NOT NULL) THEN sum(t.monto_clp) END AS monto_clp,
                       min(t.producto) AS producto, min(coalesce(t.direccion, t.ciudad)) AS donde, string_agg(t.nro_documento, ', ' ORDER BY t.fecha_hora, t.id) AS documento,
                       min(t.estacion_codigo) AS estacion_codigo, 'falta_registrar' AS situacion, NULL::bigint AS carga_id, NULL::text AS diferencia, count(*) AS tickets
                  FROM fue.enex_transaccion t
                 WHERE t.descartada_en IS NULL AND t.fecha_hora > now() - interval '45 days' AND t.carga_id IS NULL
                 GROUP BY coalesce(t.grupo_id, t.id)
                UNION ALL
                -- Difiere: el aviso está en el primer ticket de la carga; los números son la suma
                SELECT t.id, t.fecha_hora, t.patente, t.camion_id IS NOT NULL, round(s.litros, 2),
                       s.precio, CASE WHEN s.con_monto THEN s.monto END,
                       t.producto, coalesce(t.direccion, t.ciudad), t.nro_documento, t.estacion_codigo, 'difiere', t.carga_id, t.diferencia, s.tickets
                  FROM fue.enex_transaccion t
                  CROSS JOIN LATERAL (SELECT count(*) AS tickets, sum(o.litros) AS litros, sum(o.monto_clp) AS monto, bool_and(o.monto_clp IS NOT NULL) AS con_monto, CASE WHEN min(o.precio_clp) = max(o.precio_clp) THEN max(o.precio_clp) WHEN bool_and(o.monto_clp IS NOT NULL) AND sum(o.litros) > 0 THEN round(sum(o.monto_clp) / sum(o.litros), 4) ELSE max(o.precio_clp) END AS precio
                                        FROM fue.enex_transaccion o WHERE o.carga_id = t.carga_id AND o.descartada_en IS NULL) s
                 WHERE t.descartada_en IS NULL AND t.fecha_hora > now() - interval '45 days' AND t.carga_id IS NOT NULL AND t.difiere) q));
END $function$;

-- Reacomoda lo que ya está traído
SELECT fue.fn_enex_vincular();

COMMIT;
