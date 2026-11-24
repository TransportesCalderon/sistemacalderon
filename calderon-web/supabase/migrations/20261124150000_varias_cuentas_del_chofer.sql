-- =====================================================================================
-- Migración 303 · Varias cuentas bancarias por chofer y elegir a cuál se transfiere cada pedido
-- =====================================================================================
-- Pedido (24/11/2026): los choferes suelen tener varias cuentas (Global66, Mercado Pago, un banco…). Hasta ahora había
-- una sola por moneda.
--   · fin.chofer_cuenta_transferencia: varias por chofer y moneda; una es la principal (la que se propone sola).
--     Se pueden quitar (quedan guardadas, sin usarse). No se repite el mismo número en la misma moneda.
--   · Las cuentas las cargan el chofer (las suyas), quien pide, autoriza o paga fondos, y también Gerencia, TI y RRHH
--     (para la ficha del chofer en Flota).
--   · Al pedir dinero (el chofer desde su perfil, o Logística/Operaciones por él) se elige a qué cuenta va: funciones
--     fin.fn_pedir_fondo_chofer_a_cuenta y fin.fn_pedir_fondo_a_cuenta. Sin elegir, va la principal (como antes).
--   · En un pedido sin pagar se puede cambiar la cuenta: fin.fn_elegir_cuenta_pedido (el chofer en los suyos; la oficina
--     en todos).
--   · La web vieja sigue andando: guardar sin id cambia la principal, como antes.
-- web.version_base = 303.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 288 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 288 (cuentas del chofer en el perfil)';
    END IF;
    IF to_regclass('fin.chofer_cuenta_transferencia') IS NULL THEN
        RAISE EXCEPTION 'Falta la tabla de cuentas del chofer (migración 284)';
    END IF;
END $v$;

-- ---------------------------------------------------------------------------------
-- 1 · La tabla: varias por chofer y moneda, una principal
-- ---------------------------------------------------------------------------------
ALTER TABLE fin.chofer_cuenta_transferencia DROP CONSTRAINT IF EXISTS ux_chofer_cuenta_transferencia;
ALTER TABLE fin.chofer_cuenta_transferencia
    ADD COLUMN IF NOT EXISTS principal boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS eliminado_en timestamptz,
    ADD COLUMN IF NOT EXISTS eliminado_por bigint REFERENCES seg.usuario(id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cuenta_chofer_principal
    ON fin.chofer_cuenta_transferencia (chofer_id, moneda) WHERE principal AND eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cuenta_chofer_numero
    ON fin.chofer_cuenta_transferencia (chofer_id, moneda, upper(regexp_replace(numero, '[^A-Za-z0-9]', '', 'g'))) WHERE eliminado_en IS NULL;

-- ¿Quién maneja las cuentas de un chofer (no la propia)?
CREATE OR REPLACE FUNCTION fin.fn_puedo_cuentas_chofer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fin.fn_puedo_pedir_fondos() OR fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos()
        OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('gerencia', 'ti', 'rrhh'))
$f$;

-- Una cuenta en JSON (con id y si es la principal)
CREATE OR REPLACE FUNCTION fin.fn_cuenta_transferencia_json_id(p_cuenta bigint)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT jsonb_build_object('id', c.id, 'moneda', c.moneda, 'banco', c.banco, 'tipo_cuenta', c.tipo_cuenta, 'numero', c.numero,
                              'titular', c.titular, 'titular_documento', c.titular_documento, 'principal', c.principal,
                              'actualizado_en', c.actualizado_en)
      FROM fin.chofer_cuenta_transferencia c WHERE c.id = p_cuenta
$f$;

-- La principal de esa moneda (lo que usaban la 284 y la 288)
CREATE OR REPLACE FUNCTION fin.fn_cuenta_transferencia_json(p_chofer bigint, p_moneda text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fin.fn_cuenta_transferencia_json_id(c.id)
      FROM fin.chofer_cuenta_transferencia c
     WHERE c.chofer_id = p_chofer AND c.moneda = p_moneda AND c.eliminado_en IS NULL
     ORDER BY c.principal DESC, c.id LIMIT 1
$f$;

-- Todas las cuentas vigentes de un chofer
CREATE OR REPLACE FUNCTION fin.fn_cuentas_transferencia(p_chofer bigint DEFAULT NULL::bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_chofer bigint;
BEGIN
    IF p_chofer IS NULL THEN
        v_chofer := ops.fn_exigir_mi_chofer();
    ELSE
        IF NOT (fin.fn_puedo_cuentas_chofer()
                OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo = 'auditor')) THEN
            RAISE EXCEPTION 'Las cuentas de los choferes las ven quienes piden, autorizan o pagan fondos, Gerencia, TI y RRHH' USING ERRCODE = '42501';
        END IF;
        v_chofer := p_chofer;
    END IF;
    RETURN coalesce((SELECT jsonb_agg(fin.fn_cuenta_transferencia_json_id(c.id) ORDER BY c.moneda, c.principal DESC, c.id)
                       FROM fin.chofer_cuenta_transferencia c WHERE c.chofer_id = v_chofer AND c.eliminado_en IS NULL), '[]');
END $f$;

-- El chofer de una cuenta, si quien llama la puede tocar (la propia o, con permiso, la de cualquiera)
CREATE OR REPLACE FUNCTION fin.fn_exigir_cuenta_chofer(p_chofer bigint)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF p_chofer IS NULL THEN RETURN ops.fn_exigir_mi_chofer(); END IF;
    IF p_chofer IS NOT DISTINCT FROM ops.fn_mi_chofer() THEN RETURN p_chofer; END IF;
    IF NOT fin.fn_puedo_cuentas_chofer() THEN
        RAISE EXCEPTION 'La cuenta de un chofer la cargan quienes piden, autorizan o pagan fondos, Gerencia, TI y RRHH' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM mae.chofer WHERE id = p_chofer) THEN RAISE EXCEPTION 'El chofer no existe' USING ERRCODE = 'P0002'; END IF;
    RETURN p_chofer;
END $f$;

-- ---------------------------------------------------------------------------------
-- 2 · Guardar: con «id» cambia esa cuenta; con «nueva» agrega otra; sin nada cambia la principal (como antes)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_guardar_cuenta_transferencia(p_chofer bigint, p_moneda text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_chofer bigint := fin.fn_exigir_cuenta_chofer(p_chofer);
    v_banco text := btrim(coalesce(p_datos->>'banco', ''));
    v_tipo  text := nullif(btrim(coalesce(p_datos->>'tipo_cuenta', '')), '');
    v_num   text := btrim(coalesce(p_datos->>'numero', ''));
    v_tit   text := btrim(coalesce(p_datos->>'titular', ''));
    v_doc   text := nullif(btrim(coalesce(p_datos->>'titular_documento', '')), '');
    v_id    bigint := nullif(p_datos->>'id', '')::bigint;
    v_nueva boolean := coalesce((p_datos->>'nueva')::boolean, false);
    v_princ boolean := coalesce((p_datos->>'principal')::boolean, false);
    c fin.chofer_cuenta_transferencia%ROWTYPE;
BEGIN
    IF p_moneda IS NULL OR p_moneda NOT IN ('ARS', 'CLP', 'USD') THEN RAISE EXCEPTION 'Elegí la moneda' USING ERRCODE = '22023'; END IF;
    IF length(v_banco) < 2 OR length(v_banco) > 80 THEN RAISE EXCEPTION 'Escribí el banco (o la billetera)' USING ERRCODE = '22023'; END IF;
    IF length(v_num) < 3 OR length(v_num) > 60 THEN RAISE EXCEPTION 'Escribí el número de cuenta, CBU o alias' USING ERRCODE = '22023'; END IF;
    IF length(v_tit) < 3 OR length(v_tit) > 120 THEN RAISE EXCEPTION 'Escribí a nombre de quién está la cuenta' USING ERRCODE = '22023'; END IF;
    IF length(coalesce(v_tipo, '')) > 40 THEN RAISE EXCEPTION 'El tipo de cuenta es muy largo' USING ERRCODE = '22023'; END IF;
    IF length(coalesce(v_doc, '')) > 30 THEN RAISE EXCEPTION 'El RUT o CUIT del titular es muy largo' USING ERRCODE = '22023'; END IF;

    IF v_id IS NULL AND NOT v_nueva THEN   -- web vieja: la principal de esa moneda
        SELECT c2.id INTO v_id FROM fin.chofer_cuenta_transferencia c2
         WHERE c2.chofer_id = v_chofer AND c2.moneda = p_moneda AND c2.eliminado_en IS NULL ORDER BY c2.principal DESC, c2.id LIMIT 1;
    END IF;
    IF v_id IS NOT NULL THEN
        SELECT * INTO c FROM fin.chofer_cuenta_transferencia WHERE id = v_id AND chofer_id = v_chofer AND eliminado_en IS NULL FOR UPDATE;
        IF c.id IS NULL THEN RAISE EXCEPTION 'La cuenta no existe' USING ERRCODE = 'P0002'; END IF;
        IF c.moneda <> p_moneda THEN RAISE EXCEPTION 'La moneda de una cuenta no se cambia: agregá otra' USING ERRCODE = '22023'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM fin.chofer_cuenta_transferencia x
                WHERE x.chofer_id = v_chofer AND x.moneda = p_moneda AND x.eliminado_en IS NULL AND x.id IS DISTINCT FROM v_id
                  AND upper(regexp_replace(x.numero, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(v_num, '[^A-Za-z0-9]', '', 'g'))) THEN
        RAISE EXCEPTION 'Esa cuenta ya está cargada' USING ERRCODE = '23505';
    END IF;
    -- La primera de la moneda es la principal; si se pide que sea principal, la anterior deja de serlo
    IF NOT EXISTS (SELECT 1 FROM fin.chofer_cuenta_transferencia x
                    WHERE x.chofer_id = v_chofer AND x.moneda = p_moneda AND x.eliminado_en IS NULL AND x.principal AND x.id IS DISTINCT FROM v_id) THEN
        v_princ := true;
    END IF;
    IF v_princ THEN
        UPDATE fin.chofer_cuenta_transferencia SET principal = false
         WHERE chofer_id = v_chofer AND moneda = p_moneda AND eliminado_en IS NULL AND principal AND id IS DISTINCT FROM v_id;
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO fin.chofer_cuenta_transferencia (chofer_id, moneda, banco, tipo_cuenta, numero, titular, titular_documento, principal, actualizado_por)
        VALUES (v_chofer, p_moneda, v_banco, v_tipo, v_num, v_tit, v_doc, v_princ, aud.fn_usuario_actual())
        RETURNING id INTO v_id;
    ELSE
        UPDATE fin.chofer_cuenta_transferencia
           SET banco = v_banco, tipo_cuenta = v_tipo, numero = v_num, titular = v_tit, titular_documento = v_doc,
               principal = principal OR v_princ, actualizado_en = now(), actualizado_por = aud.fn_usuario_actual()
         WHERE id = v_id;
        -- Los pedidos sin pagar que van a esa cuenta muestran los datos nuevos
        UPDATE fin.pedido_fondo SET cuenta_destino = fin.fn_cuenta_transferencia_json_id(v_id)
         WHERE chofer_id = v_chofer AND estado IN ('solicitado', 'pendiente', 'aprobado')
           AND (cuenta_destino ->> 'id')::bigint = v_id;
    END IF;
    -- Pedidos sin pagar de esa moneda que todavía no tienen cuenta: la principal
    UPDATE fin.pedido_fondo SET cuenta_destino = fin.fn_cuenta_transferencia_json(v_chofer, p_moneda)
     WHERE chofer_id = v_chofer AND moneda = p_moneda AND estado IN ('solicitado', 'pendiente', 'aprobado')
       AND (cuenta_destino IS NULL OR (cuenta_destino ->> 'id') IS NULL);
    RETURN fin.fn_cuenta_transferencia_json_id(v_id);
END $f$;

-- Quitar una cuenta (queda guardada, ya no se ofrece). Si era la principal, pasa a serlo otra de la misma moneda.
CREATE OR REPLACE FUNCTION fin.fn_quitar_cuenta_transferencia(p_cuenta bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE c fin.chofer_cuenta_transferencia%ROWTYPE; v_otra bigint;
BEGIN
    SELECT * INTO c FROM fin.chofer_cuenta_transferencia WHERE id = p_cuenta AND eliminado_en IS NULL FOR UPDATE;
    IF c.id IS NULL THEN RAISE EXCEPTION 'La cuenta no existe' USING ERRCODE = 'P0002'; END IF;
    PERFORM fin.fn_exigir_cuenta_chofer(c.chofer_id);
    IF EXISTS (SELECT 1 FROM fin.pedido_fondo p WHERE p.chofer_id = c.chofer_id AND p.estado IN ('solicitado', 'pendiente', 'aprobado')
                AND (p.cuenta_destino ->> 'id')::bigint = c.id) THEN
        RAISE EXCEPTION 'Hay un pedido de dinero sin pagar que va a esa cuenta: cambiale la cuenta al pedido antes de quitarla' USING ERRCODE = '55000';
    END IF;
    UPDATE fin.chofer_cuenta_transferencia SET eliminado_en = now(), eliminado_por = aud.fn_usuario_actual(), principal = false WHERE id = c.id;
    IF c.principal THEN
        SELECT id INTO v_otra FROM fin.chofer_cuenta_transferencia
         WHERE chofer_id = c.chofer_id AND moneda = c.moneda AND eliminado_en IS NULL ORDER BY actualizado_en DESC, id DESC LIMIT 1;
        IF v_otra IS NOT NULL THEN UPDATE fin.chofer_cuenta_transferencia SET principal = true WHERE id = v_otra; END IF;
    END IF;
    RETURN jsonb_build_object('quitada', c.id, 'principal_nueva', v_otra);
END $f$;

-- ---------------------------------------------------------------------------------
-- 3 · Elegir la cuenta de cada pedido
-- ---------------------------------------------------------------------------------
-- La cuenta elegida para el pedido que se está creando (la usa el trigger)
CREATE OR REPLACE FUNCTION fin.fn_pedido_fondo_cuenta_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_elegida bigint := nullif(current_setting('fin.cuenta_destino_id', true), '')::bigint;
BEGIN
    IF NEW.cuenta_destino IS NULL AND v_elegida IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM fin.chofer_cuenta_transferencia c
                        WHERE c.id = v_elegida AND c.chofer_id = NEW.chofer_id AND c.moneda = NEW.moneda AND c.eliminado_en IS NULL) THEN
            RAISE EXCEPTION 'La cuenta elegida no es del chofer o no es en %', NEW.moneda USING ERRCODE = '22023';
        END IF;
        NEW.cuenta_destino := fin.fn_cuenta_transferencia_json_id(v_elegida);
        PERFORM set_config('fin.cuenta_destino_id', '', true);
    END IF;
    IF NEW.cuenta_destino IS NULL THEN NEW.cuenta_destino := fin.fn_cuenta_transferencia_json(NEW.chofer_id, NEW.moneda); END IF;
    IF NEW.cuenta_destino IS NULL AND NEW.pedido_por_chofer THEN
        RAISE EXCEPTION 'Antes de pedir, cargá a qué cuenta te transferimos (banco, número y titular)' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END $f$;

-- El chofer pide desde su perfil, eligiendo la cuenta
CREATE OR REPLACE FUNCTION fin.fn_pedir_fondo_chofer_a_cuenta(p_moneda text, p_importe numeric, p_detalle text, p_cuenta bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r jsonb;
BEGIN
    PERFORM set_config('fin.cuenta_destino_id', coalesce(p_cuenta::text, ''), true);
    r := fin.fn_pedir_fondo_chofer(p_moneda, p_importe, p_detalle);
    PERFORM set_config('fin.cuenta_destino_id', '', true);
    RETURN r;
END $f$;

-- Logística / Operaciones pide por el chofer, eligiendo la cuenta
CREATE OR REPLACE FUNCTION fin.fn_pedir_fondo_a_cuenta(p_chofer bigint, p_moneda text, p_importe numeric, p_detalle text, p_cuenta bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r jsonb;
BEGIN
    PERFORM set_config('fin.cuenta_destino_id', coalesce(p_cuenta::text, ''), true);
    r := to_jsonb(fin.fn_pedir_fondo(p_chofer, p_moneda, p_importe, p_detalle));
    PERFORM set_config('fin.cuenta_destino_id', '', true);
    RETURN r;
END $f$;

-- Cambiar la cuenta de un pedido sin pagar
CREATE OR REPLACE FUNCTION fin.fn_elegir_cuenta_pedido(p_pedido bigint, p_cuenta bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p fin.pedido_fondo%ROWTYPE; v jsonb;
BEGIN
    SELECT * INTO p FROM fin.pedido_fondo WHERE id = p_pedido FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002'; END IF;
    IF p.chofer_id IS DISTINCT FROM ops.fn_mi_chofer() AND NOT fin.fn_puedo_cuentas_chofer() THEN
        RAISE EXCEPTION 'La cuenta del pedido la eligen el chofer o quienes piden, autorizan o pagan fondos' USING ERRCODE = '42501';
    END IF;
    IF p.estado NOT IN ('solicitado', 'pendiente', 'aprobado') THEN
        RAISE EXCEPTION 'El pedido ya está % : no se le cambia la cuenta', p.estado USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fin.chofer_cuenta_transferencia c
                    WHERE c.id = p_cuenta AND c.chofer_id = p.chofer_id AND c.moneda = p.moneda AND c.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'La cuenta no es del chofer o no es en %', p.moneda USING ERRCODE = '22023';
    END IF;
    v := fin.fn_cuenta_transferencia_json_id(p_cuenta);
    UPDATE fin.pedido_fondo SET cuenta_destino = v WHERE id = p.id;
    RETURN v;
END $f$;

-- ---------------------------------------------------------------------------------
-- 4 · Permisos (copiados de las funciones vecinas)
-- ---------------------------------------------------------------------------------
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_puedo_cuentas_chofer() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_cuenta_transferencia_json_id(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_exigir_cuenta_chofer(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_quitar_cuenta_transferencia(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pedir_fondo_chofer_a_cuenta(text, numeric, text, bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pedir_fondo_a_cuenta(bigint, text, numeric, text, bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_elegir_cuenta_pedido(bigint, bigint) FROM PUBLIC;
    FOR r IN SELECT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'fin' AND a.routine_name = 'fn_guardar_cuenta_transferencia' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_quitar_cuenta_transferencia(bigint) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_elegir_cuenta_pedido(bigint, bigint) TO %I', r.grantee);
    END LOOP;
    FOR r IN SELECT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'fin' AND a.routine_name = 'fn_pedir_fondo_chofer' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pedir_fondo_chofer_a_cuenta(text, numeric, text, bigint) TO %I', r.grantee);
    END LOOP;
    FOR r IN SELECT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'fin' AND a.routine_name = 'fn_pedir_fondo' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pedir_fondo_a_cuenta(bigint, text, numeric, text, bigint) TO %I', r.grantee);
    END LOOP;
END $g$;

-- Los pedidos sin pagar que tienen copia de cuenta sin id: se les pone el id de la cuenta que coincide
UPDATE fin.pedido_fondo p SET cuenta_destino = fin.fn_cuenta_transferencia_json_id(c.id)
  FROM fin.chofer_cuenta_transferencia c
 WHERE p.estado IN ('solicitado', 'pendiente', 'aprobado') AND p.cuenta_destino IS NOT NULL AND (p.cuenta_destino ->> 'id') IS NULL
   AND c.chofer_id = p.chofer_id AND c.moneda = p.moneda AND c.eliminado_en IS NULL
   AND upper(regexp_replace(c.numero, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(p.cuenta_destino ->> 'numero', '[^A-Za-z0-9]', '', 'g'));

UPDATE ref.parametro SET valor = '303' WHERE codigo = 'web.version_base' AND valor::text::int < 303;

COMMIT;

SELECT 'migración 303 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM fin.chofer_cuenta_transferencia WHERE eliminado_en IS NULL) AS cuentas_cargadas,
       (SELECT count(DISTINCT chofer_id) FROM fin.chofer_cuenta_transferencia WHERE eliminado_en IS NULL) AS choferes_con_cuenta;
