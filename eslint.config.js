import fs from 'node:fs'
import path from 'node:path'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ── Garde-fou architecture : aucun import entre features/ ─────────────────────
// Règle d'or CLAUDE.md : chaque dossier features/<x> est étanche. Seuls shared/
// et app/ sont importables par tous. On génère un override par feature qui
// INTERDIT d'importer une AUTRE feature (relative `../<autre>/…` ou chemin
// contenant `features/<autre>`). Import de sa PROPRE feature (`./…`) : autorisé.
const featuresDir = path.join(import.meta.dirname, 'src/features')
const FEATURES = fs.existsSync(featuresDir)
  ? fs.readdirSync(featuresDir).filter(f =>
      fs.statSync(path.join(featuresDir, f)).isDirectory())
  : []

// Ratchet : la dette existante (eslint-arch-baseline.json) est tolérée pour ne
// pas bloquer la CI sur du legacy. Tout NOUVEL import cross-feature vers une
// cible non baselinée est bloqué. Réduire cette liste au fil des refactos.
const baselinePath = path.join(import.meta.dirname, 'eslint-arch-baseline.json')
const BASELINE = fs.existsSync(baselinePath)
  ? (JSON.parse(fs.readFileSync(baselinePath, 'utf8')).allowed ?? {})
  : {}

const crossFeatureOverrides = FEATURES.map(feature => ({
  files: [`src/features/${feature}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: FEATURES
        .filter(other => other !== feature)
        // Exclut les cibles déjà en dette pour cette feature (baseline).
        .filter(other => !(BASELINE[feature] ?? []).includes(other))
        .map(other => ({
          // `**/<other>` (import du dossier) + `**/<other>/**` (import d'un fichier).
          // Couvre le relatif sibling (`../<other>/x`) et l'absolu (`…/features/<other>/x`).
          group: [`**/${other}`, `**/${other}/**`],
          message:
            `Import cross-feature interdit : features/${feature} ne doit pas importer features/${other}. ` +
            `Passe par shared/ (helper partagé) ou app/.`,
        })),
    }],
  },
}))

export default defineConfig([
  globalIgnores(['dist', 'supabase/functions/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  ...crossFeatureOverrides,
])
