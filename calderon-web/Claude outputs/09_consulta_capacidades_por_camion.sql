-- 09 · CONSULTA DE SOLO LECTURA (no cambia nada)
-- Capacidades camión por camión, tal como están cargadas hoy.
-- Es la lista «antes» de la verificación de A3: Operaciones la revisa y dice
-- si los litros de tanques y de mochila son los que usa Calderón.
--
-- Columnas:
--   tanques_l        suma de los tanques principal y secundario vigentes hoy
--   mochila_l        suma de los tanques de tipo mochila vigentes hoy
--   otros_l          tanques de tipo «otro» (si hay, revisar a mano)
--   total_l          todo junto
--   hoy_pedido_usa_l lo que el pedido de carga toma hoy como «capacidad de tanques»
--   sobra_l          cuánto de más toma hoy el pedido (debería ser 0 después de A3)
--   detalle          cada tanque: número, tipo y litros útiles
--   revisar          aviso si algo no cierra con la regla 700–830 + 720

SET search_path = public, extensions;

WITH t AS (
    SELECT t.camion_id, t.numero_tanque, t.tipo, t.capacidad_util_l, t.capacidad_nominal_l
      FROM mae.tanque_combustible t
     WHERE t.eliminado_en IS NULL
       AND t.vigente_desde <= mae.fn_hoy()
       AND (t.vigente_hasta IS NULL OR t.vigente_hasta > mae.fn_hoy())
), c AS (
    SELECT c.id, c.patente, c.marca, c.modelo, c.estado,
           coalesce(sum(t.capacidad_util_l) FILTER (WHERE t.tipo IN ('principal','secundario')), 0) AS tanques_l,
           coalesce(sum(t.capacidad_util_l) FILTER (WHERE t.tipo = 'mochila'), 0)                 AS mochila_l,
           coalesce(sum(t.capacidad_util_l) FILTER (WHERE t.tipo = 'otro'), 0)                    AS otros_l,
           coalesce(sum(t.capacidad_util_l), 0)                                                   AS total_l,
           count(t.numero_tanque) FILTER (WHERE t.tipo = 'mochila')                               AS n_mochilas,
           bool_or(t.capacidad_util_l <> t.capacidad_nominal_l)                                   AS util_distinta,
           string_agg(t.numero_tanque || ' ' || t.tipo || ' ' || trim(to_char(t.capacidad_util_l, 'FM999990.##'), '.') || ' L',
                      ' · ' ORDER BY t.numero_tanque)                                             AS detalle
      FROM mae.camion c
      LEFT JOIN t ON t.camion_id = c.id
     WHERE c.eliminado_en IS NULL
     GROUP BY c.id, c.patente, c.marca, c.modelo, c.estado
)
SELECT c.patente, c.marca, c.modelo, c.estado,
       c.tanques_l, c.mochila_l, c.otros_l, c.total_l,
       (fue.fn_capacidad_camion(c.id, now()) ->> 'litros')::numeric                    AS hoy_pedido_usa_l,
       (fue.fn_capacidad_camion(c.id, now()) ->> 'litros')::numeric - c.tanques_l      AS sobra_l,
       c.detalle,
       nullif(concat_ws('; ',
           CASE WHEN c.total_l = 0 THEN 'sin tanques cargados' END,
           CASE WHEN c.total_l > 0 AND c.tanques_l = 0 THEN 'sin tanque principal ni secundario' END,
           CASE WHEN c.n_mochilas > 1 THEN 'más de una mochila' END,
           CASE WHEN c.mochila_l > 0 AND c.mochila_l <> 720 THEN 'mochila distinta de 720 L' END,
           CASE WHEN c.tanques_l > 0 AND c.tanques_l NOT BETWEEN 700 AND 830 THEN 'tanques fuera de 700–830 L' END,
           CASE WHEN c.otros_l > 0 THEN 'tiene tanque de tipo «otro»' END,
           CASE WHEN c.util_distinta THEN 'litros útiles distintos de los nominales' END
       ), '') AS revisar
  FROM c
 ORDER BY c.marca NULLS LAST, c.modelo NULLS LAST, c.patente;
