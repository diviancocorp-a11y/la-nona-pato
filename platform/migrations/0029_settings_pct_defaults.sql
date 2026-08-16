-- 0029_settings_pct_defaults.sql
-- Los porcentajes proyectados dejan de ser NULL.
--
-- El problema: `waste_pct` estaba NULL en los 7 tenants (la fila de settings
-- la crea un trigger con solo el nombre). Y "NULL" se interpretaba distinto en
-- cada lado:
--   - Settings.jsx muestra `waste_pct ?? 5`  -> la pantalla decia 5%
--   - platformRecipes usaba Number(null) = 0 -> la cuenta usaba 0%
-- El usuario veia 5% en configuracion y ningun colchon en el costo, sin que
-- nada fallara ni avisara.
--
-- El fix en JS ya alinea las dos lecturas, pero mientras el valor viva como
-- NULL cada consumidor nuevo tiene que acordarse de aplicar el mismo default.
-- Esto lo hace explicito en la fuente: la DB guarda el numero que el usuario
-- ve, y el default de JS queda como red y no como regla.
--
-- Los valores son los del legacy (useFinancials): 5% de merma, 0% de gastos.
-- Un 0 explicito sigue siendo una eleccion valida y no se pisa.

alter table public.settings alter column waste_pct set default 5;
alter table public.settings alter column expense_pct set default 0;

update public.settings set waste_pct = 5 where waste_pct is null;
update public.settings set expense_pct = 0 where expense_pct is null;
