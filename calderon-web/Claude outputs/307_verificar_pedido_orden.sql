-- =============================================================================
-- IronTrack — Verificación 307 · Cambio 253 (migración 263) · Pedido y orden: recomendación y decisión
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 263. NO GUARDA NADA: usa dos usuarios ZZ, un viaje en curso
-- y una estación con correo que ya existen; pide una carga por sistema, la aprueba sin cambios
-- y con cambios, mira lo que reciben las pantallas y termina con un error a propósito
-- («VERIFICACIÓN 307 OK …») que deshace todo (no queda la orden, ni el mail, ni los avisos).
-- Si termina con otro error, copiarlo y mandarlo.
-- =============================================================================
DO $do$
DECLARE
    v_pide bigint; v_autoriza bigint; v ops.viaje_chofer%ROWTYPE; v_est bigint;
    b jsonb; r jsonb; p tel.pedido_carga%ROWTYPE; s jsonb; x jsonb; v_ok text[] := '{}';
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 263 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 263';
    END IF;

    -- Un viaje en curso cuyo camión no tenga orden vigente ni solicitud pendiente
    SELECT vc.* INTO v FROM ops.viaje_chofer vc
     WHERE vc.estado = 'abierto' AND vc.eliminado_en IS NULL
       AND NOT EXISTS (SELECT 1 FROM fue.orden_carga oc WHERE oc.camion_id = vc.camion_id AND oc.genset_id IS NULL AND oc.estado IN ('emitida', 'autorizada') AND oc.vence_en > now())
       AND NOT EXISTS (SELECT 1 FROM tel.pedido_carga pc WHERE pc.camion_id = vc.camion_id AND pc.estado = 'pendiente')
     ORDER BY vc.salida_ts DESC LIMIT 1;
    IF v.id IS NULL THEN RAISE EXCEPTION 'No hay un viaje en curso libre para probar (todos tienen una orden vigente o una solicitud pendiente): probar más tarde'; END IF;
    SELECT id INTO v_est FROM mae.estacion_servicio
     WHERE eliminado_en IS NULL AND NOT es_tanque_propio AND nullif(btrim(coalesce(correo, '')), '') IS NOT NULL ORDER BY id LIMIT 1;
    IF v_est IS NULL THEN RAISE EXCEPTION 'No hay una estación con correo para probar'; END IF;

    INSERT INTO seg.usuario (login, nombre) VALUES ('zz_pide_307', 'ZZ Pide 307') RETURNING id INTO v_pide;
    INSERT INTO seg.usuario (login, nombre, autoriza_cargas) VALUES ('zz_autoriza_307', 'ZZ Autoriza 307', true) RETURNING id INTO v_autoriza;
    INSERT INTO seg.usuario_rol (usuario_id, rol_codigo) VALUES (v_pide, 'analista_control');

    -- 1 · El pedido guarda la recomendación completa (lo mismo que mostró la pantalla al pedir)
    PERFORM set_config('app.usuario_id', v_pide::text, true);
    b := tel.fn_preparar_pedido_carga(v.id, v_est);
    r := tel.fn_pedir_carga(v.id, v_est, 400, p_detalle => '{"destino":"tanques","tanques":{"modo":"lleno"}}', p_via => 'sistema', p_observacion => 'ZZ prueba 307');
    SELECT * INTO p FROM tel.pedido_carga WHERE id = (r ->> 'id')::bigint;
    IF NOT (p.datos ? 'litros_para_llegar' AND p.datos ? 'litros_para_llenar')
       OR p.datos -> 'litros_sugeridos' IS DISTINCT FROM b -> 'litros_sugeridos'
       OR p.datos -> 'litros_para_llegar' IS DISTINCT FROM b -> 'litros_para_llegar'
       OR p.datos -> 'litros_para_llenar' IS DISTINCT FROM b -> 'litros_para_llenar' THEN
        RAISE EXCEPTION 'FALLA 1: el pedido no guardó la recomendación: guardó % y la pantalla mostraba %',
            jsonb_build_object('sug', p.datos -> 'litros_sugeridos', 'llegar', p.datos -> 'litros_para_llegar', 'llenar', p.datos -> 'litros_para_llenar'),
            jsonb_build_object('sug', b -> 'litros_sugeridos', 'llegar', b -> 'litros_para_llegar', 'llenar', b -> 'litros_para_llenar');
    END IF;
    v_ok := v_ok || '1 el pedido guarda la recomendación completa'::text;

    -- 2 · Quien autoriza ve la recomendación junto al pedido
    PERFORM set_config('app.usuario_id', v_autoriza::text, true);
    SELECT e INTO s FROM jsonb_array_elements(fue.fn_solicitudes_carga()) e WHERE (e ->> 'id')::bigint = p.id;
    IF s IS NULL THEN RAISE EXCEPTION 'FALLA 2: la solicitud no aparece entre las pendientes'; END IF;
    IF NOT (s ? 'recomendado_l' AND s ? 'para_llegar_l' AND s ? 'para_llenar_l')
       OR (s ->> 'recomendado_l')::numeric IS DISTINCT FROM (b ->> 'litros_sugeridos')::numeric
       OR (s ->> 'para_llegar_l')::numeric IS DISTINCT FROM (b ->> 'litros_para_llegar')::numeric
       OR (s ->> 'para_llenar_l')::numeric IS DISTINCT FROM (b ->> 'litros_para_llenar')::numeric
       OR (s ->> 'litros')::numeric <> 400 OR s ->> 'a_cargar' IS NULL THEN
        RAISE EXCEPTION 'FALLA 2: la solicitud pendiente no trae la recomendación o perdió datos: %', s - 'mensaje';
    END IF;
    v_ok := v_ok || '2 quien autoriza ve recomendación y pedido'::text;

    -- 3 · Pendiente: en Seguimiento se ve lo recomendado y todavía no hay orden
    SELECT e INTO x FROM jsonb_array_elements(tel.fn_pedidos_carga_viaje(v.id)) e WHERE (e ->> 'id')::bigint = p.id;
    IF (x ->> 'recomendado_l')::numeric IS DISTINCT FROM (b ->> 'litros_sugeridos')::numeric
       OR x ->> 'orden_a_cargar' IS NOT NULL OR x ->> 'orden_con_cambios' IS NOT NULL OR x ->> 'estado' <> 'pendiente' THEN
        RAISE EXCEPTION 'FALLA 3: el pedido pendiente quedó mal en Seguimiento: %', x - 'mensaje';
    END IF;
    v_ok := v_ok || '3 pendiente sin orden'::text;

    -- 4 · Aprobada sin cambios: la orden dice lo mismo que el pedido (se prueba y se deshace)
    BEGIN
        PERFORM fue.fn_aprobar_solicitud_carga(p.id);
        SELECT e INTO x FROM jsonb_array_elements(tel.fn_pedidos_carga_viaje(v.id)) e WHERE (e ->> 'id')::bigint = p.id;
        IF x ->> 'orden' IS NULL OR x ->> 'orden_a_cargar' IS DISTINCT FROM x ->> 'a_cargar' OR (x ->> 'orden_con_cambios')::boolean IS DISTINCT FROM false THEN
            RAISE EXCEPTION 'FALLA 4: aprobada sin cambios y la orden no coincide con el pedido: %', x - 'mensaje';
        END IF;
        RAISE EXCEPTION 'deshacer' USING ERRCODE = 'ZZ307';
    EXCEPTION WHEN SQLSTATE 'ZZ307' THEN v_ok := v_ok || '4 aprobada sin cambios: orden igual al pedido'::text;
    END;

    -- 5 · Aprobada con cambios: se ve lo que decidió la orden y que es distinto
    PERFORM fue.fn_aprobar_solicitud_carga(p.id, v_est, '{"destino":"tanques","tanques":{"modo":"litros","litros":123}}'::jsonb, NULL, 'ZZ editada 307');
    SELECT e INTO x FROM jsonb_array_elements(tel.fn_pedidos_carga_viaje(v.id)) e WHERE (e ->> 'id')::bigint = p.id;
    IF x ->> 'orden' IS NULL OR x ->> 'orden_a_cargar' NOT LIKE '%123%' OR x ->> 'orden_a_cargar' = x ->> 'a_cargar'
       OR (x ->> 'orden_con_cambios')::boolean IS DISTINCT FROM true OR (x ->> 'litros')::numeric <> 400 THEN
        RAISE EXCEPTION 'FALLA 5: aprobada con cambios y no se ve la decisión: %', x - 'mensaje';
    END IF;
    v_ok := v_ok || '5 aprobada con cambios: se ve la decisión'::text;

    -- 6 · Un pedido anterior (sin la recomendación completa guardada) no rompe nada
    UPDATE tel.pedido_carga SET datos = datos - 'litros_para_llegar' - 'litros_para_llenar' - 'litros_sugeridos' WHERE id = p.id;
    SELECT e INTO x FROM jsonb_array_elements(tel.fn_pedidos_carga_viaje(v.id)) e WHERE (e ->> 'id')::bigint = p.id;
    IF x ->> 'recomendado_l' IS NOT NULL OR x ->> 'orden' IS NULL THEN RAISE EXCEPTION 'FALLA 6: un pedido sin recomendación guardada quedó mal: %', x - 'mensaje'; END IF;
    v_ok := v_ok || '6 pedidos anteriores sin recomendación'::text;

    RAISE EXCEPTION 'VERIFICACIÓN 307 OK (no se guardó nada): %', array_to_string(v_ok, ' · ');
END $do$;
