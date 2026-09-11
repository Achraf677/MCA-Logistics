import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Navigation2, Check, Phone, Package, Camera } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { deposerTicket } from '../../shared/lib/receiptsInbox.queries'
import { canTransition } from '../../shared/lib/livraisonStatuts'
import { getMesCourses, avancerCourse } from './mescourses.queries'
import {
  bornesPeriode, decalerPeriode, libellePeriode,
  grouperParJour, estAFaire, resteAFaire,
  type ModePeriode,
} from './mescourses.logic'
import type { CourseChauffeur } from './mescourses.types'

const MODES: Array<{ key: ModePeriode; label: string }> = [
  { key: 'jour',    label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois',    label: 'Mois' },
]

const aujourdhui = () => new Date().toISOString().slice(0, 10)

/**
 * Écran chauffeur — « Mes courses ».
 *
 * Volontairement pauvre : une période, une liste d'arrêts, deux gestes par
 * arrêt (naviguer, marquer livré). Aucun montant n'est chargé (voir
 * mescourses.types.ts). Le filtrage par chauffeur est assuré par la policy RLS
 * `deliveries_select_own`, pas par cet écran.
 *
 * Pensé pour un téléphone tenu d'une main : cibles tactiles hautes, une colonne.
 */
export function MesCourses() {
  const { toast } = useToast()
  const [mode, setMode]     = useState<ModePeriode>('jour')
  const [ancre, setAncre]   = useState(aujourdhui)
  const [courses, setCourses] = useState<CourseChauffeur[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur]   = useState<string | null>(null)
  const [busyId, setBusyId]   = useState<string | null>(null)

  const { debut, fin } = bornesPeriode(ancre, mode)

  const charger = useCallback(async () => {
    setLoading(true); setErreur(null)
    const { data, error } = await getMesCourses(debut, fin)
    if (error) { setErreur(error.message); setCourses([]) }
    else setCourses(data ?? [])
    setLoading(false)
  }, [debut, fin])

  useEffect(() => { charger() }, [charger])

  const groupes = grouperParJour(courses)
  const { reste, total } = resteAFaire(courses)

  /**
   * Un chauffeur ne peut qu'AVANCER une course : démarrer, puis livrer. La
   * machine à états reste la référence unique (`canTransition`) — on ne
   * réimplémente pas les règles ici.
   */
  const avancer = async (c: CourseChauffeur) => {
    const cible = c.statut === 'planifiee' ? 'en_cours' : 'livree'
    if (!canTransition(c.statut, cible)) {
      toast(`Passage ${c.statut} → ${cible} impossible`, 'error'); return
    }
    setBusyId(c.id)
    const { error } = await avancerCourse(c.id, cible)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(cible === 'en_cours' ? 'Course démarrée' : 'Course livrée')
    await charger()
  }

  return (
    <Shell pageTitle="Mes courses">
      {/* Sélecteur de période — collé en haut, toujours atteignable au pouce */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-1 p-1 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 min-h-[40px] rounded-[var(--r-md)] text-[var(--fs-sm)] font-medium transition-colors ${
                mode === m.key
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAncre(a => decalerPeriode(a, mode, -1))}
            aria-label="Période précédente"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex-1 text-center">
            <span className="block text-[var(--fs-sm)] font-medium text-[var(--text)] first-letter:uppercase">
              {libellePeriode(ancre, mode)}
            </span>
            {!loading && (
              <span className="block text-[var(--fs-xs)] text-[var(--text-muted)]">
                {total === 0
                  ? 'aucune course'
                  : `${reste} restante${reste > 1 ? 's' : ''} sur ${total}`}
              </span>
            )}
          </div>

          <button
            onClick={() => setAncre(a => decalerPeriode(a, mode, 1))}
            aria-label="Période suivante"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {ancre !== aujourdhui() && (
          <button
            onClick={() => setAncre(aujourdhui())}
            className="self-center text-[var(--fs-xs)] text-[var(--brand)] underline min-h-[32px]"
          >
            Revenir à aujourd'hui
          </button>
        )}
      </div>

      <ScannerTicket />

      {erreur && (
        <p className="mb-4 text-[var(--fs-sm)] text-[var(--danger)]">{erreur}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title="Aucune course sur cette période"
          description="Change de période avec les flèches, ou reviens à aujourd'hui."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groupes.map(([jour, duJour]) => (
            <section key={jour} className="flex flex-col gap-2">
              {/* En-tête de jour : inutile en mode « jour », le titre le dit déjà */}
              {mode !== 'jour' && (
                <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide first-letter:uppercase">
                  {libellePeriode(jour, 'jour')}
                </h2>
              )}

              {duJour.map(c => (
                <CarteCourse
                  key={c.id}
                  course={c}
                  busy={busyId === c.id}
                  onAvancer={() => avancer(c)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </Shell>
  )
}

function CarteCourse({
  course: c, busy, onAvancer,
}: {
  course: CourseChauffeur
  busy: boolean
  onAvancer: () => void
}) {
  const aFaire = estAFaire(c.statut)
  const geo = c.delivery_lat != null && c.delivery_lng != null

  return (
    <article className={`rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3 ${
      aFaire ? '' : 'opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[var(--text)] truncate">{c.clients?.name ?? '—'}</p>
          {c.delivery_address && (
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">{c.delivery_address}</p>
          )}
        </div>
        <Badge color={aFaire ? 'warning' : 'success'}>
          {c.statut === 'planifiee' ? 'À faire'
            : c.statut === 'en_cours' ? 'En cours'
            : 'Livrée'}
        </Badge>
      </div>

      {(c.description || c.weight_kg != null || c.vehicles) && (
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
          {[
            c.description,
            c.weight_kg != null ? `${c.weight_kg} kg` : null,
            c.vehicles ? `${c.vehicles.label} (${c.vehicles.plate})` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {geo && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${c.delivery_lat},${c.delivery_lng}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
              hover:border-[var(--brand)] transition-colors"
          >
            <Navigation2 size={15} /> Naviguer
          </a>
        )}

        {c.clients?.phone && (
          <a
            href={`tel:${c.clients.phone}`}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
              hover:border-[var(--brand)] transition-colors"
          >
            <Phone size={15} /> Appeler
          </a>
        )}

        {aFaire && (
          <Button
            variant="primary"
            className="min-h-[44px] ml-auto"
            onClick={onAvancer}
            disabled={busy}
          >
            {busy ? '…' : c.statut === 'planifiee' ? 'Démarrer' : (
              <span className="inline-flex items-center gap-1.5"><Check size={15} /> Livré</span>
            )}
          </Button>
        )}
      </div>
    </article>
  )
}

/**
 * Dépôt d'un ticket photographié (péage, plein, pièce détachée…).
 *
 * `capture="environment"` ouvre directement l'appareil photo arrière sur
 * téléphone, au lieu du sélecteur de fichiers : c'est le geste attendu au bord
 * de la route. Sur ordinateur, l'attribut est ignoré et on retombe sur le
 * sélecteur habituel.
 */
function ScannerTicket() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [ouvert, setOuvert] = useState(false)

  const choisir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de reprendre le même fichier après une erreur
    if (!file || !companyId) return

    setEnvoi(true)
    const { error } = await deposerTicket(file, companyId, note)
    setEnvoi(false)
    if (error) { toast(error.message, 'error'); return }

    setNote('')
    setOuvert(false)
    toast('Ticket envoyé — il apparaît côté gestion')
  }

  return (
    <div className="mb-4 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={choisir}
      />

      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 text-[var(--fs-sm)]
            text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors"
        >
          <Camera size={16} /> Scanner un ticket
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="De quoi s'agit-il ? (péage A35, plein Movano…)"
            className="w-full min-h-[44px] px-3 rounded-[var(--r-md)] bg-[var(--bg)]
              border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)]
              focus:outline-none focus:border-[var(--brand)]"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1 min-h-[44px]"
              onClick={() => inputRef.current?.click()}
              disabled={envoi}
            >
              {envoi ? 'Envoi…' : 'Prendre la photo'}
            </Button>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => { setOuvert(false); setNote('') }}
              disabled={envoi}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
