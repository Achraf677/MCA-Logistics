import { useEffect, useState } from 'react'
import { Phone, Mail, IdCard, Stethoscope, FileText, Image as ImageIcon, Truck, LogOut, Smartphone, User } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { InstallAppButton } from '../../shared/ui/InstallAppButton'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import { getDownloadUrl } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { getDocumentsDeMaFiche, getMesCourses, seDeconnecter } from './mescourses.queries'
import { filtrerMesCourses, libelleCategorieDocument, libelleDateCourte, vehiculesDuJour } from './mescourses.logic'
import { etatEcheance, type EtatEcheance } from './espace.logic'
import type { EtatFiche, MaFiche } from './mescourses.types'
import { Carte, TitreCarte, MessageErreur, GardeFiche, boutonSecondaireCls } from './EspaceCommun'

/**
 * Moi : mes coordonnées, mon permis et ma visite médicale (avec alerte), mes
 * documents, mon véhicule du jour, installer l'appli, se déconnecter.
 * Pas de « Appeler le bureau » : la société n'a pas de numéro de téléphone en
 * base (`companies` sans colonne téléphone, vérifié le 13/10/2026).
 */
export function Moi({ fiche }: { fiche: EtatFiche }) {
  const [sortie, setSortie] = useState(false)
  const deconnexion = async () => { setSortie(true); await seDeconnecter() }
  return (
    <div className="flex flex-col gap-4">
      <GardeFiche fiche={fiche}>{f => <MoiFiche fiche={f} />}</GardeFiche>

      <Carte>
        <TitreCarte icone={<Smartphone size={18} />}>L'appli sur ton téléphone</TitreCarte>
        <p className="text-sm text-[var(--text-muted)]">
          Installe le site comme une appli : il s'ouvre d'un geste depuis l'écran d'accueil.
        </p>
        <InstallAppButton />
      </Carte>

      <button className={`${boutonSecondaireCls} w-full text-[var(--danger)]`} onClick={deconnexion} disabled={sortie}>
        <LogOut size={18} /> {sortie ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </div>
  )
}

function MoiFiche({ fiche }: { fiche: MaFiche }) {
  const { toast } = useToast()
  const { profile } = useProfile()
  const auj = toLocalISO(new Date())
  const [docs, setDocs] = useState<DocumentRow[] | null>(null)
  const [erreurDocs, setErreurDocs] = useState<string | null>(null)
  const [vehicules, setVehicules] = useState<string[] | null>(null)
  const [ouverture, setOuverture] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    getDocumentsDeMaFiche(fiche.id).then(({ data, error }) => {
      if (annule) return
      setErreurDocs(error ? error.message : null)
      setDocs(data)
    })
    // Véhicule du jour : celui de SES courses (un président voit toutes les courses).
    getMesCourses(auj, auj).then(({ data }) => {
      if (annule) return
      const siennes = profile?.role === 'chauffeur' ? (data ?? []) : filtrerMesCourses(data ?? [], fiche.id)
      setVehicules(vehiculesDuJour(siennes))
    })
    return () => { annule = true }
  }, [fiche.id, auj, profile?.role])

  const ouvrir = async (d: DocumentRow) => {
    setOuverture(d.id)
    const url = await getDownloadUrl(d)
    setOuverture(null)
    if (!url) { toast('Ce document est introuvable.', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <Carte>
        <TitreCarte icone={<User size={18} />}>{fiche.full_name}</TitreCarte>
        <Coordonnee icone={<Phone size={16} />} valeur={fiche.phone} vide="Téléphone non renseigné" />
        <Coordonnee icone={<Mail size={16} />} valeur={fiche.email} vide="E-mail non renseigné" />
        <p className="text-xs text-[var(--text-muted)]">Une erreur ? Préviens le bureau, il corrige ta fiche.</p>
      </Carte>

      <Carte>
        <TitreCarte icone={<IdCard size={18} />}>Mes échéances</TitreCarte>
        <Echeance icone={<IdCard size={16} />} libelle="Permis B" date={fiche.licence_b_expiry} etat={etatEcheance(fiche.licence_b_expiry, auj)} />
        <Echeance icone={<Stethoscope size={16} />} libelle="Visite médicale" date={fiche.medical_visit_expiry} etat={etatEcheance(fiche.medical_visit_expiry, auj)} />
      </Carte>

      <Carte>
        <TitreCarte icone={<Truck size={18} />}>Mon véhicule aujourd'hui</TitreCarte>
        {vehicules == null ? <Skeleton className="h-6" />
          : vehicules.length === 0
            ? <p className="text-sm text-[var(--text-muted)]">Aucune course aujourd'hui, donc pas de véhicule attribué.</p>
            : <p className="text-base font-medium text-[var(--text)]">{vehicules.join(' / ')}</p>}
      </Carte>

      <Carte>
        <TitreCarte icone={<FileText size={18} />}>Mes documents</TitreCarte>
        {erreurDocs && <MessageErreur>Documents illisibles : {erreurDocs}</MessageErreur>}
        {docs == null ? <Skeleton className="h-12" />
          : docs.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Aucun document sur ta fiche.</p>
          : (
            <ul className="flex flex-col gap-1.5">
              {docs.map(d => (
                <li key={d.id}>
                  <button onClick={() => ouvrir(d)} disabled={ouverture === d.id}
                    className="w-full flex items-center gap-2 min-h-12 px-3 rounded-[var(--r-md)] text-left
                      border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--brand)] disabled:opacity-50">
                    <span className="text-[var(--text-muted)] shrink-0">
                      {(d.mime_type ?? '').startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[var(--text)] truncate">{d.file_name}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{libelleCategorieDocument(d.category)}</span>
                    </span>
                    {ouverture === d.id && <span className="text-xs text-[var(--text-muted)]">Ouverture…</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Carte>
    </>
  )
}

function Coordonnee({ icone, valeur, vide }: { icone: React.ReactNode; valeur: string | null; vide: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className="text-[var(--text-muted)]">{icone}</span>
      {valeur ? <span className="text-[var(--text)] break-all">{valeur}</span> : <span className="text-[var(--text-muted)]">{vide}</span>}
    </p>
  )
}

const COULEUR_ECHEANCE: Record<EtatEcheance['niveau'], 'muted' | 'danger' | 'warning' | 'success'> = {
  absente: 'muted', depassee: 'danger', bientot: 'warning', ok: 'success',
}

function Echeance({ icone, libelle, date, etat }: { icone: React.ReactNode; libelle: string; date: string | null; etat: EtatEcheance }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-[var(--r-md)] border ${
      etat.niveau === 'depassee' ? 'border-[var(--danger)]/40 bg-[var(--danger)]/10'
        : etat.niveau === 'bientot' ? 'border-[var(--warning)]/40 bg-[var(--warning)]/10' : 'border-[var(--border)]'}`}>
      <span className="text-[var(--text-muted)]">{icone}</span>
      <div className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-[var(--text)]">{libelle}</span>
        <span className="block text-xs text-[var(--text-muted)]">
          {date ? <>Valable jusqu'au <span className="first-letter:uppercase">{libelleDateCourte(date.slice(0, 10))}</span> {date.slice(0, 4)}</> : etat.libelle}
        </span>
      </div>
      {date && <Badge color={COULEUR_ECHEANCE[etat.niveau]}>{etat.libelle}</Badge>}
    </div>
  )
}
