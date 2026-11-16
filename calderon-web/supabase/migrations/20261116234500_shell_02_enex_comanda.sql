-- Shell 02 · Enex comanda: la carga con tarjeta Shell se registra y se corrige con los datos de Enex
-- NO cambia web.version_base. Necesita Shell 01 aplicada.
-- Decisiones de Gerencia (16/11/2026): la carga nueva se PROPONE y una persona la confirma con un clic;
-- si lo registrado difiere de Enex, se corrige con Enex y queda avisado; la carga que nace de Enex va como «no lleno».
-- Registrar y corregir pasan por las mismas reglas de siempre (permisos, cierres aprobados, auditoría).

BEGIN;

DO $do$
BEGIN
    IF to_regclass('fue.enex_transaccion') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr shell_01_cargas_enex.sql'; END IF;
END $do$;

ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS difiere boolean NOT NULL DEFAULT false;
ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS diferencia text;
ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS corregida_en timestamptz;
ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS registrada_por_enex boolean NOT NULL DEFAULT false;
ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS descartada_en timestamptz;
ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS descartada_motivo text;
ALTER TABLE fue.enex_transaccion ADD COLUMN IF NOT EXISTS resuelta_por bigint;

-- Qué estación de IronTrack es cada estación de Enex (se aprende la primera vez que alguien la elige)
CREATE TABLE IF NOT EXISTS fue.enex_estacion (
    codigo      text PRIMARY KEY,
    estacion_id bigint NOT NULL REFERENCES mae.estacion_servicio(id),
    creado_en   timestamptz NOT NULL DEFAULT now(),
    creado_por  bigint
);
REVOKE ALL ON fue.enex_estacion FROM PUBLIC;

-- Comparar con lo registrado. Primero la que coincide; si no, la del mismo tractor a la misma hora aunque los números no coincidan
CREATE OR REPLACE FUNCTION fue.fn_enex_vincular()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE e record; k fue.carga_combustible%ROWTYPE; n integer := 0; v_dif text;
BEGIN
    UPDATE fue.enex_transaccion t SET camion_id = c.id
      FROM mae.camion c
     WHERE t.camion_id IS NULL AND c.eliminado_en IS NULL AND upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = t.patente;
    FOR e IN SELECT * FROM fue.enex_transaccion WHERE carga_id IS NULL AND camion_id IS NOT NULL AND descartada_en IS NULL
                AND fecha_hora > now() - interval '45 days' ORDER BY fecha_hora LOOP
        SELECT x.* INTO k FROM fue.carga_combustible x
         WHERE x.camion_id = e.camion_id AND x.eliminado_en IS NULL AND coalesce(x.estado_validacion, '') <> 'anulada'
           AND x.tanque_reefer_id IS NULL AND x.deposito_id IS NULL
           AND x.fecha_hora BETWEEN e.fecha_hora - interval '6 hours' AND e.fecha_hora + interval '6 hours'
           AND NOT EXISTS (SELECT 1 FROM fue.enex_transaccion o WHERE o.carga_id = x.id)
         ORDER BY (abs(x.litros - e.litros) <= greatest(2, e.litros * 0.02)) DESC, abs(x.litros - e.litros), abs(extract(epoch FROM x.fecha_hora - e.fecha_hora)) LIMIT 1;
        IF k.id IS NOT NULL THEN
            UPDATE fue.enex_transaccion SET carga_id = k.id, revisado_en = now() WHERE id = e.id;
            n := n + 1;
        END IF;
        k := NULL;
    END LOOP;
    -- Las que están unidas: ¿lo registrado dice lo mismo que Enex?
    FOR e IN SELECT t.id, t.litros, t.precio_clp, t.monto_clp, x.litros AS k_litros, x.precio_unitario AS k_precio, x.moneda AS k_moneda, x.importe_original AS k_importe
               FROM fue.enex_transaccion t JOIN fue.carga_combustible x ON x.id = t.carga_id
              WHERE t.fecha_hora > now() - interval '45 days' LOOP
        v_dif := concat_ws(' · ',
            CASE WHEN abs(e.k_litros - e.litros) > 0.5 THEN format('litros: registrado %s, Enex %s', round(e.k_litros, 1), round(e.litros, 1)) END,
            CASE WHEN e.k_moneda <> 'CLP' THEN format('moneda: registrado %s, Enex CLP', e.k_moneda)
                 WHEN e.precio_clp IS NOT NULL AND abs(e.k_precio - e.precio_clp) > 1 THEN format('precio: registrado %s, Enex %s', round(e.k_precio), round(e.precio_clp)) END);
        UPDATE fue.enex_transaccion SET difiere = (v_dif <> ''), diferencia = nullif(v_dif, '') WHERE id = e.id AND (difiere IS DISTINCT FROM (v_dif <> '') OR diferencia IS DISTINCT FROM nullif(v_dif, ''));
    END LOOP;
    RETURN n;
END $function$;

-- Quién puede resolver: los mismos que registran cargas
CREATE OR REPLACE FUNCTION fue.fn_enex_exigir()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    IF NOT fue.fn_puede_registrar_cargas() THEN
        RAISE EXCEPTION 'Las cargas de Shell las resuelven Adm. de combustible, Base Mendoza o TI' USING ERRCODE = '42501';
    END IF;
END $function$;

-- Registrar con un clic la carga que informó Enex
CREATE OR REPLACE FUNCTION fue.fn_enex_registrar(p_trx bigint, p_estacion bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE t fue.enex_transaccion%ROWTYPE; v_est bigint; v_id bigint; v_precio numeric;
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
    IF NOT EXISTS (SELECT 1 FROM mae.estacion_servicio s WHERE s.id = v_est AND s.eliminado_en IS NULL AND s.pais = 'CL') THEN
        RAISE EXCEPTION 'La estación elegida no existe o no es de Chile' USING ERRCODE = '22023';
    END IF;
    v_precio := coalesce(t.precio_clp, round(t.monto_clp / nullif(t.litros, 0), 4));
    IF v_precio IS NULL THEN RAISE EXCEPTION 'Enex no informó el precio de esa carga' USING ERRCODE = '23502'; END IF;
    INSERT INTO fue.carga_combustible (camion_id, chofer_id, estacion_id, fecha_hora, tipo_combustible_id, litros, precio_unitario, moneda,
                                       importe_original, medio_pago, odometro_km, origen_dato, tanque_lleno, es_frontera, motivo_observacion)
    VALUES (t.camion_id, fue.fn_chofer_actual(t.camion_id), v_est, t.fecha_hora, (SELECT tipo_combustible_id FROM mae.camion WHERE id = t.camion_id),
            round(t.litros, 2), v_precio, 'CLP', coalesce(t.monto_clp, round(t.litros * v_precio, 2)), 'tarjeta', NULL, 'tarjeta', false, false,
            'Shell Card (Enex) · transacción ' || t.trx || coalesce(' · documento ' || t.nro_documento, ''))
    RETURNING id INTO v_id;
    IF t.estacion_codigo IS NOT NULL THEN
        INSERT INTO fue.enex_estacion (codigo, estacion_id, creado_por) VALUES (t.estacion_codigo, v_est, aud.fn_usuario_actual())
        ON CONFLICT (codigo) DO UPDATE SET estacion_id = EXCLUDED.estacion_id;
    END IF;
    UPDATE fue.enex_transaccion SET carga_id = v_id, registrada_por_enex = true, difiere = false, diferencia = NULL, revisado_en = now(), resuelta_por = aud.fn_usuario_actual() WHERE id = p_trx;
    RETURN jsonb_build_object('carga_id', v_id);
END $function$;

-- Corregir lo registrado con lo que dice Enex (usa la edición de cargas de siempre: mismas reglas y auditoría)
CREATE OR REPLACE FUNCTION fue.fn_enex_corregir(p_trx bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE t record; v_ver integer; v_precio numeric;
BEGIN
    PERFORM fue.fn_enex_exigir();
    SELECT x.* INTO t FROM fue.fn_enex_una(p_trx) x;
    IF t.id IS NULL THEN RAISE EXCEPTION 'Esa carga de Enex no existe' USING ERRCODE = 'P0002'; END IF;
    IF t.carga_id IS NULL THEN RAISE EXCEPTION 'Esa carga todavía no está registrada: registrala primero' USING ERRCODE = '55000'; END IF;
    IF NOT t.difiere THEN RAISE EXCEPTION 'Lo registrado ya coincide con Enex' USING ERRCODE = '55000'; END IF;
    v_precio := coalesce(t.precio_clp, round(t.monto_clp / nullif(t.litros, 0), 4));
    SELECT k.version_fila INTO v_ver FROM fue.carga_combustible k WHERE k.id = t.carga_id;
    PERFORM fue.fn_editar_carga(t.carga_id, v_ver,
                jsonb_strip_nulls(jsonb_build_object('litros', round(t.litros, 2), 'precio_unitario', v_precio, 'moneda', 'CLP', 'medio_pago', 'tarjeta')),
                'Corregido con lo que informó Enex (Shell Card, transacción ' || t.trx || '): ' || coalesce(t.diferencia, ''));
    PERFORM fue.fn_enex_marcar_corregida(p_trx);
    RETURN jsonb_build_object('carga_id', t.carga_id, 'antes', t.diferencia);
END $function$;

CREATE OR REPLACE FUNCTION fue.fn_enex_una(p_trx bigint)
 RETURNS SETOF fue.enex_transaccion
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ SELECT * FROM fue.enex_transaccion WHERE id = p_trx AND fue.fn_puede_registrar_cargas() $function$;

CREATE OR REPLACE FUNCTION fue.fn_enex_marcar_corregida(p_trx bigint)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    PERFORM fue.fn_enex_exigir();
    UPDATE fue.enex_transaccion SET corregida_en = now(), resuelta_por = aud.fn_usuario_actual() WHERE id = p_trx;
    PERFORM fue.fn_enex_vincular();
END $function$;

-- Descartar una carga de Enex que no corresponde registrar (queda el motivo)
CREATE OR REPLACE FUNCTION fue.fn_enex_descartar(p_trx bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    PERFORM fue.fn_enex_exigir();
    IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'Escribí por qué se descarta' USING ERRCODE = '23502'; END IF;
    UPDATE fue.enex_transaccion SET descartada_en = now(), descartada_motivo = btrim(p_motivo), resuelta_por = aud.fn_usuario_actual()
     WHERE id = p_trx AND carga_id IS NULL AND descartada_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esa carga no existe, ya está registrada o ya fue descartada' USING ERRCODE = '55000'; END IF;
END $function$;

-- Lo que hay para resolver (para la pantalla)
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
                'id', t.id, 'fecha_hora', t.fecha_hora, 'patente', t.patente, 'es_tractor', t.camion_id IS NOT NULL, 'litros', t.litros, 'precio_clp', t.precio_clp, 'monto_clp', t.monto_clp,
                'producto', t.producto, 'donde', coalesce(t.direccion, t.ciudad), 'documento', t.nro_documento,
                'estacion_id', (SELECT m.estacion_id FROM fue.enex_estacion m WHERE m.codigo = t.estacion_codigo),
                'situacion', CASE WHEN t.carga_id IS NULL THEN 'falta_registrar' ELSE 'difiere' END,
                'carga_id', t.carga_id, 'diferencia', t.diferencia) ORDER BY t.fecha_hora DESC), '[]')
              FROM fue.enex_transaccion t
             WHERE t.descartada_en IS NULL AND t.fecha_hora > now() - interval '45 days' AND (t.carga_id IS NULL OR t.difiere)));
END $function$;

-- Lo que llama la web
CREATE OR REPLACE FUNCTION ops.fn_enex_pendientes() RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_enex_pendientes() $f$;
CREATE OR REPLACE FUNCTION ops.fn_enex_registrar(p_id bigint, p_estacion bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_enex_registrar(p_id, p_estacion) $f$;
CREATE OR REPLACE FUNCTION ops.fn_enex_corregir(p_id bigint) RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_enex_corregir(p_id) $f$;
CREATE OR REPLACE FUNCTION ops.fn_enex_descartar(p_id bigint, p_motivo text) RETURNS void LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_enex_descartar(p_id, p_motivo) $f$;

-- Permisos: los mismos roles que registran la carga de una orden
DO $do$
DECLARE r record; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['fue.fn_enex_exigir()', 'fue.fn_enex_registrar(bigint, bigint)', 'fue.fn_enex_corregir(bigint)', 'fue.fn_enex_una(bigint)',
                             'fue.fn_enex_marcar_corregida(bigint)', 'fue.fn_enex_descartar(bigint, text)', 'fue.fn_enex_pendientes()',
                             'ops.fn_enex_pendientes()', 'ops.fn_enex_registrar(bigint, bigint)', 'ops.fn_enex_corregir(bigint)', 'ops.fn_enex_descartar(bigint, text)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('tc_admin', 'tc_app') LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r.rolname);
        END LOOP;
    END LOOP;
    IF NOT has_function_privilege('tc_app', 'ops.fn_enex_registrar(bigint, bigint)', 'EXECUTE') THEN RAISE EXCEPTION 'Faltó el permiso de la web'; END IF;
END $do$;

-- Iris: que distinga las que difieren
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_lectura_cargas_shell(jsonb)'::regprocedure);
BEGIN
    IF v_def LIKE '%DIFIERE DE ENEX%' THEN RETURN; END IF;
    IF position('CASE WHEN x.carga_id IS NOT NULL THEN ''registrada''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_lectura_cargas_shell no es la que esperaba esta migración';
    END IF;
    EXECUTE replace(v_def, 'CASE WHEN x.carga_id IS NOT NULL THEN ''registrada''',
        'CASE WHEN x.descartada_en IS NOT NULL THEN ''descartada'' WHEN x.carga_id IS NOT NULL AND x.difiere THEN ''DIFIERE DE ENEX: '' || coalesce(x.diferencia, '''') WHEN x.carga_id IS NOT NULL THEN ''registrada''');
END $do$;

SELECT fue.fn_enex_vincular();

COMMIT;
