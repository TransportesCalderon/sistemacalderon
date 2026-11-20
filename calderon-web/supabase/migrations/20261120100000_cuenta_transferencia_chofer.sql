-- =====================================================================================
-- Migración 284 · El pedido de dinero del chofer trae los datos de la cuenta a transferir
-- =====================================================================================
-- Pedido (19/11/2026): «En la solicitud de los fondos deben traer los datos de la cuenta a transferir».
--
--   · fin.chofer_cuenta_transferencia: una cuenta por chofer y moneda (banco, tipo, número/CBU/alias,
--     titular y su RUT/CUIT). La carga el chofer al pedir, o quien pide por él.
--   · fin.pedido_fondo.cuenta_destino: copia de esos datos en cada pedido (queda como se pagó).
--   · El chofer no puede pedir desde su perfil sin tener cargada la cuenta de esa moneda.
--   · No se redefine ninguna función de los pedidos: todo es agregado.
--
-- Los datos bancarios solo se leen por funciones: el chofer ve los suyos; los ve quien ve los pedidos.
-- No cambia datos. web.version_base = 284.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 283 THEN
        RAISE EXCEPTION 'Primero hay que aplicar las migraciones anteriores, hasta la 283 (remitos automáticos). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
END $v$;

CREATE TABLE IF NOT EXISTS fin.chofer_cuenta_transferencia (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chofer_id         bigint NOT NULL REFERENCES mae.chofer (id) ON DELETE RESTRICT,
    moneda            char(3) NOT NULL,
    banco             text NOT NULL CHECK (length(btrim(banco)) BETWEEN 2 AND 80),
    tipo_cuenta       text CHECK (tipo_cuenta IS NULL OR length(tipo_cuenta) <= 40),
    numero            text NOT NULL CHECK (length(btrim(numero)) BETWEEN 3 AND 60),
    titular           text NOT NULL CHECK (length(btrim(titular)) BETWEEN 3 AND 120),
    titular_documento text CHECK (titular_documento IS NULL OR length(titular_documento) <= 30),
    actualizado_en    timestamptz NOT NULL DEFAULT now(),
    actualizado_por   bigint REFERENCES seg.usuario (id),
    CONSTRAINT ux_chofer_cuenta_transferencia UNIQUE (chofer_id, moneda)
);
COMMENT ON TABLE fin.chofer_cuenta_transferencia IS
    'Migración 284: a qué cuenta se le transfiere el dinero del viaje a cada chofer, por moneda. Solo se lee y escribe por funciones.';

ALTER TABLE fin.pedido_fondo ADD COLUMN IF NOT EXISTS cuenta_destino jsonb;
COMMENT ON COLUMN fin.pedido_fondo.cuenta_destino IS 'Migración 284: datos de la cuenta a transferir, copiados al pedir.';

-- La tabla no se toca desde la web: solo por las funciones de abajo
DO $r$
DECLARE r record;
BEGIN
    REVOKE ALL ON TABLE fin.chofer_cuenta_transferencia FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'fin.chofer_cuenta_transferencia'::regclass) LOOP
        EXECUTE format('REVOKE ALL ON TABLE fin.chofer_cuenta_transferencia FROM %I', r.rolname);
    END LOOP;
END $r$;

CREATE OR REPLACE FUNCTION fin.fn_cuenta_transferencia_json(p_chofer bigint, p_moneda text)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT jsonb_build_object('moneda', c.moneda, 'banco', c.banco, 'tipo_cuenta', c.tipo_cuenta, 'numero', c.numero,
                              'titular', c.titular, 'titular_documento', c.titular_documento, 'actualizado_en', c.actualizado_en)
      FROM fin.chofer_cuenta_transferencia c WHERE c.chofer_id = p_chofer AND c.moneda = p_moneda
$f$;

-- El chofer ve su cuenta de una moneda (null si no la cargó)
CREATE OR REPLACE FUNCTION fin.fn_mi_cuenta_transferencia(p_moneda text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    RETURN fin.fn_cuenta_transferencia_json(ops.fn_exigir_mi_chofer(), p_moneda);
END $f$;

-- Guardar la cuenta: el chofer la suya (p_chofer vacío) o quien maneja los pedidos, la de un chofer
CREATE OR REPLACE FUNCTION fin.fn_guardar_cuenta_transferencia(p_chofer bigint, p_moneda text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_chofer bigint;
    v_banco text := btrim(coalesce(p_datos->>'banco', ''));
    v_tipo  text := nullif(btrim(coalesce(p_datos->>'tipo_cuenta', '')), '');
    v_num   text := btrim(coalesce(p_datos->>'numero', ''));
    v_tit   text := btrim(coalesce(p_datos->>'titular', ''));
    v_doc   text := nullif(btrim(coalesce(p_datos->>'titular_documento', '')), '');
    v_json  jsonb;
BEGIN
    IF p_chofer IS NULL THEN
        v_chofer := ops.fn_exigir_mi_chofer();
    ELSE
        IF NOT (fin.fn_puedo_pedir_fondos() OR fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos()) THEN
            RAISE EXCEPTION 'La cuenta de un chofer la carga quien pide, autoriza o paga los fondos' USING ERRCODE = '42501';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM mae.chofer WHERE id = p_chofer) THEN RAISE EXCEPTION 'El chofer no existe' USING ERRCODE = 'P0002'; END IF;
        v_chofer := p_chofer;
    END IF;
    IF p_moneda IS NULL OR p_moneda NOT IN ('ARS', 'CLP', 'USD') THEN RAISE EXCEPTION 'Elegí la moneda' USING ERRCODE = '22023'; END IF;
    IF length(v_banco) < 2 OR length(v_banco) > 80 THEN RAISE EXCEPTION 'Escribí el banco (o la billetera)' USING ERRCODE = '22023'; END IF;
    IF length(v_num) < 3 OR length(v_num) > 60 THEN RAISE EXCEPTION 'Escribí el número de cuenta, CBU o alias' USING ERRCODE = '22023'; END IF;
    IF length(v_tit) < 3 OR length(v_tit) > 120 THEN RAISE EXCEPTION 'Escribí a nombre de quién está la cuenta' USING ERRCODE = '22023'; END IF;
    IF length(coalesce(v_tipo, '')) > 40 THEN RAISE EXCEPTION 'El tipo de cuenta es muy largo' USING ERRCODE = '22023'; END IF;
    IF length(coalesce(v_doc, '')) > 30 THEN RAISE EXCEPTION 'El RUT o CUIT del titular es muy largo' USING ERRCODE = '22023'; END IF;

    INSERT INTO fin.chofer_cuenta_transferencia (chofer_id, moneda, banco, tipo_cuenta, numero, titular, titular_documento, actualizado_por)
    VALUES (v_chofer, p_moneda, v_banco, v_tipo, v_num, v_tit, v_doc, aud.fn_usuario_actual())
    ON CONFLICT (chofer_id, moneda) DO UPDATE
       SET banco = EXCLUDED.banco, tipo_cuenta = EXCLUDED.tipo_cuenta, numero = EXCLUDED.numero, titular = EXCLUDED.titular,
           titular_documento = EXCLUDED.titular_documento, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por;
    v_json := fin.fn_cuenta_transferencia_json(v_chofer, p_moneda);
    -- Los pedidos que todavía no se pagaron pasan a mostrar la cuenta nueva
    UPDATE fin.pedido_fondo SET cuenta_destino = v_json
     WHERE chofer_id = v_chofer AND moneda = p_moneda AND estado IN ('solicitado', 'pendiente', 'aprobado');
    RETURN v_json;
END $f$;

-- Cada pedido nuevo copia la cuenta; el chofer no pide sin haberla cargado
CREATE OR REPLACE FUNCTION fin.fn_pedido_fondo_cuenta_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NEW.cuenta_destino IS NULL THEN NEW.cuenta_destino := fin.fn_cuenta_transferencia_json(NEW.chofer_id, NEW.moneda); END IF;
    IF NEW.cuenta_destino IS NULL AND NEW.pedido_por_chofer THEN
        RAISE EXCEPTION 'Antes de pedir, cargá a qué cuenta te transferimos (banco, número y titular)' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS tg_07_cuenta_destino ON fin.pedido_fondo;
CREATE TRIGGER tg_07_cuenta_destino BEFORE INSERT ON fin.pedido_fondo
    FOR EACH ROW EXECUTE FUNCTION fin.fn_pedido_fondo_cuenta_destino();

-- Lo que ve quien maneja los pedidos: la cuenta de cada pedido sin pagar (o la última del chofer si el pedido es anterior)
CREATE OR REPLACE FUNCTION fin.fn_cuentas_destino_pedidos()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT (fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos() OR fin.fn_puedo_pedir_fondos()
            OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('gerencia', 'auditor'))) THEN
        RAISE EXCEPTION 'No tenés acceso a los pedidos de FF Chofer' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce((
        SELECT jsonb_object_agg(p.id::text, coalesce(p.cuenta_destino, fin.fn_cuenta_transferencia_json(p.chofer_id, p.moneda)))
          FROM fin.pedido_fondo p
         WHERE p.estado IN ('solicitado', 'pendiente', 'aprobado')
           AND coalesce(p.cuenta_destino, fin.fn_cuenta_transferencia_json(p.chofer_id, p.moneda)) IS NOT NULL), '{}');
END $f$;

DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_cuenta_transferencia_json(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_mi_cuenta_transferencia(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_guardar_cuenta_transferencia(bigint, text, jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_cuentas_destino_pedidos() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pedido_fondo_cuenta_destino() FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_pedir_fondo_chofer(text,numeric,text)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_mi_cuenta_transferencia(text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_guardar_cuenta_transferencia(bigint, text, jsonb) TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_pedidos_fondo(boolean)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cuentas_destino_pedidos() TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_guardar_cuenta_transferencia(bigint, text, jsonb) TO %I', r.rolname);
        END IF;
    END LOOP;
END $g$;

UPDATE ref.parametro SET valor = '284' WHERE codigo = 'web.version_base' AND valor::text::int < 284;

COMMIT;

SELECT 'migración 284 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
