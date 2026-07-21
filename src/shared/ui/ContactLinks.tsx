// Liens de contact cliquables — téléphone (tel:) + email (mailto:).
// Icônes discrètes, affichage inchangé du texte. Le clic ne propage pas (utile
// dans une ligne/carte cliquable). Rien ne s'affiche si aucun contact.
import { Phone, Mail } from 'lucide-react'
import { telHref, mailtoHref } from '../lib/contact'

interface Props {
  phone?: string | null
  email?: string | null
  /** Taille des icônes (défaut 12). */
  iconSize?: number
  className?: string
}

export function ContactLinks({ phone, email, iconSize = 12, className }: Props) {
  const tel = telHref(phone)
  const mail = mailtoHref(email)
  if (!tel && !mail) return null

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${className ?? ''}`}>
      {tel && (
        <a
          href={tel}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors"
        >
          <Phone size={iconSize} className="shrink-0" />
          <span>{phone}</span>
        </a>
      )}
      {mail && (
        <a
          href={mail}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors"
        >
          <Mail size={iconSize} className="shrink-0" />
          <span>{email}</span>
        </a>
      )}
    </div>
  )
}
