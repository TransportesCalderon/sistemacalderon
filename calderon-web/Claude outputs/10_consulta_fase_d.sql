-- 10 · CONSULTA DE SOLO LECTURA (no cambia nada)
-- Datos para decidir los retiros de la Fase D y la unión de clientes (A5).
-- Devuelve una sola tabla: sección, dato, cantidad y detalle.
--   A · Tablas sin uso: cuántas filas tiene cada una.
--   B · Mochila como depósito (modelo anterior): qué queda vivo.
--   C · Liquidación antigua: si siguen entrando filas.
--   D · Clientes que parecen duplicados (mismo nombre o mismo identificador fiscal).

SET search_path = public, extensions;

WITH
-- ───────────── A · Tablas sin uso
a AS (
    SELECT 'A · Tablas sin uso' AS seccion, t.tabla AS dato, t.n AS cantidad,
           CASE WHEN t.n = 0 THEN 'vacía: se puede borrar' ELSE 'tiene filas: exportar antes o dejar' END AS detalle
      FROM (VALUES
        ('ana.baseline_consumo',        (SELECT count(*) FROM ana.baseline_consumo)),
        ('ana.caso_revision',           (SELECT count(*) FROM ana.caso_revision)),
        ('ana.alerta_caso',             (SELECT count(*) FROM ana.alerta_caso)),
        ('fin.asignacion_costo',        (SELECT count(*) FROM fin.asignacion_costo)),
        ('fin.rentabilidad_servicio',   (SELECT count(*) FROM fin.rentabilidad_servicio)),
        ('fue.consumo_servicio',        (SELECT count(*) FROM fue.consumo_servicio)),
        ('fue.costo_medio_combustible', (SELECT count(*) FROM fue.costo_medio_combustible)),
        ('stg.lote_importacion',        (SELECT count(*) FROM stg.lote_importacion)),
        ('tel.nivel_suavizado',         (SELECT count(*) FROM tel.nivel_suavizado)),
        ('tel.sesion_conductor',        (SELECT count(*) FROM tel.sesion_conductor))
      ) AS t(tabla, n)
    UNION ALL
    SELECT 'A · Tablas sin uso', 'cargas con lote de importación', count(*),
           'cargas que apuntan a stg.lote_importacion'
      FROM fue.carga_combustible WHERE lote_importacion_id IS NOT NULL
),
-- ───────────── B · Mochila como depósito
moch AS (
    SELECT d.*, c.patente,
           (d.eliminado_en IS NULL AND d.estado = 'activo' AND d.vigente_hasta IS NULL) AS vigente
      FROM fue.deposito_combustible d
      LEFT JOIN mae.camion c ON c.id = d.camion_id
     WHERE d.tipo = 'mochila'
),
b AS (
    SELECT 'B · Mochila como depósito' AS seccion, 'depósitos de tipo mochila (todos)' AS dato, count(*) AS cantidad,
           'último creado: ' || coalesce(to_char(max(creado_en), 'DD/MM/YYYY'), '—') AS detalle
      FROM moch
    UNION ALL
    SELECT 'B · Mochila como depósito', 'depósitos mochila todavía vigentes', count(*) FILTER (WHERE vigente),
           coalesce(string_agg(patente || ' (' || codigo || ', saldo ' ||
                    coalesce(round(fue.fn_saldo_deposito(id, now()))::text, '?') || ' L)', ' · ' ORDER BY patente) FILTER (WHERE vigente), '—')
      FROM moch
    UNION ALL
    SELECT 'B · Mochila como depósito', 'cargas hechas a una mochila-depósito', count(*),
           'última: ' || coalesce(to_char(max(cc.creado_en), 'DD/MM/YYYY'), '—')
      FROM fue.carga_combustible cc JOIN moch m ON m.id = cc.deposito_id
    UNION ALL
    SELECT 'B · Mochila como depósito', 'movimientos sobre una mochila-depósito', count(*),
           'último: ' || coalesce(to_char(max(mv.creado_en), 'DD/MM/YYYY'), '—')
      FROM fue.movimiento_combustible mv JOIN moch m ON m.id = mv.deposito_id
    UNION ALL
    SELECT 'B · Mochila como depósito', 'controles de saldo de una mochila-depósito', count(*),
           'último: ' || coalesce(to_char(max(cs.creado_en), 'DD/MM/YYYY'), '—')
      FROM fue.control_saldo_deposito cs JOIN moch m ON m.id = cs.deposito_id
    UNION ALL
    SELECT 'B · Mochila como depósito',
           'cierres versión ' || coalesce(cv.version_calculo::text, '?') || ' · ' || cv.estado ||
           CASE WHEN cv.usa_mochila OR cv.deposito_id IS NOT NULL THEN ' · usa mochila-depósito' ELSE '' END,
           count(*),
           'último: ' || to_char(max(cv.creado_en), 'DD/MM/YYYY') ||
           CASE WHEN bool_or(cv.usa_mochila OR cv.deposito_id IS NOT NULL) AND cv.estado NOT IN ('aprobado', 'anulado')
                THEN ' · ABIERTO: ' || string_agg(cv.numero, ', ' ORDER BY cv.numero) ELSE '' END
      FROM fue.cierre_viaje cv
     WHERE cv.eliminado_en IS NULL
     GROUP BY cv.version_calculo, cv.estado, (cv.usa_mochila OR cv.deposito_id IS NOT NULL)
),
-- ───────────── C · Liquidación antigua
corte AS (SELECT min(creado_en) AS desde FROM fin.liquidacion_mensual),
c AS (
    SELECT 'C · Liquidación antigua' AS seccion, 'fin.liquidacion_mensual (la vigente)' AS dato, count(*) AS cantidad,
           'primera: ' || coalesce(to_char(min(creado_en), 'DD/MM/YYYY'), '—') || ' · última: ' || coalesce(to_char(max(creado_en), 'DD/MM/YYYY'), '—') AS detalle
      FROM fin.liquidacion_mensual
    UNION ALL
    SELECT 'C · Liquidación antigua', t.tabla, t.n,
           'última fila: ' || coalesce(to_char(t.ultima, 'DD/MM/YYYY'), '—') ||
           ' · creadas después de empezar la vigente: ' || t.despues
      FROM (
        SELECT 'fin.liquidacion_chofer' AS tabla, count(*) AS n, max(x.creado_en) AS ultima,
               count(*) FILTER (WHERE x.creado_en >= k.desde) AS despues FROM fin.liquidacion_chofer x, corte k
        UNION ALL
        SELECT 'fin.liquidacion_detalle', count(*), max(x.creado_en),
               count(*) FILTER (WHERE x.creado_en >= k.desde) FROM fin.liquidacion_detalle x, corte k
        UNION ALL
        SELECT 'ops.tramo_liquidable', count(*), max(x.creado_en),
               count(*) FILTER (WHERE x.creado_en >= k.desde) FROM ops.tramo_liquidable x, corte k
        UNION ALL
        SELECT 'ops.tramo_liquidable_tramo', count(*), max(x.creado_en),
               count(*) FILTER (WHERE x.creado_en >= k.desde) FROM ops.tramo_liquidable_tramo x, corte k
      ) t
),
-- ───────────── D · Clientes que parecen duplicados
cli AS (
    SELECT id, codigo, razon_social, identificador_fiscal, estado,
           seg.fn_normalizar_busqueda(razon_social)                                    AS nombre_norm,
           nullif(upper(regexp_replace(coalesce(identificador_fiscal, ''), '[^0-9A-Za-z]', '', 'g')), '') AS fiscal_norm
      FROM mae.cliente
     WHERE eliminado_en IS NULL
),
d AS (
    SELECT 'D · Clientes duplicados' AS seccion, 'clientes en total' AS dato, count(*) AS cantidad, '' AS detalle FROM cli
    UNION ALL
    SELECT 'D · Clientes duplicados', 'mismo identificador fiscal: ' || fiscal_norm, count(*),
           string_agg('#' || id || ' ' || razon_social || ' (' || estado || ')', ' · ' ORDER BY id)
      FROM cli WHERE fiscal_norm IS NOT NULL
     GROUP BY fiscal_norm HAVING count(*) > 1
    UNION ALL
    SELECT 'D · Clientes duplicados', 'mismo nombre: ' || nombre_norm, count(*),
           string_agg('#' || id || ' ' || razon_social || ' · fiscal ' || coalesce(identificador_fiscal, '—') || ' (' || estado || ')', ' · ' ORDER BY id)
      FROM cli WHERE nombre_norm <> ''
     GROUP BY nombre_norm HAVING count(*) > 1
)
SELECT * FROM a
UNION ALL SELECT * FROM b
UNION ALL SELECT * FROM c
UNION ALL SELECT * FROM d
ORDER BY seccion, dato;
