-- =============================================================================
-- IronTrack — 283 · Cambio 277 · Combustible: el remito de la estación manda y se registra o corrige solo
-- -----------------------------------------------------------------------------
-- Pedido del usuario (19/11/2026): que la fecha, la hora y los litros salgan del documento de la estación, que el remito
-- de Shell Rodríguez Peña se compare solo con la carga aunque todavía no esté registrada, y que todo sea lo más
-- automático posible. Decisiones: manda el remito, después el ticket leído por Iris, después lo escrito a mano;
-- con orden de carga se registra solo; si ya estaba registrada y difiere, se corrige sola salvo que esté en un
-- período cerrado (cierre de viaje aprobado); sin orden ni carga queda para revisar.
--   · fue.remito_estacion: orden_id (la orden de carga del remito), auto_accion ('registrada' | 'corregida'), auto_en y
--     auto_motivo (por qué no se pudo hacer solo).
--   · El remito se une a la orden de carga (mismo tractor y estación, entre 1 h antes y 12 h después de autorizada), no
--     solo a una carga ya registrada. Si la orden ya tiene carga, el remito queda unido a esa carga.
--   · fue.fn_propuesta_carga_orden: si la orden tiene remito, la propuesta usa sus litros, precio, fecha y hora y su
--     número (la función anterior queda como fue.fn_propuesta_carga_orden_ticket). Así también lo que registra una persona
--     sale del remito.
--   · fue.fn_registrar_carga_orden: el control «el ticket dice X L» no frena cuando los litros son los del remito.
--   · Automático (cada 10 minutos, con la sincronización de remitos), solo remitos de los últimos 7 días:
--       - Orden sin carga: registra la carga con el remito. Pasa la orden a «cargada» si el chofer no la terminó.
--         Exige litros dentro de lo autorizado (2 % + 1 L de margen; a «llenar» no tiene tope) y moneda ARS.
--         Corte de viaje: solo si la orden era a tanque lleno y el chofer sacó las fotos del tablero (entre 3 h antes y
--         12 h después). Lleno sin fotos del tablero: queda para revisar (no se sabe si inicia viaje).
--       - Carga que difiere del remito (litros, precio, moneda, estación u hora, más de 10 minutos): la corrige con
--         fue.fn_editar_carga (queda en el historial). Si la carga está en un período cerrado o es la salida o llegada de un
--         cierre, no la toca y anota el motivo.
--     Lo hace la base sin usuario: fue.fn_puede_registrar_cargas y fue.fn_editar_carga aceptan el modo automático solo
--     cuando no hay usuario identificado y la propia base pone «fue.automatico» (nunca desde la web).
--   · Al unirse a una orden «autorizada», la orden pasa a «cargada» con los datos del remito (la estación confirma la carga),
--     con la misma alerta de litros de más que pone el chofer. Si después el chofer toca «Terminé mi carga», se guardan
--     sus fotos y no le da error (fue.fn_terminar_orden_carga).
--   · fue.fn_remito_registrar (botón «Registrar»): un remito con orden se registra desde la orden.
--   · fue.fn_remitos_pendientes: devuelve la orden, el motivo de lo que no se hizo solo y lo que se hizo solo en 7 días.
--   · Parámetro fue.remitos_automatico (true): en false vuelve a ser como antes (solo propone).
-- Genset: el remito se une a la orden del genset pero no se registra solo. web.version_base = 283.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    -- Compras pudo haberse corrido con su número viejo (280): vale si ya están sus tablas y la 281
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 282
       AND NOT (coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) >= 281 AND to_regclass('fin.pedido_compra') IS NOT NULL) THEN
        RAISE EXCEPTION 'Falta la migración 282 (compras y cotizaciones): aplicarla antes';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fue' AND table_name = 'remito_estacion' AND column_name = 'orden_id') THEN
        RAISE EXCEPTION 'La migración 283 (remitos automáticos) ya está aplicada';
    END IF;
    IF to_regprocedure('fue.fn_remitos_vincular()') IS NULL OR to_regprocedure('fue.fn_remitos_pendientes()') IS NULL
       OR to_regprocedure('fue.fn_remito_registrar(bigint,bigint)') IS NULL
       OR to_regprocedure('fue.fn_propuesta_carga_orden(bigint)') IS NULL OR to_regprocedure('fue.fn_registrar_carga_orden(bigint,boolean,jsonb)') IS NULL
       OR to_regprocedure('fue.fn_editar_carga(bigint,integer,jsonb,text)') IS NULL OR to_regprocedure('fue.fn_puede_registrar_cargas()') IS NULL
       OR to_regprocedure('fue.fn_hora_ticket(bigint[],timestamp with time zone,timestamp with time zone)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones de combustible (remitos 277 y hora del ticket): aplicar esas migraciones antes';
    END IF;
END $do$;

-- 1 · Columnas y parámetro ------------------------------------------------------
ALTER TABLE fue.remito_estacion
    ADD COLUMN orden_id bigint REFERENCES fue.orden_carga (id),
    ADD COLUMN auto_accion text CHECK (auto_accion IS NULL OR auto_accion IN ('registrada', 'corregida')),
    ADD COLUMN auto_en timestamptz,
    ADD COLUMN auto_motivo text;
CREATE INDEX ix_remito_estacion_orden ON fue.remito_estacion (orden_id) WHERE orden_id IS NOT NULL;

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fue.remitos_automatico', 'true', 'Migración 283: «true» = con el remito de la estación se registra sola la carga de una orden y se corrige sola la carga que difiere (si no está en un período cerrado). «false» = solo se propone.')
ON CONFLICT (codigo) DO NOTHING;

-- 2 · Modo automático: sin usuario y con «fue.automatico» que pone la propia base ----
CREATE FUNCTION fue.fn_es_automatico()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT aud.fn_usuario_actual() IS NULL AND coalesce(current_setting('fue.automatico', true), '') = '1'
$f$;
REVOKE ALL ON FUNCTION fue.fn_es_automatico() FROM PUBLIC;

DO $do$
DECLARE v_def text; v_nuevo text; n integer;
BEGIN
    -- fue.fn_puede_registrar_cargas: también en modo automático
    v_def := pg_get_functiondef('fue.fn_puede_registrar_cargas()'::regprocedure);
    n := (length(v_def) - length(replace(v_def, 'rol_codigo IN (''adm_combustible'', ''base_mendoza'', ''ti''))', ''))) / length('rol_codigo IN (''adm_combustible'', ''base_mendoza'', ''ti''))');
    IF n <> 1 THEN RAISE EXCEPTION 'fue.fn_puede_registrar_cargas cambió: no se encontró el punto a modificar (%)', n; END IF;
    v_nuevo := replace(v_def, 'rol_codigo IN (''adm_combustible'', ''base_mendoza'', ''ti''))',
                              'rol_codigo IN (''adm_combustible'', ''base_mendoza'', ''ti'')) OR fue.fn_es_automatico()');
    EXECUTE v_nuevo;

    -- fue.fn_editar_carga: sin usuario solo en modo automático; el control de quién edita no aplica a la base
    v_def := pg_get_functiondef('fue.fn_editar_carga(bigint,integer,jsonb,text)'::regprocedure);
    v_nuevo := regexp_replace(v_def, 'IF v_usr IS NULL THEN(\s+RAISE EXCEPTION ''Editar una carga exige un usuario identificado'')',
                              'IF v_usr IS NULL AND NOT fue.fn_es_automatico() THEN\1');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'fue.fn_editar_carga cambió: no se encontró el control de usuario'; END IF;
    v_def := v_nuevo;
    v_nuevo := regexp_replace(v_def, 'IF c\.creado_por IS DISTINCT FROM v_usr AND NOT coalesce\(v_roles',
                              'IF v_usr IS NOT NULL AND c.creado_por IS DISTINCT FROM v_usr AND NOT coalesce(v_roles');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'fue.fn_editar_carga cambió: no se encontró el control de quién edita'; END IF;
    EXECUTE v_nuevo;

    -- fue.fn_registrar_carga_orden: los litros del remito valen aunque el ticket leído diga otra cosa
    v_def := pg_get_functiondef('fue.fn_registrar_carga_orden(bigint,boolean,jsonb)'::regprocedure);
    v_nuevo := replace(v_def,
        'IF round(fue.fn_litros_ticket(o.lecturas), 2) <> round(v_lit, 2) AND abs(fue.fn_litros_ticket(o.lecturas) - v_lit) < 1 THEN',
        'IF round(fue.fn_litros_ticket(o.lecturas), 2) <> round(v_lit, 2) AND abs(fue.fn_litros_ticket(o.lecturas) - v_lit) < 1'
        || E'\n       AND NOT EXISTS (SELECT 1 FROM fue.remito_estacion r WHERE r.orden_id = o.id AND r.descartada_en IS NULL AND r.lectura = ''lista'''
        || E'\n                          AND round(r.litros, 2) = round(v_lit, 2)) THEN');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'fue.fn_registrar_carga_orden cambió: no se encontró el control de los litros del ticket'; END IF;
    EXECUTE v_nuevo;
END $do$;

-- 3 · La propuesta de la orden: manda el remito -------------------------------------
ALTER FUNCTION fue.fn_propuesta_carga_orden(bigint) RENAME TO fn_propuesta_carga_orden_ticket;

CREATE FUNCTION fue.fn_propuesta_carga_orden(p_orden bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p jsonb := fue.fn_propuesta_carga_orden_ticket(p_orden); r fue.remito_estacion%ROWTYPE; v_lit numeric; v_dif text;
BEGIN
    IF p IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO r FROM fue.remito_estacion
     WHERE orden_id = p_orden AND descartada_en IS NULL AND lectura = 'lista' AND litros > 0 AND precio > 0 AND fecha_hora IS NOT NULL
     ORDER BY id LIMIT 1;
    IF r.id IS NULL THEN RETURN p || jsonb_build_object('del_remito', false); END IF;
    v_lit := round(r.litros, 2);
    v_dif := concat_ws(' · ',
        CASE WHEN (p ->> 'litros') IS NOT NULL AND round((p ->> 'litros')::numeric, 2) <> v_lit
             THEN format('el ticket dice %s L', replace(to_char(round((p ->> 'litros')::numeric, 2), 'FM999999990.00'), '.', ',')) END,
        CASE WHEN (p ->> 'precio_unitario') IS NOT NULL AND abs((p ->> 'precio_unitario')::numeric - r.precio) > 0.01
             THEN format('el ticket dice %s por litro', replace(to_char((p ->> 'precio_unitario')::numeric, 'FM999999990.00'), '.', ',')) END);
    RETURN p || jsonb_build_object(
        'litros', v_lit, 'precio_unitario', r.precio, 'moneda', coalesce(r.moneda, 'ARS'), 'fecha_hora', r.fecha_hora,
        'importe', round(v_lit * r.precio, 2), 'ticket_numero', coalesce(nullif(r.numero, ''), p ->> 'ticket_numero'),
        'odometro_km', coalesce((fue.fn_odometro_telemetria((p ->> 'camion_id')::bigint, r.fecha_hora) ->> 'odometro_km')::numeric, (p ->> 'odometro_km')::numeric),
        'del_remito', true, 'remito_id', r.id, 'remito_numero', r.numero, 'hora_del_ticket', true,
        'alerta', nullif(concat_ws(' · ', nullif(p ->> 'alerta', ''),
                                   CASE WHEN v_dif <> '' THEN 'Datos del remito ' || coalesce(r.numero, '') || ' de la estación (manda sobre el ticket: ' || v_dif || ')' END), ''));
END $f$;

-- Los permisos de la propuesta: los mismos que tenía
DO $do$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fue.fn_propuesta_carga_orden(bigint) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon') LOOP
        IF has_function_privilege(r.rolname, 'fue.fn_propuesta_carga_orden_ticket(bigint)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fue.fn_propuesta_carga_orden(bigint) TO %I', r.rolname);
        END IF;
    END LOOP;
END $do$;

-- 4 · Registrar sola la carga de una orden con su remito ---------------------------
-- Devuelve la carga; si algo no cierra, error con el motivo (lo anota quien la llama).
CREATE FUNCTION fue.fn_remito_registrar_orden_auto(p_remito bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t fue.remito_estacion%ROWTYPE; o fue.orden_carga%ROWTYPE; v_lleno boolean; v_corte boolean; v_r jsonb; v_lit numeric;
BEGIN
    SELECT * INTO t FROM fue.remito_estacion WHERE id = p_remito FOR UPDATE;
    IF t.orden_id IS NULL OR t.carga_id IS NOT NULL OR t.descartada_en IS NOT NULL THEN RETURN NULL; END IF;
    IF t.lectura <> 'lista' OR t.litros IS NULL OR t.litros <= 0 OR t.precio IS NULL OR t.precio <= 0 OR t.fecha_hora IS NULL THEN
        RAISE EXCEPTION 'Iris no leyó todos los datos del remito (litros, precio, fecha y hora)';
    END IF;
    IF coalesce(t.moneda, 'ARS') <> 'ARS' THEN RAISE EXCEPTION 'El remito no está en pesos argentinos'; END IF;
    SELECT * INTO o FROM fue.orden_carga WHERE id = t.orden_id FOR UPDATE;
    IF o.genset_id IS NOT NULL OR o.camion_id IS NULL THEN RAISE EXCEPTION 'Es la orden de un genset: se registra desde la orden'; END IF;
    IF o.carga_id IS NOT NULL THEN RETURN NULL; END IF;
    IF o.estado NOT IN ('autorizada', 'cargada') THEN RAISE EXCEPTION 'La orden % está %', o.numero, o.estado; END IF;
    IF t.estacion_id IS DISTINCT FROM o.estacion_id THEN RAISE EXCEPTION 'La estación del remito no es la de la orden %', o.numero; END IF;
    v_lit := round(t.litros, 2);
    IF o.modo = 'litros' AND v_lit > o.litros * 1.02 + 1 THEN
        RAISE EXCEPTION 'Cargó % L y la orden % autorizaba % L', replace(v_lit::text, '.', ','), o.numero, replace(trim_scale(o.litros)::text, '.', ',');
    END IF;
    IF o.modo = 'importe' AND round(v_lit * t.precio, 2) > o.importe * 1.02 + 1 THEN
        RAISE EXCEPTION 'Cargó por $ % y la orden % autorizaba $ %', replace(to_char(round(v_lit * t.precio), 'FM999,999,999,990'), ',', '.'), o.numero,
            replace(to_char(round(o.importe), 'FM999,999,999,990'), ',', '.');
    END IF;
    -- ¿Inicia viaje? Solo un lleno con las fotos del tablero es corte; lleno sin fotos no se sabe
    v_lleno := coalesce((fue.fn_propuesta_carga_orden_ticket(o.id) ->> 'tanque_lleno')::boolean, false);
    v_corte := v_lleno AND EXISTS (SELECT 1 FROM tel.tablero b WHERE b.camion_id = o.camion_id AND b.anulado_en IS NULL
                                     AND b.tomada_en BETWEEN t.fecha_hora - interval '3 hours' AND t.fecha_hora + interval '12 hours');
    IF v_lleno AND NOT v_corte THEN
        RAISE EXCEPTION 'Fue a tanque lleno pero no hay fotos del tablero: no se sabe si inicia viaje (corte)';
    END IF;
    -- La orden terminada con los datos del remito (si el chofer no tocó «Terminé mi carga»)
    IF o.estado = 'autorizada' THEN
        UPDATE fue.orden_carga SET estado = 'cargada', cargada_en = t.fecha_hora, litros_cargados = v_lit,
               importe_cargado = round(v_lit * t.precio, 2)
         WHERE id = o.id;
    END IF;
    PERFORM set_config('fue.automatico', '1', true);
    v_r := fue.fn_registrar_carga_orden(o.id, v_corte, jsonb_build_object(
               'litros', v_lit, 'precio_unitario', t.precio, 'moneda', 'ARS', 'fecha_hora', t.fecha_hora,
               'ticket_numero', coalesce(nullif(t.numero, ''), 'remito ' || t.id)));
    PERFORM set_config('fue.automatico', '', true);
    UPDATE fue.carga_combustible SET motivo_observacion = coalesce(motivo_observacion || ' · ', '') || 'registrada sola con el remito ' || coalesce(t.numero, '')
     WHERE id = (v_r ->> 'carga_id')::bigint;
    UPDATE fue.remito_estacion SET carga_id = (v_r ->> 'carga_id')::bigint, registrada_por_remito = true, difiere = false, diferencia = NULL,
           auto_accion = 'registrada', auto_en = now(), auto_motivo = NULL
     WHERE id = t.id;
    RETURN (v_r ->> 'carga_id')::bigint;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('fue.automatico', '', true);
    RAISE;
END $f$;
REVOKE ALL ON FUNCTION fue.fn_remito_registrar_orden_auto(bigint) FROM PUBLIC;

-- 5 · Corregir sola la carga que difiere del remito ---------------------------------
CREATE FUNCTION fue.fn_remito_corregir_auto(p_remito bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t fue.remito_estacion%ROWTYPE; k fue.carga_combustible%ROWTYPE; v_datos jsonb;
BEGIN
    SELECT * INTO t FROM fue.remito_estacion WHERE id = p_remito FOR UPDATE;
    IF t.carga_id IS NULL OR NOT t.difiere OR t.descartada_en IS NOT NULL THEN RETURN false; END IF;
    IF t.litros IS NULL OR t.litros <= 0 OR t.precio IS NULL OR t.precio <= 0 OR t.fecha_hora IS NULL THEN
        RAISE EXCEPTION 'Iris no leyó todos los datos del remito (litros, precio, fecha y hora)';
    END IF;
    IF coalesce(t.moneda, 'ARS') <> 'ARS' THEN RAISE EXCEPTION 'El remito no está en pesos argentinos'; END IF;
    SELECT * INTO k FROM fue.carga_combustible WHERE id = t.carga_id;
    v_datos := jsonb_strip_nulls(jsonb_build_object(
        'litros', round(t.litros, 2), 'precio_unitario', t.precio, 'moneda', 'ARS', 'estacion_id', t.estacion_id,
        'fecha_hora', CASE WHEN abs(extract(epoch FROM k.fecha_hora - t.fecha_hora)) > 600 THEN t.fecha_hora END));
    PERFORM set_config('fue.automatico', '1', true);
    PERFORM fue.fn_editar_carga(k.id, k.version_fila, v_datos,
        'Corregida sola con el remito ' || coalesce(t.numero, '') || ' de la estación: ' || coalesce(t.diferencia, ''));
    PERFORM set_config('fue.automatico', '', true);
    UPDATE fue.remito_estacion SET corregida_en = now(), difiere = false, auto_accion = 'corregida', auto_en = now(), auto_motivo = NULL
     WHERE id = t.id;
    RETURN true;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('fue.automatico', '', true);
    RAISE;
END $f$;
REVOKE ALL ON FUNCTION fue.fn_remito_corregir_auto(bigint) FROM PUBLIC;

-- 6 · El cruce: remito ↔ orden ↔ carga, diferencias (con la hora) y lo automático ---
CREATE OR REPLACE FUNCTION fue.fn_remitos_vincular()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE e record; k fue.carga_combustible%ROWTYPE; v_o fue.orden_carga%ROWTYPE; n integer := 0; v_dif text;
        v_param boolean := coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.remitos_automatico' AND eliminado_en IS NULL), false);
        v_auto boolean := v_param AND aud.fn_usuario_actual() IS NULL;
        v_tol numeric := ref.fn_parametro_num('fue.orden_carga_tolerancia_l', 30);
BEGIN
    UPDATE fue.remito_estacion t SET camion_id = c.id
      FROM mae.camion c
     WHERE t.camion_id IS NULL AND t.patente IS NOT NULL AND c.eliminado_en IS NULL
       AND upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = t.patente;
    UPDATE fue.remito_estacion t SET estacion_id = m.estacion_id
      FROM fue.remito_estacion_cuit m
     WHERE t.estacion_id IS NULL AND t.cuit = m.cuit;
    -- Remito repetido (mismo número y CUIT en otro mail): se descarta solo el nuevo
    UPDATE fue.remito_estacion t SET descartada_en = now(), descartada_motivo = 'Remito repetido: ya llegó en otro mail'
     WHERE t.descartada_en IS NULL AND t.carga_id IS NULL AND t.numero IS NOT NULL
       AND EXISTS (SELECT 1 FROM fue.remito_estacion o WHERE o.id < t.id AND o.numero = t.numero AND o.cuit IS NOT DISTINCT FROM t.cuit AND o.descartada_en IS NULL);

    -- Migración 283: el remito con su orden de carga (mismo tractor y estación, de 1 h antes a 12 h después de autorizada)
    FOR e IN SELECT * FROM fue.remito_estacion WHERE lectura = 'lista' AND orden_id IS NULL AND carga_id IS NULL AND camion_id IS NOT NULL
                AND estacion_id IS NOT NULL AND descartada_en IS NULL AND fecha_hora IS NOT NULL AND fecha_hora > now() - interval '60 days'
              ORDER BY fecha_hora LOOP
        SELECT x.* INTO v_o FROM fue.orden_carga x
         WHERE x.camion_id = e.camion_id AND x.estacion_id = e.estacion_id AND x.estado IN ('autorizada', 'cargada')
           AND x.autorizada_en IS NOT NULL AND e.fecha_hora BETWEEN x.autorizada_en - interval '1 hour' AND x.autorizada_en + interval '12 hours'
           AND NOT EXISTS (SELECT 1 FROM fue.remito_estacion r WHERE r.orden_id = x.id AND r.descartada_en IS NULL)
         ORDER BY abs(extract(epoch FROM e.fecha_hora - x.autorizada_en)) LIMIT 1;
        IF v_o.id IS NOT NULL THEN
            UPDATE fue.remito_estacion SET orden_id = v_o.id, carga_id = v_o.carga_id WHERE id = e.id;
            n := n + 1;
            -- La estación confirma que cargó: la orden queda «cargada» con los datos del remito aunque el chofer no haya
            -- tocado «Terminé mi carga» (así aparece en «Cargas de órdenes para registrar» si no se registra sola)
            IF v_param AND v_o.estado = 'autorizada' AND v_o.genset_id IS NULL AND e.litros > 0 AND e.precio > 0 THEN
                UPDATE fue.orden_carga SET estado = 'cargada', cargada_en = e.fecha_hora, litros_cargados = round(e.litros, 2),
                       importe_cargado = round(round(e.litros, 2) * e.precio, 2),
                       diferencia_l = CASE WHEN v_o.modo = 'litros' AND e.litros > v_o.litros + v_tol THEN round(e.litros - v_o.litros, 1)
                                           WHEN v_o.modo = 'llenar' AND v_o.litros_calculados IS NOT NULL AND e.litros - v_o.litros_calculados > v_tol
                                           THEN round(e.litros - v_o.litros_calculados, 1) END,
                       alerta = CASE WHEN v_o.modo = 'litros' AND e.litros > v_o.litros + v_tol
                                     THEN format('Se autorizaron %s L y el remito de la estación dice %s L.', tel.fn_num_ar(v_o.litros), tel.fn_num_ar(round(e.litros, 2)))
                                     WHEN v_o.modo = 'llenar' AND v_o.litros_calculados IS NOT NULL AND e.litros - v_o.litros_calculados > v_tol
                                     THEN format('Para llenar se calcularon %s L y el remito de la estación dice %s L: %s L de más. Posible faltante de combustible en el viaje.',
                                                 tel.fn_num_ar(v_o.litros_calculados), tel.fn_num_ar(round(e.litros, 2)), tel.fn_num_ar(round(e.litros - v_o.litros_calculados, 1)))
                                     WHEN v_o.modo = 'importe' AND e.litros * e.precio > v_o.importe * 1.01
                                     THEN format('Se autorizaron %s %s y el remito de la estación dice %s %s.', v_o.moneda, tel.fn_num_ar(v_o.importe), v_o.moneda, tel.fn_num_ar(round(e.litros * e.precio, 2))) END
                 WHERE id = v_o.id AND estado = 'autorizada';
            END IF;
        END IF;
        v_o := NULL;
    END LOOP;

    -- Remito sin orden: con una carga ya registrada del mismo tractor (±6 h)
    FOR e IN SELECT * FROM fue.remito_estacion WHERE lectura = 'lista' AND carga_id IS NULL AND orden_id IS NULL AND camion_id IS NOT NULL
                AND descartada_en IS NULL AND fecha_hora IS NOT NULL AND litros IS NOT NULL AND fecha_hora > now() - interval '60 days' ORDER BY fecha_hora LOOP
        SELECT x.* INTO k FROM fue.carga_combustible x
         WHERE x.camion_id = e.camion_id AND x.eliminado_en IS NULL AND coalesce(x.estado_validacion, '') <> 'anulada'
           AND x.tanque_reefer_id IS NULL AND x.deposito_id IS NULL
           AND x.fecha_hora BETWEEN e.fecha_hora - interval '6 hours' AND e.fecha_hora + interval '6 hours'
           AND (e.estacion_id IS NULL OR x.estacion_id IS NULL OR x.estacion_id = e.estacion_id)
           AND NOT EXISTS (SELECT 1 FROM fue.remito_estacion o WHERE o.carga_id = x.id AND o.descartada_en IS NULL)
         ORDER BY (abs(x.litros - e.litros) <= greatest(2, e.litros * 0.02)) DESC, abs(x.litros - e.litros), abs(extract(epoch FROM x.fecha_hora - e.fecha_hora)) LIMIT 1;
        IF k.id IS NOT NULL THEN
            UPDATE fue.remito_estacion SET carga_id = k.id WHERE id = e.id;
            n := n + 1;
        END IF;
        k := NULL;
    END LOOP;
    -- Si la orden se registró después de unir el remito, el remito queda con esa carga
    UPDATE fue.remito_estacion t SET carga_id = x.carga_id
      FROM fue.orden_carga x
     WHERE t.orden_id = x.id AND t.carga_id IS NULL AND x.carga_id IS NOT NULL AND t.descartada_en IS NULL;

    -- ¿La carga dice lo mismo que el remito? Litros desde 0,02 L, precio por litro, moneda, estación y hora (más de 10 minutos)
    FOR e IN SELECT t.id, t.litros, t.precio, t.estacion_id, t.fecha_hora, x.litros AS k_litros, x.precio_unitario AS k_precio, x.moneda AS k_moneda,
                    x.estacion_id AS k_est, x.fecha_hora AS k_fecha
               FROM fue.remito_estacion t JOIN fue.carga_combustible x ON x.id = t.carga_id
              WHERE t.descartada_en IS NULL AND t.fecha_hora > now() - interval '60 days' LOOP
        v_dif := concat_ws(' · ',
            CASE WHEN abs(e.k_litros - round(e.litros, 2)) >= 0.02 THEN format('litros: registrado %s, remito %s', e.k_litros, round(e.litros, 3)) END,
            CASE WHEN e.k_moneda <> 'ARS' THEN format('moneda: registrado %s, remito ARS', e.k_moneda)
                 WHEN e.precio IS NOT NULL AND abs(e.k_precio - e.precio) > 0.01 THEN format('precio por litro: registrado %s, remito %s', round(e.k_precio, 2), round(e.precio, 2)) END,
            CASE WHEN e.estacion_id IS NOT NULL AND e.k_est IS DISTINCT FROM e.estacion_id
                 THEN 'estación: registrada ' || coalesce((SELECT nombre FROM mae.estacion_servicio WHERE id = e.k_est), 'sin estación')
                      || ', remito ' || (SELECT nombre FROM mae.estacion_servicio WHERE id = e.estacion_id) END,
            CASE WHEN abs(extract(epoch FROM e.k_fecha - e.fecha_hora)) > 600
                 THEN format('hora: registrada %s, remito %s', to_char(e.k_fecha AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM HH24:MI'),
                             to_char(e.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM HH24:MI')) END);
        UPDATE fue.remito_estacion SET difiere = (v_dif <> ''), diferencia = nullif(v_dif, '')
         WHERE id = e.id AND (difiere IS DISTINCT FROM (v_dif <> '') OR diferencia IS DISTINCT FROM nullif(v_dif, ''));
    END LOOP;

    -- Lo automático (solo desde la tarea programada, sin usuario, y remitos de los últimos 7 días). Lo que no se pudo se
    -- vuelve a intentar cada vez (por ejemplo, el chofer sube las fotos del tablero después de que llegó el remito)
    IF v_auto THEN
        FOR e IN SELECT id FROM fue.remito_estacion WHERE orden_id IS NOT NULL AND carga_id IS NULL AND descartada_en IS NULL AND lectura = 'lista'
                    AND fecha_hora > now() - interval '7 days' ORDER BY fecha_hora LOOP
            BEGIN
                PERFORM fue.fn_remito_registrar_orden_auto(e.id);
            EXCEPTION WHEN OTHERS THEN
                UPDATE fue.remito_estacion SET auto_motivo = left(SQLERRM, 300) WHERE id = e.id;
            END;
        END LOOP;
        FOR e IN SELECT id FROM fue.remito_estacion WHERE carga_id IS NOT NULL AND difiere AND descartada_en IS NULL AND lectura = 'lista'
                    AND fecha_hora > now() - interval '7 days' ORDER BY fecha_hora LOOP
            BEGIN
                PERFORM fue.fn_remito_corregir_auto(e.id);
            EXCEPTION WHEN OTHERS THEN
                UPDATE fue.remito_estacion SET auto_motivo = left(SQLERRM, 300) WHERE id = e.id;
            END;
        END LOOP;
    END IF;
    RETURN n;
END $f$;

-- 7 · «Registrar» a mano: el remito de una orden se registra desde la orden ---------
DO $do$
DECLARE v_def text; v_nuevo text;
BEGIN
    v_def := pg_get_functiondef('fue.fn_remito_registrar(bigint,bigint)'::regprocedure);
    v_nuevo := replace(v_def,
        'IF t.carga_id IS NOT NULL THEN RAISE EXCEPTION ''Ese remito ya tiene su carga'' USING ERRCODE = ''55000''; END IF;',
        'IF t.carga_id IS NOT NULL THEN RAISE EXCEPTION ''Ese remito ya tiene su carga'' USING ERRCODE = ''55000''; END IF;'
        || E'\n    IF t.orden_id IS NOT NULL THEN'
        || E'\n        RAISE EXCEPTION ''Ese remito es de la orden de carga %: registrala desde «Cargas de órdenes para registrar» (ya trae los datos del remito)'','
        || E'\n            (SELECT numero FROM fue.orden_carga WHERE id = t.orden_id) USING ERRCODE = ''55000'';'
        || E'\n    END IF;');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'fue.fn_remito_registrar cambió: no se encontró el punto a modificar'; END IF;
    EXECUTE v_nuevo;
END $do$;

-- 7b · El chofer toca «Terminé mi carga» después de que llegó el remito: se guardan sus fotos y no da error
DO $do$
DECLARE v_def text; v_nuevo text;
BEGIN
    v_def := pg_get_functiondef('fue.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)'::regprocedure);
    v_nuevo := replace(v_def,
        E'    IF o.estado <> ''autorizada'' THEN\n        RAISE EXCEPTION ''La orden % todavía no fue autorizada por la estación (o ya está cerrada)''',
        E'    IF o.estado = ''cargada'' AND o.genset_id IS NULL AND EXISTS (SELECT 1 FROM fue.remito_estacion r WHERE r.orden_id = o.id AND r.descartada_en IS NULL) THEN'
        || E'\n        UPDATE fue.orden_carga SET tickets = CASE WHEN jsonb_typeof(p_fotos) = ''array'' AND jsonb_array_length(tickets) = 0 THEN p_fotos ELSE tickets END,'
        || E'\n               lecturas = CASE WHEN cardinality(lecturas) = 0 THEN coalesce(p_lecturas, ''{}'') ELSE lecturas END'
        || E'\n         WHERE id = o.id;'
        || E'\n        RETURN jsonb_build_object(''numero'', o.numero, ''litros'', o.litros_cargados, ''diferencia_l'', o.diferencia_l, ''alerta'', o.alerta IS NOT NULL, ''con_remito'', true);'
        || E'\n    END IF;'
        || E'\n    IF o.estado <> ''autorizada'' THEN\n        RAISE EXCEPTION ''La orden % todavía no fue autorizada por la estación (o ya está cerrada)''');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'fue.fn_terminar_orden_carga cambió: no se encontró el punto a modificar'; END IF;
    EXECUTE v_nuevo;
END $do$;

-- 8 · Lo que ve la pantalla -------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_remitos_pendientes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT (fue.fn_puede_registrar_cargas() OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo = 'gerencia')) THEN
        RAISE EXCEPTION 'Sin permiso para ver los remitos de las estaciones' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'puede_resolver', fue.fn_puede_registrar_cargas(),
        'activo', coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.remitos_activo' AND eliminado_en IS NULL), false),
        'automatico', coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.remitos_automatico' AND eliminado_en IS NULL), false),
        'ultima_consulta', (SELECT jsonb_build_object('cuando', c.creado_en, 'ok', c.ok, 'mensaje', c.mensaje) FROM fue.remito_consulta c ORDER BY c.id DESC LIMIT 1),
        'coinciden_30_dias', (SELECT count(*) FROM fue.remito_estacion t WHERE t.carga_id IS NOT NULL AND NOT t.difiere AND t.descartada_en IS NULL AND t.fecha_hora > now() - interval '30 days'),
        'leyendo', (SELECT count(*) FROM fue.remito_estacion t WHERE t.lectura IN ('pendiente', 'enviada')),
        'esperando_chofer', (SELECT count(*) FROM fue.remito_estacion t WHERE t.lectura = 'lista' AND t.carga_id IS NULL AND t.orden_id IS NULL AND t.descartada_en IS NULL
                                AND t.fecha_hora >= now() - make_interval(hours => ref.fn_parametro_num('fue.remitos_espera_horas', 12)::int)),
        'estaciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre), '[]') FROM mae.estacion_servicio s WHERE s.eliminado_en IS NULL AND s.pais = 'AR'),
        -- Migración 283: lo que se hizo solo en los últimos 7 días
        'automaticos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'numero', t.numero, 'fecha_hora', t.fecha_hora, 'patente', t.patente, 'litros', t.litros, 'precio', t.precio,
                'carga_id', t.carga_id, 'orden', (SELECT numero FROM fue.orden_carga WHERE id = t.orden_id), 'accion', t.auto_accion, 'cuando', t.auto_en)
                ORDER BY t.auto_en DESC), '[]')
              FROM fue.remito_estacion t WHERE t.auto_accion IS NOT NULL AND t.auto_en > now() - interval '7 days'),
        'remitos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'numero', t.numero, 'fecha_hora', t.fecha_hora, 'patente', t.patente, 'es_tractor', t.camion_id IS NOT NULL,
                'chofer', t.chofer_nombre, 'producto', t.producto, 'litros', t.litros, 'precio', t.precio, 'total', t.total, 'moneda', t.moneda,
                'estacion_id', t.estacion_id, 'estacion', (SELECT nombre FROM mae.estacion_servicio WHERE id = t.estacion_id),
                'situacion', CASE WHEN t.lectura = 'error' THEN 'no_se_leyo' WHEN t.carga_id IS NULL AND t.orden_id IS NOT NULL THEN 'orden_sin_registrar'
                                  WHEN t.carga_id IS NULL THEN 'falta_registrar' ELSE 'difiere' END,
                'orden', (SELECT numero FROM fue.orden_carga WHERE id = t.orden_id), 'motivo_auto', t.auto_motivo,
                'carga_id', t.carga_id, 'diferencia', t.diferencia, 'avisos', t.avisos, 'error', t.error, 'archivo', t.archivo)
                ORDER BY coalesce(t.fecha_hora, t.recibido_en, t.creado_en) DESC), '[]')
              FROM fue.remito_estacion t
             WHERE t.descartada_en IS NULL AND coalesce(t.fecha_hora, t.creado_en) > now() - interval '60 days'
               AND (t.lectura = 'error'
                    OR (t.lectura = 'lista' AND (
                        t.difiere
                        -- Con orden: aparece si no se pudo registrar sola (o si lo automático está apagado, enseguida)
                        OR (t.carga_id IS NULL AND t.orden_id IS NOT NULL
                            AND (t.auto_motivo IS NOT NULL OR NOT coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.remitos_automatico' AND eliminado_en IS NULL), false)))
                        -- Sin orden: recién después de la espera (el chofer o la oficina registran la carga)
                        OR (t.carga_id IS NULL AND t.orden_id IS NULL
                            AND coalesce(t.fecha_hora, t.creado_en) < now() - make_interval(hours => ref.fn_parametro_num('fue.remitos_espera_horas', 12)::int)))))));
END $f$;

-- 9 · Si se corrigió a mano el motivo de lo automático deja de valer: lo vuelve a intentar
--     (fue.fn_remito_marcar_corregido limpia el motivo)
DO $do$
DECLARE v_def text; v_nuevo text;
BEGIN
    v_def := pg_get_functiondef('fue.fn_remito_marcar_corregido(bigint)'::regprocedure);
    v_nuevo := replace(v_def, 'SET corregida_en = now(), resuelta_por = aud.fn_usuario_actual() WHERE id = p_id;',
                              'SET corregida_en = now(), resuelta_por = aud.fn_usuario_actual(), auto_motivo = NULL WHERE id = p_id;');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'fue.fn_remito_marcar_corregido cambió: no se encontró el punto a modificar'; END IF;
    EXECUTE v_nuevo;
END $do$;

UPDATE ref.parametro SET valor = '283' WHERE codigo = 'web.version_base' AND valor::text::int < 283;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Primera pasada con lo que ya llegó (los remitos de los últimos 7 días)
SELECT 'migración 283 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       fue.fn_remitos_vincular() AS remitos_unidos,
       (SELECT count(*) FROM fue.remito_estacion WHERE auto_accion = 'registrada') AS registradas_solas,
       (SELECT count(*) FROM fue.remito_estacion WHERE auto_accion = 'corregida') AS corregidas_solas,
       (SELECT count(*) FROM fue.remito_estacion WHERE auto_motivo IS NOT NULL) AS para_revisar;
