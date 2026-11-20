-- =====================================================================================
-- Migración 294 · Cargas sin datos: litros escritos a mano y un monto máximo para Finanzas
-- =====================================================================================
-- Caso (20/11/2026): OC-000033 (SXXV17, tanques y mochila llenos, por transferencia). El camión no informa el nivel del
-- tanque ni el odómetro, y la orden se hizo desde «Nueva orden» (sin solicitud): el sistema no tenía ningún dato de litros
-- y Finanzas no veía cuánto transferir.
--   · La orden guarda «litros_estimados» si quien la hace los escribe (la web los pide cuando el sistema no los puede
--     calcular, y son obligatorios si se paga por transferencia). fue.fn_detalle_orden conserva medio_pago, precio_litro y
--     litros_estimados.
--   · fin.fn_litros_max_orden(orden): lo más que puede entrar: capacidad de los tanques (o los litros pedidos) + la mochila
--     (su capacidad si va llena, o los litros pedidos).
--   · fin.pago_carga suma litros_max e importe_max; los litros estimados nunca pasan del máximo. Si no se sabe cuánto carga,
--     Finanzas ve «hasta $…». Lo que se transfiera de más queda a cuenta de la estación para la próxima factura.
--   · Se recalculan las pendientes.
-- web.version_base = 294.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 293 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 293 (monto a transferir). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
END $v$;

-- ------------------------------------------------------------------ el detalle guarda los litros escritos a mano
CREATE OR REPLACE FUNCTION fue.fn_detalle_orden(p_camion bigint, p_detalle jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_medio text := nullif(btrim(coalesce(p_detalle ->> 'medio_pago', '')), ''); v_precio numeric; v_est numeric;
BEGIN
    IF v_medio IS NOT NULL AND v_medio NOT IN ('tarjeta', 'transferencia') THEN
        RAISE EXCEPTION 'Elegí cómo se paga: con la tarjeta de flota o por transferencia a la estación' USING ERRCODE = '22023';
    END IF;
    BEGIN
        v_precio := nullif(p_detalle ->> 'precio_litro', '')::numeric;
        v_est := nullif(p_detalle ->> 'litros_estimados', '')::numeric;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'El precio o los litros aproximados no son un número' USING ERRCODE = '22023';
    END;
    IF v_precio IS NOT NULL AND (v_precio <= 0 OR v_precio > 100000) THEN
        RAISE EXCEPTION 'El precio por litro tiene que ser mayor que cero' USING ERRCODE = '22023';
    END IF;
    IF v_est IS NOT NULL AND (v_est <= 0 OR v_est > 5000) THEN
        RAISE EXCEPTION 'Los litros aproximados van de 1 a 5.000' USING ERRCODE = '22023';
    END IF;
    RETURN fue.fn_detalle_orden_sin_pago(p_camion, p_detalle - 'medio_pago' - 'precio_litro' - 'litros_estimados')
           || CASE WHEN v_medio IS NOT NULL THEN jsonb_build_object('medio_pago', v_medio) ELSE '{}'::jsonb END
           || CASE WHEN v_precio IS NOT NULL THEN jsonb_build_object('precio_litro', round(v_precio, 2)) ELSE '{}'::jsonb END
           || CASE WHEN v_est IS NOT NULL THEN jsonb_build_object('litros_estimados', round(v_est)) ELSE '{}'::jsonb END;
END $f$;

-- ------------------------------------------------------------------ lo más que puede entrar
CREATE OR REPLACE FUNCTION fin.fn_litros_max_orden(p_orden bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o fue.orden_carga%ROWTYPE; v_tq numeric; v_mo numeric := 0;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF NOT FOUND OR o.camion_id IS NULL THEN RETURN NULL; END IF;
    IF o.modo = 'litros' AND o.litros IS NOT NULL THEN RETURN o.litros; END IF;
    v_tq := CASE WHEN o.detalle #>> '{tanques,modo}' = 'litros' THEN nullif(o.detalle #>> '{tanques,litros}', '')::numeric
                 ELSE coalesce(nullif(fue.fn_capacidad_camion(o.camion_id, now()) ->> 'tanques_l', '')::numeric,
                               nullif(o.combustible ->> 'capacidad_l', '')::numeric) END;   -- solo los tanques: la mochila va aparte
    IF v_tq IS NULL THEN RETURN NULL; END IF;
    IF o.detalle ->> 'destino' = 'tanques_mochila' THEN
        v_mo := CASE WHEN o.detalle #>> '{mochila,modo}' = 'litros' THEN nullif(o.detalle #>> '{mochila,litros}', '')::numeric
                     ELSE coalesce(nullif(o.detalle #>> '{mochila,capacidad_l}', '')::numeric, fue.fn_capacidad_mochila(o.camion_id)) END;
    END IF;
    RETURN round(v_tq + coalesce(v_mo, 0), 1);
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION fin.fn_litros_max_orden(bigint) FROM PUBLIC;

-- ------------------------------------------------------------------ los litros para el pago: también los escritos a mano
CREATE OR REPLACE FUNCTION fin.fn_litros_orden_para_pago(p_orden bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o fue.orden_carga%ROWTYPE; v numeric; v_est numeric; v_cam numeric;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v := coalesce(o.litros, o.litros_calculados, nullif(o.detalle ->> 'litros', '')::numeric,
                  nullif(o.detalle ->> 'litros_estimados', '')::numeric,   -- Migración 294: los escribió quien hizo la orden
                  (SELECT p.litros FROM tel.pedido_carga p
                    WHERE p.litros > 0 AND (p.orden_id = o.id OR (p.camion_id = o.camion_id AND p.estado = 'pendiente'))
                    ORDER BY (p.orden_id = o.id) DESC NULLS LAST, p.id DESC LIMIT 1));
    IF v IS NOT NULL OR o.camion_id IS NULL THEN RETURN round(v, 1); END IF;
    BEGIN
        v_est := nullif(fue.fn_estimar_llenado(o.camion_id) ->> 'litros', '')::numeric;
        v_cam := nullif(fue.fn_camino_a_estacion(o.camion_id, o.estacion_id) ->> 'litros', '')::numeric;
    EXCEPTION WHEN OTHERS THEN v_est := NULL;
    END;
    IF v_est IS NULL THEN RETURN NULL; END IF;
    RETURN round(v_est + coalesce(v_cam, 0) + coalesce(nullif(o.detalle #>> '{mochila,litros}', '')::numeric, 0), 1);
END $f$;

-- ------------------------------------------------------------------ el pago guarda el máximo
ALTER TABLE fin.pago_carga ADD COLUMN IF NOT EXISTS litros_max numeric(10,1);
ALTER TABLE fin.pago_carga ADD COLUMN IF NOT EXISTS importe_max numeric(14,2);

CREATE OR REPLACE FUNCTION fin.fn_orden_carga_a_finanzas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_max numeric; v_medio text; v_lit numeric; v_pre numeric; v_mon text; v_pat text; v_est text; v_dest bigint[];
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
    v_lit := fin.fn_litros_orden_para_pago(NEW.id);   -- Migración 293
    v_max := fin.fn_litros_max_orden(NEW.id);           -- Migración 294: lo más que puede entrar
    IF v_max IS NOT NULL AND v_lit > v_max THEN v_lit := v_max; END IF;
    -- Migración 292: manda el precio que se escribió en la orden; si no, el de la solicitud; si no, el promedio de la estación
    v_pre := nullif(NEW.detalle ->> 'precio_litro', '')::numeric;
    IF v_pre IS NOT NULL THEN
        v_mon := CASE (SELECT e.pais FROM mae.estacion_servicio e WHERE e.id = NEW.estacion_id) WHEN 'CL' THEN 'CLP' WHEN 'AR' THEN 'ARS' END;
    ELSE
        SELECT p.precio_unitario, p.moneda INTO v_pre, v_mon FROM tel.pedido_carga p
         WHERE (p.orden_id = NEW.id OR (p.camion_id = NEW.camion_id AND p.estado = 'pendiente')) AND p.precio_unitario > 0
         ORDER BY (p.orden_id = NEW.id) DESC NULLS LAST, p.id DESC LIMIT 1;
    END IF;
    IF v_pre IS NULL THEN SELECT r.precio, r.moneda INTO v_pre, v_mon FROM fin.fn_precio_referencia_estacion(NEW.estacion_id) r; END IF;
    INSERT INTO fin.pago_carga (orden_id, medio, camion_id, estacion_id, proveedor_id, litros, precio, moneda, importe, litros_max, importe_max)
    VALUES (NEW.id, v_medio, NEW.camion_id, NEW.estacion_id,
            (SELECT pr.id FROM mae.proveedor pr
              WHERE pr.id = fin.fn_proveedor_de_carga(NEW.estacion_id, CASE WHEN v_medio = 'tarjeta' THEN 'tarjeta' ELSE 'cuenta_corriente' END)),
            round(v_lit, 1), v_pre, coalesce(v_mon, 'CLP'), round(v_lit * v_pre, 0), round(v_max, 1), round(v_max * v_pre, 0));
    SELECT patente INTO v_pat FROM mae.camion WHERE id = NEW.camion_id;
    SELECT nombre INTO v_est FROM mae.estacion_servicio WHERE id = NEW.estacion_id;
    SELECT array_agg(DISTINCT r.usuario_id) INTO v_dest FROM seg.usuario_rol r JOIN seg.usuario u ON u.id = r.usuario_id
     WHERE r.rol_codigo = 'finanzas' AND u.activo;
    IF v_dest IS NOT NULL THEN
        PERFORM ops.fn_avisar(v_dest, 'pago_carga:' || NEW.id,
            CASE WHEN v_medio = 'tarjeta' THEN 'Habilitar la tarjeta · ' ELSE 'Transferir a la estación · ' END || coalesce(v_pat, ''),
            concat_ws(' · ', NEW.numero, v_est, '≈ ' || tel.fn_num_ar(v_lit) || ' L',
                      CASE WHEN v_pre IS NOT NULL AND v_lit IS NOT NULL THEN '≈ $' || tel.fn_num_ar(round(v_lit * v_pre, 0)) || ' ' || coalesce(v_mon, '')
                           WHEN v_pre IS NOT NULL AND v_max IS NOT NULL THEN 'hasta $' || tel.fn_num_ar(round(v_max * v_pre, 0)) || ' ' || coalesce(v_mon, '') END),
            '/analisis/cobros-pagos?ver=pagar', true);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- El aviso a Finanzas nunca frena la orden de carga
    RAISE WARNING 'No se pudo armar el pago de la orden %: %', NEW.numero, SQLERRM;
    RETURN NEW;
END $f$;



CREATE OR REPLACE FUNCTION fin.fn_pagos_carga(p_todos boolean DEFAULT false)
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
                   'litros', g.litros, 'precio', g.precio, 'moneda', g.moneda, 'importe', g.importe, 'litros_max', g.litros_max, 'importe_max', g.importe_max,
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


-- Las pendientes: máximo y litros de nuevo (sin pasar el máximo)
UPDATE fin.pago_carga g
   SET litros_max = x.mx, importe_max = round(x.mx * g.precio, 0),
       litros = CASE WHEN x.lit IS NULL THEN g.litros WHEN x.mx IS NOT NULL THEN least(x.lit, x.mx) ELSE x.lit END,
       importe = round(CASE WHEN x.lit IS NULL THEN g.litros WHEN x.mx IS NOT NULL THEN least(x.lit, x.mx) ELSE x.lit END * g.precio, 0)
  FROM (SELECT g2.id, fin.fn_litros_orden_para_pago(g2.orden_id) AS lit, fin.fn_litros_max_orden(g2.orden_id) AS mx
          FROM fin.pago_carga g2 WHERE g2.estado = 'pendiente') x
 WHERE g.id = x.id;

UPDATE ref.parametro SET valor = '294' WHERE codigo = 'web.version_base' AND valor::text::int < 294;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 294 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(o.numero || ': ' || coalesce(g.litros::text || ' L', 'sin litros') || ' · máx. ' || coalesce(g.litros_max::text || ' L', '?')
                          || ' · ' || coalesce('$' || g.importe::text, 'hasta $' || g.importe_max::text, 'sin monto'), ' | ')
          FROM fin.pago_carga g JOIN fue.orden_carga o ON o.id = g.orden_id WHERE g.estado = 'pendiente') AS pendientes;
