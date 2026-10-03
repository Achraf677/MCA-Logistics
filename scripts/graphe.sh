#!/usr/bin/env bash
# Carte du code (dépendances fonctions / imports) — graphify, 100 % local, sans IA.
# Usage : scripts/graphe.sh            → (ré)génère graphify-out/graph.json (~6 s)
#         scripts/graphe.sh explain X  → qui utilise / qu'utilise le symbole X
# Ne couvre PAS les tables / colonnes / Edge appelées par chaîne
# (from('deliveries'), functions.invoke('...')) : pour ça, CARTE-INTERCONNEXIONS + grep.
set -e
cd "$(dirname "$0")/.."
command -v graphify >/dev/null || pip install --quiet graphifyy
if [ "$1" = "explain" ] || [ "$1" = "path" ]; then
  [ -f graphify-out/graph.json ] || graphify extract src --code-only >/dev/null
  graphify "$@"
else
  graphify extract . --code-only
fi
