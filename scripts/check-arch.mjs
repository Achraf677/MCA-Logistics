#!/usr/bin/env node
// Garde-fou architecture MCA — double filet (redondant avec ESLint pour les
// imports, + checks que l'ESLint ne couvre pas). Échoue (exit 1) avec un
// message clair au premier bloquant. Les points "tolérants" (centimes) ne
// font que LISTER sans bloquer.
//
// Checks :
//   1. Imports cross-feature (bloquant, hors baseline eslint-arch-baseline.json).
//   2. Migrations : aucun DROP TABLE / DROP COLUMN hors commentaire (bloquant).
//   3. Aucun fichier *.down.sql dans supabase/migrations/ (bloquant).
//   4. Montants : déclarations `xxx: number` au nom "montant/amount/prix/cost/
//      total/solde/ht/ttc/tva" SANS suffixe _cts (tolérant — liste seulement).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FEATURES_DIR = path.join(ROOT, 'src/features')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations')

let hardFailures = 0
const softNotes = []

function fail(msg) { hardFailures++; console.error(`\x1b[31m✗ ${msg}\x1b[0m`) }
function ok(msg)   { console.log(`\x1b[32m✓ ${msg}\x1b[0m`) }

// ── Utils ────────────────────────────────────────────────────────────────────
function walk(dir, filterExt) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, filterExt))
    else if (!filterExt || filterExt.some(e => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

/** Retire les commentaires de ligne (--) et de bloc pour l'analyse SQL.
 *  [^\n]* (pas .*$) : sur CRLF (Windows), `.` n'inclut jamais \r, donc `--.*$`
 *  ne pouvait pas atteindre la fin de ligne réelle et ne retirait rien —
 *  faux positifs sur tout DROP commenté dans un fichier CRLF. */
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')    // blocs /* … */
    .replace(/--[^\n]*/g, '')             // ligne -- … (jusqu'à \n ou \r\n, peu importe)
}

// ── 1. Imports cross-feature ──────────────────────────────────────────────────
function checkCrossFeatureImports() {
  const features = fs.existsSync(FEATURES_DIR)
    ? fs.readdirSync(FEATURES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name)
    : []
  const featureSet = new Set(features)

  const baselinePath = path.join(ROOT, 'eslint-arch-baseline.json')
  const baseline = fs.existsSync(baselinePath)
    ? (JSON.parse(fs.readFileSync(baselinePath, 'utf8')).allowed ?? {})
    : {}

  const importRe = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  let violations = 0

  for (const feature of features) {
    const dir = path.join(FEATURES_DIR, feature)
    const allowed = new Set(baseline[feature] ?? [])
    for (const file of walk(dir, ['.ts', '.tsx'])) {
      const src = fs.readFileSync(file, 'utf8')
      let m
      while ((m = importRe.exec(src)) !== null) {
        const spec = m[1] ?? m[2]
        if (!spec || !spec.startsWith('.')) continue
        // Résout le chemin de l'import pour trouver la feature cible réelle.
        const resolved = path.resolve(path.dirname(file), spec)
        const rel = path.relative(FEATURES_DIR, resolved)
        if (rel.startsWith('..')) continue          // hors features/ (shared, app…)
        const targetFeature = rel.split(path.sep)[0]
        if (!featureSet.has(targetFeature)) continue
        if (targetFeature === feature) continue      // même feature = OK
        if (allowed.has(targetFeature)) continue     // dette baselinée = toléré
        violations++
        fail(`Import cross-feature : ${path.relative(ROOT, file)} → features/${targetFeature} ` +
             `(hors baseline). Passe par shared/.`)
      }
    }
  }
  if (violations === 0) ok('Imports cross-feature : aucun nouveau couplage (hors baseline)')
}

// ── 2 & 3. Migrations ─────────────────────────────────────────────────────────
function checkMigrations() {
  const files = walk(MIGRATIONS_DIR, ['.sql'])

  // 3. Pas de .down.sql séparé (DOWN doit être commenté en pied de fichier).
  const downFiles = files.filter(f => f.endsWith('.down.sql'))
  if (downFiles.length > 0) {
    for (const f of downFiles) {
      fail(`Fichier .down.sql interdit : ${path.relative(ROOT, f)} — le DOWN doit être commenté en pied du fichier UP.`)
    }
  } else {
    ok('Migrations : aucun .down.sql séparé')
  }

  // 2. Pas de DROP TABLE / DROP COLUMN hors commentaire.
  // Baseline : migrations historiques DÉJÀ APPLIQUÉES contenant un DROP légitime
  // (refactor de colonne). Elles sont figées (impossible de les ré-éditer sans
  // drift). Toute NOUVELLE migration avec DROP hors commentaire reste bloquée.
  const DROP_BASELINE = new Set([
    '20260622200000_charge_categories.sql',        // drop col `category` legacy → category_id
    '20260623110000_fuel_logs_tva_cts_writable.sql', // tva_cts GENERATED → integer (fix /120)
  ])
  let dropViolations = 0
  const dropRe = /\bdrop\s+(table|column)\b/i
  for (const f of files) {
    if (DROP_BASELINE.has(path.basename(f))) continue
    const code = stripSqlComments(fs.readFileSync(f, 'utf8'))
    if (dropRe.test(code)) {
      dropViolations++
      fail(`DROP TABLE/COLUMN hors commentaire : ${path.relative(ROOT, f)} — les migrations doivent être additives (DOWN commenté uniquement).`)
    }
  }
  if (dropViolations === 0) ok('Migrations : aucun DROP TABLE/COLUMN hors commentaire (hors baseline)')
}

// ── 4. Montants sans _cts (tolérant : liste seulement) ────────────────────────
function checkCentimes() {
  const src = walk(path.join(ROOT, 'src'), ['.ts', '.tsx'])
  // Champs monétaires typés `number` sans suffixe _cts.
  const moneyName = /(montant|amount|prix|price|cost|solde|total|_ht|_ttc|_tva)\w*/i
  const declRe = /^\s*(?:readonly\s+)?([a-zA-Z_]\w*)\s*\??\s*:\s*number(\s*\|\s*null)?\b/
  const suspects = []
  for (const file of src) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const m = declRe.exec(line)
      if (!m) return
      const name = m[1]
      if (!moneyName.test(name)) return
      if (/_cts$|cts$/i.test(name)) return        // déjà en centimes (_cts ou camelCase Cts)
      if (/rate|pct|percent|_rate|taux|milli|minutes?$|km$|_km$/i.test(name)) return  // taux/durées/distances, pas un montant € entier
      suspects.push(`${path.relative(ROOT, file)}:${i + 1}  ${name}: number`)
    })
  }
  if (suspects.length > 0) {
    softNotes.push(
      `Montants possiblement sans suffixe _cts (${suspects.length}) — à vérifier (non bloquant) :`,
      ...suspects.map(s => `    ${s}`),
    )
  } else {
    ok('Centimes : aucun champ monétaire `number` sans suffixe _cts détecté')
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('── Garde-fous architecture MCA ──')
checkCrossFeatureImports()
checkMigrations()
checkCentimes()

if (softNotes.length > 0) {
  console.log('\n\x1b[33m⚠ Points d\'attention (non bloquants) :\x1b[0m')
  for (const n of softNotes) console.log(`  ${n}`)
}

if (hardFailures > 0) {
  console.error(`\n\x1b[31m✗ ${hardFailures} violation(s) bloquante(s) — corrige avant de merger.\x1b[0m`)
  process.exit(1)
}
console.log('\n\x1b[32m✓ Architecture conforme.\x1b[0m')
