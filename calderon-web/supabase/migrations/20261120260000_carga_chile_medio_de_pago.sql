-- =====================================================================================
-- Migración 290 · Carga en Chile: tarjeta de flota o transferencia a la estación, y el aviso a Finanzas
-- =====================================================================================
-- Pedido (20/11/2026): en las estaciones de Chile (sin QR) la carga se paga con la tarjeta de flota (lo habitual) o por
-- transferencia a la estación. Telemetría lo elige al pedir la carga; quien autoriza aprueba, edita o rechaza como hoy;
-- el sistema calcula los litros y la plata aproximada; y al autorizarse le llega a Finanzas:
--   · tarjeta: qué tractor carga, dónde y cuántos litros, para habilitar la tarjeta;
--   · transferencia: cuánto transferir a la estación, y desde ahí registra el pago (orden de pago a cuenta del
--     proveedor que factura el pago directo, migraciones 281 y 282).
--
--   1 · fue.fn_detalle_orden (envoltorio; la anterior queda como fue.fn_detalle_orden_sin_pago): conserva «medio_pago»
--       ('tarjeta' o 'transferencia'). Así viaja de la solicitud a la orden sin tocar las funciones que la usan.
--   2 · fin.pago_carga: lo que Finanzas tiene que hacer por cada orden autorizada en Chile (una por orden). La crea un
--       disparador al autorizarse la orden, con litros, precio de referencia e importe aproximado; si la orden se anula
--       y no se pagó, se anula. Aviso al teléfono a Finanzas.
--   3 · Al chofer: si es por transferencia, el aviso dice que no use la tarjeta (una frase en fue.fn_crear_orden_carga,
--       reemplazo con control) y «Mi viaje» recibe «medio_pago» (envoltorio de fue.fn_mis_ordenes_carga).
--   4 · Al registrar la carga de la orden, el medio es «tarjeta» o «cuenta_corriente» (transferencia) para que la deuda
--       vaya al proveedor que corresponde (envoltorio de fue.fn_propuesta_carga_orden).
--   5 · fin.fn_pagos_carga, fin.fn_pago_carga_tarjeta (tarjeta habilitada), fin.fn_pago_carga_transferir (registra la
--       orden de pago a cuenta del proveedor de la estación) y fin.fn_pago_carga_anular. Finanzas y TI; leen también
--       Gerencia y el auditor.
-- web.version_base = 290.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 289 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 289 (cargos al chofer en cuotas). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF to_regprocedure('fue.fn_estacion_tarjeta(bigint)') IS NULL OR to_regprocedure('fue.fn_crear_orden_carga_base(bigint,bigint,text,numeric,numeric,text,bigint,text,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración de la carga en Chile con tarjeta (20261120090000_carga_chile_tarjeta.sql)';
    END IF;
    IF to_regprocedure('fin.fn_registrar_orden_pago(jsonb)') IS NULL OR to_regprocedure('fin.fn_proveedor_de_carga(bigint,text)') IS NULL THEN
        RAISE EXCEPTION 'Faltan la orden de pago (281) o la estación con dos proveedores (282)';
    END IF;
    IF to_regprocedure('fue.fn_detalle_orden_sin_pago(bigint,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 290 ya está aplicada';
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

-- ------------------------------------------------------------------ 1 · el medio de pago viaja en el detalle
ALTER FUNCTION fue.fn_detalle_orden(bigint, jsonb) RENAME TO fn_detalle_orden_sin_pago;
CREATE FUNCTION fue.fn_detalle_orden(p_camion bigint, p_detalle jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_medio text := nullif(btrim(coalesce(p_detalle ->> 'medio_pago', '')), '');
BEGIN
    IF v_medio IS NOT NULL AND v_medio NOT IN ('tarjeta', 'transferencia') THEN
        RAISE EXCEPTION 'Elegí cómo se paga: con la tarjeta de flota o por transferencia a la estación' USING ERRCODE = '22023';
    END IF;
    RETURN fue.fn_detalle_orden_sin_pago(p_camion, p_detalle - 'medio_pago')
           || CASE WHEN v_medio IS NOT NULL THEN jsonb_build_object('medio_pago', v_medio) ELSE '{}'::jsonb END;
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_detalle_orden_sin_pago(bigint,jsonb)', 'fue.fn_detalle_orden(bigint,jsonb)');

-- ------------------------------------------------------------------ 2 · lo que tiene que hacer Finanzas
CREATE TABLE fin.pago_carga (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    orden_id        bigint NOT NULL UNIQUE REFERENCES fue.orden_carga (id),
    medio           text NOT NULL CHECK (medio IN ('tarjeta', 'transferencia')),
    camion_id       bigint REFERENCES mae.camion (id),
    estacion_id     bigint NOT NULL REFERENCES mae.estacion_servicio (id),
    proveedor_id    bigint REFERENCES mae.proveedor (id),
    litros          numeric(10,1),
    precio          numeric(14,4),
    moneda          char(3),
    importe         numeric(14,2),
    estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecho', 'anulado')),
    orden_pago_id   bigint REFERENCES fin.orden_pago (id),
    nota            text CHECK (nota IS NULL OR length(nota) <= 500),
    hecho_por       bigint REFERENCES seg.usuario (id),
    hecho_en        timestamptz,
    creado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE fin.pago_carga IS 'Migración 290: por cada orden de carga autorizada en Chile, lo que Finanzas tiene que hacer: habilitar la tarjeta o transferir a la estación.';
DO $r$
DECLARE r record;
BEGIN
    REVOKE ALL ON TABLE fin.pago_carga FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'fin.pago_carga'::regclass) LOOP
        EXECUTE format('REVOKE ALL ON TABLE fin.pago_carga FROM %I', r.rolname);
    END LOOP;
END $r$;

-- Precio de referencia en una estación: el de la solicitud, o el promedio de las cargas de los últimos 60 días
CREATE FUNCTION fin.fn_precio_referencia_estacion(p_estacion bigint)
RETURNS TABLE (precio numeric, moneda text)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT round(sum(c.importe_original) / nullif(sum(c.litros), 0), 2), c.moneda::text
      FROM fue.carga_combustible c
     WHERE c.estacion_id = p_estacion AND c.eliminado_en IS NULL AND coalesce(c.estado_validacion, '') <> 'anulada'
       AND c.fecha_hora > now() - interval '60 days' AND c.litros > 0 AND c.importe_original > 0
     GROUP BY c.moneda
     ORDER BY count(*) DESC
     LIMIT 1
$f$;

CREATE FUNCTION fin.fn_orden_carga_a_finanzas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_medio text; v_lit numeric; v_pre numeric; v_mon text; v_pat text; v_est text; v_dest bigint[];
BEGIN
    IF NEW.genset_id IS NOT NULL OR NOT fue.fn_estacion_tarjeta(NEW.estacion_id) THEN RETURN NEW; END IF;
    -- Se anula la orden: si Finanzas todavía no hizo nada, tampoco tiene que hacerlo
    IF NEW.estado = 'anulada' THEN
        UPDATE fin.pago_carga SET estado = 'anulado', nota = coalesce(nota, 'La orden se anuló') WHERE orden_id = NEW.id AND estado = 'pendiente';
        RETURN NEW;
    END IF;
    IF NEW.estado <> 'autorizada' OR (TG_OP = 'UPDATE' AND OLD.estado = 'autorizada') OR EXISTS (SELECT 1 FROM fin.pago_carga WHERE orden_id = NEW.id) THEN
        RETURN NEW;
    END IF;
    v_medio := coalesce(NEW.detalle ->> 'medio_pago', 'tarjeta');
    v_lit := coalesce(NEW.litros, NEW.litros_calculados, (NEW.detalle ->> 'litros')::numeric,
                      (SELECT p.litros FROM tel.pedido_carga p WHERE p.orden_id = NEW.id ORDER BY p.id DESC LIMIT 1));
    SELECT p.precio_unitario, p.moneda INTO v_pre, v_mon FROM tel.pedido_carga p WHERE p.orden_id = NEW.id AND p.precio_unitario > 0 ORDER BY p.id DESC LIMIT 1;
    IF v_pre IS NULL THEN SELECT r.precio, r.moneda INTO v_pre, v_mon FROM fin.fn_precio_referencia_estacion(NEW.estacion_id) r; END IF;
    INSERT INTO fin.pago_carga (orden_id, medio, camion_id, estacion_id, proveedor_id, litros, precio, moneda, importe)
    VALUES (NEW.id, v_medio, NEW.camion_id, NEW.estacion_id,
            (SELECT pr.id FROM mae.proveedor pr
              WHERE pr.id = fin.fn_proveedor_de_carga(NEW.estacion_id, CASE WHEN v_medio = 'tarjeta' THEN 'tarjeta' ELSE 'cuenta_corriente' END)),
            round(v_lit, 1), v_pre, coalesce(v_mon, 'CLP'), round(v_lit * v_pre, 0));
    SELECT patente INTO v_pat FROM mae.camion WHERE id = NEW.camion_id;
    SELECT nombre INTO v_est FROM mae.estacion_servicio WHERE id = NEW.estacion_id;
    SELECT array_agg(DISTINCT r.usuario_id) INTO v_dest FROM seg.usuario_rol r JOIN seg.usuario u ON u.id = r.usuario_id
     WHERE r.rol_codigo = 'finanzas' AND u.activo;
    IF v_dest IS NOT NULL THEN
        PERFORM ops.fn_avisar(v_dest, 'pago_carga:' || NEW.id,
            CASE WHEN v_medio = 'tarjeta' THEN 'Habilitar la tarjeta · ' ELSE 'Transferir a la estación · ' END || coalesce(v_pat, ''),
            concat_ws(' · ', NEW.numero, v_est, '≈ ' || tel.fn_num_ar(v_lit) || ' L',
                      CASE WHEN v_pre IS NOT NULL THEN '≈ $' || tel.fn_num_ar(round(v_lit * v_pre, 0)) || ' ' || coalesce(v_mon, '') END),
            '/analisis/cobros-pagos?ver=pagar', true);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- El aviso a Finanzas nunca frena la orden de carga
    RAISE WARNING 'No se pudo armar el pago de la orden %: %', NEW.numero, SQLERRM;
    RETURN NEW;
END $f$;
CREATE TRIGGER tg_95_pago_carga AFTER INSERT OR UPDATE OF estado ON fue.orden_carga
    FOR EACH ROW EXECUTE FUNCTION fin.fn_orden_carga_a_finanzas();

-- ------------------------------------------------------------------ 3 · el chofer: por transferencia no usa la tarjeta
DO $p$
DECLARE
    v_def text := pg_get_functiondef('fue.fn_crear_orden_carga(bigint,bigint,text,numeric,numeric,text,bigint,text,jsonb)'::regprocedure);
    a CONSTANT text := $t$'. Pagá con la tarjeta de flota. Al terminar, tocá «Terminé mi carga» en Mi viaje y sacale foto al ticket.'$t$;
    b CONSTANT text := $t$CASE WHEN o.detalle ->> 'medio_pago' = 'transferencia' THEN '. La paga la oficina por transferencia a la estación: NO uses la tarjeta.' ELSE '. Pagá con la tarjeta de flota.' END || ' Al terminar, tocá «Terminé mi carga» en Mi viaje y sacale foto al ticket.'$t$;
BEGIN
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
        RAISE EXCEPTION 'fue.fn_crear_orden_carga no es la que esperaba esta migración (aviso al chofer): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, a, b);
END $p$;

ALTER FUNCTION fue.fn_mis_ordenes_carga() RENAME TO fn_mis_ordenes_carga_sin_pago;
CREATE FUNCTION fue.fn_mis_ordenes_carga()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(jsonb_agg(x || jsonb_build_object('medio_pago', o.detalle ->> 'medio_pago') ORDER BY n), '[]'::jsonb)
      FROM jsonb_array_elements(fue.fn_mis_ordenes_carga_sin_pago()) WITH ORDINALITY AS t(x, n)
      LEFT JOIN fue.orden_carga o ON o.id = (x ->> 'id')::bigint
$f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_mis_ordenes_carga_sin_pago()', 'fue.fn_mis_ordenes_carga()');

-- ------------------------------------------------------------------ 4 · al registrar la carga: el medio que corresponde
ALTER FUNCTION fue.fn_propuesta_carga_orden(bigint) RENAME TO fn_propuesta_carga_orden_sin_pago;
CREATE FUNCTION fue.fn_propuesta_carga_orden(p_orden bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p jsonb := fue.fn_propuesta_carga_orden_sin_pago(p_orden); o fue.orden_carga%ROWTYPE;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF p IS NULL OR o.id IS NULL OR o.genset_id IS NOT NULL OR NOT fue.fn_estacion_tarjeta(o.estacion_id) THEN RETURN p; END IF;
    RETURN p || jsonb_build_object('medio_pago', CASE WHEN o.detalle ->> 'medio_pago' = 'transferencia' THEN 'cuenta_corriente' ELSE 'tarjeta' END);
END $f$;
SELECT pg_temp.fn_copiar_permisos('fue.fn_propuesta_carga_orden_sin_pago(bigint)', 'fue.fn_propuesta_carga_orden(bigint)');

-- ------------------------------------------------------------------ 5 · Finanzas
CREATE FUNCTION fin.fn_pagos_carga(p_todos boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', g.id, 'medio', g.medio, 'estado', g.estado, 'orden_id', o.id, 'orden', o.numero, 'orden_estado', o.estado,
                   'patente', m.patente, 'chofer', ops.fn_nombre_chofer(o.chofer_id), 'estacion', e.nombre,
                   'proveedor_id', g.proveedor_id, 'proveedor', pr.razon_social, 'proveedor_rut', pr.identificador_fiscal,
                   'litros', g.litros, 'precio', g.precio, 'moneda', g.moneda, 'importe', g.importe,
                   'a_cargar', fue.fn_texto_autorizado(o), 'autorizada_en', o.autorizada_en, 'vence_en', o.vence_en,
                   'cargado_l', k.litros, 'cargado_importe', k.importe_original,
                   'orden_pago', op.numero, 'pagado', op.monto, 'nota', g.nota,
                   'hecho_por', (SELECT u.nombre FROM seg.usuario u WHERE u.id = g.hecho_por), 'hecho_en', g.hecho_en)
               ORDER BY g.estado <> 'pendiente', g.creado_en DESC)
          FROM fin.pago_carga g
          JOIN fue.orden_carga o ON o.id = g.orden_id
          LEFT JOIN mae.camion m ON m.id = g.camion_id
          JOIN mae.estacion_servicio e ON e.id = g.estacion_id
          LEFT JOIN mae.proveedor pr ON pr.id = g.proveedor_id
          LEFT JOIN fue.carga_combustible k ON k.id = o.carga_id
          LEFT JOIN fin.orden_pago op ON op.id = g.orden_pago_id
         WHERE g.estado = 'pendiente' OR (p_todos AND g.creado_en > now() - interval '60 days')), '[]');
END $f$;

CREATE FUNCTION fin.fn_pago_carga_tarjeta(p_id bigint, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); g fin.pago_carga%ROWTYPE;
BEGIN
    SELECT * INTO g FROM fin.pago_carga WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe' USING ERRCODE = 'P0002'; END IF;
    IF g.medio <> 'tarjeta' THEN RAISE EXCEPTION 'Esta carga se paga por transferencia: registrá el pago' USING ERRCODE = '22023'; END IF;
    IF g.estado <> 'pendiente' THEN RAISE EXCEPTION 'Ya está %', g.estado USING ERRCODE = '55000'; END IF;
    UPDATE fin.pago_carga SET estado = 'hecho', hecho_por = v_usr, hecho_en = now(), nota = nullif(btrim(coalesce(p_nota, '')), '') WHERE id = p_id;
END $f$;

CREATE FUNCTION fin.fn_pago_carga_transferir(p_id bigint, p_cuenta bigint, p_fecha date, p_monto numeric, p_monto_deuda numeric DEFAULT NULL, p_observacion text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); g fin.pago_carga%ROWTYPE; o fue.orden_carga%ROWTYPE; r jsonb; v_prov bigint;
BEGIN
    SELECT * INTO g FROM fin.pago_carga WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe' USING ERRCODE = 'P0002'; END IF;
    IF g.medio <> 'transferencia' THEN RAISE EXCEPTION 'Esta carga se paga con la tarjeta de flota' USING ERRCODE = '22023'; END IF;
    IF g.estado <> 'pendiente' THEN RAISE EXCEPTION 'Ya está %', g.estado USING ERRCODE = '55000'; END IF;
    SELECT * INTO o FROM fue.orden_carga WHERE id = g.orden_id;
    -- El proveedor de hoy (por si se cargó la razón social de la estación después de autorizar)
    v_prov := coalesce(fin.fn_proveedor_de_carga(g.estacion_id, 'cuenta_corriente'), g.proveedor_id);
    IF v_prov IS NULL THEN
        RAISE EXCEPTION 'La estación no tiene proveedor: cargalo en Comercial › Estaciones (quién factura si se paga directo)' USING ERRCODE = '55000';
    END IF;
    r := fin.fn_registrar_orden_pago(jsonb_build_object(
            'proveedor_id', v_prov, 'cuenta_dinero_id', p_cuenta, 'fecha', p_fecha, 'monto', p_monto, 'moneda', g.moneda,
            'monto_deuda', p_monto_deuda, 'aplicar', false,
            'observacion', concat_ws(' · ', 'Carga ' || o.numero || ' · ' || (SELECT patente FROM mae.camion WHERE id = g.camion_id), nullif(btrim(coalesce(p_observacion, '')), ''))));
    UPDATE fin.pago_carga SET estado = 'hecho', hecho_por = v_usr, hecho_en = now(), proveedor_id = v_prov,
           orden_pago_id = (r ->> 'id')::bigint, nota = nullif(btrim(coalesce(p_observacion, '')), '')
     WHERE id = p_id;
    RETURN r;
END $f$;

CREATE FUNCTION fin.fn_pago_carga_anular(p_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); g fin.pago_carga%ROWTYPE;
BEGIN
    IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'Escribí el motivo' USING ERRCODE = '22023'; END IF;
    SELECT * INTO g FROM fin.pago_carga WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe' USING ERRCODE = 'P0002'; END IF;
    IF g.estado <> 'pendiente' THEN
        RAISE EXCEPTION 'Ya está %: si se transfirió de más, anulá la orden de pago en Cuenta corriente de proveedores', g.estado USING ERRCODE = '55000';
    END IF;
    UPDATE fin.pago_carga SET estado = 'anulado', hecho_por = v_usr, hecho_en = now(), nota = btrim(p_motivo) WHERE id = p_id;
END $f$;

DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_pagos_carga(boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pago_carga_tarjeta(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pago_carga_transferir(bigint, bigint, date, numeric, numeric, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pago_carga_anular(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_orden_carga_a_finanzas() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_precio_referencia_estacion(bigint) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_registrar_orden_pago(jsonb)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pago_carga_tarjeta(bigint, text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pago_carga_transferir(bigint, bigint, date, numeric, numeric, text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pago_carga_anular(bigint, text) TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_cuenta_proveedores()', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pagos_carga(boolean) TO %I', r.rolname);
        END IF;
    END LOOP;
END $g$;

UPDATE ref.parametro SET valor = '290' WHERE codigo = 'web.version_base' AND valor::text::int < 290;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 290 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
