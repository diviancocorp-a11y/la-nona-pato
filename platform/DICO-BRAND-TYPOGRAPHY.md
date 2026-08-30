# DICO — Brand Manual / 02 Typography

## Autoridad vigente — 30/ago/2026

Este capítulo reemplaza la dupla provisional Söhne + Canela del manual
consolidado del 29/ago/2026. La dirección Machine Soul no cambia; cambia su
implementación por una dupla disponible, verificable y utilizable de inmediato.

> La máquina habla en Overused Grotesk. El alma habla en Butler.

## Sistema oficial

| Rol | Familia | Uso | Pesos aprobados |
| --- | --- | --- | --- |
| System / Machine | **Overused Grotesk** | interfaz, navegación, controles, tablas, métricas y copy operativo | 350, 400, 500, 600, 700; 800 sólo en marca compacta |
| Soul / Editorial | **Butler Free** | títulos editoriales, aperturas, mensajes humanos y momentos de marca | Roman 400 y Medium 500 |
| Technical | **JetBrains Mono** | IDs, códigos, trazas, tiempos y datos técnicos puntuales | 400, 500, 700 |
| Display | construcción DICO | wordmark y piezas hero; no se resuelve escribiendo DICO con Butler | según asset aprobado |

## Overused Grotesk

- Autor: Bao Nguyen / RandomMaerks.
- Fuente oficial: <https://github.com/RandomMaerks/Overused-Grotesk>.
- Versión fijada por commit:
  `73d02b98d4d9c3cb0532fb0c72f5e1597a46f106`.
- Archivo de producción: `OverusedGrotesk-VF.woff2`.
- Ejes disponibles: peso 300–900 y slant; DICO activa el eje de peso.
- Cobertura auditada: español y portugués completos, Latin Extended,
  vietnamita y cirílico.
- Funciones relevantes: números tabulares, fracciones, super/subíndices,
  símbolos monetarios y doce sets estilísticos.
- Licencia: SIL Open Font License 1.1. Puede incorporarse y redistribuirse con
  el software; no puede venderse como fuente aislada. La licencia completa se
  conserva junto al binario.

### Voz Machine

- Cuerpo operativo: 400.
- Tablas densas y metadata: 350/400.
- Inputs, botones y navegación: 500/600.
- KPIs: 700 con números tabulares.
- Mayúsculas técnicas: tracking positivo moderado; nunca compensar densidad
  usando todo en mayúsculas.
- El peso 800 queda reservado para firmas breves; 900 no forma parte del uso
  normal del producto.

## Butler Free

- Autor y propietario: Fabian De Smet.
- Fuente oficial: <https://www.fabiandesmet.com/portfolio/butler-font/>.
- Paquete de autoridad: `Butler-FREE.zip`, recibido el 30/ago/2026;
  SHA-256 del ZIP:
  `328a65b8db424d878042cde716be6a5ae15bc71c0145eee8cbc915a1db386744`.
- Archivos de producción: Butler Free Roman y Butler Free Medium en WOFF2.
- Cobertura auditada: español completo, signos `¿¡`, Latin Extended y símbolos
  monetarios frecuentes.
- Licencia: Butler Free EULA v2.00, 19/feb/2026. Autoriza trabajo creativo
  personal y comercial. La redistribución debe ser gratuita, sin modificar los
  archivos, incluyendo la licencia completa y un enlace claro al sitio oficial.
- La EULA original en PDF, su transcripción completa y el ReadMe oficial se
  distribuyen junto a los WOFF2.

### Voz Soul

- Roman 400: títulos principales, aperturas y mensajes de acompañamiento.
- Medium 500: énfasis editorial corto, nunca cuerpo largo.
- No usar Butler en tablas, labels, botones, inputs, precios, códigos ni
  navegación.
- No sintetizar bold ni italic. Si una pieza necesita otra voz, vuelve a
  Overused Grotesk o requiere una decisión de sistema.
- El contraste Machine/Soul debe aportar significado; no alternar familias por
  decoración.

## Aplicación por superficie

| Superficie | Machine | Soul | Estado |
| --- | --- | --- | --- |
| `/registro` | Overused Grotesk | Butler Free | activa |
| Plataforma / marketing nuevo | Overused Grotesk | Butler Free | autoridad para toda pieza nueva |
| Admin / POS legacy | adaptador DM Sans actual | excepcional | migración posterior, después de Golden Screens |
| Catálogo tenant | Inter / Source Serif 4 o identidad del tenant | identidad del tenant | deliberadamente independiente |

El catálogo no hereda tipografía DICO: es la cara del negocio del cliente. El
Admin sí pertenece a DICO, pero se migra por componentes para no introducir un
cambio raster transversal dentro de Phase 2B.

## Implementación técnica

```css
--ds-font-ui: 'Overused Grotesk', 'DM Sans', system-ui, sans-serif;
--ds-font-soul: 'Butler', 'Instrument Serif', Georgia, serif;
--ds-font-technical: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
```

- Autoalojamiento: `/public/fonts/dico`.
- Sin CDN ni request de Google para las familias DICO.
- `font-display: swap` para no bloquear el primer render.
- Los binarios se mantienen sin subsetting, renaming ni conversión.
- Hashes y licencias viven en `public/fonts/dico/README.md`.

## Do / Don't

### Do

- usar Overused para precisión, estructura y decisiones;
- usar Butler para humanidad, contexto y respiración editorial;
- mantener JetBrains Mono escaso y funcional;
- comprobar `áéíóúüñ¿¡` antes de aceptar cualquier actualización de archivos;
- revisar licencia y raster antes de cambiar el commit o el ZIP fijado.

### Don't

- reintroducir Söhne o Canela como dependencia de producción;
- mezclar Butler con Source Serif dentro de la misma superficie DICO;
- usar Butler para “hacer premium” una pantalla operativa;
- descargar las fuentes en runtime desde GitHub;
- transformar o redistribuir Butler sin su EULA completa;
- cambiar de versión silenciosamente.

## Definition of Done tipográfica

- el sistema funciona offline con sus WOFF2 locales;
- no existe fuente trial ni binario sin licencia;
- español completo renderiza sin fallback accidental;
- Machine y Soul se distinguen por función, no por ornamento;
- el catálogo tenant conserva independencia;
- hashes, versión y procedencia son auditables.
