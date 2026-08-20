// El negocio activo, para la vitrina.
//
// `activeTenant` resuelve el slug por HOSTNAME, y en localhost:5199 no hay
// ninguno: cualquier pantalla que pregunte "de que negocio soy" recibe null y
// se comporta como si el negocio no existiera. Sin esto, la pantalla de cobros
// aparece siempre "sin conectar" y parece un bug del componente cuando es de
// la vitrina.
const SLUG = 'cochi';

export function getTenantSlugSync() { return SLUG; }
export async function resolveTenantSlug() { return SLUG; }
export function setTenantSlug() {}
export function clearTenantSlug() {}
export default { getTenantSlugSync, resolveTenantSlug };
