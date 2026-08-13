-- 0006 Mover btree_gist al schema extensions. Aplicada via MCP el 9/jul/2026.
-- Cierra el warning "Extension in Public" del linter. El exclusion constraint de
-- appointments sigue funcionando (la dependencia es por OID del opclass, no por schema).

create schema if not exists extensions;
alter extension btree_gist set schema extensions;
