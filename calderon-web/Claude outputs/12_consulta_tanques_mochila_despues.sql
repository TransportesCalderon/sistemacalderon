-- 12 · CONSULTA DE SOLO LECTURA (no cambia nada) · A3: tanques y mochila, camión por camión
-- Correr DESPUÉS de la migración 267. Una fila por camión: la capacidad (tanques + mochila = total),
-- lo que el sistema estima que tiene ahora repartido en tanques y mochila, y, si está en viaje,
-- lo que mostraría el pedido de carga (disponible e inicial, repartidos).
-- Cómo usarla: pegar todo en el SQL Editor de Supabase, Run, y descargar el resultado como CSV.
WITH cam AS (
    SELECT c.id, c.patente, c.marca, fue.fn_capacidad_camion(c.id, now()) AS k, fue.fn_combustible_actual(c.id) AS ca
      FROM mae.camion c WHERE c.eliminado_en IS NULL AND c.fecha_baja IS NULL
),
ped AS (
    SELECT DISTINCT ON (v.camion_id) v.camion_id, v.numero, tel.fn_preparar_pedido_carga(v.id) AS b
      FROM ops.viaje_chofer v WHERE v.estado = 'abierto' AND v.eliminado_en IS NULL
     ORDER BY v.camion_id, v.salida_ts DESC
)
SELECT cam.patente, cam.marca,
       (cam.k ->> 'tanques_l')::numeric AS cap_tanques_l,
       (cam.k ->> 'mochila_l')::numeric AS cap_mochila_l,
       (cam.k ->> 'total_l')::numeric   AS cap_total_l,
       (cam.ca ->> 'litros')::numeric    AS ahora_total_l,
       (cam.ca ->> 'tractor_l')::numeric AS ahora_tanques_l,
       coalesce((cam.ca ->> 'mochila_l')::numeric, CASE WHEN cam.ca ->> 'litros' IS NOT NULL THEN 0 END) AS ahora_mochila_l,
       cam.ca ->> 'motivo' AS sin_dato_porque,
       ped.numero AS viaje,
       (ped.b ->> 'tanques_l')::numeric AS pedido_disp_tanques_l,
       (ped.b ->> 'mochila_l')::numeric AS pedido_disp_mochila_l,
       (ped.b ->> 'inicial_tanques_l')::numeric AS pedido_inicial_tanques_l,
       (ped.b ->> 'inicial_mochila_l')::numeric AS pedido_inicial_mochila_l,
       (ped.b ->> 'litros_para_llenar')::numeric AS pedido_para_llenar_l,
       (ped.b ->> 'litros_sugeridos')::numeric AS pedido_recomendado_l
  FROM cam LEFT JOIN ped ON ped.camion_id = cam.id
 ORDER BY cam.patente;
