-- =============================================================================
-- IronTrack · Consulta de SOLO LECTURA (no cambia nada)
-- ¿Hay casos reales donde el faltante para lleno no sea solo de la mochila?
-- Sirve para decidir el punto 3 de A3: calcular la parte de mochila o guardarla.
-- Devuelve dos bloques: cargas con faltante y órdenes con tanques por litros.
-- =============================================================================
WITH cargas AS (
    SELECT c.id, c.fecha_hora, cam.patente, c.litros, c.faltante_lleno_l AS faltante, c.faltante_observacion,
           coalesce((SELECT sum(t.capacidad_util_l) FROM mae.tanque_combustible t
                      WHERE t.camion_id = c.camion_id AND t.tipo = 'mochila' AND t.eliminado_en IS NULL
                        AND t.vigente_desde <= c.fecha_hora::date AND (t.vigente_hasta IS NULL OR t.vigente_hasta > c.fecha_hora::date)), 0) AS cap_mochila,
           coalesce((SELECT sum(t.capacidad_util_l) FROM mae.tanque_combustible t
                      WHERE t.camion_id = c.camion_id AND t.tipo <> 'mochila' AND t.eliminado_en IS NULL
                        AND t.vigente_desde <= c.fecha_hora::date AND (t.vigente_hasta IS NULL OR t.vigente_hasta > c.fecha_hora::date)), 0) AS cap_tanques
      FROM fue.carga_combustible c JOIN mae.camion cam ON cam.id = c.camion_id
     WHERE c.faltante_lleno_l > 0 AND c.eliminado_en IS NULL AND c.estado_validacion <> 'anulada'
)
SELECT '1 · carga con faltante' AS bloque, id::text AS referencia, to_char(fecha_hora, 'DD/MM/YYYY') AS fecha, patente,
       faltante AS faltante_l, cap_tanques, cap_mochila,
       CASE WHEN cap_mochila = 0 THEN 'A · camión sin mochila cargada: el faltante es de los tanques'
            WHEN faltante > cap_mochila THEN 'B · faltó más que toda la mochila: una parte es de los tanques'
            ELSE 'C · entra en la mochila: leer la observación' END AS caso,
       faltante_observacion AS detalle
  FROM cargas
UNION ALL
SELECT '2 · orden con tanques por litros', o.numero, to_char(o.creada_en, 'DD/MM/YYYY'), cam.patente,
       (o.detalle #>> '{tanques,litros}')::numeric, NULL, (o.detalle #>> '{mochila,capacidad_l}')::numeric,
       CASE WHEN o.detalle ->> 'destino' = 'tanques_mochila' AND o.detalle #>> '{mochila,modo}' = 'llena'
                 THEN 'D · tanques por litros y mochila llena: tanques incompletos con mochila llena'
            WHEN o.detalle ->> 'destino' = 'tanques_mochila' THEN 'E · tanques y mochila por litros'
            ELSE 'F · solo tanques, por litros' END,
       'estado ' || o.estado || coalesce(' · cargó ' || o.litros_cargados || ' L', '')
  FROM fue.orden_carga o JOIN mae.camion cam ON cam.id = o.camion_id
 WHERE o.detalle #>> '{tanques,modo}' = 'litros' AND o.genset_id IS NULL AND o.estado <> 'anulada'
 ORDER BY 1, 8, 2;
