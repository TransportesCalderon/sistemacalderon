-- =====================================================================================
-- Migración 282 · Estación con dos proveedores: quién factura con tarjeta y quién si se paga directo
-- =====================================================================================
-- Pedido (19/11/2026): en Shell Lo Espejo, si se paga con la tarjeta de flota factura Enex;
-- si se paga directo a la estación, factura la razón social de la estación.
--
--   · mae.estacion_servicio.proveedor_directo_id: quién factura cuando NO se paga con tarjeta.
--     Vacío = como hasta hoy (todo al proveedor de la estación).
--   · fin.fn_proveedor_de_carga(estación, medio): a quién se le debe la carga.
--   · mae.fn_estacion_proveedor_directo(estación, proveedor): lo carga Finanzas, Gerencia,
--     Adm. de combustible o TI, y rehace los asientos de las cargas de esa estación que no
--     fueron con tarjeta ni están en una factura.
--   · Las funciones de Finanzas que miraban «el proveedor de la estación» pasan a mirar
--     «el proveedor de la carga». Se cambian sobre la definición que tenga la base hoy
--     (reemplazo de texto con control): si alguna no tiene el texto esperado, no se aplica nada.
--
-- No cambia datos. web.version_base = 282.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 281 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 281 (orden de pago y cuenta de proveedores)';
    END IF;
END $v$;

ALTER TABLE mae.estacion_servicio ADD COLUMN IF NOT EXISTS proveedor_directo_id bigint REFERENCES mae.proveedor(id) ON DELETE RESTRICT;
COMMENT ON COLUMN mae.estacion_servicio.proveedor_directo_id IS
    'Quién factura cuando la carga se paga directo a la estación (no con tarjeta). Vacío = el proveedor de la estación.';

CREATE OR REPLACE FUNCTION fin.fn_proveedor_de_carga(p_estacion bigint, p_medio text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT CASE WHEN p_medio IS DISTINCT FROM 'tarjeta' AND e.proveedor_directo_id IS NOT NULL THEN e.proveedor_directo_id ELSE e.proveedor_id END
      FROM mae.estacion_servicio e WHERE e.id = p_estacion
$f$;
COMMENT ON FUNCTION fin.fn_proveedor_de_carga(bigint, text) IS
    'A quién se le debe una carga: con tarjeta, al proveedor de la estación; pagada directo, a la razón social de la estación si está cargada.';

-- ------------------------------------------------------------------ reemplazos con control
DO $p$
DECLARE
    r record; v_def text; v_n int;
    c_p  CONSTANT text := 'fin.fn_proveedor_de_carga(e.id, c.medio_pago)';
    c_pa CONSTANT text := 'fin.fn_proveedor_de_carga(e.id, ca.medio_pago)';
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
          -- función, texto viejo, texto nuevo, veces esperadas
          ('fin.fn_cargas_por_facturar', 'e.proveedor_id', c_p, 2),
          ('fin.fn_cuenta_proveedor',    'e.proveedor_id', c_p, 2),
          ('fin.fn_cuenta_proveedores',  'SELECT e.proveedor_id, c.moneda', 'SELECT ' || c_p || ' AS proveedor_id, c.moneda', 1),
          ('fin.fn_cuenta_proveedores',  'WHERE e.proveedor_id IS NOT NULL', 'WHERE ' || c_p || ' IS NOT NULL', 1),
          ('fin.fn_cuenta_proveedores',  'fn_medio_de_carga(c.medio_pago, e.proveedor_id)', 'fn_medio_de_carga(c.medio_pago, ' || c_p || ')', 1),
          ('fin.fn_cuenta_estaciones',   'SELECT e.proveedor_id, c.moneda', 'SELECT ' || c_p || ' AS proveedor_id, c.moneda', 1),
          ('fin.fn_cuenta_estaciones',   'WHERE e.proveedor_id IS NOT NULL AND c.estado', 'WHERE ' || c_p || ' IS NOT NULL AND c.estado', 1),
          ('fin.fn_cuenta_estaciones',   'fn_medio_de_carga(c.medio_pago, e.proveedor_id)', 'fn_medio_de_carga(c.medio_pago, ' || c_p || ')', 1),
          ('fin.fn_cuenta_estaciones',   '(SELECT e.proveedor_id FROM mae.estacion_servicio e WHERE e.proveedor_id IS NOT NULL)',
                                         '(SELECT e.proveedor_id FROM mae.estacion_servicio e WHERE e.proveedor_id IS NOT NULL UNION SELECT e.proveedor_directo_id FROM mae.estacion_servicio e WHERE e.proveedor_directo_id IS NOT NULL)', 1),
          ('fin.fn_cuenta_estaciones',   'WHERE e.proveedor_id = x.proveedor_id', 'WHERE x.proveedor_id IN (e.proveedor_id, e.proveedor_directo_id)', 1),
          ('fin.fn_vincular_cargas',     'ca.eliminado_en, e.proveedor_id,', 'ca.eliminado_en, ' || c_pa || ' AS proveedor_id,', 1),
          ('fin.fn_vincular_cargas',     'fn_medio_de_carga(ca.medio_pago, e.proveedor_id)', 'fn_medio_de_carga(ca.medio_pago, ' || c_pa || ')', 1),
          ('fin.fn_contabilizar_carga',  'SELECT e.proveedor_id, e.es_tanque_propio INTO', 'SELECT ' || c_p || ', e.es_tanque_propio INTO', 1),
          ('fin.fn_contabilizar_gasto',  'FOR r IN SELECT e.proveedor_id, sum(', 'FOR r IN SELECT ' || c_p || ' AS proveedor_id, sum(', 1),
          ('fin.fn_contabilizar_gasto',  'GROUP BY e.proveedor_id LOOP', 'GROUP BY 1 LOOP', 1)
        ) t(fn, viejo, nuevo, veces)
    LOOP
        SELECT pg_get_functiondef(p.oid) INTO STRICT v_def
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname || '.' || p.proname = r.fn;
        v_n := (length(v_def) - length(replace(v_def, r.viejo, ''))) / length(r.viejo);
        IF v_n = 0 AND position(r.nuevo IN v_def) > 0 THEN CONTINUE; END IF;   -- ya estaba cambiado
        IF v_n <> r.veces THEN
            RAISE EXCEPTION 'No se aplicó nada: en % esperaba % vez/veces «%» y hay %. Avisar para revisar.', r.fn, r.veces, r.viejo, v_n;
        END IF;
        EXECUTE replace(v_def, r.viejo, r.nuevo);
    END LOOP;
END $p$;

-- ------------------------------------------------------------------ cargarlo en la estación
CREATE OR REPLACE FUNCTION mae.fn_estacion_proveedor_directo(p_estacion bigint, p_proveedor bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE e mae.estacion_servicio; c record; n int := 0;
BEGIN
    IF NOT fue.fn_puedo_autorizar_cargas() THEN
        PERFORM ven.fn_exigir(ARRAY['gerencia', 'adm_combustible', 'finanzas', 'ti'], 'Quién factura el pago directo lo cargan Gerencia, Finanzas, Adm. de combustible o TI');
    END IF;
    SELECT * INTO e FROM mae.estacion_servicio WHERE id = p_estacion AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La estación no existe' USING ERRCODE = 'P0002'; END IF;
    IF p_proveedor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mae.proveedor WHERE id = p_proveedor AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El proveedor no existe' USING ERRCODE = 'P0002';
    END IF;
    IF p_proveedor IS NOT NULL AND p_proveedor = e.proveedor_id THEN
        RAISE EXCEPTION 'Es el mismo proveedor de la estación: dejalo vacío' USING ERRCODE = '22023';
    END IF;
    IF e.proveedor_directo_id IS NOT DISTINCT FROM p_proveedor THEN RETURN 0; END IF;
    -- Cargas pagadas directo que ya están en una factura: primero hay que sacarlas de la factura
    IF EXISTS (SELECT 1 FROM fue.carga_combustible ca JOIN fin.gasto_carga gc ON gc.carga_id = ca.id
                WHERE ca.estacion_id = p_estacion AND ca.medio_pago IS DISTINCT FROM 'tarjeta' AND ca.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Hay cargas de esta estación pagadas directo que ya están en una factura. Primero sacalas de esa factura.' USING ERRCODE = '22023';
    END IF;
    UPDATE mae.estacion_servicio SET proveedor_directo_id = p_proveedor WHERE id = p_estacion;
    -- Rehace los asientos de las cargas que no fueron con tarjeta (la deuda pasa al otro proveedor)
    PERFORM set_config('fin.cont_fn', '1', true);
    FOR c IN SELECT ca.id FROM fue.carga_combustible ca
              WHERE ca.estacion_id = p_estacion AND ca.medio_pago IS DISTINCT FROM 'tarjeta'
                AND ca.eliminado_en IS NULL AND ca.estado_validacion <> 'anulada' ORDER BY ca.id LOOP
        PERFORM fin.fn_contabilizar_carga(c.id);
        n := n + 1;
    END LOOP;
    RETURN n;
END $f$;
COMMENT ON FUNCTION mae.fn_estacion_proveedor_directo(bigint, bigint) IS
    'Carga quién factura cuando se paga directo a la estación y rehace los asientos de esas cargas. Devuelve cuántas cargas rehízo.';

DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION mae.fn_estacion_proveedor_directo(bigint, bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_proveedor_de_carga(bigint, text) FROM PUBLIC;
    -- Los mismos permisos que «correo de la estación»
    FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'mae.fn_estacion_correo(bigint, text)'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION mae.fn_estacion_proveedor_directo(bigint, bigint) TO %I', pg_get_userbyid(r.grantee));
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_proveedor_de_carga(bigint, text) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
END $g$;

UPDATE ref.parametro SET valor = '282' WHERE codigo = 'web.version_base' AND valor::text::int < 282;

COMMIT;

SELECT 'migración 282 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
