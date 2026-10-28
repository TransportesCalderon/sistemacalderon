'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, UserPlus, Users } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { ETIQUETA_ROL, ROLES_APP, type RolApp } from '@/modules/core/permissions/roles';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { FRESCURA } from '@/shared/query/frescura';
import { browserDb } from '@/shared/supabase/browser';
import { Campo } from '@/shared/ui/campo';
import { useChoferesCombustible } from '@/modules/combustible/queries/hooks';
import { guardarUsuario } from '../usuarios.actions';
import { usuariosRepository, type Usuario } from '../usuarios.repository';
import { invalidar } from '@/shared/query/invalidar';

/** Roles que se asignan desde acá. Migración 60: el chofer entra al celular (Mi carga, Mis gastos), vinculado a su ficha. */
const ROLES_ASIGNABLES = ROLES_APP;

/**
 * Configuración > Usuarios y roles (migración 34). La cuenta de acceso (email y contraseña) se crea
 * en Supabase; acá se vincula con un nombre y sus roles, se cambian los roles o se desactiva.
 */
export function UsuariosPantalla() {
  const { zonaHoraria } = useSesion();
  const db = browserDb();
  const usuarios = useQuery({
    queryKey: ['usuarios', 'lista'],
    queryFn: () => usuariosRepository(db).listar(),
    staleTime: FRESCURA.maestro,
  });
  const cuentas = useQuery({
    queryKey: ['usuarios', 'sin-vincular'],
    queryFn: () => usuariosRepository(db).sinVincular(),
    staleTime: FRESCURA.maestro,
  });
  const [abierto, setAbierto] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Usuarios y roles" subtitulo="Configuración" />
      <p className="text-sm text-tinta-suave">
        Para sumar a alguien: en Supabase, <span className="font-medium">Authentication → Users → Add user</span> (email y contraseña, o
        invitación por email). Después aparece abajo en «Cuentas sin vincular» para darle nombre y roles. Los roles nuevos rigen cuando la
        persona vuelve a entrar (hasta 1 hora); desactivar corta el acceso en el momento.
      </p>

      {cuentas.data && cuentas.data.length > 0 && (
        <Seccion titulo={`Cuentas sin vincular (${cuentas.data.length})`}>
          <ul className="divide-y divide-borde text-sm">
            {cuentas.data.map((c) => (
              <li key={c.email} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium text-tinta">{c.email}</span>
                    <span className="ml-2 text-xs text-tinta-suave">creada {formatearFechaHora(c.creadaEn, zonaHoraria)}</span>
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-marca hover:underline"
                    onClick={() => setAbierto(`n:${c.email}`)}
                  >
                    <UserPlus className="size-4" /> Vincular
                  </button>
                </div>
                {abierto === `n:${c.email}` && (
                  <div className="mt-2">
                    <FormUsuario email={c.email} onCerrar={() => setAbierto(null)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <section className="overflow-hidden rounded-xl border border-borde bg-panel">
        {usuarios.isPending ? (
          <Cargando texto="Cargando usuarios…" />
        ) : usuarios.isError ? (
          <ErrorLectura
            texto={usuarios.error instanceof Error ? usuarios.error.message : 'No se pudieron cargar los usuarios.'}
            onReintentar={() => usuarios.refetch()}
          />
        ) : usuarios.data.length === 0 ? (
          <Vacio icono={<Users className="size-6" />} texto="Todavía no hay usuarios." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="border-b border-borde bg-fondo">
                <tr>
                  <th className={TH}>Nombre</th>
                  <th className={TH}>Roles</th>
                  <th className={TH}>Último ingreso</th>
                  <th className={TH}>Estado</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {usuarios.data.map((u) => (
                  <Fragment key={u.id}>
                    <tr className={cn(!u.activo && 'text-tinta-suave')}>
                      <td className={TD}>
                        <span className="font-medium">{u.nombre}</span>
                        <span className="block text-xs text-tinta-suave">{u.email ?? '—'}</span>
                      </td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Chip key={r} tono={r === 'ti' ? 'marca' : 'neutro'}>
                              {ETIQUETA_ROL[r]}
                            </Chip>
                          ))}
                        </div>
                      </td>
                      <td className={cn(TD, 'tabular-nums')}>
                        {u.ultimoIngreso ? formatearFechaHora(u.ultimoIngreso, zonaHoraria) : 'Nunca'}
                      </td>
                      <td className={TD}>{u.activo ? <Chip tono="exito">Activo</Chip> : <Chip tono="neutro">Desactivado</Chip>}</td>
                      <td className={cn(TD, 'text-right')}>
                        {u.email && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
                            onClick={() => setAbierto(`u:${u.id}`)}
                          >
                            <Pencil className="size-3.5" /> Editar
                          </button>
                        )}
                      </td>
                    </tr>
                    {abierto === `u:${u.id}` && u.email && (
                      <tr>
                        <td colSpan={5} className="px-3 pb-3">
                          <FormUsuario email={u.email} usuario={u} onCerrar={() => setAbierto(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FormUsuario({ email, usuario, onCerrar }: { email: string; usuario?: Usuario; onCerrar: () => void }) {
  const qc = useQueryClient();
  const guardar = useMutation({
    mutationFn: guardarUsuario,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'usuario') : undefined),
  });
  const { error, enviar, campo } = useEnvio();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [roles, setRoles] = useState<RolApp[]>(usuario?.roles ?? []);
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [choferId, setChoferId] = useState<number | null>(usuario?.choferId ?? null);
  const choferes = useChoferesCombustible();
  const alternar = (r: RolApp) => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r]);

  return (
    <Panel
      titulo={usuario ? `Editar ${usuario.nombre}` : `Vincular ${email}`}
      explicacion="Con varios roles, el usuario suma los permisos de todos. Las aprobaciones las hacen Administración de combustible, Finanzas y TI (parámetro fue.correccion_roles_aprobadores)."
      error={error}
      ocupado={guardar.isPending}
      textoBoton={usuario ? 'Guardar cambios' : 'Vincular'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(guardar.mutateAsync({ email, nombre, roles, activo, choferId: roles.includes('chofer') ? choferId : null }), onCerrar)}
    >
      <Campo label="Nombre *" error={campo('nombre')}>
        <input maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <fieldset className="space-y-1.5 sm:col-span-2">
        <legend className="text-sm font-medium text-tinta">Roles *</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ROLES_ASIGNABLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-tinta">
              <input type="checkbox" className="size-4 accent-marca" checked={roles.includes(r)} onChange={() => alternar(r)} />
              {ETIQUETA_ROL[r]}
            </label>
          ))}
        </div>
        {campo('roles') && <p className="text-xs text-error">{campo('roles')}</p>}
      </fieldset>
      {roles.includes('chofer') && (
        <Campo label="Es el chofer *" ayuda="Ve solo su carga asignada y sus gastos, desde el celular.">
          <select value={choferId ?? ''} onChange={(e) => setChoferId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            {(choferes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {usuario && (
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" className="size-4 accent-marca" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo (si lo desactivás, deja de entrar en el momento)
        </label>
      )}
    </Panel>
  );
}
