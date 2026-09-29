import { Fuel, Droplet, Wrench, Package } from 'lucide-react'
import type { FamilleProduit } from '../lib/produitsVehicule'

/** Pictogramme d'une famille de dépense véhicule — mêmes icônes (lucide) que le reste du site. */
export function IconeFamille({ famille, size = 14, className }: { famille: FamilleProduit; size?: number; className?: string }) {
  const Icone = { carburant: Fuel, liquide: Droplet, entretien: Wrench, equipement: Package }[famille]
  return <Icone size={size} className={className} aria-hidden />
}
