// Libellé « comptable » d'une opération Qonto : contrepartie + référence, comme Pennylane l'écrit pour Swan
// (ex. « MCA Logistics - COMPTE A COMPTE QONTO TO PENNYLANE 29/10/2026 »). Qonto sépare les deux champs.
// Le libellé d'origine reste dans raw_data.label.
export function libelleComptable(label: string | null | undefined, reference: string | null | undefined): string | null {
  const l = (label ?? '').trim();
  const r = (reference ?? '').trim();
  if (!r) return l || null;
  if (!l) return r;
  return l.includes(r) ? l : `${l} - ${r}`;
}
