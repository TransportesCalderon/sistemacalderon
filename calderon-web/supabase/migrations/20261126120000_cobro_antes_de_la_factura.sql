-- =====================================================================================
-- Migración 361 · Un cliente puede pagar antes de la factura (anticipo)
-- =====================================================================================
-- Caso (26/11/2026): Humber Chile pagó USD 2.500 el 26/10, a los 3 días de la primera operación, y la factura 34-38 es
-- del 23/11. El cobro con la fecha real (la de la cartola) frenaba con «El cobro no puede ser antes de la factura».
-- Ahora se acepta un cobro hasta 90 días antes de la fecha de la factura (parámetro fin.cobro_antes_factura_dias).
-- Más que eso sigue frenando, para atajar fechas mal escritas.
-- Cambio por reemplazo de texto sobre la definición viva de fin.fn_registrar_movimiento_interno (con control).
-- =====================================================================================
BEGIN;

DO $p$
DECLARE
    v_def text := pg_get_functiondef('fin.fn_registrar_movimiento_interno(jsonb)'::regprocedure);
    v_de  text := $t$IF v_fecha < f.fecha_emision THEN RAISE EXCEPTION 'El cobro no puede ser antes de la factura' USING ERRCODE = '22023'; END IF;$t$;
    v_a   text := $t$IF v_fecha < f.fecha_emision - ref.fn_parametro_num('fin.cobro_antes_factura_dias', 90)::int THEN   -- Migración 361: anticipo del cliente
            RAISE EXCEPTION 'El cobro no puede ser más de % días antes de la factura (%)', ref.fn_parametro_num('fin.cobro_antes_factura_dias', 90)::int,
                to_char(f.fecha_emision, 'DD/MM/YYYY') USING ERRCODE = '22023';
        END IF;$t$;
BEGIN
    IF position('Migración 361' IN v_def) > 0 THEN
        RAISE NOTICE 'La migración 361 ya estaba aplicada';
        RETURN;
    END IF;
    IF (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 THEN
        RAISE EXCEPTION 'No se encontró el control de fecha del cobro en fin.fn_registrar_movimiento_interno: no se aplicó nada';
    END IF;
    EXECUTE replace(v_def, v_de, v_a);
END $p$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: un cobro puede ser hasta 90 días antes de la factura' AS resultado;
