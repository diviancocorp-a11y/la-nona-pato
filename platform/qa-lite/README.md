# DICO-QA-Lite

Instrumento local y descartable para responder una sola pregunta:

> ¿`621c492` conserva el DOM, layout, estilos computados y raster de su padre?

No es staging, no usa Vercel, no conoce proyectos Supabase remotos y no agrega
rutas ni flags al runtime. QA Platform queda fuera de esta fase.

## Prerrequisitos

- Node 22.
- Docker Desktop iniciado.
- Chromium de Playwright (`npx playwright install chromium`).

No hacen falta credenciales. Las keys que entrega Supabase local se capturan en
memoria, no se imprimen y no se escriben en artifacts.

## Comandos

```powershell
npm run qa:lite:setup
npm run qa:lite:motion-inventory -- --ref=621c492^
npm run qa:lite:compare -- --base=621c492^ --candidate=621c492
```

`qa:lite:setup` copia mecanicamente `platform/migrations` al workdir local,
levanta Supabase, hace reset, carga `seed.sql` y crea un owner Auth efimero.

`qa:lite:compare` hace dos fases estrictamente seriales:

```text
reset -> base -> reset -> candidate -> comparar
```

`qa:lite:motion-inventory` verifica que no existan animaciones infinitas
desconocidas en Admin ni en los tres temas del catalogo. El splash finito del
catalogo se espera hasta su desmontaje; los cinco blobs decorativos del carrusel
se congelan selectivamente en fase cero mediante su contrato WAAPI.

Los previews pueden estar levantados al mismo tiempo, pero nunca navegan ni
mutan la base en paralelo. Cada fase recibe un Auth UUID nuevo y ese valor se
normaliza fuera del contrato.

## Gate

Primario: DOM relevante, clases, atributos, cajas, inline styles, propiedades
computadas curadas y pseudoelementos con contenido.

Secundario: ocho screenshots comparados con Pixelmatch 7.2.0, `threshold: 0.01`,
`includeAA: false` y cero pixeles bloqueantes permitidos. El diff RGBA binario
se conserva completo como diagnostico; antialiasing y redondeo subcanal se
informan por separado y no se convierten en una tolerancia por cantidad:

1. Admin light, 1440x1000.
2. Admin dark, 1440x1000.
3. POS light, 1440x1000.
4. POS dark, 1440x1000.
5. POS light, 390x844.
6. Catalogo ambar, 390x844.
7. Catalogo noche, 390x844.
8. Catalogo carbon, 390x844.

Las animaciones finitas deben alcanzar tres frames consecutivos de quiescencia.
El motion infinito se inventaria antes de aplicar contratos dirigidos: los
blobs del catalogo se congelan en fase conocida y Dico usa
`static-neutral-dico` para DOM y screenshot.

No existe comando de rebaseline para Phase 1. Cualquier pixel bloqueante
produce evidencia y falla; no actualiza ninguna expectativa.

## Red y assets

La allowlist acepta solamente localhost/127.0.0.1. Google Fonts se intercepta
antes de salir a red:

- el CSS se responde desde `e2e/qa-lite/assets/fonts.css`;
- los WOFF2 se responden desde paquetes `@fontsource` pinneados;
- esas requests se registran como `fulfilledLocal`;
- cualquier otra URL externa se aborta y hace fallar la prueba.

Las fuentes legacy interceptadas son DM Sans, DM Serif Display, Instrument
Serif, Inter, Source Serif 4 y JetBrains Mono. La tipografía DICO nueva
(Overused Grotesk + Butler) se sirve localmente desde `public/fonts/dico`;
no hay Söhne, Canela ni archivos trial.

Los productos del seed usan SVG locales en `public/clients/dico-qa-lite`.

## Evidencia

Cada corrida escribe bajo `.qa-lite/artifacts/<run-id>/`:

```text
base/dom/                 contratos del padre
candidate/dom/            contratos del commit
base/screenshots/         raster del padre
candidate/screenshots/    raster del commit
screenshots/diff/         amarillo AA, cian redondeo, rojo bloqueante
dom-diff.json             propiedades diferentes
network-*.json            fulfilled-local y bloqueos
manifest.json             refs, versiones, hashes y veredicto
```

El manifiesto incluye hostname y puertos locales, nunca keys, contraseñas,
DB URLs ni Auth UUIDs.

## Estado sin Docker

Los tests unitarios, lint y typecheck pueden correr sin Docker. El gate no.
La salida correcta en esa maquina es:

```text
IMPLEMENTED / NOT EXECUTED — Docker prerequisite missing
```
