-- =============================================================================
-- IronTrack — 284 · Cambio 278 · Combustible en Chile: solicitud y orden de carga sin QR, con tarjeta de flota
-- -----------------------------------------------------------------------------
-- Pedido del usuario (19/11/2026): que la carga del lado chileno funcione como la de Shell Argentina (se pide desde
-- Seguimiento y se aprueba desde el sistema, así Gerencia sabe cuánto autoriza), pero sin QR: en Chile se paga con la
-- tarjeta de flota (Shell Card, Enex). Decisiones: todas las estaciones de Chile van con tarjeta; el chofer recibe un aviso
-- al teléfono; la carga se registra sola con lo que informa Enex; si cargó de más se registra igual y se avisa.
--   · fue.fn_estacion_tarjeta(estación): verdadero si la estación es de Chile.
--   · Pedir por sistema (Seguimiento) y crear la orden ya no exigen correo en Chile (cambio de una línea en
--     tel.fn_pedir_carga y fue.fn_crear_orden_carga). En Chile no sale mail (fue.fn_mail_orden no manda nada).
--   · fue.fn_crear_orden_carga (envoltorio; la anterior queda como _base): en Chile la orden nace «autorizada» (no hay
--     estación que confirme), vence a las 36 h (fue.orden_tarjeta_horas) y le llega un aviso al chofer con lo autorizado.
--     Sirve igual para «Aprobar» una solicitud y para «Nueva orden de carga».
--   · Las pantallas reciben «tarjeta»: preparar la orden, solicitudes pendientes, lista de órdenes y la del chofer
--     (envoltorios que agregan el dato; la del chofer no muestra las de tarjeta vencidas).
--   · Enex: fue.enex_transaccion suma orden_id, auto_motivo y auto_en. Después del cruce de siempre (fue.fn_enex_vincular,
--     cada hora), fue.fn_enex_ordenes une cada carga de Enex (grupo de tickets) con la orden de tarjeta del mismo tractor
--     (desde 1 h antes de autorizada hasta que vence) y, sin usuario (la tarea programada):
--       - registra sola la carga de la orden con los datos de Enex (litros, precio, hora, medio «tarjeta») cuando pasaron
--         45 minutos del último ticket (por si la bomba cortó y hay más tickets). Corte de viaje: solo si la orden era a
--         tanque lleno y el chofer sacó las fotos del tablero (como el remito, migración 283);
--       - si cargó más de lo autorizado, registra igual y avisa a quienes autorizan cargas;
--       - si la carga de la orden ya estaba registrada y difiere de Enex, la corrige sola (fue.fn_enex_corregir: historial
--         y cierres de siempre). Si no se puede, anota el motivo.
--   · Si la orden se registra a mano (Cargas de órdenes para registrar), la propuesta trae los datos de Enex.
--   · «Registrar» de la lista de Shell Card: si la carga es de una orden, se registra desde la orden.
--   · La lista de Shell Card no muestra las de una orden mientras se resuelven solas; si no se pudo, muestra el motivo.
--   · Parámetro fue.enex_automatico (true). Con false, Enex solo compara como antes.
-- Los envoltorios no dependen del texto de las funciones anteriores (la base real puede tener saltos de línea distintos).
-- web.version_base = 284.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 283 THEN
        RAISE EXCEPTION 'Falta la migración 283 (remitos automáticos): aplicarla antes';
    END IF;
    IF to_regprocedure('fue.fn_estacion_tarjeta(bigint)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 284 (carga en Chile con tarjeta) ya está aplicada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fue' AND table_name = 'enex_transaccion' AND column_name = 'grupo_id') THEN
        RAISE EXCEPTION 'Faltan las migraciones de Shell Card (shell_01 a shell_04): aplicarlas antes';
    END IF;
    IF to_regprocedure('fue.fn_crear_orden_carga(bigint,bigint,text,numeric,numeric,text,bigint,text,jsonb)') IS NULL
       OR to_regprocedure('fue.fn_mail_orden(bigint,text)') IS NULL
       OR to_regprocedure('tel.fn_pedir_carga(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text)') IS NULL
       OR to_regprocedure('fue.fn_preparar_orden_carga(bigint,bigint)') IS NULL OR to_regprocedure('fue.fn_solicitudes_carga()') IS NULL
       OR to_regprocedure('fue.fn_ordenes_carga(integer)') IS NULL OR to_regprocedure('fue.fn_mis_ordenes_carga()') IS NULL
       OR to_regprocedure('fue.fn_enex_vincular()') IS NULL OR to_regprocedure('fue.fn_enex_registrar(bigint,bigint)') IS NULL
       OR to_regprocedure('fue.fn_enex_pendientes()') IS NULL OR to_regprocedure('fue.fn_enex_corregir(bigint)') IS NULL
       OR to_regprocedure('fue.fn_propuesta_carga_orden(bigint)') IS NULL OR to_regprocedure('fue.fn_propuesta_carga_orden_ticket(bigint)') IS NULL
       OR to_regprocedure('fue.fn_registrar_carga_orden(bigint,boolean,jsonb)') IS NULL OR to_regprocedure('fue.fn_es_automatico()') IS NULL
       OR to_regprocedure('fue.fn_texto_autorizado(fue.orden_carga)') IS NULL
       OR to_regprocedure('ops.fn_avisar(bigint[],text,text,text,text,boolean)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones de combustible que esta migración necesita (órdenes de carga, Shell Card o la 283)';
    END IF;
END $do$;

-- Copia los permisos de ejecución de una función a otra (los mismos roles)
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END
               FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = p_de AND x.privilege_type = 'EXECUTE' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', p_a, g);
    END LOOP;
    IF (SELECT proacl FROM pg_proc WHERE oid = p_de) IS NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', p_a);
    END IF;
END $fn$;

-- Cambia una sola línea de una función viva; frena si no aparece exactamente una vez
CREATE FUNCTION pg_temp.fn_parchar(p_f regprocedure, p_ancla text, p_nuevo text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE v_def text := pg_get_functiondef(p_f); n integer;
BEGIN
    n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
    IF n <> 1 THEN RAISE EXCEPTION '% cambió: «%» aparece % veces', p_f, p_ancla, n; END IF;
    EXECUTE replace(v_def, p_ancla, p_nuevo);
END $fn$;

-- 1 · Parámetros, columnas y la regla «Chile = tarjeta de flota» -------------------
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fue.orden_tarjeta_horas', '36', 'Migración 284: horas que dura una orden de carga con tarjeta de flota (Chile) sin usarse.'),
 ('fue.enex_automatico', 'true', 'Migración 284: «true» = con Enex se registra sola la carga de una orden de Chile y se corrige sola si difiere. «false» = solo compara.')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE fue.enex_transaccion
    ADD COLUMN orden_id bigint REFERENCES fue.orden_carga (id),
    ADD COLUMN auto_motivo text,
    ADD COLUMN auto_en timestamptz;
CREATE INDEX ix_enex_transaccion_orden ON fue.enex_transaccion (orden_id) WHERE orden_id IS NOT NULL;

CREATE FUNCTION fue.fn_estacion_tarjeta(p_estacion bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce((SELECT e.pais = 'CL' FROM mae.estacion_servicio e WHERE e.id = p_estacion), false)
$f$;
GRANT EXECUTE ON FUNCTION fue.fn_estacion_tarjeta(bigint) TO PUBLIC;

-- ¿La orden es de tarjeta de flota?
CREATE FUNCTION fue.fn_orden_tarjeta(o fue.orden_carga)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(o.autorizada_desde ? 'tarjeta_flota', false) OR (o.genset_id IS NULL AND fue.fn_estacion_tarjeta(o.estacion_id))
$f$;
GRANT EXECUTE ON FUNCTION fue.fn_orden_tarjeta(fue.orden_carga) TO PUBLIC;

-- 2 · Sin correo en Chile: una línea en cada función ------------------------------
SELECT pg_temp.fn_parchar('fue.fn_crear_orden_carga(bigint,bigint,text,numeric,numeric,text,bigint,text,jsonb)',
    'IF nullif(btrim(coalesce(e.correo, '''')), '''') IS NULL THEN',
    'IF nullif(btrim(coalesce(e.correo, '''')), '''') IS NULL AND NOT fue.fn_estacion_tarjeta(e.id) THEN');
SELECT pg_temp.fn_parchar('tel.fn_pedir_carga(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text)',
    'IF v_correo IS NULL THEN',
    'IF v_correo IS NULL AND NOT fue.fn_estacion_tarjeta(p_estacion) THEN');

-- 3 · En Chile no sale el mail con la palabra ---------------------------------------
ALTER FUNCTION fue.fn_mail_orden(bigint, text) RENAME TO fn_mail_orden_base;
CREATE FUNCTION fue.fn_mail_orden(p_orden bigint, p_palabra text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF EXISTS (SELECT 1 FROM fue.orden_carga o WHERE o.id = p_orden AND o.genset_id IS NULL AND fue.fn_estacion_tarjeta(o.estacion_id)) THEN
        RETURN NULL;   -- Migración 284: tarjeta de flota, no hay palabra ni QR
    END IF;
    RETURN fue.fn_mail_orden_base(p_orden, p_palabra);
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_mail_orden_base(bigint,text)', 'fue.fn_mail_orden(bigint,text)');

-- 4 · Crear la orden: en Chile nace autorizada y se le avisa al chofer -------------
ALTER FUNCTION fue.fn_crear_orden_carga(bigint, bigint, text, numeric, numeric, text, bigint, text, jsonb) RENAME TO fn_crear_orden_carga_base;
CREATE FUNCTION fue.fn_crear_orden_carga(p_camion bigint, p_estacion bigint, p_modo text, p_litros numeric DEFAULT NULL::numeric,
                                         p_importe numeric DEFAULT NULL::numeric, p_moneda text DEFAULT NULL::text, p_chofer bigint DEFAULT NULL::bigint,
                                         p_observacion text DEFAULT NULL::text, p_detalle jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r jsonb; o fue.orden_carga%ROWTYPE; v_avisados integer; v_texto text;
BEGIN
    r := fue.fn_crear_orden_carga_base(p_camion, p_estacion, p_modo, p_litros, p_importe, p_moneda, p_chofer, p_observacion, p_detalle);
    IF NOT fue.fn_estacion_tarjeta(p_estacion) THEN RETURN r; END IF;
    UPDATE fue.orden_carga
       SET estado = 'autorizada', autorizada_en = now(),
           autorizada_desde = jsonb_build_object('tarjeta_flota', true, 'aprobo', aud.fn_usuario_actual()),
           vence_en = now() + make_interval(hours => ref.fn_parametro_num('fue.orden_tarjeta_horas', 36)::int)
     WHERE id = (r ->> 'id')::bigint
    RETURNING * INTO o;
    v_texto := fue.fn_texto_autorizado(o)
               || CASE WHEN o.litros_calculados IS NOT NULL THEN ' (≈ ' || tel.fn_num_ar(o.litros_calculados) || ' L)' ELSE '' END;
    SELECT count(*) INTO v_avisados FROM seg.usuario u WHERE u.chofer_id = o.chofer_id AND u.activo;
    PERFORM ops.fn_avisar(
        ARRAY(SELECT u.id FROM seg.usuario u WHERE u.chofer_id = o.chofer_id AND u.activo),
        'orden_carga:' || o.id || ':tarjeta', 'Carga autorizada · ' || coalesce((SELECT patente FROM mae.camion WHERE id = o.camion_id), ''),
        'Cargá en ' || (SELECT nombre FROM mae.estacion_servicio WHERE id = o.estacion_id) || ': ' || v_texto
            || '. Pagá con la tarjeta de flota. Al terminar, tocá «Terminé mi carga» en Mi viaje y sacale foto al ticket.',
        '/mi-viaje', true);
    RETURN (r - 'palabra') || jsonb_build_object('mail', 'tarjeta', 'palabra', NULL, 'tarjeta', true, 'autorizado', v_texto,
                                                 'chofer_avisado', v_avisados > 0, 'vence_en', o.vence_en);
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_crear_orden_carga_base(bigint,bigint,text,numeric,numeric,text,bigint,text,jsonb)',
                                  'fue.fn_crear_orden_carga(bigint,bigint,text,numeric,numeric,text,bigint,text,jsonb)');

-- 5 · Las pantallas saben si es con tarjeta -----------------------------------------
ALTER FUNCTION fue.fn_preparar_orden_carga(bigint, bigint) RENAME TO fn_preparar_orden_carga_base;
CREATE FUNCTION fue.fn_preparar_orden_carga(p_camion bigint, p_estacion bigint)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fue.fn_preparar_orden_carga_base(p_camion, p_estacion) || jsonb_build_object('tarjeta', fue.fn_estacion_tarjeta(p_estacion))
$f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_preparar_orden_carga_base(bigint,bigint)', 'fue.fn_preparar_orden_carga(bigint,bigint)');

ALTER FUNCTION fue.fn_solicitudes_carga() RENAME TO fn_solicitudes_carga_base;
CREATE FUNCTION fue.fn_solicitudes_carga()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(jsonb_agg(x || jsonb_build_object('tarjeta', fue.fn_estacion_tarjeta(nullif(x ->> 'estacion_id', '')::bigint)) ORDER BY n), '[]'::jsonb)
      FROM jsonb_array_elements(fue.fn_solicitudes_carga_base()) WITH ORDINALITY AS t(x, n)
$f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_solicitudes_carga_base()', 'fue.fn_solicitudes_carga()');

ALTER FUNCTION fue.fn_ordenes_carga(integer) RENAME TO fn_ordenes_carga_base;
CREATE FUNCTION fue.fn_ordenes_carga(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(jsonb_agg(x || jsonb_build_object(
               'tarjeta', coalesce(fue.fn_orden_tarjeta(o), false),
               'estado', CASE WHEN o.estado = 'autorizada' AND o.carga_id IS NULL AND fue.fn_orden_tarjeta(o) AND o.vence_en <= now() THEN 'vencida' ELSE x ->> 'estado' END,
               'enex_litros', (SELECT round(sum(t.litros), 2) FROM fue.enex_transaccion t WHERE t.orden_id = o.id AND t.descartada_en IS NULL))
             ORDER BY n), '[]'::jsonb)
      FROM jsonb_array_elements(fue.fn_ordenes_carga_base(p_dias)) WITH ORDINALITY AS t(x, n)
      LEFT JOIN fue.orden_carga o ON o.id = (x ->> 'id')::bigint
$f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_ordenes_carga_base(integer)', 'fue.fn_ordenes_carga(integer)');

ALTER FUNCTION fue.fn_mis_ordenes_carga() RENAME TO fn_mis_ordenes_carga_base;
CREATE FUNCTION fue.fn_mis_ordenes_carga()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(jsonb_agg(x || jsonb_build_object(
               'tarjeta', fue.fn_orden_tarjeta(o), 'autorizado', fue.fn_texto_autorizado(o), 'litros_calculados', o.litros_calculados, 'vence_en', o.vence_en)
             ORDER BY n), '[]'::jsonb)
      FROM jsonb_array_elements(fue.fn_mis_ordenes_carga_base()) WITH ORDINALITY AS t(x, n)
      JOIN fue.orden_carga o ON o.id = (x ->> 'id')::bigint
     WHERE NOT (fue.fn_orden_tarjeta(o) AND o.vence_en <= now())   -- la de tarjeta vencida ya no se muestra
$f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_mis_ordenes_carga_base()', 'fue.fn_mis_ordenes_carga()');

-- 6 · La propuesta de la orden: con Enex, mandan los datos de Enex --------------------
ALTER FUNCTION fue.fn_propuesta_carga_orden(bigint) RENAME TO fn_propuesta_carga_orden_remito;
CREATE FUNCTION fue.fn_propuesta_carga_orden(p_orden bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p jsonb := fue.fn_propuesta_carga_orden_remito(p_orden); o fue.orden_carga%ROWTYPE; s record; v_lit numeric;
BEGIN
    IF p IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF NOT fue.fn_orden_tarjeta(o) THEN RETURN p || jsonb_build_object('tarjeta', false); END IF;
    SELECT count(*) AS tickets, sum(t.litros) AS litros, min(t.fecha_hora) AS desde, string_agg(t.trx, ', ' ORDER BY t.fecha_hora, t.id) AS trxs,
           CASE WHEN min(t.precio_clp) = max(t.precio_clp) THEN max(t.precio_clp)
                WHEN bool_and(t.monto_clp IS NOT NULL) AND sum(t.litros) > 0 THEN round(sum(t.monto_clp) / sum(t.litros), 4) ELSE max(t.precio_clp) END AS precio
      INTO s FROM fue.enex_transaccion t WHERE t.orden_id = p_orden AND t.descartada_en IS NULL;
    IF coalesce(s.tickets, 0) = 0 OR s.litros IS NULL OR s.precio IS NULL THEN
        RETURN p || jsonb_build_object('tarjeta', true, 'medio_pago', 'tarjeta', 'del_enex', false);
    END IF;
    v_lit := round(s.litros, 2);
    RETURN p || jsonb_build_object(
        'tarjeta', true, 'medio_pago', 'tarjeta', 'del_enex', true, 'del_remito', false,
        'litros', v_lit, 'precio_unitario', s.precio, 'moneda', 'CLP', 'fecha_hora', s.desde, 'importe', round(v_lit * s.precio, 2),
        'ticket_numero', left('Shell Card ' || s.trxs, 60), 'hora_del_ticket', true,
        'alerta', nullif(concat_ws(' · ', nullif(p ->> 'alerta', ''),
                         CASE WHEN (p ->> 'litros') IS NOT NULL AND round((p ->> 'litros')::numeric, 2) <> v_lit
                              THEN format('Datos de Enex (Shell Card%s; el ticket dice %s L)', CASE WHEN s.tickets > 1 THEN ', ' || s.tickets || ' tickets' ELSE '' END,
                                          replace(to_char(round((p ->> 'litros')::numeric, 2), 'FM999999990.00'), '.', ',')) END), ''));
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_propuesta_carga_orden_remito(bigint)', 'fue.fn_propuesta_carga_orden(bigint)');

-- Los litros de Enex valen aunque el ticket leído diga otra cosa (como el remito en la 283)
SELECT pg_temp.fn_parchar('fue.fn_registrar_carga_orden(bigint,boolean,jsonb)',
    'AND NOT EXISTS (SELECT 1 FROM fue.remito_estacion r WHERE r.orden_id = o.id',
    'AND NOT EXISTS (SELECT 1 FROM fue.enex_transaccion x WHERE x.orden_id = o.id AND x.descartada_en IS NULL) AND NOT EXISTS (SELECT 1 FROM fue.remito_estacion r WHERE r.orden_id = o.id');

-- 7 · Registrar sola la carga de una orden con Enex ---------------------------------
CREATE FUNCTION fue.fn_enex_registrar_orden_auto(p_orden bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o fue.orden_carga%ROWTYPE; s record; v_lit numeric; v_lleno boolean; v_corte boolean; v_r jsonb; v_carga bigint; v_tol numeric; v_alerta text;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden FOR UPDATE;
    IF o.id IS NULL OR o.carga_id IS NOT NULL OR o.estado NOT IN ('autorizada', 'cargada') OR o.genset_id IS NOT NULL THEN RETURN NULL; END IF;
    SELECT count(*) AS tickets, sum(t.litros) AS litros, min(t.fecha_hora) AS desde, string_agg(t.trx, ', ' ORDER BY t.fecha_hora, t.id) AS trxs,
           bool_and(t.carga_id IS NULL) AS sin_carga, sum(t.monto_clp) AS monto,
           CASE WHEN min(t.precio_clp) = max(t.precio_clp) THEN max(t.precio_clp)
                WHEN bool_and(t.monto_clp IS NOT NULL) AND sum(t.litros) > 0 THEN round(sum(t.monto_clp) / sum(t.litros), 4) ELSE max(t.precio_clp) END AS precio
      INTO s FROM fue.enex_transaccion t WHERE t.orden_id = p_orden AND t.descartada_en IS NULL;
    IF coalesce(s.tickets, 0) = 0 OR NOT s.sin_carga THEN RETURN NULL; END IF;
    IF s.litros IS NULL OR s.litros <= 0 OR s.precio IS NULL OR s.precio <= 0 THEN RAISE EXCEPTION 'Enex no informó los litros o el precio'; END IF;
    v_lit := round(s.litros, 2);
    -- ¿Inicia viaje? Solo un lleno con las fotos del tablero es corte; lleno sin fotos no se sabe
    v_lleno := coalesce((fue.fn_propuesta_carga_orden_ticket(o.id) ->> 'tanque_lleno')::boolean, false);
    v_corte := v_lleno AND EXISTS (SELECT 1 FROM tel.tablero b WHERE b.camion_id = o.camion_id AND b.anulado_en IS NULL
                                     AND b.tomada_en BETWEEN s.desde - interval '3 hours' AND s.desde + interval '12 hours');
    IF v_lleno AND NOT v_corte THEN
        RAISE EXCEPTION 'Fue a tanque lleno pero no hay fotos del tablero: no se sabe si inicia viaje (corte)';
    END IF;
    -- Cargó de más: se registra igual y se avisa
    v_tol := ref.fn_parametro_num('fue.orden_carga_tolerancia_l', 30);
    v_alerta := CASE WHEN o.modo = 'litros' AND v_lit > o.litros + v_tol
                     THEN format('Se autorizaron %s L y Enex informa %s L.', tel.fn_num_ar(o.litros), tel.fn_num_ar(v_lit, 2))
                     WHEN o.modo = 'llenar' AND o.litros_calculados IS NOT NULL AND v_lit - o.litros_calculados > v_tol
                     THEN format('Para llenar se calcularon %s L y Enex informa %s L: %s L de más. Posible faltante de combustible en el viaje.',
                                 tel.fn_num_ar(o.litros_calculados), tel.fn_num_ar(v_lit, 2), tel.fn_num_ar(round(v_lit - o.litros_calculados, 1), 1))
                     WHEN o.modo = 'importe' AND v_lit * s.precio > o.importe * 1.01
                     THEN format('Se autorizaron %s %s y Enex informa CLP %s.', o.moneda, tel.fn_num_ar(o.importe), tel.fn_num_ar(round(v_lit * s.precio))) END;
    IF o.estado = 'autorizada' THEN
        UPDATE fue.orden_carga SET estado = 'cargada', cargada_en = s.desde, litros_cargados = v_lit, importe_cargado = round(v_lit * s.precio, 2),
               diferencia_l = CASE WHEN v_alerta IS NOT NULL THEN round(v_lit - coalesce(o.litros, o.litros_calculados, v_lit), 1) END,
               alerta = v_alerta
         WHERE id = o.id;
    ELSIF v_alerta IS NOT NULL THEN
        UPDATE fue.orden_carga SET alerta = concat_ws(' · ', alerta, v_alerta) WHERE id = o.id;
    END IF;
    PERFORM set_config('fue.automatico', '1', true);
    v_r := fue.fn_registrar_carga_orden(o.id, v_corte, jsonb_build_object(
               'litros', v_lit, 'precio_unitario', s.precio, 'moneda', 'CLP', 'fecha_hora', s.desde, 'medio_pago', 'tarjeta',
               'ticket_numero', left('Shell Card ' || s.trxs, 60)));
    PERFORM set_config('fue.automatico', '', true);
    v_carga := (v_r ->> 'carga_id')::bigint;
    UPDATE fue.carga_combustible
       SET motivo_observacion = left(coalesce(motivo_observacion || ' · ', '') || 'registrada sola con Shell Card (Enex) · '
                                     || CASE WHEN s.tickets > 1 THEN s.tickets || ' tickets · transacciones ' ELSE 'transacción ' END || s.trxs, 480)
     WHERE id = v_carga;
    UPDATE fue.enex_transaccion SET carga_id = v_carga, registrada_por_enex = true, difiere = false, diferencia = NULL, revisado_en = now(),
           auto_motivo = NULL, auto_en = now()
     WHERE orden_id = o.id AND descartada_en IS NULL;
    IF v_alerta IS NOT NULL THEN
        PERFORM ops.fn_avisar(
            ARRAY(SELECT u.id FROM seg.usuario u WHERE u.autoriza_cargas AND u.activo),
            'orden_carga:' || o.id || ':exceso', 'Cargó de más · ' || coalesce((SELECT patente FROM mae.camion WHERE id = o.camion_id), ''),
            'Orden ' || o.numero || ' (' || (SELECT nombre FROM mae.estacion_servicio WHERE id = o.estacion_id) || '): ' || v_alerta || ' Quedó registrada con lo de Enex.',
            '/combustible/cargas?vista=ordenes', true);
    END IF;
    RETURN v_carga;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('fue.automatico', '', true);
    RAISE;
END $f$;
REVOKE ALL ON FUNCTION fue.fn_enex_registrar_orden_auto(bigint) FROM PUBLIC;

-- 8 · Enex ↔ orden de carga: unir, registrar y corregir solo ------------------------
CREATE FUNCTION fue.fn_enex_ordenes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE g record; v_o bigint; n integer := 0; v_min interval := make_interval(mins => ref.fn_parametro_num('fue.enex_grupo_min', 45)::integer);
        v_auto boolean := coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.enex_automatico' AND eliminado_en IS NULL), false)
                          AND aud.fn_usuario_actual() IS NULL;
BEGIN
    -- Sin repetirse: corregir llama otra vez al cruce
    IF coalesce(current_setting('fue.enex_ordenes', true), '') = '1' THEN RETURN 0; END IF;
    PERFORM set_config('fue.enex_ordenes', '1', true);

    -- a) Cada grupo de tickets con la orden de tarjeta del mismo tractor (desde 1 h antes de autorizada hasta que vence).
    --    Si la carga que le encontró el cruce es anterior a la orden, no es esta carga: se suelta.
    FOR g IN SELECT coalesce(t.grupo_id, t.id) AS grupo, min(t.camion_id) AS camion, min(t.fecha_hora) AS desde, min(t.estacion_codigo) AS codigo,
                    min(t.carga_id) AS carga
               FROM fue.enex_transaccion t
              WHERE t.descartada_en IS NULL AND t.camion_id IS NOT NULL AND t.fecha_hora > now() - interval '7 days'
              GROUP BY coalesce(t.grupo_id, t.id)
             HAVING bool_and(t.orden_id IS NULL) AND NOT bool_or(coalesce(t.registrada_por_enex, false))
              ORDER BY min(t.fecha_hora) LOOP
        SELECT x.id INTO v_o FROM fue.orden_carga x
         WHERE x.camion_id = g.camion AND x.genset_id IS NULL AND x.estado IN ('autorizada', 'cargada') AND x.autorizada_en IS NOT NULL
           AND fue.fn_orden_tarjeta(x)
           AND g.desde BETWEEN x.autorizada_en - interval '1 hour' AND greatest(x.vence_en, x.autorizada_en + interval '12 hours')
           AND NOT EXISTS (SELECT 1 FROM fue.enex_estacion m WHERE m.codigo = g.codigo AND m.estacion_id <> x.estacion_id)
           AND NOT EXISTS (SELECT 1 FROM fue.enex_transaccion o WHERE o.orden_id = x.id AND o.descartada_en IS NULL)
         ORDER BY abs(extract(epoch FROM g.desde - x.autorizada_en)) LIMIT 1;
        IF v_o IS NOT NULL THEN
            UPDATE fue.enex_transaccion t
               SET orden_id = v_o,
                   carga_id = coalesce((SELECT x.carga_id FROM fue.orden_carga x WHERE x.id = v_o),
                                       CASE WHEN t.carga_id IS NOT NULL AND (SELECT k.fecha_hora FROM fue.carga_combustible k WHERE k.id = t.carga_id)
                                                 >= (SELECT x.autorizada_en FROM fue.orden_carga x WHERE x.id = v_o) - interval '1 hour' THEN t.carga_id END),
                   difiere = false, diferencia = NULL, revisado_en = now()
             WHERE coalesce(t.grupo_id, t.id) = g.grupo AND t.descartada_en IS NULL;
            n := n + 1;
        END IF;
        v_o := NULL;
    END LOOP;
    -- Si la orden se registró después (a mano), los tickets quedan con esa carga
    UPDATE fue.enex_transaccion t SET carga_id = x.carga_id, revisado_en = now()
      FROM fue.orden_carga x
     WHERE t.orden_id = x.id AND x.carga_id IS NOT NULL AND t.carga_id IS DISTINCT FROM x.carga_id AND t.descartada_en IS NULL;

    IF v_auto THEN
        -- b) Registrar: la orden con sus tickets sin carga, 45 minutos después del último ticket
        FOR g IN SELECT t.orden_id FROM fue.enex_transaccion t JOIN fue.orden_carga x ON x.id = t.orden_id
                  WHERE t.descartada_en IS NULL AND x.carga_id IS NULL AND x.estado IN ('autorizada', 'cargada')
                    AND t.fecha_hora > now() - interval '7 days'
                  GROUP BY t.orden_id HAVING bool_and(t.carga_id IS NULL) AND max(t.fecha_hora) < now() - v_min LOOP
            BEGIN
                PERFORM fue.fn_enex_registrar_orden_auto(g.orden_id);
            EXCEPTION WHEN OTHERS THEN
                UPDATE fue.enex_transaccion SET auto_motivo = left(SQLERRM, 300) WHERE orden_id = g.orden_id AND descartada_en IS NULL;
            END;
        END LOOP;
    END IF;

    -- c) Las diferencias con las cargas que se acaban de unir (el cruce de siempre las calcula)
    PERFORM fue.fn_enex_vincular_base();

    IF v_auto THEN
        -- d) Corregir: la carga de una orden que difiere de Enex (si está en un período cerrado, queda el motivo)
        FOR g IN SELECT t.id FROM fue.enex_transaccion t JOIN fue.orden_carga x ON x.id = t.orden_id AND x.carga_id = t.carga_id
                  WHERE t.difiere AND t.descartada_en IS NULL AND t.fecha_hora > now() - interval '7 days' ORDER BY t.fecha_hora LOOP
            CONTINUE WHEN NOT coalesce((SELECT difiere FROM fue.enex_transaccion WHERE id = g.id), false);
            BEGIN
                PERFORM set_config('fue.automatico', '1', true);
                PERFORM fue.fn_enex_corregir(g.id);
                PERFORM set_config('fue.automatico', '', true);
                UPDATE fue.enex_transaccion SET auto_motivo = NULL, auto_en = now() WHERE id = g.id;
            EXCEPTION WHEN OTHERS THEN
                PERFORM set_config('fue.automatico', '', true);
                UPDATE fue.enex_transaccion SET auto_motivo = left(SQLERRM, 300) WHERE id = g.id;
            END;
        END LOOP;
    END IF;
    PERFORM set_config('fue.enex_ordenes', '', true);
    RETURN n;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('fue.enex_ordenes', '', true);
    PERFORM set_config('fue.automatico', '', true);
    RAISE;
END $f$;
REVOKE ALL ON FUNCTION fue.fn_enex_ordenes() FROM PUBLIC;

-- El cruce de cada hora: el de siempre y después las órdenes
ALTER FUNCTION fue.fn_enex_vincular() RENAME TO fn_enex_vincular_base;
CREATE FUNCTION fue.fn_enex_vincular()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE n integer;
BEGIN
    n := fue.fn_enex_vincular_base();
    PERFORM fue.fn_enex_ordenes();
    RETURN n;
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_enex_vincular_base()', 'fue.fn_enex_vincular()');

-- 9 · «Registrar» de la lista de Shell Card: la carga de una orden se registra desde la orden
ALTER FUNCTION fue.fn_enex_registrar(bigint, bigint) RENAME TO fn_enex_registrar_base;
CREATE FUNCTION fue.fn_enex_registrar(p_trx bigint, p_estacion bigint DEFAULT NULL::bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_num text;
BEGIN
    SELECT x.numero INTO v_num FROM fue.enex_transaccion t JOIN fue.orden_carga x ON x.id = t.orden_id
     WHERE t.id = p_trx AND x.carga_id IS NULL AND x.estado IN ('autorizada', 'cargada');
    IF v_num IS NOT NULL THEN
        RAISE EXCEPTION 'Esa carga es de la orden %: registrala desde «Cargas de órdenes para registrar» (ya trae los datos de Enex)', v_num USING ERRCODE = '55000';
    END IF;
    RETURN fue.fn_enex_registrar_base(p_trx, p_estacion);
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_enex_registrar_base(bigint,bigint)', 'fue.fn_enex_registrar(bigint,bigint)');

-- 10 · La lista de Shell Card: lo de una orden no aparece mientras se resuelve solo ------
ALTER FUNCTION fue.fn_enex_pendientes() RENAME TO fn_enex_pendientes_base;
CREATE FUNCTION fue.fn_enex_pendientes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r jsonb := fue.fn_enex_pendientes_base();
        v_auto boolean := coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.enex_automatico' AND eliminado_en IS NULL), false);
BEGIN
    RETURN r || jsonb_build_object(
        'automatico', v_auto,
        'cargas', (SELECT coalesce(jsonb_agg(c.x || jsonb_build_object(
                           'orden', c.orden, 'motivo_auto', c.motivo,
                           'situacion', CASE WHEN c.x ->> 'situacion' = 'falta_registrar' AND c.orden IS NOT NULL THEN 'orden_sin_registrar' ELSE c.x ->> 'situacion' END)
                         ORDER BY c.n), '[]'::jsonb)
                     FROM (SELECT e.x, e.n, (SELECT o.numero FROM fue.orden_carga o WHERE o.id = t.orden_id) AS orden, t.auto_motivo AS motivo, t.orden_id
                             FROM jsonb_array_elements(coalesce(r -> 'cargas', '[]'::jsonb)) WITH ORDINALITY AS e(x, n)
                             LEFT JOIN fue.enex_transaccion t ON t.id = (e.x ->> 'id')::bigint) c
                    -- La de una orden que todavía se está resolviendo sola no se muestra
                    WHERE NOT (c.orden_id IS NOT NULL AND c.motivo IS NULL AND v_auto)),
        'automaticos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                               'orden', o.numero, 'patente', fue.fn_equipo_orden(o.camion_id, o.genset_id), 'carga_id', o.carga_id,
                               'litros', (SELECT round(sum(t.litros), 2) FROM fue.enex_transaccion t WHERE t.orden_id = o.id AND t.descartada_en IS NULL),
                               'cuando', (SELECT max(t.auto_en) FROM fue.enex_transaccion t WHERE t.orden_id = o.id), 'alerta', o.alerta)
                             ORDER BY o.id DESC), '[]'::jsonb)
                          FROM fue.orden_carga o
                         WHERE EXISTS (SELECT 1 FROM fue.enex_transaccion t WHERE t.orden_id = o.id AND t.auto_en > now() - interval '7 days')));
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_enex_pendientes_base()', 'fue.fn_enex_pendientes()');

UPDATE ref.parametro SET valor = '284' WHERE codigo = 'web.version_base' AND valor::text::int < 284;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 284 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT valor::text FROM ref.parametro WHERE codigo = 'fue.enex_activo') AS enex_activo,
       (SELECT count(*) FROM mae.estacion_servicio WHERE pais = 'CL' AND eliminado_en IS NULL) AS estaciones_chile_con_tarjeta;
