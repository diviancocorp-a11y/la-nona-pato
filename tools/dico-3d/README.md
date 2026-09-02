# Plancha técnica Dico 3D

Herramienta autónoma de auditoría. No importa componentes de `src/`, no monta
assets en runtime y no modifica los masters.

```powershell
$env:NODE_PATH='C:\ruta\al\repo\node_modules'
node tools/dico-3d/generar-plancha.mjs `
  'C:\ruta\a\Dico 3D' `
  '.qa-lite\dico-3d\plancha-tecnica.svg'
```

El `NODE_PATH` sólo hace falta cuando se ejecuta desde un worktree sin su propio
`node_modules`. En un checkout instalado, alcanza el comando `node`.

La salida contiene las ocho poses oficiales, embebe los PNG de origen y dibuja:

- azul Volt: centro y diámetro estimado de moneda;
- dorado: bbox técnico del personaje;
- turquesa punteado: safe area proporcional al contrato final;
- borde gris: canvas completo.

Usar `--no-overlays` para generar la misma plancha limpia. La herramienta admite
el matte negro sólo para medir el lote actual. No produce alfa, no recorta y no
aprueba esos archivos para runtime.
