// Ouverture du PDF de lettre de voiture archivé, depuis sa référence
// `deliveries.lv_pdf_url` (`doc:<id>` → URL signée ; ancien lien Drive → tel quel).
//
// L'URL signée se calcule après un aller-retour réseau : un `window.open`
// appelé APRÈS un `await` est bloqué par Safari (hors geste utilisateur). On
// ouvre donc l'onglet tout de suite, pendant le clic, puis on le dirige vers
// l'URL une fois connue — ou on le referme si elle est introuvable.

import { lienPdfLv } from './livraisons.queries'

/** Renvoie false si le PDF est introuvable (l'appelant affiche un message). */
export async function ouvrirPdfLv(ref: string | null | undefined): Promise<boolean> {
  const onglet = window.open('about:blank', '_blank')
  const url = await lienPdfLv(ref)
  if (!url) {
    onglet?.close()
    return false
  }
  if (onglet) {
    onglet.opener = null
    onglet.location.href = url
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  return true
}
