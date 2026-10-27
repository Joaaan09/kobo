#!/usr/bin/env bash
# Arranque de sesión: muestra el estado actual del proyecto Kobo.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "工房  Kobo — estado del proyecto"
echo "================================="
echo

if [ -f .progreso/estado.md ]; then
  echo "── .progreso/estado.md (checkpoint) ─────────────────────────"
  head -n 40 .progreso/estado.md
  echo
fi

echo "── Rama git ────────────────────────────────────────────────"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  && git status -sb | head -n 20 \
  || echo "  (aún no es un repo git — ver plan.md: git init + main/staging)"
echo

echo "── Recuerda ────────────────────────────────────────────────"
echo "  · Lee CLAUDE.md y DESIGN.md antes de tocar nada."
echo "  · Modo Directo por defecto; subagentes solo con el 'botón rojo' (CLAUDE.md §8)."
echo "  · Al terminar: actualiza .progreso/estado.md y añade línea a log.md."
