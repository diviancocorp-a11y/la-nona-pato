# Plancha técnica Dico 3D

Herramienta autónoma de auditoría. No importa componentes de `src/`, no monta
assets en runtime y no modifica los masters.

```powershell
$env:NODE_PATH='C:\ruta\al\repo\node_modules'
node tools/dico-3d/generar-plancha.mjs `
  'platform\brand\dico-3d-masters' `
  '.qa-lite\dico-3d\plancha-final.svg'
```

El `NODE_PATH` sólo hace falta cuando se ejecuta desde un worktree sin su propio
`node_modules`. En un checkout instalado, alcanza el comando `node`.

La salida sólo se genera si los ocho masters oficiales pasan el contrato
integral. Embebe los PNG aprobados y dibuja:

- azul Volt: centro y diámetro estimado de moneda;
- dorado: bbox técnico del personaje;
- turquesa punteado: safe area proporcional al contrato final;
- borde gris: canvas completo.

Usar `--no-overlays` para generar la misma plancha limpia. La herramienta no
produce alfa, no recorta y no modifica los masters.
