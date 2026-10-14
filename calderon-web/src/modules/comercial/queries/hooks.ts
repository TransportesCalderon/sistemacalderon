'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import type { ClienteId } from '@/shared/types/dominio';
import { crearCliente, editarCliente } from '../actions/cliente.actions';
import type { ClienteEdicionInput, ClienteFormInput } from '../domain/cliente.schemas';
import type { Cliente, ClienteListaParams } from '../domain/cliente.types';
import { palabrasSignificativas } from '../repositories/cliente.repository';
import { catalogosComercialQueries, clientesQueries } from './keys';

/** Lista paginada; conserva la página anterior mientras carga la nueva (sin parpadeo). */
export function useClientes(p: ClienteListaParams) {
  return useQuery({ ...clientesQueries.lista(browserDb(), p), placeholderData: keepPreviousData });
}

export function useCliente(id: ClienteId, opciones: { enabled?: boolean } = {}) {
  return useQuery({ ...clientesQueries.detalle(browserDb(), id), enabled: opciones.enabled ?? true });
}

export function useCatalogosComercial() {
  return useQuery(catalogosComercialQueries.obtener(browserDb()));
}

export function useSegmentosCliente() {
  return useQuery(clientesQueries.segmentos(browserDb()));
}

/**
 * Clientes con razón social parecida mientras se escribe (P-CLI-01). Espera 400 ms
 * después de la última tecla y consulta solo si hay alguna palabra distintiva.
 */
export function useClientesParecidos(razonSocial: string, excluirId?: ClienteId) {
  const [texto, setTexto] = useState(razonSocial);
  useEffect(() => {
    const t = setTimeout(() => setTexto(razonSocial), 400);
    return () => clearTimeout(t);
  }, [razonSocial]);

  const clave = palabrasSignificativas(texto).join(' ');
  return useQuery({
    ...clientesQueries.parecidos(browserDb(), clave, excluirId),
    enabled: clave.length > 0,
    placeholderData: keepPreviousData,
  });
}

/**
 * Mutaciones: llaman a la server action y devuelven su ActionResult (no lanzan).
 * Si sale bien, dejan la ficha en caché e invalidan listas, segmentos y parecidos.
 */
function useAlGuardarCliente() {
  const qc = useQueryClient();
  return (cliente: Cliente) => {
    qc.setQueryData(clientesQueries.detalle(browserDb(), cliente.id).queryKey, cliente);
    return Promise.all([
      qc.invalidateQueries({ queryKey: clientesQueries.listas() }),
      qc.invalidateQueries({ queryKey: [...clientesQueries.todas(), 'parecidos'] }),
      qc.invalidateQueries({ queryKey: clientesQueries.segmentos(browserDb()).queryKey }),
    ]);
  };
}

export function useCrearCliente() {
  const alGuardar = useAlGuardarCliente();
  return useMutation({
    mutationFn: (input: ClienteFormInput) => crearCliente(input),
    onSuccess: (r) => (r.ok ? alGuardar(r.data) : undefined),
  });
}

export function useEditarCliente() {
  const alGuardar = useAlGuardarCliente();
  return useMutation({
    mutationFn: (input: ClienteEdicionInput) => editarCliente(input),
    onSuccess: (r) => (r.ok ? alGuardar(r.data) : undefined),
  });
}
