-- =====================================================================================
-- Migración 304 · Chile: el chofer avisa la carga con tarjeta de flota y sube el ticket
-- =====================================================================================
-- Pedido (24/11/2026): en Chile se paga con la tarjeta de flota y la estación no interviene (no hay QR ni palabra).
-- Si no había orden, o la orden ya había vencido (36 h), al chofer no le aparecía nada y la carga quedaba sin
-- registrar. Ahora, al terminar de cargar, el chofer toca «Cargué en Chile con la tarjeta de flota» en Mi viaje,
-- elige la estación, dice si llenó el tanque y saca la foto del ticket (Iris lee los litros). La oficina la registra
-- desde «Cargas de órdenes para registrar», como cualquier orden terminada.
--
--   1 · fue.fn_informar_carga_tarjeta(camión, estación, lleno, fotos, lecturas, litros):
--       · solo el chofer, con un camión suyo (tel.fn_camiones_del_chofer) y una estación de tarjeta (Chile);
--       · si el camión tiene una orden de tarjeta abierta en esa estación (últimos 7 días, aunque haya vencido), la
--         cierra con este ticket (fue.fn_terminar_orden_carga); si la orden era de otro chofer, queda a nombre de quien
--         cargó; si lo del tanque lleno no coincide con lo autorizado, lo deja en la alerta;
--       · si no hay orden, crea una ya «cargada» (autorizada_desde.informada_por_chofer), con la hora del ticket. No
--         pasa por «autorizada», así que no le pide nada a Finanzas (tg_95_pago_carga).
--       · controla: la foto, los litros (Iris o a mano), que no pasen lo que entra en el camión (como la 298) y que la
--         misma foto no se haya mandado antes.
--   2 · fue.fn_opciones_carga_tarjeta(): los camiones del chofer y las estaciones de Chile, la más cercana primero (GPS).
--   3 · ops.fn_informar_carga_tarjeta y ops.fn_opciones_carga_tarjeta: lo que llama la web del chofer. Copian los
--       permisos de ops.fn_terminar_orden_carga y ops.fn_mis_ordenes_carga.
--   4 · fue.fn_texto_autorizado (reemplazo con control, conserva sus permisos): en esas órdenes dice
--       «sin orden: la informó el chofer · tanque lleno» (o los litros).
-- No toca datos. Va después de la 303 (varias cuentas del chofer). web.version_base = 304.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 303 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 303 (20261124150000_varias_cuentas_del_chofer.sql). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF to_regprocedure('fue.fn_informar_carga_tarjeta(bigint,bigint,boolean,jsonb,bigint[],numeric)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 304 ya está aplicada';
    END IF;
    IF to_regprocedure('fue.fn_estacion_tarjeta(bigint)') IS NULL OR to_regprocedure('fue.fn_orden_tarjeta(fue.orden_carga)') IS NULL
       OR to_regprocedure('fue.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)') IS NULL
       OR to_regprocedure('ops.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)') IS NULL
       OR to_regprocedure('ops.fn_mis_ordenes_carga()') IS NULL OR to_regprocedure('fue.fn_mis_ordenes_carga()') IS NULL
       OR to_regprocedure('tel.fn_camiones_del_chofer(bigint)') IS NULL OR to_regprocedure('ops.fn_mi_chofer()') IS NULL
       OR to_regprocedure('ops.fn_nombre_chofer(bigint)') IS NULL
       OR to_regprocedure('fue.fn_hora_ticket(bigint[],timestamptz,timestamptz)') IS NULL
       OR to_regprocedure('fue.fn_capacidad_camion(bigint,timestamptz)') IS NULL
       OR to_regprocedure('fue.fn_texto_autorizado(fue.orden_carga)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones de las órdenes de carga que esta migración usa (Chile con tarjeta, 284)';
    END IF;
END $v$;

-- Copia los permisos de ejecución: solo roles tc_* (nunca tc_cliente) y authenticated (como la 297)
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

-- ------------------------------------------------------------------ 1 · el chofer avisa la carga
CREATE FUNCTION fue.fn_informar_carga_tarjeta(p_camion bigint, p_estacion bigint, p_lleno boolean, p_fotos jsonb,
                                              p_lecturas bigint[] DEFAULT '{}'::bigint[], p_litros numeric DEFAULT NULL::numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_ch bigint := ops.fn_mi_chofer(); v_usr bigint := aud.fn_usuario_actual();
    e mae.estacion_servicio%ROWTYPE; o fue.orden_carga%ROWTYPE; r jsonb;
    v_pat text; v_rep text; v_lit numeric; v_imp numeric; v_cap numeric; v_tope numeric; v_hora timestamptz; v_lleno_orden boolean;
BEGIN
    IF v_ch IS NULL THEN
        RAISE EXCEPTION 'Esto lo usa el chofer desde Mi viaje' USING ERRCODE = '42501';
    END IF;
    SELECT c.patente INTO v_pat FROM mae.camion c WHERE c.id = p_camion AND c.eliminado_en IS NULL;
    IF v_pat IS NULL OR NOT EXISTS (SELECT 1 FROM tel.fn_camiones_del_chofer(v_ch) AS m(camion_id) WHERE m.camion_id = p_camion) THEN
        RAISE EXCEPTION 'Ese camión no está a tu nombre en la Pizarra: avisá a la oficina' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO e FROM mae.estacion_servicio WHERE id = p_estacion AND eliminado_en IS NULL;
    IF NOT FOUND OR NOT fue.fn_estacion_tarjeta(e.id) THEN
        RAISE EXCEPTION 'Elegí la estación de Chile donde cargaste' USING ERRCODE = '22023';
    END IF;
    IF p_lleno IS NULL THEN
        RAISE EXCEPTION 'Decí si llenaste el tanque' USING ERRCODE = '22023';
    END IF;
    IF (CASE WHEN jsonb_typeof(p_fotos) = 'array' THEN jsonb_array_length(p_fotos) ELSE 0 END) = 0 THEN
        RAISE EXCEPTION 'Subí la foto del ticket' USING ERRCODE = '22023';
    END IF;
    -- Una a la vez por camión (doble toque)
    PERFORM pg_advisory_xact_lock(304, p_camion::integer);
    -- La misma foto ya se mandó (el mismo ticket otra vez)
    SELECT x.numero INTO v_rep
      FROM fue.orden_carga x
     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.tickets) = 'array' THEN x.tickets ELSE '[]'::jsonb END) t
     WHERE x.camion_id = p_camion AND x.creada_en > now() - interval '30 days' AND x.estado <> 'anulada'
       AND nullif(t ->> 'hash', '') IS NOT NULL
       AND t ->> 'hash' IN (SELECT f ->> 'hash' FROM jsonb_array_elements(p_fotos) f)
     LIMIT 1;
    IF v_rep IS NOT NULL THEN
        RAISE EXCEPTION 'Ese ticket ya lo mandaste: está en la orden %', v_rep USING ERRCODE = '23505';
    END IF;

    -- Los litros: los que escribió el chofer o la suma de los tickets que leyó Iris
    SELECT sum((l.propuesta ->> 'litros')::numeric), sum((l.propuesta ->> 'importe_total')::numeric) INTO v_lit, v_imp
      FROM ia.lectura l WHERE l.id = ANY (coalesce(p_lecturas, '{}')) AND l.estado = 'lista' AND l.tipo = 'ticket_combustible';
    v_lit := round(coalesce(p_litros, v_lit), 2);
    IF v_lit IS NULL OR v_lit < 1 THEN
        RAISE EXCEPTION 'Escribí los litros que dice el ticket' USING ERRCODE = '22023';
    END IF;
    -- Como la 298: no pueden ser más de los que entran en el camión (tanques + mochila + 10 %, mínimo 50 L)
    v_cap := (fue.fn_capacidad_camion(p_camion, now()) ->> 'total_l')::numeric;
    v_tope := CASE WHEN coalesce(v_cap, 0) > 0 THEN v_cap + greatest(round(v_cap * 0.10), 50) ELSE 3000 END;
    IF v_lit > v_tope THEN
        RAISE EXCEPTION '%', CASE WHEN coalesce(v_cap, 0) > 0
                                  THEN format('No pueden ser %s L: en el %s entran %s L entre tanques y mochila.',
                                              replace(to_char(round(v_lit), 'FM999,999,999,990'), ',', '.'), v_pat,
                                              replace(to_char(round(v_cap), 'FM999,999,999,990'), ',', '.'))
                                  ELSE format('No pueden ser %s L en un camión.', replace(to_char(round(v_lit), 'FM999,999,999,990'), ',', '.')) END
                             || CASE WHEN v_lit >= v_tope * 3
                                     THEN ' Revisá el número: el punto separa los miles (11.992 son once mil litros) y los decimales van con coma (11,992).'
                                     ELSE ' Revisá los litros del ticket.' END
            USING ERRCODE = '23514';
    END IF;
    -- La hora de la carga: la del ticket si Iris la leyó; si no, ahora
    v_hora := least(coalesce(fue.fn_hora_ticket(p_lecturas, now() - interval '7 days', now()), now()), now());

    -- a) Una orden de tarjeta abierta del camión en esa estación (aunque ya haya vencido): se cierra con este ticket
    SELECT * INTO o FROM fue.orden_carga x
     WHERE x.camion_id = p_camion AND x.genset_id IS NULL AND x.estado = 'autorizada' AND x.estacion_id = p_estacion
       AND fue.fn_orden_tarjeta(x) AND coalesce(x.detalle ->> 'medio_pago', 'tarjeta') = 'tarjeta'
       AND coalesce(x.autorizada_en, x.creada_en) > now() - interval '7 days'
     ORDER BY coalesce(x.autorizada_en, x.creada_en) DESC
     LIMIT 1
     FOR UPDATE;
    IF FOUND THEN
        IF o.chofer_id IS DISTINCT FROM v_ch THEN
            UPDATE fue.orden_carga
               SET chofer_id = v_ch,
                   observacion = left(concat_ws(' · ', observacion, 'La cargó ' || coalesce(ops.fn_nombre_chofer(v_ch), 'otro chofer')), 500)
             WHERE id = o.id;
        END IF;
        r := fue.fn_terminar_orden_carga(o.id, p_fotos, coalesce(p_lecturas, '{}'), v_lit, NULL);
        v_lleno_orden := CASE WHEN o.detalle IS NULL OR o.detalle #>> '{tanques,modo}' IS NULL THEN o.modo = 'llenar'
                              ELSE o.detalle #>> '{tanques,modo}' = 'lleno' END;
        IF p_lleno IS DISTINCT FROM v_lleno_orden THEN
            UPDATE fue.orden_carga
               SET alerta = concat_ws(' · ', alerta, CASE WHEN p_lleno THEN 'El chofer dice que llenó el tanque.' ELSE 'El chofer dice que no llenó el tanque.' END)
             WHERE id = o.id;
        END IF;
        RETURN r || jsonb_build_object('nueva', false);
    END IF;

    -- b) Sin orden: se crea ya cargada, para que la oficina la registre
    INSERT INTO fue.orden_carga (camion_id, chofer_id, estacion_id, modo, litros, token, palabra_hash, estado, vence_en, observacion, creada_por,
                                 autorizada_en, autorizada_desde, cargada_en, tickets, lecturas, litros_cargados, importe_cargado)
    VALUES (p_camion, v_ch, p_estacion, CASE WHEN p_lleno THEN 'llenar' ELSE 'litros' END, CASE WHEN NOT p_lleno THEN round(v_lit, 1) END,
            encode(extensions.gen_random_bytes(24), 'hex'), extensions.crypt(encode(extensions.gen_random_bytes(12), 'hex'), extensions.gen_salt('bf')),
            'cargada', now(), 'Carga con tarjeta de flota informada por el chofer (sin orden)', v_usr,
            v_hora, jsonb_build_object('tarjeta_flota', true, 'informada_por_chofer', true), now(),
            p_fotos, coalesce(p_lecturas, '{}'), v_lit, round(v_imp, 2))
    RETURNING * INTO o;
    RETURN jsonb_build_object('numero', o.numero, 'litros', v_lit, 'diferencia_l', NULL, 'alerta', false, 'nueva', true);
END $f$;
COMMENT ON FUNCTION fue.fn_informar_carga_tarjeta(bigint, bigint, boolean, jsonb, bigint[], numeric) IS
    'Migración 304: el chofer avisa una carga con tarjeta de flota en Chile y sube el ticket; cierra la orden de tarjeta abierta del camión en esa estación o crea una ya cargada para que la oficina la registre.';

-- ------------------------------------------------------------------ 2 · lo que ve el chofer para elegir
CREATE FUNCTION fue.fn_opciones_carga_tarjeta()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_ch bigint := ops.fn_mi_chofer(); v_cam bigint; v_camiones jsonb; v_lat numeric; v_lng numeric; v_est jsonb; v_cerca bigint;
BEGIN
    IF v_ch IS NULL THEN
        RETURN jsonb_build_object('camiones', '[]'::jsonb, 'camion_id', NULL, 'estaciones', '[]'::jsonb, 'cerca', NULL);
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'patente', c.patente) ORDER BY c.patente), '[]'::jsonb) INTO v_camiones
      FROM mae.camion c WHERE c.eliminado_en IS NULL AND c.id IN (SELECT tel.fn_camiones_del_chofer(v_ch));
    -- El camión de ahora: el del viaje abierto; si no, el primero
    v_cam := coalesce((SELECT v.camion_id FROM ops.viaje_chofer v
                        WHERE v.chofer_id = v_ch AND v.estado = 'abierto' AND v.eliminado_en IS NULL
                          AND v.camion_id IN (SELECT (j ->> 'id')::bigint FROM jsonb_array_elements(v_camiones) j)
                        ORDER BY v.salida_ts DESC NULLS LAST LIMIT 1),
                      (v_camiones -> 0 ->> 'id')::bigint);
    -- Dónde está (GPS de las últimas 6 horas)
    IF v_cam IS NOT NULL THEN
        SELECT l.latitud, l.longitud INTO v_lat, v_lng FROM tel.lectura l
         WHERE l.camion_id = v_cam AND l.latitud IS NOT NULL AND l.longitud IS NOT NULL AND l.ts > now() - interval '6 hours'
         ORDER BY l.ts DESC LIMIT 1;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'km', x.km) ORDER BY x.km NULLS LAST, x.nombre), '[]'::jsonb),
           (array_agg(x.id ORDER BY x.km) FILTER (WHERE x.km <= 3))[1]
      INTO v_est, v_cerca
      FROM (SELECT e.id, e.nombre,
                   CASE WHEN v_lat IS NOT NULL AND u.latitud IS NOT NULL AND u.longitud IS NOT NULL THEN
                        round((extensions.ST_Distance(extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography,
                                                      extensions.ST_SetSRID(extensions.ST_MakePoint(u.longitud, u.latitud), 4326)::extensions.geography) / 1000)::numeric, 1)
                   END AS km
              FROM mae.estacion_servicio e LEFT JOIN mae.ubicacion u ON u.id = e.ubicacion_id
             WHERE e.eliminado_en IS NULL AND NOT e.es_tanque_propio AND fue.fn_estacion_tarjeta(e.id)) x;
    RETURN jsonb_build_object('camiones', v_camiones, 'camion_id', v_cam, 'estaciones', v_est, 'cerca', v_cerca);
END $f$;
COMMENT ON FUNCTION fue.fn_opciones_carga_tarjeta() IS
    'Migración 304: para «Cargué en Chile con la tarjeta de flota»: los camiones del chofer y las estaciones de Chile, la más cercana primero (cerca = a 3 km o menos).';

-- ------------------------------------------------------------------ 3 · lo que llama la web del chofer (esquema ops)
CREATE FUNCTION ops.fn_informar_carga_tarjeta(p_camion bigint, p_estacion bigint, p_lleno boolean, p_fotos jsonb,
                                              p_lecturas bigint[] DEFAULT '{}'::bigint[], p_litros numeric DEFAULT NULL::numeric)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fue.fn_informar_carga_tarjeta(p_camion, p_estacion, p_lleno, p_fotos, p_lecturas, p_litros)
$f$;

CREATE FUNCTION ops.fn_opciones_carga_tarjeta()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fue.fn_opciones_carga_tarjeta()
$f$;

SELECT pg_temp.fn_copiar_permisos('fue.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)',
                                  'fue.fn_informar_carga_tarjeta(bigint,bigint,boolean,jsonb,bigint[],numeric)');
SELECT pg_temp.fn_copiar_permisos('fue.fn_mis_ordenes_carga()', 'fue.fn_opciones_carga_tarjeta()');
SELECT pg_temp.fn_copiar_permisos('ops.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)',
                                  'ops.fn_informar_carga_tarjeta(bigint,bigint,boolean,jsonb,bigint[],numeric)');
SELECT pg_temp.fn_copiar_permisos('ops.fn_mis_ordenes_carga()', 'ops.fn_opciones_carga_tarjeta()');

-- ------------------------------------------------------------------ 4 · el texto de lo autorizado en esas órdenes
-- Reemplazo con control (una sola línea de ancla; CREATE OR REPLACE conserva los permisos de la función)
DO $p$
DECLARE
    v_def text := pg_get_functiondef('fue.fn_texto_autorizado(fue.orden_carga)'::regprocedure);
    a CONSTANT text := 'SELECT CASE';
    b CONSTANT text := $t$SELECT CASE WHEN coalesce(o.autorizada_desde ? 'informada_por_chofer', false) THEN 'sin orden: la informó el chofer · ' || CASE WHEN o.modo = 'llenar' THEN 'tanque lleno' ELSE tel.fn_num_ar(o.litros) || ' L' END$t$;
BEGIN
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 OR strpos(v_def, 'informada_por_chofer') > 0 THEN
        RAISE EXCEPTION 'fue.fn_texto_autorizado no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, a, b);
END $p$;

UPDATE ref.parametro SET valor = '304' WHERE codigo = 'web.version_base' AND valor::text::int < 304;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 304 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM mae.estacion_servicio e WHERE e.eliminado_en IS NULL AND NOT e.es_tanque_propio AND fue.fn_estacion_tarjeta(e.id)) AS estaciones_chile,
       (SELECT count(*) FROM mae.estacion_servicio e LEFT JOIN mae.ubicacion u ON u.id = e.ubicacion_id
         WHERE e.eliminado_en IS NULL AND NOT e.es_tanque_propio AND fue.fn_estacion_tarjeta(e.id) AND (u.latitud IS NULL OR u.longitud IS NULL)) AS chile_sin_ubicacion,
       (SELECT string_agg(o.numero, ', ' ORDER BY o.id) FROM fue.orden_carga o
         WHERE o.estado = 'autorizada' AND o.genset_id IS NULL AND fue.fn_orden_tarjeta(o) AND o.vence_en <= now()
           AND coalesce(o.autorizada_en, o.creada_en) > now() - interval '30 days') AS ordenes_tarjeta_vencidas_sin_ticket;
