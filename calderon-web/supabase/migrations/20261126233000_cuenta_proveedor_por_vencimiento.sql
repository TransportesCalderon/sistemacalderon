-- =====================================================================================
-- Migración 370 · La cuenta de cada proveedor, ordenada por vencimiento
-- =====================================================================================
-- Pedido (26/11/2026): al abrir un proveedor en Finanzas › Cobros y pagos › Por pagar › Cuenta corriente de
-- proveedores, los movimientos salían por la fecha del documento y de lo más nuevo a lo más viejo. Con cuatro leasing
-- del mismo banco quedaban mezclados y lo que todavía no vence arriba de todo. «Deberían estar ordenados por
-- vencimiento».
--   · Ahora van por vencimiento, de lo más viejo a lo más nuevo: es el mismo orden en que «Pagar» cancela las facturas.
--     Los pagos, las órdenes de pago y las cargas sin factura no tienen vencimiento: van por su fecha.
--   · Con el mismo vencimiento, por el detalle: los contratos salen siempre en el mismo orden.
--   · El saldo acumulado se suma en ese mismo orden: la última fila es el saldo del proveedor.
--   · La respuesta dice «orden: vencimiento» para que la pantalla lo avise.
-- Solo cambia el orden de fin.fn_cuenta_proveedor. Se toca por anclas, sin reescribirla: si la función no es la que
-- se espera, frena sin aplicar nada. No cambia datos ni web.version_base. Se puede correr más de una vez.
-- Antes de terminar la prueba con los proveedores de esta base: si algo no cierra, no deja nada aplicado.
-- =====================================================================================
BEGIN;

DO $do$
DECLARE
    v_def text;
    -- El saldo acumulado
    c_a1 constant text := 'sum(debe - haber) OVER (ORDER BY fecha, orden, ref) AS saldo FROM mov)';
    c_n1 constant text := 'sum(debe - haber) OVER (ORDER BY coalesce(vence, fecha), orden, detalle, ref) AS saldo FROM mov)';
    -- El orden en que salen los movimientos
    c_a2 constant text := ') ORDER BY fecha DESC, orden DESC, ref DESC) FROM con)';
    c_n2 constant text := ') ORDER BY coalesce(vence, fecha), orden, detalle, ref) FROM con)';
    -- El aviso para la pantalla
    c_a3 constant text := $a$'proveedor_id', p_proveedor, 'proveedor',$a$;
    c_n3 constant text := $a$'orden', 'vencimiento', 'proveedor_id', p_proveedor, 'proveedor',$a$;
BEGIN
    IF to_regprocedure('fin.fn_cuenta_proveedor(bigint, text)') IS NULL THEN
        RAISE EXCEPTION 'Falta la cuenta corriente de proveedores (orden_pago_cuenta_proveedores): avisar antes de seguir';
    END IF;
    v_def := pg_get_functiondef('fin.fn_cuenta_proveedor(bigint, text)'::regprocedure);
    -- Ya está aplicada
    IF position(c_n1 IN v_def) > 0 AND position(c_n2 IN v_def) > 0 AND position(c_n3 IN v_def) > 0 THEN RETURN; END IF;
    IF position(c_a1 IN v_def) = 0 OR position(c_a2 IN v_def) = 0 OR position(c_a3 IN v_def) = 0 THEN
        RAISE EXCEPTION 'fin.fn_cuenta_proveedor no es la que esperaba esta migración. No se aplicó nada: avisar antes de seguir.';
    END IF;
    EXECUTE replace(replace(replace(v_def, c_a1, c_n1), c_a2, c_n2), c_a3, c_n3);
END $do$;

COMMENT ON FUNCTION fin.fn_cuenta_proveedor(bigint, text) IS
    'Cuenta corriente de un proveedor en una moneda: facturas, pagos, órdenes de pago y cargas sin factura, con el saldo acumulado. Migración 370: ordenada por vencimiento, de lo más viejo a lo más nuevo (lo que no tiene vencimiento va por su fecha).';

-- ---------------------------------------------------------------------------------
-- Prueba con los proveedores de esta base (solo lee): el orden y el saldo de la última fila
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE
    v_antes text := current_setting('app.usuario_id', true);
    v_usr text; r record; j jsonb; v_mal text; v_n integer := 0;
BEGIN
    IF position('ORDER BY coalesce(vence, fecha), orden, detalle, ref) FROM con)' IN pg_get_functiondef('fin.fn_cuenta_proveedor(bigint, text)'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'la función no quedó con el orden nuevo';
    END IF;
    -- La cuenta la ve quien ve Finanzas: se lee como uno de ellos, solo dentro de esta prueba
    SELECT u.usuario_id::text INTO v_usr FROM seg.usuario_rol u WHERE u.rol_codigo IN ('finanzas', 'ti', 'gerencia', 'auditor') ORDER BY u.usuario_id LIMIT 1;
    IF v_usr IS NULL THEN RETURN; END IF;
    PERFORM set_config('app.usuario_id', v_usr, true);
    -- Los proveedores con más documentos
    FOR r IN SELECT g.proveedor_id, g.moneda::text AS moneda FROM fin.gasto g
              WHERE g.proveedor_id IS NOT NULL AND g.estado = 'vigente' AND g.eliminado_en IS NULL
              GROUP BY g.proveedor_id, g.moneda ORDER BY count(*) DESC, g.proveedor_id LIMIT 5 LOOP
        j := fin.fn_cuenta_proveedor(r.proveedor_id, r.moneda);
        v_n := v_n + 1;
        SELECT CASE WHEN bool_or(x.clave < x.anterior) THEN 'los movimientos no quedaron por vencimiento' END INTO v_mal
          FROM (SELECT coalesce((m ->> 'vence')::date, (m ->> 'fecha')::date) AS clave,
                       lag(coalesce((m ->> 'vence')::date, (m ->> 'fecha')::date)) OVER (ORDER BY n) AS anterior
                  FROM jsonb_array_elements(j -> 'movimientos') WITH ORDINALITY t(m, n)) x;
        IF v_mal IS NULL AND j ->> 'orden' IS DISTINCT FROM 'vencimiento' THEN v_mal := 'la respuesta no avisa el orden'; END IF;
        IF v_mal IS NULL AND jsonb_array_length(j -> 'movimientos') > 0
           AND (j -> 'movimientos' -> -1 ->> 'saldo')::numeric IS DISTINCT FROM (j ->> 'saldo')::numeric THEN
            v_mal := 'el saldo de la última fila (' || (j -> 'movimientos' -> -1 ->> 'saldo') || ') no es el saldo del proveedor (' || (j ->> 'saldo') || ')';
        END IF;
        IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'proveedor % en %: %', r.proveedor_id, r.moneda, v_mal; END IF;
    END LOOP;
    PERFORM set_config('app.usuario_id', coalesce(v_antes, ''), true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La migración 370 no pasó su prueba con los datos de esta base (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado
SELECT 'migración 370 aplicada' AS que,
       pg_get_functiondef('fin.fn_cuenta_proveedor(bigint, text)'::regprocedure)
           LIKE '%ORDER BY coalesce(vence, fecha), orden, detalle, ref) FROM con)%' AS cuenta_ordenada_por_vencimiento;
