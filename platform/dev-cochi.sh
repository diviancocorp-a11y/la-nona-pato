#!/usr/bin/env bash
# Levanta el catalogo de COCHI corriendo sobre el edificio (hermes-platform).
# Uso desde git bash (MINGW64), doble click no: abrir git bash y:
#   bash ~/Proyectos/hermes-gastro/platform/dev-cochi.sh
set -e
cd "$(dirname "$0")/.."
echo "Carpeta: $(pwd)"

# devDeps: NODE_ENV=production global se come vite/husky (bug #5 CLAUDE.md)
if [ ! -d node_modules/vite ]; then
  echo "Instalando dependencias (incluye devDeps)..."
  NODE_ENV=development npm install --include=dev
fi

echo "Levantando CLIENT=hermes-cochi (catalogo de cochi contra el edificio)..."
CLIENT=hermes-cochi npm run dev
