-- =====================================================================================
-- Cambio 360 · Órdenes de carga de Chile que vencen sin ticket: quedan pendientes (oficina y chofer)
-- =====================================================================================
-- Caso (26/11/2026): OC-000036 (SHXB49, Martínez, Shell Los Andes, tarjeta de flota, tanques 150 L), autorizada el 24/11
-- 12:36. El chofer cargó y no subió el ticket. A las 36 h la orden venció: desapareció de su Mi viaje, en la oficina
-- quedó «Vencida» sin botones y nunca llegó a «Cargas de órdenes para registrar». Enex no la registró sola. La carga
-- quedó sin registrar y el mapa mostraba el combustible del camión en 0.
-- Decisión del usuario: «Oficina y chofer».
--
--   1 · fue.fn_enex_registra_solo(): Enex prendido y automático (fue.enex_activo y fue.enex_automatico).
--   2 · fue.fn_orden_pide_ticket(orden): orden de Chile del tractor, autorizada, vencida, sin ticket y de los últimos
--       7 días (lo mismo que acepta «Cargué en Chile con la tarjeta», 304). Si se paga con tarjeta, solo mientras Enex
--       no registre las cargas solo; si es por transferencia, siempre.
--   3 · Mi viaje: fue.fn_mis_ordenes_carga_sin_pago deja de esconder esas órdenes (una condición, con control: si no
--       aparece exactamente una vez, no se aplica nada). El chofer la termina con «Terminé mi carga», como siempre.
--   4 · fue.fn_no_cargue_orden(orden) + ops.fn_no_cargue_orden: el chofer avisa que no cargó. La orden se anula con ese
--       motivo; si Finanzas no había hecho nada, el pago de la orden se anula solo (como al anular desde la oficina).
--   5 · fin.fn_trabas_pedido_fondo (envoltorio; la anterior queda como fin.fn_trabas_pedido_fondo_sin_chile): mientras
--       la orden pida ticket, el chofer no puede pedir dinero: «Subí el ticket de la carga OC-… (estación) y tocá
--       «Terminé mi carga». Si no cargaste, tocá «No cargué».» Respeta fin.ff_control_activo.
--   6 · fue.fn_ordenes_vencidas_sin_ticket(): para arriba de Cargas, las órdenes de Chile del tractor vencidas sin
--       ticket (últimos 60 días), con lo que puede hacer quien mira: subir el ticket por el chofer (Gerencia, Adm. de
--       combustible y TI, como fue.fn_terminar_orden_carga) o anularla con «No cargó» (quien autoriza cargas).
-- Las del genset no entran (al terminarlas hace falta el horómetro).
-- No cambia web.version_base (otros chats siguen la numeración). Pide la 304. No toca datos.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 304 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 304 (20261124200000_carga_tarjeta_informada_por_chofer.sql). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF to_regprocedure('fue.fn_orden_pide_ticket(fue.orden_carga)') IS NOT NULL THEN
        RAISE EXCEPTION 'El cambio 360 (órdenes de Chile vencidas sin ticket) ya está aplicado';
    END IF;
    IF to_regprocedure('fue.fn_orden_tarjeta(fue.orden_carga)') IS NULL OR to_regprocedure('fue.fn_mis_ordenes_carga_sin_pago()') IS NULL
       OR to_regprocedure('fin.fn_trabas_pedido_fondo(bigint)') IS NULL OR to_regprocedure('fue.fn_puede_registrar_cargas()') IS NULL
       OR to_regprocedure('fue.fn_puedo_autorizar_cargas()') IS NULL OR to_regprocedure('fue.fn_texto_autorizado(fue.orden_carga)') IS NULL
       OR to_regprocedure('fue.fn_equipo_orden(bigint,bigint)') IS NULL OR to_regprocedure('ops.fn_mi_chofer()') IS NULL
       OR to_regprocedure('ops.fn_nombre_chofer(bigint)') IS NULL
       OR to_regprocedure('ops.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)') IS NULL
       OR to_regprocedure('fue.fn_ordenes_por_registrar()') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones de las órdenes de carga de Chile que este cambio usa (284, 290 y 304)';
    END IF;
END $v$;

-- Copia los permisos de ejecución: solo roles tc_* (nunca tc_cliente) y authenticated (como la 304)
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT r.rolname FROM pg_roles r
              WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, p_de, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, g);
        END IF;
    END LOOP;
END $fn$;

-- ------------------------------------------------------------------ 1 · ¿Enex registra solo las cargas con tarjeta?
CREATE FUNCTION fue.fn_enex_registra_solo()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce((SELECT valor::text = 'true' FROM ref.parametro WHERE codigo = 'fue.enex_activo' AND eliminado_en IS NULL), false)
       AND coalesce((SELECT valor::text = 'true' FROM ref.parametro WHERE codigo = 'fue.enex_automatico' AND eliminado_en IS NULL), true)
$f$;
COMMENT ON FUNCTION fue.fn_enex_registra_solo() IS 'Cambio 360: verdadero si Enex está prendido y registra solo las cargas con tarjeta (fue.enex_activo y fue.enex_automatico).';
GRANT EXECUTE ON FUNCTION fue.fn_enex_registra_solo() TO PUBLIC;

-- ------------------------------------------------------------------ 2 · ¿la orden vencida le pide el ticket al chofer?
CREATE FUNCTION fue.fn_orden_pide_ticket(o fue.orden_carga)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT o.estado = 'autorizada' AND o.genset_id IS NULL AND o.camion_id IS NOT NULL
       AND coalesce(fue.fn_orden_tarjeta(o), false)
       AND o.vence_en <= now()
       AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '7 days'
       AND jsonb_array_length(coalesce(o.tickets, '[]'::jsonb)) = 0
       AND (coalesce(o.detalle ->> 'medio_pago', 'tarjeta') <> 'tarjeta' OR NOT fue.fn_enex_registra_solo())
$f$;
COMMENT ON FUNCTION fue.fn_orden_pide_ticket(fue.orden_carga) IS
    'Cambio 360: orden de Chile del tractor vencida sin ticket (7 días): el chofer la sigue viendo y no puede pedir dinero hasta subir el ticket o avisar que no cargó. Con tarjeta, solo si Enex no registra solo.';
GRANT EXECUTE ON FUNCTION fue.fn_orden_pide_ticket(fue.orden_carga) TO PUBLIC;

-- ------------------------------------------------------------------ 3 · Mi viaje: la vencida sin ticket se sigue viendo
DO $p$
DECLARE v_def text := pg_get_functiondef('fue.fn_mis_ordenes_carga_sin_pago()'::regprocedure); v_n int;
BEGIN
    v_n := regexp_count(v_def, 'o\.vence_en\s*<=\s*now\(\)\s*\)');
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fue.fn_mis_ordenes_carga_sin_pago cambió: «o.vence_en <= now())» aparece % veces (se esperaba 1). No se aplicó nada.', v_n;
    END IF;
    EXECUTE regexp_replace(v_def, 'o\.vence_en\s*<=\s*now\(\)\s*\)', 'o.vence_en <= now() AND NOT fue.fn_orden_pide_ticket(o))');
END $p$;

-- ------------------------------------------------------------------ 4 · el chofer avisa que no cargó
CREATE FUNCTION fue.fn_no_cargue_orden(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o fue.orden_carga%ROWTYPE; v_ch bigint := ops.fn_mi_chofer();
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_ch IS NULL OR o.chofer_id IS DISTINCT FROM v_ch THEN
        RAISE EXCEPTION 'La orden no existe' USING ERRCODE = 'P0002';
    END IF;
    IF NOT fue.fn_orden_pide_ticket(o) THEN
        RAISE EXCEPTION 'La orden % no está vencida sin ticket. Si cargaste, tocá «Terminé mi carga».', o.numero USING ERRCODE = '55000';
    END IF;
    UPDATE fue.orden_carga
       SET estado = 'anulada', anulada_por = aud.fn_usuario_actual(), anulada_en = now(),
           motivo_anulacion = 'El chofer avisó que no cargó (la orden venció sin ticket)'
     WHERE id = o.id;
    RETURN jsonb_build_object('numero', o.numero);
END $f$;
COMMENT ON FUNCTION fue.fn_no_cargue_orden(bigint) IS 'Cambio 360: el chofer avisa que no cargó con una orden de Chile vencida sin ticket; la orden se anula con ese motivo.';
SELECT pg_temp.fn_copiar_permisos('fue.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)', 'fue.fn_no_cargue_orden(bigint)');

CREATE FUNCTION ops.fn_no_cargue_orden(p_id bigint)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fue.fn_no_cargue_orden(p_id)
$f$;
COMMENT ON FUNCTION ops.fn_no_cargue_orden(bigint) IS 'Cambio 360: «No cargué» de Mi viaje (lo que llama la web del chofer).';
SELECT pg_temp.fn_copiar_permisos('ops.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)', 'ops.fn_no_cargue_orden(bigint)');

-- ------------------------------------------------------------------ 5 · no pide dinero mientras la orden pida el ticket
ALTER FUNCTION fin.fn_trabas_pedido_fondo(bigint) RENAME TO fn_trabas_pedido_fondo_sin_chile;

CREATE FUNCTION fin.fn_trabas_pedido_fondo(p_chofer bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t jsonb := coalesce(fin.fn_trabas_pedido_fondo_sin_chile(p_chofer), '[]'::jsonb); r record;
BEGIN
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fin.ff_control_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN
        RETURN t;
    END IF;
    FOR r IN SELECT o.numero, e.nombre AS estacion
               FROM fue.orden_carga o LEFT JOIN mae.estacion_servicio e ON e.id = o.estacion_id
              WHERE o.chofer_id = p_chofer AND o.estado = 'autorizada' AND fue.fn_orden_pide_ticket(o)
              ORDER BY o.id
    LOOP
        t := t || jsonb_build_object('tipo', 'ticket', 'texto',
            format('Subí el ticket de la carga %s%s y tocá «Terminé mi carga». Si no cargaste, tocá «No cargué».',
                   r.numero, coalesce(' (' || r.estacion || ')', '')));
    END LOOP;
    RETURN t;
END $f$;
COMMENT ON FUNCTION fin.fn_trabas_pedido_fondo(bigint) IS
    'Cambio 360: las trabas de siempre (fin.fn_trabas_pedido_fondo_sin_chile) más las órdenes de Chile vencidas sin ticket (fue.fn_orden_pide_ticket).';
SELECT pg_temp.fn_copiar_permisos('fin.fn_trabas_pedido_fondo_sin_chile(bigint)', 'fin.fn_trabas_pedido_fondo(bigint)');

-- ------------------------------------------------------------------ 6 · la oficina: vencidas sin ticket
CREATE FUNCTION fue.fn_ordenes_vencidas_sin_ticket()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_ticket boolean := EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('gerencia', 'adm_combustible', 'ti'));
BEGIN
    IF NOT (fue.fn_puede_registrar_cargas() OR v_ticket) THEN
        RAISE EXCEPTION 'Sin permiso para ver las órdenes vencidas sin ticket' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'puede_ticket', v_ticket,
        'puede_anular', fue.fn_puedo_autorizar_cargas(),
        'ordenes', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', o.id, 'numero', o.numero, 'patente', fue.fn_equipo_orden(o.camion_id, o.genset_id),
                       'chofer', ops.fn_nombre_chofer(o.chofer_id), 'estacion', e.nombre,
                       'medio_pago', coalesce(o.detalle ->> 'medio_pago', 'tarjeta'), 'autorizado', fue.fn_texto_autorizado(o),
                       'autorizada_en', coalesce(o.autorizada_en, o.creada_en), 'vence_en', o.vence_en, 'creada_por', u.nombre,
                       'chofer_la_ve', fue.fn_orden_pide_ticket(o))
                     ORDER BY o.vence_en)
              FROM fue.orden_carga o
              JOIN mae.estacion_servicio e ON e.id = o.estacion_id
              LEFT JOIN seg.usuario u ON u.id = o.creada_por
             WHERE o.estado = 'autorizada' AND o.genset_id IS NULL AND o.camion_id IS NOT NULL
               AND coalesce(fue.fn_orden_tarjeta(o), false) AND o.vence_en <= now()
               AND jsonb_array_length(coalesce(o.tickets, '[]'::jsonb)) = 0
               AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '60 days'), '[]'::jsonb));
END $f$;
COMMENT ON FUNCTION fue.fn_ordenes_vencidas_sin_ticket() IS
    'Cambio 360: órdenes de Chile del tractor vencidas sin ticket (60 días), para que la oficina suba el ticket por el chofer o la anule si no cargó.';
SELECT pg_temp.fn_copiar_permisos('fue.fn_ordenes_por_registrar()', 'fue.fn_ordenes_vencidas_sin_ticket()');

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'cambio 360 aplicado' AS que,
       (SELECT count(*) FROM fue.orden_carga o
         WHERE o.estado = 'autorizada' AND o.genset_id IS NULL AND o.camion_id IS NOT NULL AND coalesce(fue.fn_orden_tarjeta(o), false)
           AND o.vence_en <= now() AND jsonb_array_length(coalesce(o.tickets, '[]'::jsonb)) = 0
           AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '60 days') AS vencidas_sin_ticket,
       (SELECT string_agg(o.numero || ' ' || coalesce(fue.fn_equipo_orden(o.camion_id, o.genset_id), ''), ', ' ORDER BY o.id) FROM fue.orden_carga o
         WHERE o.estado = 'autorizada' AND o.genset_id IS NULL AND o.camion_id IS NOT NULL AND coalesce(fue.fn_orden_tarjeta(o), false)
           AND o.vence_en <= now() AND jsonb_array_length(coalesce(o.tickets, '[]'::jsonb)) = 0
           AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '60 days') AS cuales,
       (SELECT count(*) FROM fue.orden_carga o WHERE o.estado = 'autorizada' AND fue.fn_orden_pide_ticket(o)) AS las_ve_el_chofer,
       fue.fn_enex_registra_solo() AS enex_registra_solo;
