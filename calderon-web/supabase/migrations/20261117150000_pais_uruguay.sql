-- =============================================================================
-- IronTrack — 272 · Cambio 266 · Uruguay como país (clientes y lugares)
-- -----------------------------------------------------------------------------
-- Pedido del usuario (16/11/2026): poder elegir Uruguay como país de un cliente, con lo que
-- eso implica, y los datos que necesita su factura. Decidido: al cliente uruguayo se le factura
-- en dólares, como a los demás extranjeros; Uruguay se usa también para lugares de carga y
-- descarga, pero no para cargar combustible.
--   · ref.pais: Uruguay (UY), moneda por defecto USD, hora de Montevideo. Con eso aparece en
--     clientes, prospectos, lugares, proveedores y estaciones (todos leen la tabla de países).
--   · RUT de Uruguay: 12 dígitos, empieza con 01 a 21 y el último es el verificador (módulo 11,
--     pesos 4,3,2,9,8,7,6,5,4,3,2). mae.fn_rut_uy_valido lo controla y una restricción de
--     mae.cliente lo exige a los clientes de Uruguay (hoy no hay ninguno).
--   · Factura: sale como factura de exportación del SII (tipo 110, igual que Argentina, Brasil
--     y Paraguay). El código de Aduana de Uruguay (223) se agrega al parámetro
--     fact.paises_aduana. La migración se frena si el parámetro no tiene los códigos que se
--     esperan para los demás países (Argentina 224, y si están, Brasil 220 y Paraguay 222).
--     En la factura van el RUT uruguayo, la razón social, la dirección, el departamento y la
--     ciudad, que ya son datos del cliente (Ventas › ficha del cliente).
-- No cambia funciones existentes ni datos de clientes. web.version_base = 272.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
DECLARE p jsonb;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 271 THEN
        RAISE EXCEPTION 'Falta la migración 271 (puerta única de alta de clientes): aplicarla antes';
    END IF;
    IF to_regprocedure('mae.fn_rut_uy_valido(text)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 272 (Uruguay) ya está aplicada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ref.moneda WHERE codigo = 'USD') THEN
        RAISE EXCEPTION 'No está el dólar (USD) en las monedas: avisar antes de seguir';
    END IF;
    IF EXISTS (SELECT 1 FROM mae.cliente WHERE pais = 'UY') THEN
        RAISE EXCEPTION 'Ya hay clientes de Uruguay: avisar antes de seguir (hay que revisar su RUT)';
    END IF;
    p := (SELECT valor FROM ref.parametro WHERE codigo = 'fact.paises_aduana' AND eliminado_en IS NULL);
    IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
        RAISE EXCEPTION 'No encontré el parámetro fact.paises_aduana: avisar antes de seguir';
    END IF;
    IF p ->> 'AR' IS DISTINCT FROM '224' OR (p ? 'BR' AND p ->> 'BR' <> '220') OR (p ? 'PY' AND p ->> 'PY' <> '222') THEN
        RAISE EXCEPTION 'Los códigos de Aduana del parámetro no son los esperados (%): avisar antes de seguir', p;
    END IF;
    IF p ? 'UY' AND p ->> 'UY' <> '223' THEN
        RAISE EXCEPTION 'El parámetro ya tiene otro código de Aduana para Uruguay (%): avisar antes de seguir', p ->> 'UY';
    END IF;
END $do$;

-- 1 · El país
INSERT INTO ref.pais (iso2, nombre, moneda_defecto, zona_horaria_operativa)
SELECT 'UY', 'Uruguay', 'USD', 'America/Montevideo'
WHERE NOT EXISTS (SELECT 1 FROM ref.pais WHERE iso2 = 'UY');

-- 2 · RUT de Uruguay
CREATE FUNCTION mae.fn_rut_uy_valido(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $f$
    SELECT CASE
        WHEN p IS NULL OR p !~ '^[0-9]{12}$' THEN false
        WHEN substr(p, 1, 2)::int NOT BETWEEN 1 AND 21 THEN false
        ELSE (SELECT CASE 11 - s % 11 WHEN 11 THEN 0 WHEN 10 THEN -1 ELSE 11 - s % 11 END
                FROM (SELECT sum(substr(p, i, 1)::int * (ARRAY[4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])[i]) AS s
                        FROM generate_series(1, 11) AS i) x) = substr(p, 12, 1)::int
    END
$f$;
COMMENT ON FUNCTION mae.fn_rut_uy_valido(text) IS
    'Migración 272: RUT de Uruguay válido (12 dígitos, 01 a 21 al principio, verificador módulo 11).';
-- La usa una restricción de mae.cliente: tiene que poder ejecutarla cualquiera que escriba clientes.
GRANT EXECUTE ON FUNCTION mae.fn_rut_uy_valido(text) TO PUBLIC;

ALTER TABLE mae.cliente
    ADD CONSTRAINT ck_cliente_rut_uy CHECK (pais <> 'UY' OR mae.fn_rut_uy_valido(identificador_fiscal));

-- 3 · Código de Aduana para la factura de exportación
UPDATE ref.parametro
   SET valor = valor || jsonb_build_object('UY', CASE jsonb_typeof(valor -> 'AR') WHEN 'number' THEN to_jsonb(223) ELSE to_jsonb('223'::text) END)
 WHERE codigo = 'fact.paises_aduana' AND eliminado_en IS NULL AND NOT (valor ? 'UY');

-- 4 · Controles finales
DO $do$
DECLARE v_mal text;
BEGIN
    IF NOT mae.fn_rut_uy_valido('215521750017') OR mae.fn_rut_uy_valido('215521750018') OR mae.fn_rut_uy_valido('995521750017') THEN
        RAISE EXCEPTION 'El control del RUT de Uruguay no da lo esperado: avisar';
    END IF;
    SELECT string_agg(ro.rolname, ', ') INTO v_mal FROM pg_roles ro
     WHERE (has_table_privilege(ro.rolname, 'mae.cliente', 'INSERT') OR has_table_privilege(ro.rolname, 'mae.cliente', 'UPDATE'))
       AND NOT has_function_privilege(ro.rolname, 'mae.fn_rut_uy_valido(text)', 'EXECUTE');
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'Estos roles escriben clientes pero no pueden usar el control del RUT de Uruguay: %', v_mal;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ref.pais WHERE iso2 = 'UY' AND moneda_defecto = 'USD')
       OR (SELECT valor ->> 'UY' FROM ref.parametro WHERE codigo = 'fact.paises_aduana' AND eliminado_en IS NULL) IS DISTINCT FROM '223' THEN
        RAISE EXCEPTION 'Uruguay no quedó bien cargado: avisar';
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '272' WHERE codigo = 'web.version_base' AND valor::text::int < 272;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 272 aplicada' AS que,
       (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT nombre || ' · ' || moneda_defecto || ' · ' || zona_horaria_operativa FROM ref.pais WHERE iso2 = 'UY') AS uruguay,
       (SELECT valor::text FROM ref.parametro WHERE codigo = 'fact.paises_aduana') AS codigos_aduana;
