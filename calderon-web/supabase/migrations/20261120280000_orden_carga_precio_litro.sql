-- =====================================================================================
-- Migración 292 · El precio por litro en la orden de carga: sugerido por el último dato, pero editable
-- =====================================================================================
-- Pedido (20/11/2026): al hacer la orden de carga se escribe a cuánto está el litro (el sistema sugiere el último precio
-- de esa estación y se puede cambiar si se sabe que es otro). Sirve sobre todo para la transferencia: es lo que Finanzas
-- tiene que transferir.
--   · fue.fn_detalle_orden: además de «medio_pago» (290) conserva «precio_litro» (mayor que 0). Viaja de la solicitud a la
--     orden igual que el resto del detalle.
--   · fin.fn_orden_carga_a_finanzas (290): el importe para Finanzas usa ese precio; si no se escribió, el de la
--     solicitud o el promedio de la estación, como antes.
-- web.version_base = 292.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 291
       OR to_regprocedure('fue.fn_detalle_orden_sin_pago(bigint,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que aplicar las migraciones 290 y 291. La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
END $v$;

CREATE OR REPLACE FUNCTION fue.fn_detalle_orden(p_camion bigint, p_detalle jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_medio text := nullif(btrim(coalesce(p_detalle ->> 'medio_pago', '')), ''); v_precio numeric;
BEGIN
    IF v_medio IS NOT NULL AND v_medio NOT IN ('tarjeta', 'transferencia') THEN
        RAISE EXCEPTION 'Elegí cómo se paga: con la tarjeta de flota o por transferencia a la estación' USING ERRCODE = '22023';
    END IF;
    BEGIN
        v_precio := nullif(p_detalle ->> 'precio_litro', '')::numeric;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'El precio por litro no es un número' USING ERRCODE = '22023';
    END;
    IF v_precio IS NOT NULL AND (v_precio <= 0 OR v_precio > 100000) THEN
        RAISE EXCEPTION 'El precio por litro tiene que ser mayor que cero' USING ERRCODE = '22023';
    END IF;
    RETURN fue.fn_detalle_orden_sin_pago(p_camion, p_detalle - 'medio_pago' - 'precio_litro')
           || CASE WHEN v_medio IS NOT NULL THEN jsonb_build_object('medio_pago', v_medio) ELSE '{}'::jsonb END
           || CASE WHEN v_precio IS NOT NULL THEN jsonb_build_object('precio_litro', round(v_precio, 2)) ELSE '{}'::jsonb END;
END $f$;

CREATE OR REPLACE FUNCTION fin.fn_orden_carga_a_finanzas()
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
    -- Migración 292: manda el precio que se escribió en la orden; si no, el de la solicitud; si no, el promedio de la estación
    v_pre := nullif(NEW.detalle ->> 'precio_litro', '')::numeric;
    IF v_pre IS NOT NULL THEN
        v_mon := CASE (SELECT e.pais FROM mae.estacion_servicio e WHERE e.id = NEW.estacion_id) WHEN 'CL' THEN 'CLP' WHEN 'AR' THEN 'ARS' END;
    ELSE
        SELECT p.precio_unitario, p.moneda INTO v_pre, v_mon FROM tel.pedido_carga p WHERE p.orden_id = NEW.id AND p.precio_unitario > 0 ORDER BY p.id DESC LIMIT 1;
    END IF;
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

UPDATE ref.parametro SET valor = '292' WHERE codigo = 'web.version_base' AND valor::text::int < 292;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 292 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
