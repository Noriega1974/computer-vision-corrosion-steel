// Quién puede editar, desactivar, reactivar o eliminar a otro usuario. Copia la
// regla del backend (api_usuarios `_fuera_de_alcance`, además de que solo
// admin y super_admin llegan a esas rutas):
//   - super_admin: a cualquiera.
//   - admin: solo técnicos y clientes de SU afiliación (nunca a otro admin ni a
//     un super_admin; un admin sin afiliación no gestiona a nadie).
//   - técnico y cliente: a nadie (el técnico solo puede dar de alta clientes).

// Roles que un admin puede gestionar (mismo conjunto que CREATABLE_ROLES.admin).
const ROLES_DE_ADMIN = ['tecnico', 'cliente'];

// actor: { rol, empresa_id }  objetivo: { rol, empresa_id }
export function puedeGestionar(actor, objetivo) {
  if (!actor || !objetivo) return false;
  if (actor.rol === 'super_admin') return true;
  if (actor.rol !== 'admin') return false;
  if (!actor.empresa_id || objetivo.empresa_id !== actor.empresa_id) return false;
  return ROLES_DE_ADMIN.includes(objetivo.rol);
}
