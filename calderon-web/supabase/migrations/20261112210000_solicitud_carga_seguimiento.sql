-- =============================================================================
-- IronTrack — 259 · Cambio 249 · Solicitud de carga desde Seguimiento de viaje
-- -----------------------------------------------------------------------------
-- Seguimiento de viaje › Pedir carga usa el mismo formulario que «Nueva orden de carga»
-- (estación → solo tanques / tanques y mochila → lleno o litros → litros aproximados), con el
-- camión ya elegido. Al final se elige cómo mandarla:
--   · Mensaje: como hasta ahora (texto para WhatsApp).
--   · Por sistema: queda una solicitud pendiente y les llega un aviso al teléfono a quienes
--     tienen «Autoriza cargas». La ven arriba de Combustible › Cargas › Órdenes de carga:
--       - Aprobar: genera la orden y el mail a la estación.
--       - Editar: el formulario con los datos de la solicitud; al guardar, aprueba.
--       - Rechazar: con motivo; le avisa a quien la pidió.
--     Quien la pidió ve en Seguimiento si está pendiente, aprobada (con la orden) o rechazada.
-- Se reutiliza tel.pedido_carga (columnas nuevas). No crea datos. web.version_base = 259.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 258 THEN
        RAISE EXCEPTION 'Falta la migración 258: aplicarla antes';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'tel' AND table_name = 'pedido_carga' AND column_name = 'via') THEN
        RAISE EXCEPTION 'La migración 259 (solicitud de carga) ya está aplicada';
    END IF;
END $do$;

-- Copia los permisos de ejecución de una función a otra (mismos roles que la de modelo)
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_a, g);
    END LOOP;
    FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END
               FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = p_de AND x.privilege_type = 'EXECUTE' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', p_a, g);
    END LOOP;
    IF (SELECT proacl FROM pg_proc WHERE oid = p_de) IS NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', p_a);
    END IF;
END $fn$;

-- -----------------------------------------------------------------------------
-- 1 · La solicitud: tel.pedido_carga con la vía, el estado y lo que se pide
-- -----------------------------------------------------------------------------
ALTER TABLE tel.pedido_carga
    ADD COLUMN via            text NOT NULL DEFAULT 'mensaje',
    ADD COLUMN estado         text,
    ADD COLUMN detalle        jsonb,
    ADD COLUMN observacion    text,
    ADD COLUMN orden_id       bigint REFERENCES fue.orden_carga(id) ON DELETE RESTRICT,
    ADD COLUMN resuelto_por   bigint REFERENCES seg.usuario(id) ON DELETE RESTRICT,
    ADD COLUMN resuelto_en    timestamptz,
    ADD COLUMN motivo_rechazo text,
    ADD CONSTRAINT ck_pedido_carga_via CHECK (via IN ('mensaje', 'sistema')),
    ADD CONSTRAINT ck_pedido_carga_estado CHECK (
        CASE WHEN via = 'sistema' THEN estado IN ('pendiente', 'aprobada', 'rechazada') AND detalle IS NOT NULL
             ELSE estado IS NULL END),
    ADD CONSTRAINT ck_pedido_carga_resuelto CHECK (
        CASE coalesce(estado, '')
            WHEN 'aprobada'  THEN resuelto_en IS NOT NULL AND orden_id IS NOT NULL
            WHEN 'rechazada' THEN resuelto_en IS NOT NULL AND nullif(btrim(motivo_rechazo), '') IS NOT NULL
            ELSE resuelto_en IS NULL AND orden_id IS NULL END);

-- Una sola solicitud pendiente por camión
CREATE UNIQUE INDEX ux_pedido_carga_pendiente ON tel.pedido_carga (camion_id) WHERE estado = 'pendiente';
CREATE INDEX ix_pedido_carga_estado ON tel.pedido_carga (estado, creado_en) WHERE via = 'sistema';

-- -----------------------------------------------------------------------------
-- 2 · Ayudas
-- -----------------------------------------------------------------------------
-- Texto de lo que se carga (el mismo de la orden: «Tanques: llenos · Mochila: 300 L»)
CREATE FUNCTION fue.fn_texto_detalle_carga(p_detalle jsonb)
RETURNS text LANGUAGE plpgsql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $fn$
DECLARE o fue.orden_carga;
BEGIN
    IF p_detalle IS NULL THEN RETURN NULL; END IF;
    o.detalle := p_detalle;
    o.modo := 'llenar';
    RETURN fue.fn_texto_autorizado(o);
END $fn$;

-- Aviso al teléfono (solo a quien tiene un teléfono activo; nunca al que hace la acción)
CREATE FUNCTION tel.fn_avisar_pedido_carga(p_usuarios bigint[], p_clave text, p_titulo text, p_cuerpo text, p_url text, p_urgente boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $fn$
    INSERT INTO ops.push_saliente (usuario_id, clave, titulo, cuerpo, url, urgente)
    SELECT DISTINCT s.usuario_id, p_clave, p_titulo, left(coalesce(nullif(p_cuerpo, ''), p_titulo), 300), p_url, p_urgente
      FROM ops.push_suscripcion s JOIN seg.usuario u ON u.id = s.usuario_id AND u.activo
     WHERE s.activa AND s.usuario_id = ANY (p_usuarios) AND s.usuario_id IS DISTINCT FROM aud.fn_usuario_actual()
    ON CONFLICT (usuario_id, clave) DO NOTHING
$fn$;

-- -----------------------------------------------------------------------------
-- 3 · Los datos del formulario también para quien pide la carga (Telemetría o TI)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_preparar_orden_carga(p_camion bigint, p_estacion bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_comb jsonb; v_ch bigint; v_pr record; v_llenar numeric;
BEGIN
    -- Migración 259: también lo lee quien pide la carga desde Seguimiento (Telemetría o TI)
    IF NOT fue.fn_puedo_autorizar_cargas()
       AND NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('analista_control', 'ti')) THEN
        PERFORM fue.fn_exigir_autoriza_cargas();
    END IF;
    v_comb := fue.fn_combustible_actual(p_camion);
    v_ch := fue.fn_chofer_actual(p_camion);
    v_llenar := CASE WHEN (v_comb ->> 'litros') IS NOT NULL AND (v_comb ->> 'capacidad_l') IS NOT NULL
                     THEN greatest(round((v_comb ->> 'capacidad_l')::numeric - (v_comb ->> 'litros')::numeric), 0) END;
    SELECT c.precio_unitario, c.moneda, c.fecha_hora INTO v_pr FROM fue.carga_combustible c
     WHERE c.estacion_id = p_estacion AND c.eliminado_en IS NULL AND c.precio_unitario > 0 ORDER BY c.fecha_hora DESC LIMIT 1;
    RETURN jsonb_build_object(
        'camion_id', p_camion, 'patente', (SELECT patente FROM mae.camion WHERE id = p_camion),
        'chofer_id', v_ch, 'chofer', ops.fn_nombre_chofer(v_ch),
        'combustible', v_comb, 'litros_para_llenar', coalesce(v_llenar, (fue.fn_estimar_llenado(p_camion) ->> 'litros')::numeric), 'estimacion', fue.fn_estimar_llenado(p_camion), 'capacidad_mochila_l', fue.fn_capacidad_mochila(p_camion),
        'estacion', (SELECT nombre FROM mae.estacion_servicio WHERE id = p_estacion),
        'correo', (SELECT correo FROM mae.estacion_servicio WHERE id = p_estacion),
        'precio', v_pr.precio_unitario, 'moneda', coalesce(v_pr.moneda, (SELECT CASE e.pais WHEN 'CL' THEN 'CLP' ELSE 'ARS' END FROM mae.estacion_servicio e WHERE e.id = p_estacion)),
        'precio_fecha', v_pr.fecha_hora,
        'vigente', (SELECT numero FROM fue.orden_carga WHERE camion_id = p_camion AND genset_id IS NULL AND estado IN ('emitida', 'autorizada') AND vence_en > now()),
        -- Migración 259: solicitud pendiente del camión
        'pendiente', (SELECT jsonb_build_object('id', p.id, 'por', u.nombre, 'en', p.creado_en) FROM tel.pedido_carga p LEFT JOIN seg.usuario u ON u.id = p.creado_por
                       WHERE p.camion_id = p_camion AND p.estado = 'pendiente'),
        'mail', ops.fn_estado_mail());
END $function$;

-- -----------------------------------------------------------------------------
-- 4 · Pedir la carga: por mensaje (como antes) o por sistema (solicitud pendiente)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _permisos_pedir AS
SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS rol
  FROM pg_proc p, aclexplode(p.proacl) x
 WHERE p.oid = 'tel.fn_pedir_carga(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure
   AND x.privilege_type = 'EXECUTE';

DROP FUNCTION tel.fn_pedir_carga(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric);

CREATE FUNCTION tel.fn_pedir_carga(p_viaje bigint, p_estacion bigint, p_litros numeric, p_precio numeric DEFAULT NULL::numeric, p_km numeric DEFAULT NULL::numeric, p_gasto numeric DEFAULT NULL::numeric, p_tanques numeric DEFAULT NULL::numeric, p_mochila numeric DEFAULT NULL::numeric, p_programador numeric DEFAULT NULL::numeric,
                                   p_detalle jsonb DEFAULT NULL::jsonb, p_via text DEFAULT 'mensaje'::text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint := aud.fn_usuario_actual(); v ops.viaje_chofer%ROWTYPE; b jsonb;
    v_km numeric; v_gasto numeric; v_tanq numeric; v_moch numeric; v_prog numeric; v_disp numeric; v_inicial numeric; v_l100 numeric;
    v_precio numeric; v_mon text; v_importe numeric; v_est text; v_msg text; v_id bigint; v_manual boolean;
    v_cap numeric; v_ini_t numeric; v_ini_m numeric; v_cargas_l numeric; v_cargas_txt text;
    v_via text := coalesce(nullif(btrim(p_via), ''), 'mensaje'); v_det jsonb; v_texto text; v_vig text; v_correo text; v_obs text;
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('analista_control', 'ti')) THEN
        RAISE EXCEPTION 'La carga la pide Telemetría o TI' USING ERRCODE = '42501';
    END IF;
    IF v_via NOT IN ('mensaje', 'sistema') THEN RAISE EXCEPTION 'Elegí cómo mandar el pedido: por mensaje o por sistema' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v FROM ops.viaje_chofer WHERE id = p_viaje AND eliminado_en IS NULL;
    IF v.id IS NULL THEN RAISE EXCEPTION 'El viaje no existe' USING ERRCODE = 'P0002'; END IF;
    IF v.estado <> 'abierto' THEN RAISE EXCEPTION 'El viaje ya no está en curso' USING ERRCODE = '55000'; END IF;
    IF p_estacion IS NULL OR NOT EXISTS (SELECT 1 FROM mae.estacion_servicio WHERE id = p_estacion AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Elegí la estación donde va a cargar' USING ERRCODE = '22023';
    END IF;
    -- Migración 259: qué se carga (lo mismo que en la orden de carga)
    IF p_detalle IS NOT NULL THEN
        v_det := fue.fn_detalle_orden(v.camion_id, p_detalle) - 'modo' - 'litros';
        v_texto := fue.fn_texto_detalle_carga(v_det);
    ELSIF v_via = 'sistema' THEN
        RAISE EXCEPTION 'Elegí qué se carga: solo los tanques, o los tanques y la mochila' USING ERRCODE = '22023';
    END IF;
    IF p_litros IS NULL OR p_litros <= 0 OR p_litros > 3000 THEN RAISE EXCEPTION 'Indicá los litros aproximados a cargar (hasta 3.000)' USING ERRCODE = '22023'; END IF;
    IF p_precio IS NOT NULL AND p_precio <= 0 THEN RAISE EXCEPTION 'El precio tiene que ser mayor que cero' USING ERRCODE = '22023'; END IF;
    IF p_programador IS NOT NULL AND (p_programador < 0 OR p_programador > 100) THEN RAISE EXCEPTION 'El %% de programador va de 0 a 100' USING ERRCODE = '22023'; END IF;
    IF (p_km IS NOT NULL AND p_km < 0) OR (p_gasto IS NOT NULL AND p_gasto < 0) OR (p_tanques IS NOT NULL AND p_tanques < 0) OR (p_mochila IS NOT NULL AND p_mochila < 0) THEN
        RAISE EXCEPTION 'Los km y los litros no pueden ser negativos' USING ERRCODE = '22023';
    END IF;
    v_obs := nullif(btrim(coalesce(p_observacion, '')), '');
    IF length(v_obs) > 500 THEN RAISE EXCEPTION 'La observación es muy larga (hasta 500 letras)' USING ERRCODE = '22023'; END IF;

    IF v_via = 'sistema' THEN
        -- Lo mismo que va a pedir la orden al aprobarla: que se sepa ahora y no al aprobar
        SELECT nullif(btrim(coalesce(correo, '')), '') INTO v_correo FROM mae.estacion_servicio WHERE id = p_estacion;
        IF v_correo IS NULL THEN
            RAISE EXCEPTION 'La estación % no tiene correo: sin correo no se puede autorizar por sistema (mandalo por mensaje)',
                (SELECT nombre FROM mae.estacion_servicio WHERE id = p_estacion) USING ERRCODE = '22023';
        END IF;
        SELECT numero INTO v_vig FROM fue.orden_carga
         WHERE camion_id = v.camion_id AND genset_id IS NULL AND estado IN ('emitida', 'autorizada') AND vence_en > now();
        IF v_vig IS NOT NULL THEN
            RAISE EXCEPTION 'El camión ya tiene la orden % vigente: no hace falta pedir otra', v_vig USING ERRCODE = '23505';
        END IF;
        PERFORM 1 FROM tel.pedido_carga WHERE camion_id = v.camion_id AND estado = 'pendiente' FOR UPDATE;
        IF FOUND THEN
            RAISE EXCEPTION 'Ya hay una solicitud de carga pendiente para este camión: esperá que la aprueben o la rechacen' USING ERRCODE = '23505';
        END IF;
    END IF;

    b := tel.fn_preparar_pedido_carga(p_viaje, p_estacion);
    v_manual := num_nonnulls(p_km, p_gasto, p_tanques, p_mochila, p_programador) > 0;
    v_km := coalesce(p_km, (b ->> 'km')::numeric);
    v_gasto := coalesce(p_gasto, (b ->> 'gasto_l')::numeric);
    v_tanq := coalesce(p_tanques, (b ->> 'tanques_l')::numeric);
    v_moch := coalesce(p_mochila, (b ->> 'mochila_l')::numeric);
    v_prog := coalesce(p_programador, (b ->> 'programador_pct')::numeric);
    v_disp := CASE WHEN v_tanq IS NOT NULL OR v_moch IS NOT NULL THEN coalesce(v_tanq, 0) + coalesce(v_moch, 0) END;
    v_inicial := CASE WHEN p_gasto IS NULL AND p_tanques IS NULL AND p_mochila IS NULL THEN (b ->> 'inicial_l')::numeric
                      WHEN v_disp IS NOT NULL AND v_gasto IS NOT NULL THEN v_disp + v_gasto - coalesce((b ->> 'cargas_viaje_l')::numeric, 0) END;
    -- Migración 221: inicial separado en tanques (siempre llenos primero) y mochila; lo cargado en el viaje por estación
    v_cap := (b ->> 'capacidad_tanques_l')::numeric;
    v_ini_t := CASE WHEN v_inicial IS NOT NULL AND v_cap IS NOT NULL THEN least(v_inicial, v_cap) END;
    v_ini_m := CASE WHEN v_inicial IS NOT NULL AND v_cap IS NOT NULL THEN greatest(v_inicial - v_cap, 0) END;
    v_cargas_l := coalesce((b ->> 'cargas_viaje_l')::numeric, 0);
    SELECT string_agg('- ' || (x ->> 'estacion') || ': *' || tel.fn_num_ar((x ->> 'litros')::numeric) || ' L*', E'\n')
      INTO v_cargas_txt FROM jsonb_array_elements(b -> 'cargas_viaje') x;
    v_l100 := CASE WHEN v_km > 0 AND v_gasto IS NOT NULL THEN round(100 * v_gasto / v_km, 2) END;
    v_precio := coalesce(p_precio, (b ->> 'precio')::numeric);
    v_mon := CASE WHEN p_precio IS NOT NULL AND b ->> 'moneda' IS NULL
                  THEN (SELECT CASE e.pais WHEN 'CL' THEN 'CLP' ELSE 'ARS' END FROM mae.estacion_servicio e WHERE e.id = p_estacion)
                  ELSE b ->> 'moneda' END;
    -- Migración 259: por sistema el precio no hace falta (la orden no lo usa)
    IF v_precio IS NULL AND v_via = 'mensaje' THEN
        RAISE EXCEPTION 'No hay cargas anteriores en esa estación: escribí el precio por litro' USING ERRCODE = '22023';
    END IF;
    v_importe := round(p_litros * v_precio, 2);
    v_est := b ->> 'estacion';

    v_msg := concat_ws(E'\n',
        -- Migración 222: negritas de WhatsApp (*texto*)
        '*' || coalesce(b ->> 'chofer', 'SIN CHOFER') || '*',
        '*Tractor:* ' || (b ->> 'patente'),
        '*Gasoil inicial:* ' || tel.fn_num_ar(v_inicial) || ' L'
            || CASE WHEN v_ini_t IS NOT NULL THEN ' (' || tel.fn_num_ar(v_ini_t) || ' tanques | ' || tel.fn_num_ar(v_ini_m) || ' mochila)' ELSE '' END || CASE WHEN p_gasto IS NULL AND p_tanques IS NULL AND p_mochila IS NULL AND (b ->> 'faltante_salida_l') IS NOT NULL THEN ' (faltaron ' || tel.fn_num_ar((b ->> 'faltante_salida_l')::numeric) || ' L para llenar)' ELSE '' END,
        '*Línea de viaje:* ' || coalesce(b ->> 'linea', '—'),
        '*Litros cargados en viaje:* *' || tel.fn_num_ar(v_cargas_l) || ' L*',
        v_cargas_txt,
        '*Km recorridos según plataforma:* ' || tel.fn_num_ar(v_km) || ' km',
        '*Gasto según plataforma:* ' || tel.fn_num_ar(v_gasto) || ' L (hasta ' || v_est || ')',
        '*Gasoil disponible según plataforma:* ' || tel.fn_num_ar(v_disp) || ' L (' || tel.fn_num_ar(v_tanq) || ' tanques | ' || tel.fn_num_ar(v_moch) || ' mochila)',
        '*Promedio:* ' || tel.fn_num_ar(v_l100, 2) || ' L/100 km',
        '*Programador:* ' || tel.fn_num_ar(v_prog, 2) || ' %',
        -- Migración 259: qué se carga (como en la orden) y los litros aproximados
        '*A cargar:* ' || v_texto,
        '*Litros ' || CASE WHEN v_texto IS NOT NULL THEN 'aproximados' ELSE 'a cargar' END || ':* ' || tel.fn_num_ar(p_litros) || ' L'
            || coalesce(' = *$' || tel.fn_num_ar(v_importe) || ' ' || coalesce(v_mon, '') || '*', '')
            || ' (' || v_est || coalesce(', $' || tel.fn_num_ar(v_precio, 2) || ' por litro', '') || ')',
        '*Observación:* ' || v_obs);

    INSERT INTO tel.pedido_carga (viaje_id, camion_id, chofer_id, estacion_id, litros, precio_unitario, moneda, importe, datos, mensaje, creado_por,
                                  via, estado, detalle, observacion)
    VALUES (p_viaje, v.camion_id, v.chofer_id, p_estacion, p_litros, v_precio, v_mon, v_importe,
            jsonb_build_object('inicial_l', v_inicial, 'inicial_tanques_l', v_ini_t, 'inicial_mochila_l', v_ini_m,
                               'cargas_viaje_l', v_cargas_l, 'cargas_viaje', b -> 'cargas_viaje', 'linea', b ->> 'linea', 'km', v_km, 'gasto_l', v_gasto, 'tanques_l', v_tanq, 'mochila_l', v_moch,
                               'l_100km', v_l100, 'programador_pct', v_prog, 'manual', v_manual,
                               'precio_sugerido', b -> 'precio', 'litros_sugeridos', b -> 'litros_sugeridos'),
            v_msg, v_usr, v_via, CASE WHEN v_via = 'sistema' THEN 'pendiente' END, v_det, v_obs)
    RETURNING id INTO v_id;

    -- Migración 259: aviso a quienes autorizan cargas
    IF v_via = 'sistema' THEN
        PERFORM tel.fn_avisar_pedido_carga(
            ARRAY(SELECT u.id FROM seg.usuario u WHERE u.autoriza_cargas AND u.activo),
            'pedido_carga:' || v_id, 'Solicitud de carga · ' || (b ->> 'patente'),
            concat_ws(' · ', coalesce(b ->> 'chofer', 'sin chofer'), v_est, v_texto, '≈ ' || tel.fn_num_ar(p_litros) || ' L',
                      'pidió ' || (SELECT nombre FROM seg.usuario WHERE id = v_usr)),
            '/combustible/cargas?vista=ordenes', true);
    END IF;

    RETURN jsonb_build_object('id', v_id, 'mensaje', v_msg, 'importe', v_importe, 'moneda', v_mon, 'precio', v_precio,
                              'via', v_via, 'estado', CASE WHEN v_via = 'sistema' THEN 'pendiente' END);
END $function$;

DO $do$
DECLARE g text;
BEGIN
    REVOKE ALL ON FUNCTION tel.fn_pedir_carga(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text) FROM PUBLIC;
    FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
        EXECUTE format('REVOKE ALL ON FUNCTION tel.fn_pedir_carga(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text) FROM %I', g);
    END LOOP;
    FOR g IN SELECT rol FROM _permisos_pedir LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION tel.fn_pedir_carga(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text) TO %s', g);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM _permisos_pedir) THEN
        GRANT EXECUTE ON FUNCTION tel.fn_pedir_carga(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text) TO PUBLIC;
    END IF;
END $do$;
DROP TABLE _permisos_pedir;

-- -----------------------------------------------------------------------------
-- 5 · Los pedidos del viaje, con su estado (Seguimiento)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tel.fn_pedidos_carga_viaje(p_viaje bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'en', p.creado_en, 'por', u.nombre, 'estacion', e.nombre, 'litros', p.litros,
                                                 'importe', p.importe, 'moneda', p.moneda, 'mensaje', p.mensaje,
                                                 -- Migración 259: vía, estado y la orden (o el motivo del rechazo)
                                                 'via', p.via, 'estado', p.estado, 'a_cargar', fue.fn_texto_detalle_carga(p.detalle),
                                                 'orden', o.numero, 'orden_estado', CASE WHEN o.estado = 'emitida' AND o.vence_en <= now() THEN 'vencida' ELSE o.estado END,
                                                 'motivo_rechazo', p.motivo_rechazo, 'resuelto_en', p.resuelto_en, 'resuelto_por', r.nombre)
                              ORDER BY p.creado_en DESC, p.id DESC), '[]'::jsonb)
      FROM tel.pedido_carga p LEFT JOIN seg.usuario u ON u.id = p.creado_por LEFT JOIN mae.estacion_servicio e ON e.id = p.estacion_id
      LEFT JOIN fue.orden_carga o ON o.id = p.orden_id LEFT JOIN seg.usuario r ON r.id = p.resuelto_por
     WHERE p.viaje_id = p_viaje
$function$;

-- La lista de Seguimiento: el estado de la última solicitud por sistema del viaje
CREATE OR REPLACE FUNCTION tel.fn_seguimiento_viajes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    WITH v AS (
        SELECT v.*, tel.fn_tramo_telemetria(v.camion_id, v.salida_ts, now()) AS t
          FROM ops.viaje_chofer v
         WHERE v.estado = 'abierto' AND v.eliminado_en IS NULL AND ops.fn_situacion_viaje_chofer(v) = 'en_viaje'),
    x AS (
        SELECT v.*, (v.t ->> 'km')::numeric AS km, (v.t ->> 'litros')::numeric AS litros,
               tel.fn_programador_pct(v.camion_id, v.salida_ts, now()) AS prog
          FROM v)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'viaje_id', x.id, 'numero', x.numero, 'camion_id', x.camion_id, 'patente', c.patente, 'marca', c.marca,
               'chofer_id', tel.fn_chofer_ahora_viaje(x.id), 'chofer', ops.fn_nombre_chofer(tel.fn_chofer_ahora_viaje(x.id)),
                'chofer_viaje', CASE WHEN tel.fn_chofer_ahora_viaje(x.id) IS DISTINCT FROM x.chofer_id THEN ops.fn_nombre_chofer(x.chofer_id) END,
                'salida_ts', x.salida_ts,
               'linea', (SELECT string_agg(l.codigo, ' · ' ORDER BY i.id) FROM ops.viaje_chofer_item i JOIN mae.linea l ON l.id = i.linea_id
                          WHERE i.viaje_id = x.id AND i.eliminado_en IS NULL),
               'km', x.km, 'litros', x.litros, 'programador_pct', x.prog,
               'con_telemetria', x.km IS NOT NULL AND x.litros IS NOT NULL, 'motivo_sin_litros', x.t ->> 'motivo_sin_litros',
               'evaluacion', tel.fn_evaluar_seguimiento(x.id, x.km, x.litros, x.prog),
               'ultimo_control', (SELECT jsonb_build_object('en', s.creado_en, 'por', u.nombre, 'resultado', s.resultado,
                                                            'l_100km', s.l_100km, 'programador_pct', s.programador_pct, 'fuente', s.fuente)
                                    FROM tel.seguimiento_viaje s LEFT JOIN seg.usuario u ON u.id = s.creado_por
                                   WHERE s.viaje_id = x.id ORDER BY s.creado_en DESC, s.id DESC LIMIT 1),
               'controles_hoy', (SELECT count(*) FROM tel.seguimiento_viaje s WHERE s.viaje_id = x.id
                                    AND (s.creado_en AT TIME ZONE 'America/Argentina/Mendoza')::date = (now() AT TIME ZONE 'America/Argentina/Mendoza')::date),
               -- Migración 259: última solicitud de carga por sistema
               'solicitud_carga', (SELECT jsonb_build_object('estado', p.estado, 'en', p.creado_en, 'orden', o.numero, 'motivo_rechazo', p.motivo_rechazo)
                                     FROM tel.pedido_carga p LEFT JOIN fue.orden_carga o ON o.id = p.orden_id
                                    WHERE p.viaje_id = x.id AND p.via = 'sistema' ORDER BY p.creado_en DESC, p.id DESC LIMIT 1))
             ORDER BY c.patente), '[]'::jsonb)
      FROM x JOIN mae.camion c ON c.id = x.camion_id
$function$;

-- -----------------------------------------------------------------------------
-- 6 · Órdenes de carga: las solicitudes pendientes, aprobar (con o sin cambios) y rechazar
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_solicitudes_carga()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'en', p.creado_en, 'por', u.nombre, 'viaje_id', p.viaje_id, 'viaje', vj.numero,
               'camion_id', p.camion_id, 'patente', c.patente,
               'chofer_id', coalesce(tel.fn_chofer_ahora_viaje(p.viaje_id), p.chofer_id),
               'chofer', ops.fn_nombre_chofer(coalesce(tel.fn_chofer_ahora_viaje(p.viaje_id), p.chofer_id)),
               'estacion_id', p.estacion_id, 'estacion', e.nombre, 'correo', e.correo,
               'detalle', p.detalle, 'a_cargar', fue.fn_texto_detalle_carga(p.detalle), 'litros', p.litros,
               'observacion', p.observacion, 'mensaje', p.mensaje)
             ORDER BY p.creado_en), '[]'::jsonb)
      FROM tel.pedido_carga p JOIN mae.camion c ON c.id = p.camion_id
      LEFT JOIN mae.estacion_servicio e ON e.id = p.estacion_id LEFT JOIN seg.usuario u ON u.id = p.creado_por
      LEFT JOIN ops.viaje_chofer vj ON vj.id = p.viaje_id
     WHERE p.estado = 'pendiente'
       AND (fue.fn_puedo_autorizar_cargas()
            OR EXISTS (SELECT 1 FROM seg.usuario_rol ur WHERE ur.usuario_id = aud.fn_usuario_actual()
                        AND ur.rol_codigo IN ('gerencia', 'ti', 'adm_combustible', 'analista_control', 'finanzas')))
$function$;

CREATE FUNCTION fue.fn_aprobar_solicitud_carga(p_id bigint, p_estacion bigint DEFAULT NULL::bigint, p_detalle jsonb DEFAULT NULL::jsonb,
                                               p_chofer bigint DEFAULT NULL::bigint, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint := fue.fn_exigir_autoriza_cargas(); p tel.pedido_carga%ROWTYPE; r jsonb; v_editada boolean := p_detalle IS NOT NULL;
BEGIN
    SELECT * INTO p FROM tel.pedido_carga WHERE id = p_id FOR UPDATE;
    IF p.id IS NULL OR p.via <> 'sistema' THEN RAISE EXCEPTION 'La solicitud de carga no existe' USING ERRCODE = 'P0002'; END IF;
    IF p.estado <> 'pendiente' THEN RAISE EXCEPTION 'La solicitud ya fue %', p.estado USING ERRCODE = '55000'; END IF;
    -- Sin cambios: lo que se pidió. Editada: lo que quedó en el formulario.
    r := fue.fn_crear_orden_carga(
            p.camion_id,
            CASE WHEN v_editada THEN p_estacion ELSE p.estacion_id END,
            'llenar', NULL, NULL, NULL,
            coalesce(p_chofer, tel.fn_chofer_ahora_viaje(p.viaje_id), p.chofer_id),
            CASE WHEN v_editada THEN p_observacion ELSE p.observacion END,
            CASE WHEN v_editada THEN p_detalle ELSE p.detalle END);
    UPDATE tel.pedido_carga SET estado = 'aprobada', orden_id = (r ->> 'id')::bigint, resuelto_por = v_usr, resuelto_en = now()
     WHERE id = p_id;
    PERFORM tel.fn_avisar_pedido_carga(
        ARRAY[p.creado_por], 'pedido_carga:' || p.id || ':aprobada', 'Carga aprobada · ' || (SELECT patente FROM mae.camion WHERE id = p.camion_id),
        concat_ws(' · ', 'Orden ' || (r ->> 'numero'), (SELECT nombre FROM mae.estacion_servicio e JOIN fue.orden_carga o ON o.estacion_id = e.id WHERE o.id = (r ->> 'id')::bigint),
                  CASE WHEN v_editada THEN 'con cambios' END, 'aprobó ' || (SELECT nombre FROM seg.usuario WHERE id = v_usr)),
        '/telemetria/seguimiento', false);
    RETURN r || jsonb_build_object('solicitud_id', p.id, 'editada', v_editada);
END $function$;

CREATE FUNCTION fue.fn_rechazar_solicitud_carga(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint := fue.fn_exigir_autoriza_cargas(); p tel.pedido_carga%ROWTYPE; v_mot text := btrim(coalesce(p_motivo, ''));
BEGIN
    IF length(v_mot) < 5 THEN RAISE EXCEPTION 'Escribí por qué se rechaza la solicitud' USING ERRCODE = '22023'; END IF;
    IF length(v_mot) > 500 THEN RAISE EXCEPTION 'El motivo es muy largo (hasta 500 letras)' USING ERRCODE = '22023'; END IF;
    SELECT * INTO p FROM tel.pedido_carga WHERE id = p_id FOR UPDATE;
    IF p.id IS NULL OR p.via <> 'sistema' THEN RAISE EXCEPTION 'La solicitud de carga no existe' USING ERRCODE = 'P0002'; END IF;
    IF p.estado <> 'pendiente' THEN RAISE EXCEPTION 'La solicitud ya fue %', p.estado USING ERRCODE = '55000'; END IF;
    UPDATE tel.pedido_carga SET estado = 'rechazada', motivo_rechazo = v_mot, resuelto_por = v_usr, resuelto_en = now() WHERE id = p_id;
    PERFORM tel.fn_avisar_pedido_carga(
        ARRAY[p.creado_por], 'pedido_carga:' || p.id || ':rechazada', 'Carga rechazada · ' || (SELECT patente FROM mae.camion WHERE id = p.camion_id),
        v_mot || ' (' || (SELECT nombre FROM seg.usuario WHERE id = v_usr) || ')', '/telemetria/seguimiento', false);
END $function$;

-- -----------------------------------------------------------------------------
-- 7 · Permisos: como las funciones parecidas que ya existen
-- -----------------------------------------------------------------------------
SELECT pg_temp.fn_copiar_permisos('fue.fn_texto_autorizado(fue.orden_carga)', 'fue.fn_texto_detalle_carga(jsonb)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_avisar_fondo(bigint[], text, text, text)', 'tel.fn_avisar_pedido_carga(bigint[], text, text, text, text, boolean)');
SELECT pg_temp.fn_copiar_permisos('fue.fn_ordenes_carga(integer)', 'fue.fn_solicitudes_carga()');
SELECT pg_temp.fn_copiar_permisos('fue.fn_anular_orden_carga(bigint, text)', 'fue.fn_aprobar_solicitud_carga(bigint, bigint, jsonb, bigint, text)');
SELECT pg_temp.fn_copiar_permisos('fue.fn_anular_orden_carga(bigint, text)', 'fue.fn_rechazar_solicitud_carga(bigint, text)');

UPDATE ref.parametro SET valor = '259' WHERE codigo = 'web.version_base' AND valor::text::int < 259;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Resultado
SELECT 'migración 259 aplicada' AS que,
       (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM seg.usuario WHERE autoriza_cargas AND activo) AS autorizan_cargas,
       (SELECT count(*) FROM tel.pedido_carga) AS pedidos_anteriores_por_mensaje;
