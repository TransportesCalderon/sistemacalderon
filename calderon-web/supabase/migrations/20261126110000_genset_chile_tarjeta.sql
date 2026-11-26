-- =====================================================================================
-- Migración 357 · Carga del genset en Chile: tarjeta de flota o transferencia, sin QR (como la del camión)
-- =====================================================================================
-- Pedido (25/11/2026): las órdenes de carga de los gensets (generadores) en estaciones de Chile tienen que seguir el
-- mismo modelo que las del camión (migraciones 284 y 290): se elige tarjeta de flota o transferencia, sin palabra ni
-- QR ni mail a la estación, la orden sale autorizada por 36 h, al chofer le llega el aviso y a Finanzas el pago.
--
--   1 · fue.fn_crear_orden_genset recibe p_medio_pago ('tarjeta' o 'transferencia'). En Argentina sigue igual (QR y
--       mail: queda como fue.fn_crear_orden_genset_qr). En Chile no pide correo a la estación, sale autorizada con
--       autorizada_desde.tarjeta_genset, vence a las 36 h (fue.orden_tarjeta_horas) y avisa al chofer.
--       Se usa la marca «tarjeta_genset» (no «tarjeta_flota») para que lo de Enex del camión no la tome como del tractor.
--   2 · fue.fn_orden_tarjeta_genset: la de antes o la del genset. La usan «Mi viaje» y la lista de órdenes.
--   3 · Finanzas (fin.pago_carga): el disparador ya no saltea los gensets con tarjeta/transferencia; los litros son
--       los de la orden o la capacidad del genset (lleno) y el equipo se muestra como «Genset X (tractor Y)».
--   4 · fue.fn_preparar_orden_genset dice si la estación es de Chile («tarjeta»).
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fue.fn_estacion_tarjeta(bigint)') IS NULL OR to_regclass('fin.pago_carga') IS NULL
       OR to_regprocedure('fue.fn_mis_ordenes_carga_sin_pago()') IS NULL THEN
        RAISE EXCEPTION 'Faltan las migraciones de la carga en Chile (284 y 290)';
    END IF;
    IF to_regprocedure('fin.fn_litros_orden_para_pago(bigint)') IS NULL OR to_regprocedure('fin.fn_litros_max_orden(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Faltan las migraciones 293 y 294 (litros del pago de la carga)';
    END IF;
    IF to_regprocedure('fue.fn_crear_orden_genset_qr(bigint,bigint,text,numeric,bigint,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 357 ya está aplicada';
    END IF;
END $v$;

CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE r record;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = p_de AND a.privilege_type = 'EXECUTE' LOOP
        IF r.grantee = 0 THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', p_a);
        ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, pg_get_userbyid(r.grantee)); END IF;
    END LOOP;
END $f$;

-- Reemplaza un texto en una función y exige que haya estado
CREATE FUNCTION pg_temp.fn_parchar(p_fn regprocedure, p_de text, p_a text, p_regex boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text := pg_get_functiondef(p_fn); v_nuevo text;
BEGIN
    v_nuevo := CASE WHEN p_regex THEN regexp_replace(v_def, p_de, p_a, 'g') ELSE replace(v_def, p_de, p_a) END;
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontró lo que hay que cambiar en %: %', p_fn, left(p_de, 80); END IF;
    EXECUTE v_nuevo;
END $f$;

-- ------------------------------------------------------------------ 2 · ¿se paga con tarjeta/transferencia (sin QR)?
CREATE FUNCTION fue.fn_orden_tarjeta_genset(o fue.orden_carga)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT fue.fn_orden_tarjeta(o) OR coalesce(o.autorizada_desde ? 'tarjeta_genset', false)
$function$;
GRANT EXECUTE ON FUNCTION fue.fn_orden_tarjeta_genset(fue.orden_carga) TO PUBLIC;

-- «Mi viaje» y la lista de órdenes de la oficina
DO $p$
DECLARE f regprocedure;
BEGIN
    PERFORM pg_temp.fn_parchar('fue.fn_mis_ordenes_carga_sin_pago()', 'fue.fn_orden_tarjeta(', 'fue.fn_orden_tarjeta_genset(');
    FOREACH f IN ARRAY ARRAY(SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'fue' AND p.proname = 'fn_ordenes_carga' AND p.prosrc LIKE '%fue.fn_orden_tarjeta(%') LOOP
        PERFORM pg_temp.fn_parchar(f, 'fue.fn_orden_tarjeta(', 'fue.fn_orden_tarjeta_genset(');
    END LOOP;
END $p$;

-- ------------------------------------------------------------------ 1 · crear la orden del genset
ALTER FUNCTION fue.fn_crear_orden_genset(bigint, bigint, text, numeric, bigint, text) RENAME TO fn_crear_orden_genset_qr;

CREATE FUNCTION fue.fn_crear_orden_genset(p_genset bigint, p_estacion bigint, p_modo text, p_litros numeric DEFAULT NULL::numeric,
                                          p_chofer bigint DEFAULT NULL::bigint, p_observacion text DEFAULT NULL::text,
                                          p_medio_pago text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint; g mae.genset%ROWTYPE; e mae.estacion_servicio%ROWTYPE; c jsonb; v_ch bigint; v_cam bigint; v_vig text;
    v_medio text := coalesce(nullif(btrim(coalesce(p_medio_pago, '')), ''), 'tarjeta'); o fue.orden_carga; v_texto text; v_avisados integer;
BEGIN
    -- Argentina: como siempre, con palabra, QR y mail a la estación
    IF p_estacion IS NULL OR NOT fue.fn_estacion_tarjeta(p_estacion) THEN
        RETURN fue.fn_crear_orden_genset_qr(p_genset, p_estacion, p_modo, p_litros, p_chofer, p_observacion);
    END IF;

    -- Chile: tarjeta de flota o transferencia, sin QR
    v_usr := fue.fn_exigir_autoriza_cargas();
    IF v_medio NOT IN ('tarjeta', 'transferencia') THEN
        RAISE EXCEPTION 'Elegí cómo se paga: tarjeta de flota o transferencia' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO g FROM mae.genset WHERE id = p_genset AND eliminado_en IS NULL AND estado = 'activo';
    IF g.id IS NULL THEN RAISE EXCEPTION 'Elegí el genset' USING ERRCODE = '22023'; END IF;
    SELECT * INTO e FROM mae.estacion_servicio WHERE id = p_estacion AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí la estación de servicio' USING ERRCODE = '22023'; END IF;
    c := fue.fn_contexto_genset(p_genset);
    v_ch := coalesce(p_chofer, (c ->> 'chofer_id')::bigint);
    v_cam := (c ->> 'camion_id')::bigint;
    IF v_ch IS NULL THEN RAISE EXCEPTION 'No se sabe qué chofer lleva el genset: elegí el chofer' USING ERRCODE = '22023'; END IF;
    IF p_modo IS NULL OR p_modo NOT IN ('lleno', 'litros') THEN
        RAISE EXCEPTION 'Elegí qué cargarle al genset: lleno o una cantidad de litros' USING ERRCODE = '22023';
    END IF;
    IF p_modo = 'litros' AND (p_litros IS NULL OR p_litros <= 0 OR p_litros > coalesce(g.capacidad_l, 5000)) THEN
        RAISE EXCEPTION 'Escribí los litros para el genset (entre 1 y %)', tel.fn_num_ar(coalesce(g.capacidad_l, 5000)) USING ERRCODE = '22023';
    END IF;
    SELECT numero INTO v_vig FROM fue.orden_carga WHERE genset_id = p_genset AND estado IN ('emitida', 'autorizada') AND vence_en > now();
    IF v_vig IS NOT NULL THEN RAISE EXCEPTION 'El genset ya tiene la orden % vigente: anulala antes de hacer otra', v_vig USING ERRCODE = '23505'; END IF;
    UPDATE fue.orden_carga SET estado = 'anulada', anulada_en = now(), motivo_anulacion = 'Venció sin usarse'
     WHERE genset_id = p_genset AND estado = 'emitida' AND vence_en <= now();

    -- Sin palabra (se guarda una al azar que nadie conoce) y sin mail
    INSERT INTO fue.orden_carga (camion_id, genset_id, chofer_id, estacion_id, modo, litros, token, palabra_hash, vence_en, observacion, creada_por, detalle)
    VALUES (v_cam, p_genset, v_ch, p_estacion, CASE WHEN p_modo = 'litros' THEN 'litros' ELSE 'llenar' END,
            CASE WHEN p_modo = 'litros' THEN round(p_litros, 1) END, encode(extensions.gen_random_bytes(24), 'hex'),
            extensions.crypt(encode(extensions.gen_random_bytes(12), 'hex'), extensions.gen_salt('bf')),
            now() + make_interval(hours => ref.fn_parametro_num('fue.orden_tarjeta_horas', 36)::int),
            nullif(btrim(coalesce(p_observacion, '')), ''), v_usr,
            jsonb_build_object('destino', 'genset', 'medio_pago', v_medio, 'genset', jsonb_strip_nulls(jsonb_build_object(
                'modo', p_modo, 'litros', CASE WHEN p_modo = 'litros' THEN round(p_litros, 1) END, 'capacidad_l', g.capacidad_l))))
    RETURNING * INTO o;

    -- Autorizada desde ya: el disparador le arma el pago a Finanzas
    UPDATE fue.orden_carga
       SET estado = 'autorizada', autorizada_en = now(),
           autorizada_desde = jsonb_build_object('tarjeta_genset', true, 'aprobo', v_usr)
     WHERE id = o.id
    RETURNING * INTO o;

    v_texto := fue.fn_texto_autorizado(o);
    SELECT count(*) INTO v_avisados FROM seg.usuario u WHERE u.chofer_id = o.chofer_id AND u.activo;
    PERFORM ops.fn_avisar(
        ARRAY(SELECT u.id FROM seg.usuario u WHERE u.chofer_id = o.chofer_id AND u.activo),
        'orden_carga:' || o.id || ':tarjeta', 'Carga del genset autorizada · ' || g.codigo,
        'Cargá en ' || e.nombre || ': ' || v_texto
            || CASE WHEN v_medio = 'transferencia' THEN '. La paga la oficina por transferencia a la estación: NO uses la tarjeta.' ELSE '. Pagá con la tarjeta de flota.' END
            || ' Al terminar, tocá «Terminé mi carga» en Mi viaje, anotá el horómetro y sacale foto al ticket.',
        '/mi-viaje', true);

    RETURN jsonb_build_object('id', o.id, 'numero', o.numero, 'palabra', NULL, 'litros_calculados', NULL, 'mail', 'tarjeta',
                              'correo', e.correo, 'tarjeta', true, 'autorizado', v_texto, 'chofer_avisado', v_avisados > 0,
                              'vence_en', o.vence_en);
END $function$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_crear_orden_genset_qr(bigint,bigint,text,numeric,bigint,text)',
                                  'fue.fn_crear_orden_genset(bigint,bigint,text,numeric,bigint,text,text)');

-- ------------------------------------------------------------------ 4 · preparar: ¿es de Chile?
ALTER FUNCTION fue.fn_preparar_orden_genset(bigint, bigint) RENAME TO fn_preparar_orden_genset_sin_pago;
CREATE FUNCTION fue.fn_preparar_orden_genset(p_genset bigint, p_estacion bigint DEFAULT NULL::bigint)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT fue.fn_preparar_orden_genset_sin_pago(p_genset, p_estacion)
           || jsonb_build_object('tarjeta', p_estacion IS NOT NULL AND fue.fn_estacion_tarjeta(p_estacion))
$function$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_preparar_orden_genset_sin_pago(bigint,bigint)', 'fue.fn_preparar_orden_genset(bigint,bigint)');

-- ------------------------------------------------------------------ 3 · Finanzas
-- El disparador: los gensets sin QR también van a Finanzas; el equipo se muestra como «Genset X (tractor Y)»
SELECT pg_temp.fn_parchar('fin.fn_orden_carga_a_finanzas()',
    'IF NEW.genset_id IS NOT NULL OR NOT fue.fn_estacion_tarjeta(NEW.estacion_id) THEN RETURN NEW; END IF;',
    'IF (NEW.genset_id IS NOT NULL AND NOT coalesce(NEW.autorizada_desde ? ''tarjeta_genset'', false)) OR NOT fue.fn_estacion_tarjeta(NEW.estacion_id) THEN RETURN NEW; END IF;');
SELECT pg_temp.fn_parchar('fin.fn_orden_carga_a_finanzas()',
    'SELECT patente INTO v_pat FROM mae.camion WHERE id = NEW.camion_id;',
    'v_pat := fue.fn_equipo_orden(NEW.camion_id, NEW.genset_id);');

-- Litros del pago: los de la orden, o la capacidad del genset si es lleno (no se estima con el tanque del tractor)
ALTER FUNCTION fin.fn_litros_orden_para_pago(bigint) RENAME TO fn_litros_orden_para_pago_sin_genset;
CREATE FUNCTION fin.fn_litros_orden_para_pago(p_orden bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE o fue.orden_carga%ROWTYPE;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF FOUND AND o.genset_id IS NOT NULL THEN
        RETURN round(coalesce(o.litros, nullif(o.detalle #>> '{genset,capacidad_l}', '')::numeric,
                              (SELECT capacidad_l FROM mae.genset WHERE id = o.genset_id)), 1);
    END IF;
    RETURN fin.fn_litros_orden_para_pago_sin_genset(p_orden);
END $function$;
SELECT pg_temp.fn_copiar_permisos('fin.fn_litros_orden_para_pago_sin_genset(bigint)', 'fin.fn_litros_orden_para_pago(bigint)');

ALTER FUNCTION fin.fn_litros_max_orden(bigint) RENAME TO fn_litros_max_orden_sin_genset;
CREATE FUNCTION fin.fn_litros_max_orden(p_orden bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE o fue.orden_carga%ROWTYPE;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF FOUND AND o.genset_id IS NOT NULL THEN
        RETURN round(coalesce(o.litros, nullif(o.detalle #>> '{genset,capacidad_l}', '')::numeric,
                              (SELECT capacidad_l FROM mae.genset WHERE id = o.genset_id)), 1);
    END IF;
    RETURN fin.fn_litros_max_orden_sin_genset(p_orden);
END $function$;
SELECT pg_temp.fn_copiar_permisos('fin.fn_litros_max_orden_sin_genset(bigint)', 'fin.fn_litros_max_orden(bigint)');

-- La lista de Finanzas: el equipo y lo cargado del genset
SELECT pg_temp.fn_parchar('fin.fn_pagos_carga(boolean)', '''patente'', m.patente', '''patente'', fue.fn_equipo_orden(o.camion_id, o.genset_id)');
SELECT pg_temp.fn_parchar('fin.fn_pagos_carga(boolean)', '''cargado_l'', k.litros, ''cargado_importe'', k.importe_original',
                          '''cargado_l'', coalesce(k.litros, gr.litros), ''cargado_importe'', coalesce(k.importe_original, gr.importe)');
SELECT pg_temp.fn_parchar('fin.fn_pagos_carga(boolean)', 'LEFT JOIN fue.carga_combustible k ON k.id = o.carga_id',
                          'LEFT JOIN fue.carga_combustible k ON k.id = o.carga_id
          LEFT JOIN fue.genset_registro gr ON gr.id = o.genset_registro_id AND gr.eliminado_en IS NULL');
-- La orden de pago de la transferencia dice de qué equipo es
SELECT pg_temp.fn_parchar('fin.fn_pago_carga_transferir(bigint,bigint,date,numeric,numeric,text)',
                          '(SELECT patente FROM mae.camion WHERE id = g.camion_id)', 'fue.fn_equipo_orden(g.camion_id, o.genset_id)');

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: el genset en Chile se carga con tarjeta de flota o transferencia, sin QR' AS resultado;
