-- =====================================================================================
-- Migración 308 · Cotizador como las presentaciones: el costo de un viaje por días, gasoil y vacíos
-- =====================================================================================
-- Pedido (24/11/2026): «el cotizador no está andando bien, es muy distinto a los números de las presentaciones».
-- Entre Ríos → Coronel daba 5.711 USD de costo; en la presentación del 24/11 son 3.848. Lo que estaba mal (305):
--   · dividía todos los costos de la contabilidad por los km de telemetría, que están incompletos (en octubre
--     ~3.070 km por camión, cuando hacen 8.000 a 9.500): el costo por km salía inflado;
--   · usaba los km nominales de la línea (2.140) y no los medidos (2.464), y no sumaba los vacíos;
--   · el margen era sobre el costo; en las presentaciones es sobre el precio (ganancia ÷ precio).
-- Ahora el costo de un viaje es la suma de sus tramos: vacío hasta el origen, cargado y vacío hasta la base.
-- Cada tramo: gasoil (km × consumo × precio de las últimas cargas en Chile) + días × (fijo del camión + chofer)
-- + peajes + neumáticos. El cargado suma el canon del chofer que pase del normal, con cargas sociales.
--   1 · Valores de la base (ref.parametro ven.*): fijo y chofer por día, consumos, neumáticos, peajes por km,
--       km por día, canon normal, margen mínimo y las bases de los vacíos (San Antonio y Buenos Aires).
--   2 · ven.tramo_estandar: km, días, consumo y peajes medidos de un tramo (se guardan desde el cotizador).
--       Sin estándar: km de la ruta o del mapa (quedan guardados en ven.km_lugares), días estimados por los km,
--       y consumo y peajes de la base.
--   3 · ven.fn_cotizar_viaje(origen, destino, opciones): el viaje tramo por tramo, el costo y el precio sugerido.
--       Opciones: la ruta, de dónde viene vacío y a dónde vuelve (por defecto, la base más cercana), km y días a mano.
--       ven.fn_cotizar_guardar guarda la cotización con ese mismo costo.
--   4 · ven.fn_costo_viaje (tarifario, sugerencia y editor de cotizaciones) usa el mismo cálculo, sin consultar el mapa.
--   5 · El margen es sobre el precio en el cotizador, la sugerencia y las cotizaciones: precio = costo ÷ (1 − margen).
--   6 · Se borran las funciones de la 305 que ya no se usan (costo por km de la contabilidad y cotizar por km) y sus
--       parámetros; ven.fn_costo_km_usd vuelve a ser el de antes (a mano o de los viajes; ya no se usa para cotizar).
-- No cambia las cotizaciones guardadas. Va después de la 307 (velocidad por zona de montaña, del otro chat).
-- web.version_base = 308.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 307 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la 306 (20261124220000_notificaciones_pendientes.sql) y la 307 (20261124230000_velocidad_por_zona_de_montana.sql, del otro chat). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF to_regclass('ven.tramo_estandar') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 308 ya está aplicada';
    END IF;
    IF to_regprocedure('ven.fn_cotizar_guardar(jsonb)') IS NULL OR to_regprocedure('ven.fn_costo_viaje(bigint, boolean)') IS NULL THEN
        RAISE EXCEPTION 'Falta el cotizador de la migración 305 (20261124210000_cotizador_simple.sql)';
    END IF;
END $v$;

-- Copia los permisos de ejecución de una función a otra: solo roles tc_* (nunca tc_cliente) y authenticated (como la 297)
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT r.rolname FROM pg_roles r
              WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, p_de, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, g);
        END IF;
    END LOOP;
END $fn$;

-- Funciones internas: solo las usan otras funciones de la base
CREATE FUNCTION pg_temp.fn_solo_interna(p_fn regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_fn, g);
    END LOOP;
END $fn$;

-- Reemplazo con control: el texto viejo tiene que aparecer exactamente las veces esperadas
-- (CREATE OR REPLACE conserva los permisos de la función)
CREATE FUNCTION pg_temp.fn_reemplazar(p_fn regprocedure, p_viejo text, p_nuevo text, p_veces integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_def text := pg_get_functiondef(p_fn); n integer;
BEGIN
    n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
    IF n <> p_veces THEN
        RAISE EXCEPTION '% no es la que esperaba esta migración (aparece % veces y se esperaban %): avisar antes de seguir', p_fn, n, p_veces;
    END IF;
    EXECUTE replace(v_def, p_viejo, p_nuevo);
END $fn$;

-- ---------------------------------------------------------------------------------
-- 1 · Valores de la base (Gerencia los cambia desde el cotizador)
-- ---------------------------------------------------------------------------------
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor::jsonb, x.descripcion || ' (Migración 308)'
  FROM (VALUES
    ('ven.fijo_dia_usd', '119.5', 'Cotizador: costo fijo de un camión por día en USD (leasing, estructura, amortización, seguro y semirremolque; promedio de la flota)'),
    ('ven.chofer_dia_usd', '58', 'Cotizador: costo del chofer por día en USD (sueldo con cargas sociales)'),
    ('ven.consumo_cargado_l100', '38.5', 'Cotizador: litros cada 100 km cargado, si el tramo no tiene uno medido'),
    ('ven.consumo_vacio_l100', '29', 'Cotizador: litros cada 100 km vacío, si el tramo no tiene uno medido'),
    ('ven.neumaticos_usd_km', '0.028', 'Cotizador: neumáticos en USD por km'),
    ('ven.peajes_usd_km', '0.065', 'Cotizador: peajes y tasas en USD por km, si el tramo no tiene los suyos'),
    ('ven.gasoil_clp_litro', '1488', 'Cotizador: precio del gasoil en CLP por litro cuando no hay cargas en Chile en los últimos días'),
    ('ven.gasoil_dias', '15', 'Cotizador: días de cargas en Chile que se promedian para el precio del gasoil'),
    ('ven.km_dia_cargado', '600', 'Cotizador: km por día cargado, para estimar los días de un tramo sin estándar'),
    ('ven.dias_extra_cargado', '1.5', 'Cotizador: días que se suman al tramo cargado por carga, descarga y aduana'),
    ('ven.km_dia_vacio', '480', 'Cotizador: km por día vacío, para estimar los días de un tramo sin estándar'),
    ('ven.canon_normal_clp', '80000', 'Cotizador: canon normal del chofer por viaje en CLP (ya está en el costo del chofer por día; se suma lo que una línea pague de más)'),
    ('ven.cargas_sociales_pct', '30', 'Cotizador: cargas sociales sobre el canon de más del chofer (%)'),
    ('ven.margen_minimo_pct', '12', 'Cotizador: margen mínimo sobre el precio; debajo se marca en rojo (%)'),
    ('ven.margen_objetivo_pct', '20', 'Ventas: margen objetivo sobre el precio (%)')
  ) x(codigo, valor, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

-- El margen objetivo pasa a ser sobre el precio (antes se sumaba al costo)
UPDATE ref.parametro SET descripcion = 'Ventas: margen objetivo sobre el precio: precio = costo ÷ (1 − margen) (%) (Migración 308)'
 WHERE codigo = 'ven.margen_objetivo_pct' AND descripcion NOT LIKE '%sobre el precio%';

-- Las bases de los vacíos: San Antonio y Buenos Aires (el lugar con más rutas de cada uno)
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ven.bases_vacios',
       coalesce((SELECT jsonb_agg(b.id ORDER BY b.pais DESC)
                   FROM (SELECT DISTINCT ON (u.pais) u.id, u.pais
                           FROM mae.ubicacion u
                          WHERE u.eliminado_en IS NULL AND u.latitud IS NOT NULL
                            AND ((u.pais = 'CL' AND (upper(btrim(u.codigo)) IN ('SAI', 'SAN', 'SANANTONIO') OR u.nombre ILIKE 'san antonio%'))
                              OR (u.pais = 'AR' AND (upper(btrim(u.codigo)) IN ('BSAS', 'BUE', 'BA', 'CABA', 'BAS') OR u.nombre ILIKE 'buenos aires%')))
                          ORDER BY u.pais,
                                   (SELECT count(*) FROM mae.linea l WHERE l.eliminado_en IS NULL AND u.id IN (l.lugar_retiro_id, l.lugar_entrega_id)) DESC,
                                   u.id) b), '[]'::jsonb),
       'Cotizador: lugares donde empiezan y terminan los vacíos: el camión viene vacío desde la más cercana al origen y vuelve vacío a la más cercana al destino (Migración 308)'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ven.bases_vacios');

-- Los parámetros del costo por km contable de la 305 ya no se usan
UPDATE ref.parametro SET eliminado_en = now()
 WHERE codigo IN ('ven.meses_costo_contable', 'ven.costo_incluye_mes_actual', 'ven.combustible_de_cargas',
                  'ven.cuentas_fuera_del_costo', 'ven.costo_contable_desde')
   AND eliminado_en IS NULL;

-- ---------------------------------------------------------------------------------
-- 2 · Tramos estándar y km del mapa
-- ---------------------------------------------------------------------------------
CREATE TABLE ven.tramo_estandar (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    desde_id        bigint NOT NULL REFERENCES mae.ubicacion (id) ON DELETE RESTRICT,
    hasta_id        bigint NOT NULL REFERENCES mae.ubicacion (id) ON DELETE RESTRICT,
    linea_id        bigint REFERENCES mae.linea (id) ON DELETE RESTRICT,
    km              numeric(8,1) NOT NULL,
    dias            numeric(4,1) NOT NULL,
    consumo_l100    numeric(5,2),
    peajes_usd      numeric(10,2),
    nota            text,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    eliminado_en    timestamptz,
    eliminado_por   bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    version_fila    integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_tramo_lugares CHECK (desde_id <> hasta_id),
    CONSTRAINT ck_tramo_km CHECK (km > 0 AND km <= 10000),
    CONSTRAINT ck_tramo_dias CHECK (dias >= 0 AND dias <= 60),
    CONSTRAINT ck_tramo_consumo CHECK (consumo_l100 IS NULL OR consumo_l100 BETWEEN 10 AND 80),
    CONSTRAINT ck_tramo_peajes CHECK (peajes_usd IS NULL OR peajes_usd BETWEEN 0 AND 5000),
    CONSTRAINT ck_tramo_nota CHECK (nota IS NULL OR length(nota) <= 300)
);
COMMENT ON TABLE ven.tramo_estandar IS
    'Cotizador (Migración 308): km, días, consumo y peajes medidos de un tramo (con su ruta o entre dos lugares). Manda sobre los valores de la base.';
CREATE UNIQUE INDEX ux_tramo_estandar ON ven.tramo_estandar (desde_id, hasta_id, coalesce(linea_id, 0)) WHERE eliminado_en IS NULL;
CREATE TRIGGER tg_05_impedir_borrado BEFORE DELETE ON ven.tramo_estandar FOR EACH ROW EXECUTE FUNCTION aud.fn_impedir_borrado_fisico();
CREATE TRIGGER tg_08_solo_funciones BEFORE INSERT OR UPDATE ON ven.tramo_estandar FOR EACH ROW EXECUTE FUNCTION ven.fn_solo_funciones();
CREATE TRIGGER tg_10_columnas_control BEFORE INSERT OR UPDATE ON ven.tramo_estandar FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_control();
CREATE TRIGGER tg_20_soft_delete BEFORE UPDATE ON ven.tramo_estandar FOR EACH ROW EXECUTE FUNCTION aud.fn_soft_delete();
CREATE TRIGGER tg_90_auditoria AFTER INSERT OR DELETE OR UPDATE ON ven.tramo_estandar FOR EACH ROW EXECUTE FUNCTION aud.fn_auditar();

CREATE TABLE ven.km_lugares (
    desde_id     bigint NOT NULL REFERENCES mae.ubicacion (id) ON DELETE CASCADE,
    hasta_id     bigint NOT NULL REFERENCES mae.ubicacion (id) ON DELETE CASCADE,
    km           numeric(8,1) NOT NULL CHECK (km > 0),
    calculado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (desde_id, hasta_id)
);
COMMENT ON TABLE ven.km_lugares IS
    'Cotizador (Migración 308): km por camino entre dos lugares que ya dio el mapa (para no volver a consultarlo). Se recalcula si cambia un lugar.';

-- Las tablas se leen y escriben solo desde las funciones
DO $r$
DECLARE g text;
BEGIN
    REVOKE ALL ON ven.tramo_estandar, ven.km_lugares FROM PUBLIC;
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon', 'service_role') LOOP
        EXECUTE format('REVOKE ALL ON ven.tramo_estandar, ven.km_lugares FROM %I', g);
    END LOOP;
END $r$;

-- ---------------------------------------------------------------------------------
-- 3 · El cálculo (funciones internas)
-- ---------------------------------------------------------------------------------
-- Un número opcional de las opciones, dentro de su rango (si no, el mensaje)
CREATE FUNCTION ven.fn_opcion_num(p_op jsonb, p_clave text, p_min numeric, p_max numeric, p_mensaje text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE x text := nullif(btrim(coalesce(p_op ->> p_clave, '')), ''); n numeric;
BEGIN
    IF x IS NULL THEN RETURN NULL; END IF;
    BEGIN
        n := x::numeric;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '%', p_mensaje USING ERRCODE = '22023';
    END;
    IF n < p_min OR n > p_max THEN RAISE EXCEPTION '%', p_mensaje USING ERRCODE = '22023'; END IF;
    RETURN n;
END $f$;

-- Las bases de los vacíos (lugares vigentes)
CREATE FUNCTION ven.fn_bases_vacios()
RETURNS bigint[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(array_agg(u.id ORDER BY u.id), '{}')
      FROM mae.ubicacion u
     WHERE u.eliminado_en IS NULL
       AND u.id IN (SELECT (e #>> '{}')::bigint
                      FROM ref.parametro p,
                           jsonb_array_elements(CASE WHEN jsonb_typeof(p.valor) = 'array' THEN p.valor ELSE '[]'::jsonb END) e
                     WHERE p.codigo = 'ven.bases_vacios' AND p.eliminado_en IS NULL)
$f$;

-- La base más cercana a un lugar (en línea recta); si el lugar es una base, él mismo
CREATE FUNCTION ven.fn_base_mas_cercana(p_lugar bigint, p_bases bigint[])
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT b.id
      FROM mae.ubicacion u JOIN mae.ubicacion b ON b.id = ANY (p_bases)
     WHERE u.id = p_lugar AND u.geom IS NOT NULL AND b.geom IS NOT NULL
     ORDER BY extensions.ST_Distance(u.geom, b.geom), b.id
     LIMIT 1
$f$;

-- Los valores con que se calcula: la base y el precio del gasoil (promedio de las últimas cargas en Chile)
CREATE FUNCTION ven.fn_valores_cotizador()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_dias integer := greatest(1, least(90, round(ref.fn_parametro_num('ven.gasoil_dias', 15))))::integer;
    v_fijo numeric := ref.fn_parametro_num('ven.gasoil_clp_litro', 1488);
    v_clp_usd numeric; c record; v_clp numeric; v_de_cargas boolean;
BEGIN
    -- CLP por dólar (ven.fn_a_usd redondea a centavos: se convierte un millón)
    v_clp_usd := round(1000000 / nullif(ven.fn_a_usd(1000000, 'CLP'), 0), 2);
    SELECT count(*) AS cargas, sum(k.litros) AS litros, sum(k.litros * k.precio_unitario) / nullif(sum(k.litros), 0) AS precio
      INTO c
      FROM fue.carga_combustible k
     WHERE k.moneda = 'CLP' AND k.camion_id IS NOT NULL AND k.tanque_reefer_id IS NULL AND k.deposito_id IS NULL
       AND k.eliminado_en IS NULL AND coalesce(k.estado_validacion, '') <> 'anulada'
       AND k.precio_unitario BETWEEN 500 AND 5000
       AND k.fecha_hora >= now() - make_interval(days => v_dias);
    v_de_cargas := coalesce(c.litros, 0) >= 300;
    v_clp := CASE WHEN v_de_cargas THEN round(c.precio, 1) ELSE v_fijo END;
    RETURN jsonb_build_object(
        'fijo_dia_usd', ref.fn_parametro_num('ven.fijo_dia_usd', 119.5),
        'chofer_dia_usd', ref.fn_parametro_num('ven.chofer_dia_usd', 58),
        'consumo_cargado_l100', ref.fn_parametro_num('ven.consumo_cargado_l100', 38.5),
        'consumo_vacio_l100', ref.fn_parametro_num('ven.consumo_vacio_l100', 29),
        'neumaticos_usd_km', ref.fn_parametro_num('ven.neumaticos_usd_km', 0.028),
        'peajes_usd_km', ref.fn_parametro_num('ven.peajes_usd_km', 0.065),
        'km_dia_cargado', greatest(1, ref.fn_parametro_num('ven.km_dia_cargado', 600)),
        'dias_extra_cargado', ref.fn_parametro_num('ven.dias_extra_cargado', 1.5),
        'km_dia_vacio', greatest(1, ref.fn_parametro_num('ven.km_dia_vacio', 480)),
        'canon_normal_clp', ref.fn_parametro_num('ven.canon_normal_clp', 80000),
        'cargas_sociales_pct', ref.fn_parametro_num('ven.cargas_sociales_pct', 30),
        'margen_objetivo_pct', least(ref.fn_parametro_num('ven.margen_objetivo_pct', 20), 90),
        'margen_minimo_pct', ref.fn_parametro_num('ven.margen_minimo_pct', 12),
        'gasoil_clp_litro_fijo', v_fijo, 'gasoil_dias', v_dias,
        'gasoil_clp_litro', v_clp, 'gasoil_fuente', CASE WHEN v_de_cargas THEN 'cargas' ELSE 'fijo' END,
        'gasoil_cargas', coalesce(c.cargas, 0), 'gasoil_litros', round(coalesce(c.litros, 0)),
        'clp_por_usd', v_clp_usd, 'gasoil_usd_litro', round(v_clp / nullif(v_clp_usd, 0), 4),
        'bases', to_jsonb(ven.fn_bases_vacios()));
END $f$;

-- Km entre dos lugares: una ruta cargada (en cualquier sentido, si se pide) → el mapa ya consultado → el mapa
-- (si se pide; queda guardado) → la línea recta por el factor de camino
CREATE FUNCTION ven.fn_km_lugares(p_desde bigint, p_hasta bigint, p_mapa boolean DEFAULT false, p_rutas boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o mae.ubicacion%ROWTYPE; d mae.ubicacion%ROWTYPE; x record; m record; v_km numeric; v_recta numeric;
BEGIN
    SELECT * INTO o FROM mae.ubicacion WHERE id = p_desde;
    SELECT * INTO d FROM mae.ubicacion WHERE id = p_hasta;
    IF p_rutas THEN
        SELECT l.codigo, l.distancia_km INTO x FROM mae.linea l
         WHERE l.eliminado_en IS NULL AND l.distancia_km > 0
           AND ((l.lugar_retiro_id = p_desde AND l.lugar_entrega_id = p_hasta) OR (l.lugar_retiro_id = p_hasta AND l.lugar_entrega_id = p_desde))
         ORDER BY (l.lugar_retiro_id = p_desde) DESC, l.activa DESC, l.id
         LIMIT 1;
        IF FOUND THEN RETURN jsonb_build_object('km', x.distancia_km, 'fuente', 'ruta', 'ruta', x.codigo); END IF;
    END IF;
    IF o.geom IS NULL OR d.geom IS NULL THEN
        RETURN jsonb_build_object('km', NULL, 'fuente', NULL,
            'falta', format('%s no tiene la ubicación en el mapa: cargala en Configuración › Lugares',
                            CASE WHEN o.geom IS NULL THEN o.nombre ELSE d.nombre END));
    END IF;
    v_recta := round((extensions.ST_Distance(o.geom, d.geom) / 1000)::numeric);
    -- Una ubicación mal cargada (por ejemplo, con el signo cambiado) da distancias imposibles
    IF v_recta > 4000 THEN
        RETURN jsonb_build_object('km', NULL, 'fuente', NULL,
            'falta', format('%s tiene mal la ubicación en el mapa (%s): corregila en Configuración › Lugares',
                            CASE WHEN o.latitud > 0 OR o.longitud > 0 THEN o.nombre
                                 WHEN d.latitud > 0 OR d.longitud > 0 THEN d.nombre
                                 ELSE o.nombre || ' o ' || d.nombre END,
                            format('queda a %s km en línea recta de %s', v_recta,
                                   CASE WHEN (o.latitud > 0 OR o.longitud > 0) OR NOT (d.latitud > 0 OR d.longitud > 0) THEN d.nombre ELSE o.nombre END)));
    END IF;
    SELECT k.km INTO v_km FROM ven.km_lugares k
     WHERE ((k.desde_id = p_desde AND k.hasta_id = p_hasta) OR (k.desde_id = p_hasta AND k.hasta_id = p_desde))
       AND k.calculado_en >= greatest(o.actualizado_en, d.actualizado_en)
     ORDER BY (k.desde_id = p_desde) DESC
     LIMIT 1;
    IF v_km IS NOT NULL THEN RETURN jsonb_build_object('km', v_km, 'fuente', 'mapa'); END IF;
    IF p_mapa THEN
        SELECT * INTO m FROM tel.fn_osrm_camino(jsonb_build_array(jsonb_build_object('lat', o.latitud, 'lng', o.longitud),
                                                                  jsonb_build_object('lat', d.latitud, 'lng', d.longitud)));
        IF m.km > 0 THEN
            v_km := round(m.km);
            INSERT INTO ven.km_lugares (desde_id, hasta_id, km, calculado_en) VALUES (p_desde, p_hasta, v_km, now())
            ON CONFLICT (desde_id, hasta_id) DO UPDATE SET km = EXCLUDED.km, calculado_en = EXCLUDED.calculado_en;
            RETURN jsonb_build_object('km', v_km, 'fuente', 'mapa');
        END IF;
    END IF;
    RETURN jsonb_build_object('km', greatest(1, round(v_recta * ref.fn_parametro_num('fue.orden_factor_camino', 1.3))), 'fuente', 'recta',
        'aviso', format('Los km de %s a %s son estimados en línea recta%s', o.nombre, d.nombre,
                        CASE WHEN p_mapa THEN ' (el mapa no respondió: corregilos a mano)' ELSE '' END));
END $f$;

-- Un tramo del viaje: km, días, litros y su costo (gasoil, camión y chofer, canon de más, peajes y neumáticos)
--   km:   a mano → estándar del tramo → la ruta → el mapa
--   días: a mano → estándar → estimados (cargado: km ÷ km por día + días de carga y descarga; vacío: km ÷ km por día)
CREATE FUNCTION ven.fn_tramo(p_tipo text, p_desde bigint, p_hasta bigint, p_linea bigint, p_km numeric, p_dias numeric,
                             p_mapa boolean, v jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_cargado CONSTANT boolean := p_tipo = 'cargado';
    e ven.tramo_estandar%ROWTYPE; l mae.linea%ROWTYPE; k jsonb := '{}';
    v_km numeric; v_fkm text; v_dias numeric; v_fdias text; v_cons numeric; v_peajes numeric; v_fpeajes text;
    v_litros numeric; v_gasoil numeric; v_cc numeric; v_canon numeric := 0; v_neum numeric; v_total numeric;
    v_canon_usd numeric; v_normal_usd numeric; v_aviso text;
BEGIN
    IF p_linea IS NOT NULL THEN SELECT * INTO l FROM mae.linea WHERE id = p_linea; END IF;
    -- El estándar del tramo: el de su ruta y, si no hay, el de los dos lugares
    SELECT * INTO e FROM ven.tramo_estandar t
     WHERE t.eliminado_en IS NULL AND t.desde_id = p_desde AND t.hasta_id = p_hasta
       AND (t.linea_id IS NULL OR t.linea_id = p_linea)
     ORDER BY t.linea_id NULLS LAST
     LIMIT 1;

    IF p_km IS NOT NULL THEN v_km := p_km; v_fkm := 'a_mano';
    ELSIF e.id IS NOT NULL THEN v_km := e.km; v_fkm := 'estandar';
    ELSIF l.distancia_km > 0 THEN v_km := l.distancia_km; v_fkm := 'ruta';
    ELSE
        k := ven.fn_km_lugares(p_desde, p_hasta, p_mapa, NOT v_cargado);
        v_km := (k ->> 'km')::numeric; v_fkm := k ->> 'fuente';
    END IF;

    IF p_dias IS NOT NULL THEN v_dias := p_dias; v_fdias := 'a_mano';
    ELSIF e.id IS NOT NULL THEN v_dias := e.dias; v_fdias := 'estandar';
    ELSIF v_km IS NOT NULL THEN
        v_fdias := 'estimado';
        v_dias := round(CASE WHEN v_cargado
                             THEN greatest(1, round((v_km / (v ->> 'km_dia_cargado')::numeric + (v ->> 'dias_extra_cargado')::numeric) * 2) / 2)
                             WHEN v_km < 50 THEN 0
                             ELSE greatest(0.5, round(v_km / (v ->> 'km_dia_vacio')::numeric * 2) / 2) END, 1);
    END IF;

    v_cons := coalesce(e.consumo_l100, (v ->> CASE WHEN v_cargado THEN 'consumo_cargado_l100' ELSE 'consumo_vacio_l100' END)::numeric);
    IF e.peajes_usd IS NOT NULL THEN
        v_peajes := e.peajes_usd; v_fpeajes := 'estandar';
    ELSE
        v_peajes := round(v_km * (v ->> 'peajes_usd_km')::numeric, 2); v_fpeajes := 'por_km';
    END IF;

    -- Canon: lo que la línea le paga al chofer de más sobre el normal (que ya está en el costo por día), con cargas sociales
    IF v_cargado AND l.canon_chofer > 0 THEN
        v_canon_usd := ven.fn_a_usd(l.canon_chofer, coalesce(l.canon_moneda, 'CLP'));
        v_normal_usd := ven.fn_a_usd((v ->> 'canon_normal_clp')::numeric, 'CLP');
        IF v_canon_usd IS NULL OR v_normal_usd IS NULL THEN
            v_aviso := 'Falta el tipo de cambio para el canon del chofer: no se sumó';
        ELSE
            v_canon := round(greatest(0, v_canon_usd - v_normal_usd) * (1 + (v ->> 'cargas_sociales_pct')::numeric / 100), 2);
        END IF;
    END IF;

    IF v_km IS NOT NULL AND v_dias IS NOT NULL THEN
        v_litros := round(v_km * v_cons / 100, 1);
        v_gasoil := round(v_litros * (v ->> 'gasoil_usd_litro')::numeric, 2);
        v_cc := round(v_dias * ((v ->> 'fijo_dia_usd')::numeric + (v ->> 'chofer_dia_usd')::numeric), 2);
        v_neum := round(v_km * (v ->> 'neumaticos_usd_km')::numeric, 2);
        v_total := v_gasoil + v_cc + v_canon + v_peajes + v_neum;
    END IF;

    RETURN jsonb_build_object(
        'tipo', p_tipo,
        'desde_id', p_desde, 'desde', (SELECT nombre FROM mae.ubicacion WHERE id = p_desde),
        'hasta_id', p_hasta, 'hasta', (SELECT nombre FROM mae.ubicacion WHERE id = p_hasta),
        'linea_id', l.id, 'ruta', l.codigo,
        'km', v_km, 'fuente_km', v_fkm, 'dias', v_dias, 'fuente_dias', v_fdias,
        'consumo_l100', v_cons, 'fuente_consumo', CASE WHEN e.consumo_l100 IS NOT NULL THEN 'estandar' ELSE 'base' END,
        'litros', v_litros, 'gasoil_usd', v_gasoil, 'camion_chofer_usd', v_cc, 'canon_usd', v_canon,
        'peajes_usd', v_peajes, 'fuente_peajes', v_fpeajes, 'neumaticos_usd', v_neum, 'total_usd', v_total,
        'estandar', CASE WHEN e.id IS NOT NULL THEN jsonb_build_object('id', e.id, 'linea_id', e.linea_id, 'km', e.km, 'dias', e.dias,
                                                                       'consumo_l100', e.consumo_l100, 'peajes_usd', e.peajes_usd) END,
        'falta', k ->> 'falta', 'aviso', coalesce(v_aviso, k ->> 'aviso'));
END $f$;

-- El viaje completo: vacío hasta el origen, cargado y vacío hasta la base
-- Opciones: linea_id (vacío = la primera ruta cargada; 0 = el mapa), vacio_desde y vacio_hasta (vacío = la base más
-- cercana; 0 = sin vacío; o un lugar), km_* y dias_* a mano por tramo (vacio_ida, cargado, vacio_vuelta) y mapa (consultar el mapa)
CREATE FUNCTION ven.fn_costo_viaje_detalle(p_origen bigint, p_destino bigint, p_opciones jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    op CONSTANT jsonb := coalesce(p_opciones, '{}');
    v CONSTANT jsonb := ven.fn_valores_cotizador();
    v_mapa CONSTANT boolean := coalesce((op ->> 'mapa')::boolean, false);
    c_km CONSTANT text := 'Los km de cada tramo van de 1 a 10.000';
    c_dias CONSTANT text := 'Los días de cada tramo van de 0 a 60';
    v_bases bigint[]; v_rutas jsonb; v_linea bigint; v_desde bigint; v_hasta bigint; v_tramos jsonb := '[]';
    v_avisos jsonb := '[]'; v_falta text; s record;
BEGIN
    v_bases := ARRAY(SELECT (x #>> '{}')::bigint FROM jsonb_array_elements(coalesce(v -> 'bases', '[]')) x);

    -- La ruta: la elegida, la primera cargada entre esos lugares o el mapa (0)
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'km', x.distancia_km) ORDER BY x.activa DESC, x.id), '[]')
      INTO v_rutas
      FROM mae.linea x
     WHERE x.eliminado_en IS NULL AND x.lugar_retiro_id = p_origen AND x.lugar_entrega_id = p_destino;
    v_linea := ven.fn_opcion_num(op, 'linea_id', 0, 9e15, 'Elegí la ruta de nuevo')::bigint;
    IF v_linea IS NULL THEN
        v_linea := (v_rutas -> 0 ->> 'id')::bigint;
    ELSIF v_linea = 0 THEN
        v_linea := NULL;
    ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_rutas) r WHERE (r ->> 'id')::bigint = v_linea) THEN
        RAISE EXCEPTION 'Esa ruta no va de % a %', (SELECT nombre FROM mae.ubicacion WHERE id = p_origen),
            (SELECT nombre FROM mae.ubicacion WHERE id = p_destino) USING ERRCODE = '22023';
    END IF;

    -- Los vacíos: de dónde viene el camión y a dónde vuelve
    v_desde := ven.fn_opcion_num(op, 'vacio_desde', 0, 9e15, 'Elegí de nuevo de dónde viene vacío')::bigint;
    v_hasta := ven.fn_opcion_num(op, 'vacio_hasta', 0, 9e15, 'Elegí de nuevo a dónde vuelve vacío')::bigint;
    IF v_desde > 0 AND NOT EXISTS (SELECT 1 FROM mae.ubicacion WHERE id = v_desde AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El lugar de donde viene vacío no existe' USING ERRCODE = '22023';
    END IF;
    IF v_hasta > 0 AND NOT EXISTS (SELECT 1 FROM mae.ubicacion WHERE id = v_hasta AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El lugar a donde vuelve vacío no existe' USING ERRCODE = '22023';
    END IF;
    IF v_desde IS NULL OR v_hasta IS NULL THEN
        IF cardinality(v_bases) = 0 THEN
            v_avisos := v_avisos || to_jsonb('No hay bases para los vacíos: elegilas en «De dónde salen los valores»'::text);
        ELSE
            IF v_desde IS NULL THEN
                v_desde := ven.fn_base_mas_cercana(p_origen, v_bases);
                IF v_desde IS NULL THEN
                    v_avisos := v_avisos || to_jsonb(format('%s no tiene la ubicación en el mapa: no se sumó el vacío desde la base',
                                                            (SELECT nombre FROM mae.ubicacion WHERE id = p_origen)));
                END IF;
            END IF;
            IF v_hasta IS NULL THEN
                v_hasta := ven.fn_base_mas_cercana(p_destino, v_bases);
                IF v_hasta IS NULL THEN
                    v_avisos := v_avisos || to_jsonb(format('%s no tiene la ubicación en el mapa: no se sumó el vacío hasta la base',
                                                            (SELECT nombre FROM mae.ubicacion WHERE id = p_destino)));
                END IF;
            END IF;
        END IF;
    END IF;
    v_desde := nullif(v_desde, 0);
    v_hasta := nullif(v_hasta, 0);

    IF v_desde IS NOT NULL AND v_desde <> p_origen THEN
        v_tramos := v_tramos || ven.fn_tramo('vacio_ida', v_desde, p_origen, NULL,
                                             ven.fn_opcion_num(op, 'km_vacio_ida', 1, 10000, c_km),
                                             ven.fn_opcion_num(op, 'dias_vacio_ida', 0, 60, c_dias), v_mapa, v);
    END IF;
    v_tramos := v_tramos || ven.fn_tramo('cargado', p_origen, p_destino, v_linea,
                                         ven.fn_opcion_num(op, 'km_cargado', 1, 10000, c_km),
                                         ven.fn_opcion_num(op, 'dias_cargado', 0, 60, c_dias), v_mapa, v);
    IF v_hasta IS NOT NULL AND v_hasta <> p_destino THEN
        v_tramos := v_tramos || ven.fn_tramo('vacio_vuelta', p_destino, v_hasta, NULL,
                                             ven.fn_opcion_num(op, 'km_vacio_vuelta', 1, 10000, c_km),
                                             ven.fn_opcion_num(op, 'dias_vacio_vuelta', 0, 60, c_dias), v_mapa, v);
    END IF;

    SELECT sum((x ->> 'km')::numeric) AS km,
           sum((x ->> 'km')::numeric) FILTER (WHERE x ->> 'tipo' = 'cargado') AS km_cargado,
           sum((x ->> 'dias')::numeric) AS dias, sum((x ->> 'litros')::numeric) AS litros,
           sum((x ->> 'gasoil_usd')::numeric) AS gasoil, sum((x ->> 'camion_chofer_usd')::numeric) AS cc,
           sum((x ->> 'canon_usd')::numeric) AS canon, sum((x ->> 'peajes_usd')::numeric) AS peajes,
           sum((x ->> 'neumaticos_usd')::numeric) AS neum, sum((x ->> 'total_usd')::numeric) AS total,
           bool_or(x ->> 'total_usd' IS NULL) AS incompleto,
           (array_agg(x ->> 'falta') FILTER (WHERE x ->> 'falta' IS NOT NULL))[1] AS falta,
           coalesce(jsonb_agg(x -> 'aviso') FILTER (WHERE x ->> 'aviso' IS NOT NULL), '[]') AS avisos
      INTO s
      FROM jsonb_array_elements(v_tramos) x;
    v_falta := coalesce(s.falta,
                        CASE WHEN (v ->> 'gasoil_usd_litro') IS NULL THEN 'Falta el tipo de cambio del peso chileno (Finanzas › Tipos de cambio)' END,
                        CASE WHEN s.incompleto THEN 'No se pudo calcular un tramo' END);

    RETURN jsonb_build_object(
        'origen_id', p_origen, 'origen', (SELECT nombre FROM mae.ubicacion WHERE id = p_origen),
        'destino_id', p_destino, 'destino', (SELECT nombre FROM mae.ubicacion WHERE id = p_destino),
        'rutas', v_rutas, 'linea_id', v_linea, 'ruta', (SELECT codigo FROM mae.linea WHERE id = v_linea),
        'vacio_desde_id', v_desde, 'vacio_desde', (SELECT nombre FROM mae.ubicacion WHERE id = v_desde),
        'vacio_hasta_id', v_hasta, 'vacio_hasta', (SELECT nombre FROM mae.ubicacion WHERE id = v_hasta),
        'tramos', v_tramos,
        'km_total', s.km, 'km_cargado', s.km_cargado, 'km_vacio', s.km - s.km_cargado, 'dias', s.dias, 'litros', s.litros,
        'gasoil_usd', s.gasoil, 'camion_chofer_usd', s.cc, 'canon_usd', s.canon, 'peajes_usd', s.peajes, 'neumaticos_usd', s.neum,
        'costo_usd', CASE WHEN v_falta IS NULL THEN round(s.total, 2) END,
        'valores', v - 'bases',
        'falta', v_falta, 'avisos', v_avisos || s.avisos);
END $f$;

-- El costo de una ruta (tarifario, sugerencia y editor de cotizaciones): el mismo cálculo, sin consultar el mapa.
-- Con «vuelve vacío»: va cargado y vuelve vacío al origen (sin vacío previo).
CREATE OR REPLACE FUNCTION ven.fn_costo_viaje(p_linea bigint, p_vuelta_vacia boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l mae.linea%ROWTYPE; r jsonb;
BEGIN
    SELECT * INTO l FROM mae.linea WHERE id = p_linea;
    IF NOT FOUND THEN RETURN NULL; END IF;
    r := ven.fn_costo_viaje_detalle(l.lugar_retiro_id, l.lugar_entrega_id,
             jsonb_build_object('linea_id', l.id)
             || CASE WHEN coalesce(p_vuelta_vacia, false) THEN jsonb_build_object('vacio_desde', 0, 'vacio_hasta', l.lugar_retiro_id)
                     ELSE '{}'::jsonb END);
    RETURN jsonb_build_object(
        'km', r -> 'km_total', 'km_cargado', r -> 'km_cargado', 'dias', r -> 'dias', 'fuente', 'viaje',
        'costo_km_usd', round((r ->> 'costo_usd')::numeric / nullif((r ->> 'km_total')::numeric, 0), 3),
        'canon_usd', r -> 'canon_usd', 'costo_usd', r -> 'costo_usd', 'falta', r -> 'falta', 'tramos', r -> 'tramos');
END $f$;

-- El costo por km de referencia vuelve a ser el de antes de la 305: a mano o el de los viajes (ya no se usa para cotizar)
CREATE OR REPLACE FUNCTION ven.fn_costo_km_usd()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF ref.fn_parametro_num('ven.costo_km_manual_usd', 0) > 0 THEN
        RETURN jsonb_build_object('costo_km_usd', ref.fn_parametro_num('ven.costo_km_manual_usd', 0), 'fuente', 'manual');
    END IF;
    RETURN (SELECT jsonb_build_object('costo_km_usd', x.costo_km_usd, 'fuente', 'viajes', 'viajes', x.viajes, 'km', x.km,
                                      'desde', x.desde, 'hasta', x.hasta, 'calculado_en', x.calculado_en)
              FROM ven.costo_referencia x ORDER BY x.id DESC LIMIT 1);
END $f$;

-- ---------------------------------------------------------------------------------
-- 4 · Cotizar y guardar
-- ---------------------------------------------------------------------------------
-- El viaje tramo por tramo, el costo y el precio con el margen sobre el precio. Opciones: las de
-- ven.fn_costo_viaje_detalle, margen_pct (vacío = el objetivo) y empresa_id (para la tarifa vigente del cliente).
CREATE FUNCTION ven.fn_cotizar_viaje(p_origen bigint, p_destino bigint, p_opciones jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    op CONSTANT jsonb := coalesce(p_opciones, '{}');
    r jsonb; v_margen numeric; v_costo numeric; v_precio numeric; v_emp bigint; v_cli bigint; v_tarifa numeric; v_tarifa_de text;
BEGIN
    PERFORM ven.fn_exigir_lectura();
    IF p_origen IS NULL OR p_destino IS NULL THEN RAISE EXCEPTION 'Elegí el origen y el destino' USING ERRCODE = '22023'; END IF;
    IF p_origen = p_destino THEN RAISE EXCEPTION 'El origen y el destino son el mismo lugar' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM mae.ubicacion WHERE id = p_origen AND eliminado_en IS NULL)
       OR NOT EXISTS (SELECT 1 FROM mae.ubicacion WHERE id = p_destino AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Ese lugar no existe' USING ERRCODE = '22023';
    END IF;
    v_margen := coalesce(ven.fn_opcion_num(op, 'margen_pct', 0, 90, 'El margen va de 0 a 90 % (es sobre el precio)'),
                         least(ref.fn_parametro_num('ven.margen_objetivo_pct', 20), 90));
    r := ven.fn_costo_viaje_detalle(p_origen, p_destino, op || jsonb_build_object('mapa', true));
    v_costo := (r ->> 'costo_usd')::numeric;
    IF v_costo IS NOT NULL THEN v_precio := ceil(v_costo / (1 - v_margen / 100) / 10) * 10; END IF;
    v_emp := ven.fn_opcion_num(op, 'empresa_id', 1, 9e15, 'Elegí la empresa de nuevo')::bigint;
    SELECT cliente_id INTO v_cli FROM ven.empresa WHERE id = v_emp;
    IF (r ->> 'linea_id') IS NOT NULL THEN
        SELECT t.precio_usd, CASE WHEN t.de_cliente THEN 'cliente' ELSE 'general' END INTO v_tarifa, v_tarifa_de
          FROM ven.fn_tarifa_vigente((r ->> 'linea_id')::bigint, v_cli, 'viaje', NULL) t;
    END IF;
    RETURN r || jsonb_build_object(
        'margen_pct', v_margen, 'precio_usd', v_precio,
        'precio_km_usd', round(v_precio / nullif((r ->> 'km_total')::numeric, 0), 3),
        'precio_km_cargado_usd', round(v_precio / nullif((r ->> 'km_cargado')::numeric, 0), 3),
        'tarifa_vigente_usd', v_tarifa, 'tarifa_de', v_tarifa_de);
END $f$;

-- Guardar como cotización para el cliente: con el mismo costo que mostró el cotizador (vacíos, días y km a mano)
CREATE OR REPLACE FUNCTION ven.fn_cotizar_guardar(p_datos jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    d jsonb := coalesce(p_datos, '{}'); v_emp bigint := nullif(d ->> 'empresa_id', '')::bigint; v_nombre text := btrim(coalesce(d ->> 'empresa_nombre', ''));
    v_origen bigint := nullif(d ->> 'origen_id', '')::bigint; v_destino bigint := nullif(d ->> 'destino_id', '')::bigint;
    v_precio numeric; v_viajes numeric; q jsonb; v_linea bigint; v_km numeric; o mae.ubicacion%ROWTYPE; de mae.ubicacion%ROWTYPE;
    v_cod text; i integer := 1; v_id bigint; v_costo numeric; v_obs text;
BEGIN
    PERFORM ven.fn_exigir_ventas();
    IF v_origen IS NULL OR v_destino IS NULL THEN RAISE EXCEPTION 'Elegí el origen y el destino' USING ERRCODE = '22023'; END IF;
    IF v_origen = v_destino THEN RAISE EXCEPTION 'El origen y el destino son el mismo lugar' USING ERRCODE = '22023'; END IF;
    v_precio := ven.fn_opcion_num(d, 'precio_usd', 1, 10000000, 'Falta el precio');
    IF v_precio IS NULL THEN RAISE EXCEPTION 'Falta el precio' USING ERRCODE = '22023'; END IF;
    v_viajes := coalesce(ven.fn_opcion_num(d, 'viajes', 1, 1000, '¿Cuántos viajes son? (de 1 a 1.000)'), 1);
    -- La empresa: la elegida o, si se escribió un nombre nuevo, un prospecto
    IF v_emp IS NULL THEN
        IF length(v_nombre) < 2 THEN RAISE EXCEPTION 'Elegí la empresa o escribí su nombre' USING ERRCODE = '22023'; END IF;
        SELECT id INTO v_emp FROM ven.empresa WHERE lower(btrim(nombre)) = lower(v_nombre) AND eliminado_en IS NULL LIMIT 1;
        IF v_emp IS NULL THEN v_emp := ven.fn_guardar_empresa(NULL, jsonb_build_object('nombre', v_nombre, 'origen', 'otro')); END IF;
    END IF;
    -- El costo con las mismas opciones que se vieron en el cotizador
    q := ven.fn_costo_viaje_detalle(v_origen, v_destino, d || jsonb_build_object('mapa', true));
    v_linea := nullif(q ->> 'linea_id', '')::bigint;
    -- Sin ruta cargada: se crea con los km del tramo cargado
    IF v_linea IS NULL THEN
        SELECT (x ->> 'km')::numeric INTO v_km FROM jsonb_array_elements(q -> 'tramos') x WHERE x ->> 'tipo' = 'cargado';
        IF v_km IS NULL THEN RAISE EXCEPTION '%', coalesce(q ->> 'falta', 'No se pudieron calcular los km') USING ERRCODE = '22023'; END IF;
        SELECT * INTO o FROM mae.ubicacion WHERE id = v_origen;
        SELECT * INTO de FROM mae.ubicacion WHERE id = v_destino;
        v_cod := left(regexp_replace(upper(coalesce(o.codigo, o.nombre)), '[^A-Z0-9]', '', 'g'), 12) || '-'
              || left(regexp_replace(upper(coalesce(de.codigo, de.nombre)), '[^A-Z0-9]', '', 'g'), 12);
        WHILE EXISTS (SELECT 1 FROM mae.linea WHERE codigo = v_cod || CASE WHEN i > 1 THEN '-' || i ELSE '' END AND eliminado_en IS NULL) LOOP
            i := i + 1;
        END LOOP;
        v_cod := v_cod || CASE WHEN i > 1 THEN '-' || i ELSE '' END;
        INSERT INTO mae.linea (codigo, lugar_retiro_id, lugar_entrega_id, distancia_km, cruza_frontera, creado_por, actualizado_por)
        VALUES (v_cod, v_origen, v_destino, round(v_km), coalesce(o.pais, '') <> coalesce(de.pais, ''), aud.fn_usuario_actual(), aud.fn_usuario_actual())
        RETURNING id INTO v_linea;
    END IF;
    v_costo := (q ->> 'costo_usd')::numeric;
    -- Nota interna (no sale en el PDF del cliente)
    v_obs := nullif(btrim(coalesce(d ->> 'observacion', '')), '');
    IF v_costo IS NOT NULL THEN
        v_obs := coalesce(v_obs || E'\n', '')
              || format('Cotizador: costo USD %s por viaje (%s km y %s días con los vacíos); margen %s %% sobre el precio.',
                        replace(to_char(round(v_costo), 'FM999,999,990'), ',', '.'),
                        replace(to_char(round((q ->> 'km_total')::numeric), 'FM999,999,990'), ',', '.'),
                        replace(rtrim(rtrim(to_char((q ->> 'dias')::numeric, 'FM990.0'), '0'), '.'), '.', ','),
                        replace(to_char(round((v_precio - v_costo) / v_precio * 100, 1), 'FM990.0'), '.', ','));
    END IF;
    v_id := ven.fn_guardar_cotizacion(NULL, NULL, jsonb_build_object(
        'empresa_id', v_emp, 'observacion', v_obs,
        'renglones', jsonb_build_array(jsonb_build_object(
            'tipo', 'flete', 'linea_id', v_linea, 'unidad', 'viaje', 'cantidad', v_viajes, 'vuelta_vacia', false, 'precio_usd', v_precio,
            'descripcion', 'Flete ' || ven.fn_nombre_linea(v_linea)))));
    -- El costo del renglón y de la cotización es el del cotizador, no el de la ruta sola
    PERFORM set_config('ven.fn', '1', true);
    UPDATE ven.cotizacion_renglon SET costo_usd = round(v_viajes * v_costo, 2) WHERE cotizacion_id = v_id AND tipo = 'flete';
    UPDATE ven.cotizacion SET costo_usd = round(v_viajes * v_costo, 2) WHERE id = v_id;
    RETURN v_id;
END $f$;

-- ---------------------------------------------------------------------------------
-- 5 · La base del cotizador (la ven Ventas, Gerencia, Finanzas y TI; la cambian Ventas, Gerencia y TI)
-- ---------------------------------------------------------------------------------
CREATE FUNCTION ven.fn_base_cotizador()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v jsonb;
BEGIN
    PERFORM ven.fn_exigir_lectura();
    v := ven.fn_valores_cotizador();
    RETURN v || jsonb_build_object(
        'bases', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre, 'pais', u.pais) ORDER BY u.pais DESC, u.nombre), '[]')
                    FROM mae.ubicacion u WHERE u.id = ANY (ven.fn_bases_vacios())),
        'tramos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                              'id', t.id, 'desde_id', t.desde_id, 'desde', a.nombre, 'hasta_id', t.hasta_id, 'hasta', b.nombre,
                              'linea_id', t.linea_id, 'ruta', l.codigo, 'km', t.km, 'dias', t.dias, 'consumo_l100', t.consumo_l100,
                              'peajes_usd', t.peajes_usd, 'nota', t.nota, 'actualizado_en', t.actualizado_en, 'actualizado_por', us.nombre)
                              ORDER BY a.nombre, b.nombre, l.codigo NULLS FIRST), '[]')
                     FROM ven.tramo_estandar t
                     JOIN mae.ubicacion a ON a.id = t.desde_id
                     JOIN mae.ubicacion b ON b.id = t.hasta_id
                     LEFT JOIN mae.linea l ON l.id = t.linea_id
                     LEFT JOIN seg.usuario us ON us.id = t.actualizado_por
                    WHERE t.eliminado_en IS NULL));
END $f$;

-- Cambiar los valores de la base: solo las claves que vienen; «bases» es la lista de lugares
CREATE FUNCTION ven.fn_guardar_base_cotizador(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE d jsonb := coalesce(p_datos, '{}'); v_usr bigint := ven.fn_exigir_ventas(); r record; v_val numeric; v_bases bigint[];
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('fijo_dia_usd', 'ven.fijo_dia_usd', 0::numeric, 2000::numeric, 'El fijo del camión va de 0 a 2.000 USD por día'),
        ('chofer_dia_usd', 'ven.chofer_dia_usd', 0, 1000, 'El chofer va de 0 a 1.000 USD por día'),
        ('consumo_cargado_l100', 'ven.consumo_cargado_l100', 10, 80, 'El consumo va de 10 a 80 litros cada 100 km'),
        ('consumo_vacio_l100', 'ven.consumo_vacio_l100', 10, 80, 'El consumo va de 10 a 80 litros cada 100 km'),
        ('neumaticos_usd_km', 'ven.neumaticos_usd_km', 0, 1, 'Los neumáticos van de 0 a 1 USD por km'),
        ('peajes_usd_km', 'ven.peajes_usd_km', 0, 1, 'Los peajes van de 0 a 1 USD por km'),
        ('gasoil_clp_litro_fijo', 'ven.gasoil_clp_litro', 300, 5000, 'El gasoil va de 300 a 5.000 CLP por litro'),
        ('gasoil_dias', 'ven.gasoil_dias', 1, 90, 'Los días de cargas van de 1 a 90'),
        ('km_dia_cargado', 'ven.km_dia_cargado', 100, 1500, 'Los km por día van de 100 a 1.500'),
        ('dias_extra_cargado', 'ven.dias_extra_cargado', 0, 10, 'Los días de carga y descarga van de 0 a 10'),
        ('km_dia_vacio', 'ven.km_dia_vacio', 100, 1500, 'Los km por día van de 100 a 1.500'),
        ('canon_normal_clp', 'ven.canon_normal_clp', 0, 10000000, 'El canon normal va de 0 a 10.000.000 CLP'),
        ('cargas_sociales_pct', 'ven.cargas_sociales_pct', 0, 100, 'Las cargas sociales van de 0 a 100 %'),
        ('margen_minimo_pct', 'ven.margen_minimo_pct', 0, 90, 'El margen mínimo va de 0 a 90 %')
      ) x(clave, codigo, minimo, maximo, mensaje) LOOP
        IF d ? r.clave THEN
            v_val := ven.fn_opcion_num(d, r.clave, r.minimo, r.maximo, r.mensaje);
            IF v_val IS NULL THEN RAISE EXCEPTION '%', r.mensaje USING ERRCODE = '22023'; END IF;
            UPDATE ref.parametro SET valor = to_jsonb(v_val), actualizado_por = v_usr WHERE codigo = r.codigo AND valor IS DISTINCT FROM to_jsonb(v_val);
        END IF;
    END LOOP;
    IF d ? 'bases' THEN
        IF jsonb_typeof(d -> 'bases') <> 'array' THEN RAISE EXCEPTION 'Elegí las bases de nuevo' USING ERRCODE = '22023'; END IF;
        SELECT coalesce(array_agg(DISTINCT x::bigint ORDER BY x::bigint), '{}') INTO v_bases
          FROM jsonb_array_elements_text(d -> 'bases') x WHERE x ~ '^\d+$';
        IF cardinality(v_bases) <> jsonb_array_length(d -> 'bases') OR cardinality(v_bases) > 10 THEN
            RAISE EXCEPTION 'Elegí las bases de nuevo (hasta 10, sin repetir)' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_bases) b
                    WHERE NOT EXISTS (SELECT 1 FROM mae.ubicacion u WHERE u.id = b AND u.eliminado_en IS NULL AND u.geom IS NOT NULL)) THEN
            RAISE EXCEPTION 'Cada base tiene que ser un lugar con su ubicación en el mapa' USING ERRCODE = '22023';
        END IF;
        UPDATE ref.parametro SET valor = to_jsonb(v_bases), actualizado_por = v_usr WHERE codigo = 'ven.bases_vacios';
    END IF;
    RETURN ven.fn_base_cotizador();
END $f$;

-- Guardar (o quitar) el estándar de un tramo. Consumo y peajes: si no vienen, quedan los que tenía.
CREATE FUNCTION ven.fn_guardar_tramo_estandar(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    d jsonb := coalesce(p_datos, '{}'); v_usr bigint := ven.fn_exigir_ventas();
    v_desde bigint := ven.fn_opcion_num(d, 'desde_id', 1, 9e15, 'Elegí desde dónde')::bigint;
    v_hasta bigint := ven.fn_opcion_num(d, 'hasta_id', 1, 9e15, 'Elegí hasta dónde')::bigint;
    v_linea bigint := nullif(ven.fn_opcion_num(d, 'linea_id', 0, 9e15, 'Elegí la ruta de nuevo'), 0)::bigint;
    v_km numeric; v_dias numeric; v_cons numeric; v_peajes numeric; v_nota text := nullif(btrim(coalesce(d ->> 'nota', '')), '');
    e ven.tramo_estandar%ROWTYPE;
BEGIN
    IF v_desde IS NULL OR v_hasta IS NULL OR v_desde = v_hasta THEN
        RAISE EXCEPTION 'Elegí desde y hasta dónde (dos lugares distintos)' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM mae.ubicacion WHERE id IN (v_desde, v_hasta) AND eliminado_en IS NULL) <> 2 THEN
        RAISE EXCEPTION 'Ese lugar no existe' USING ERRCODE = '22023';
    END IF;
    IF v_linea IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mae.linea WHERE id = v_linea AND lugar_retiro_id = v_desde AND lugar_entrega_id = v_hasta) THEN
        RAISE EXCEPTION 'Esa ruta no va de % a %', (SELECT nombre FROM mae.ubicacion WHERE id = v_desde),
            (SELECT nombre FROM mae.ubicacion WHERE id = v_hasta) USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('ven.fn', '1', true);
    SELECT * INTO e FROM ven.tramo_estandar
     WHERE desde_id = v_desde AND hasta_id = v_hasta AND coalesce(linea_id, 0) = coalesce(v_linea, 0) AND eliminado_en IS NULL
     FOR UPDATE;
    IF coalesce((d ->> 'quitar')::boolean, false) THEN
        IF e.id IS NULL THEN RAISE EXCEPTION 'Ese tramo no tiene estándar' USING ERRCODE = '22023'; END IF;
        UPDATE ven.tramo_estandar SET eliminado_en = now() WHERE id = e.id;
        RETURN ven.fn_base_cotizador();
    END IF;
    v_km := ven.fn_opcion_num(d, 'km', 1, 10000, 'Los km del tramo van de 1 a 10.000');
    v_dias := ven.fn_opcion_num(d, 'dias', 0, 60, 'Los días del tramo van de 0 a 60');
    v_cons := ven.fn_opcion_num(d, 'consumo_l100', 10, 80, 'El consumo va de 10 a 80 litros cada 100 km');
    v_peajes := ven.fn_opcion_num(d, 'peajes_usd', 0, 5000, 'Los peajes del tramo van de 0 a 5.000 USD');
    IF v_km IS NULL THEN RAISE EXCEPTION 'Faltan los km del tramo' USING ERRCODE = '22023'; END IF;
    IF v_dias IS NULL THEN RAISE EXCEPTION 'Faltan los días del tramo' USING ERRCODE = '22023'; END IF;
    IF length(v_nota) > 300 THEN RAISE EXCEPTION 'La nota es demasiado larga (máximo 300 letras)' USING ERRCODE = '22023'; END IF;
    IF e.id IS NULL THEN
        INSERT INTO ven.tramo_estandar (desde_id, hasta_id, linea_id, km, dias, consumo_l100, peajes_usd, nota, creado_por, actualizado_por)
        VALUES (v_desde, v_hasta, v_linea, v_km, v_dias, v_cons, v_peajes, v_nota, v_usr, v_usr);
    ELSE
        UPDATE ven.tramo_estandar
           SET km = v_km, dias = v_dias,
               consumo_l100 = CASE WHEN d ? 'consumo_l100' THEN v_cons ELSE consumo_l100 END,
               peajes_usd = CASE WHEN d ? 'peajes_usd' THEN v_peajes ELSE peajes_usd END,
               nota = CASE WHEN d ? 'nota' THEN v_nota ELSE nota END
         WHERE id = e.id;
    END IF;
    RETURN ven.fn_base_cotizador();
END $f$;

-- ---------------------------------------------------------------------------------
-- 6 · El margen es sobre el precio (reemplazos con control)
-- ---------------------------------------------------------------------------------
SELECT pg_temp.fn_reemplazar('ven.fn_sugerir(bigint, bigint, text, text, boolean)',
    $t$* (1 + v_margen / 100) / 10) * 10$t$, $t$/ (1 - least(v_margen, 90) / 100) / 10) * 10$t$, 2);
SELECT pg_temp.fn_reemplazar('ven.fn_cotizaciones(text, text)',
    $t$CASE WHEN c.costo_usd > 0 THEN round((c.total_usd - c.costo_usd) / c.costo_usd * 100, 1) END$t$,
    $t$CASE WHEN c.costo_usd IS NOT NULL AND c.total_usd > 0 THEN round((c.total_usd - c.costo_usd) / c.total_usd * 100, 1) END$t$);
SELECT pg_temp.fn_reemplazar('ven.fn_cotizacion_json(bigint)',
    $t$CASE WHEN c.costo_usd > 0 THEN round((c.total_usd - c.costo_usd) / c.costo_usd * 100, 1) END$t$,
    $t$CASE WHEN c.costo_usd IS NOT NULL AND c.total_usd > 0 THEN round((c.total_usd - c.costo_usd) / c.total_usd * 100, 1) END$t$);
SELECT pg_temp.fn_reemplazar('ven.fn_guardar_parametros(numeric, integer, text, numeric)',
    $t$p_margen NOT BETWEEN 0 AND 300 THEN RAISE EXCEPTION 'El margen va de 0 a 300 %%'$t$,
    $t$p_margen NOT BETWEEN 0 AND 90 THEN RAISE EXCEPTION 'El margen va de 0 a 90 %% (es sobre el precio)'$t$);

-- ---------------------------------------------------------------------------------
-- 7 · Lo de la 305 que ya no se usa
-- ---------------------------------------------------------------------------------
DROP FUNCTION ops.fn_ven_cotizar(bigint, bigint, bigint, boolean, bigint, numeric, bigint);
DROP FUNCTION ven.fn_cotizar(bigint, bigint, bigint, boolean, bigint, numeric, bigint);
DROP FUNCTION ven.fn_km_entre(bigint, bigint, bigint);
DROP FUNCTION ops.fn_ven_costo_km_contable(integer, boolean);
DROP FUNCTION ops.fn_ven_guardar_base_costo(integer, boolean, text[], boolean);
DROP FUNCTION ven.fn_guardar_base_costo(integer, boolean, text[], boolean);
DROP FUNCTION ven.fn_costo_km_contable(integer, boolean);

-- ---------------------------------------------------------------------------------
-- 8 · Puertas desde la web (schema ops) y permisos
-- ---------------------------------------------------------------------------------
CREATE FUNCTION ops.fn_ven_cotizar_viaje(p_origen bigint, p_destino bigint, p_opciones jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_cotizar_viaje(p_origen, p_destino, p_opciones) $f$;
CREATE FUNCTION ops.fn_ven_base_cotizador()
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_base_cotizador() $f$;
CREATE FUNCTION ops.fn_ven_guardar_base_cotizador(p_datos jsonb)
RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_guardar_base_cotizador(p_datos) $f$;
CREATE FUNCTION ops.fn_ven_guardar_tramo_estandar(p_datos jsonb)
RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_guardar_tramo_estandar(p_datos) $f$;

SELECT pg_temp.fn_solo_interna('ven.fn_opcion_num(jsonb, text, numeric, numeric, text)');
SELECT pg_temp.fn_solo_interna('ven.fn_bases_vacios()');
SELECT pg_temp.fn_solo_interna('ven.fn_base_mas_cercana(bigint, bigint[])');
SELECT pg_temp.fn_solo_interna('ven.fn_valores_cotizador()');
SELECT pg_temp.fn_solo_interna('ven.fn_km_lugares(bigint, bigint, boolean, boolean)');
SELECT pg_temp.fn_solo_interna('ven.fn_tramo(text, bigint, bigint, bigint, numeric, numeric, boolean, jsonb)');
SELECT pg_temp.fn_solo_interna('ven.fn_costo_viaje_detalle(bigint, bigint, jsonb)');
-- Leer como la sugerencia de precio; guardar como las cotizaciones
SELECT pg_temp.fn_copiar_permisos('ven.fn_sugerir(bigint, bigint, text, text, boolean)', 'ven.fn_cotizar_viaje(bigint, bigint, jsonb)');
SELECT pg_temp.fn_copiar_permisos('ven.fn_sugerir(bigint, bigint, text, text, boolean)', 'ven.fn_base_cotizador()');
SELECT pg_temp.fn_copiar_permisos('ven.fn_guardar_cotizacion(bigint, integer, jsonb)', 'ven.fn_guardar_base_cotizador(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ven.fn_guardar_cotizacion(bigint, integer, jsonb)', 'ven.fn_guardar_tramo_estandar(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ops.fn_ven_sugerir(bigint, bigint, text, text, boolean)', 'ops.fn_ven_cotizar_viaje(bigint, bigint, jsonb)');
SELECT pg_temp.fn_copiar_permisos('ops.fn_ven_sugerir(bigint, bigint, text, text, boolean)', 'ops.fn_ven_base_cotizador()');
SELECT pg_temp.fn_copiar_permisos('ops.fn_ven_guardar_cotizacion(bigint, integer, jsonb)', 'ops.fn_ven_guardar_base_cotizador(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ops.fn_ven_guardar_cotizacion(bigint, integer, jsonb)', 'ops.fn_ven_guardar_tramo_estandar(jsonb)');

UPDATE ref.parametro SET valor = '308' WHERE codigo = 'web.version_base' AND valor::text::int < 308;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: las bases elegidas, el gasoil que se usa y, si existe la línea, el viaje Entre Ríos → Coronel
SELECT 'migración 308 aplicada' AS que,
       (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(u.nombre || ' (' || coalesce(u.pais, '?') || ')', ', ' ORDER BY u.pais DESC)
          FROM mae.ubicacion u WHERE u.id = ANY (ven.fn_bases_vacios())) AS bases_de_los_vacios,
       v ->> 'gasoil_clp_litro' AS gasoil_clp_litro,
       CASE WHEN v ->> 'gasoil_fuente' = 'cargas' THEN format('promedio de %s cargas en Chile (%s L, últimos %s días)', v ->> 'gasoil_cargas', v ->> 'gasoil_litros', v ->> 'gasoil_dias')
            ELSE 'valor fijo (no hay cargas en Chile en los últimos días)' END AS gasoil_de_donde,
       v ->> 'clp_por_usd' AS clp_por_usd,
       (SELECT format('%s: %s USD (%s km, %s días)%s', l.codigo, c ->> 'costo_usd', c ->> 'km', c ->> 'dias',
                      coalesce(' · ' || (c ->> 'falta'), ''))
          FROM mae.linea l, ven.fn_costo_viaje(l.id) c
         WHERE l.codigo = 'ER-NQ-CNL' AND l.eliminado_en IS NULL LIMIT 1) AS entre_rios_coronel_sin_estandares
  FROM (SELECT ven.fn_valores_cotizador() AS v) x;
