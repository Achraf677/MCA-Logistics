export interface Theme { id: string; name: string; swatch: string; vars: Record<string,string> }

export const THEMES: Theme[] = [
  { id:'cockpit', name:'Cockpit MCA', swatch:'linear-gradient(120deg,#ff2e3e,#f5b424)', vars:{
    '--bg':'#0b0809','--bg-elevated':'#15100f','--bg-card':'#1a1416','--bg-card-hover':'#251c1e','--bg-deep':'#070405',
    '--border':'#2a2123','--border-soft':'rgba(245,239,239,.10)','--border-strong':'#3a2e30',
    '--brand':'#ff2e3e','--brand-hover':'#ff5563','--brand-soft':'rgba(255,46,62,.14)','--brand-deep':'#c81414',
    '--gold':'#f5b424','--grad':'linear-gradient(120deg,#ff2e3e,#f5b424)',
    '--success':'#21e0a0','--danger':'#ff5247','--warning':'#f5b424','--info':'#4ca8ff','--accent-violet':'#a98bff',
    '--text':'#f5efef','--text-muted':'#a99fa0','--text-disabled':'#6f6566',
    '--glow-1':'rgba(255,46,62,.10)','--glow-2':'rgba(245,180,36,.08)' }},
  { id:'cyber', name:'Cyber', swatch:'linear-gradient(120deg,#3b82f6,#22d3ee)', vars:{
    '--bg':'#070b14','--bg-elevated':'#0e1626','--bg-card':'#111c2e','--bg-card-hover':'#1a2940','--bg-deep':'#04070d',
    '--border':'#1e2c42','--border-soft':'rgba(232,238,247,.10)','--border-strong':'#2a3d59',
    '--brand':'#3b82f6','--brand-hover':'#5a9bff','--brand-soft':'rgba(59,130,246,.16)','--brand-deep':'#1e40af',
    '--gold':'#22d3ee','--grad':'linear-gradient(120deg,#3b82f6,#22d3ee)',
    '--success':'#2dd4bf','--danger':'#fb7185','--warning':'#fbbf24','--info':'#38bdf8','--accent-violet':'#818cf8',
    '--text':'#e8eef7','--text-muted':'#94a3b8','--text-disabled':'#5b6b82',
    '--glow-1':'rgba(59,130,246,.12)','--glow-2':'rgba(34,211,238,.08)' }},
  { id:'emeraude', name:'Émeraude', swatch:'linear-gradient(120deg,#10d99a,#a3e635)', vars:{
    '--bg':'#06100c','--bg-elevated':'#0d1a14','--bg-card':'#11211a','--bg-card-hover':'#1a3024','--bg-deep':'#030a07',
    '--border':'#1d3328','--border-soft':'rgba(230,245,238,.10)','--border-strong':'#2a4a38',
    '--brand':'#10d99a','--brand-hover':'#34e6ad','--brand-soft':'rgba(16,217,154,.16)','--brand-deep':'#059669',
    '--gold':'#a3e635','--grad':'linear-gradient(120deg,#10d99a,#a3e635)',
    '--success':'#34d399','--danger':'#fb7185','--warning':'#fbbf24','--info':'#38bdf8','--accent-violet':'#818cf8',
    '--text':'#e6f5ee','--text-muted':'#92ad9f','--text-disabled':'#5b756a',
    '--glow-1':'rgba(16,217,154,.12)','--glow-2':'rgba(163,230,53,.08)' }},
  { id:'amethyste', name:'Améthyste', swatch:'linear-gradient(120deg,#a855f7,#f0abfc)', vars:{
    '--bg':'#0c0814','--bg-elevated':'#150f24','--bg-card':'#1a1230','--bg-card-hover':'#271a45','--bg-deep':'#070418',
    '--border':'#2a1f44','--border-soft':'rgba(241,234,247,.10)','--border-strong':'#3d2e63',
    '--brand':'#a855f7','--brand-hover':'#c084fc','--brand-soft':'rgba(168,85,247,.16)','--brand-deep':'#7c3aed',
    '--gold':'#f0abfc','--grad':'linear-gradient(120deg,#a855f7,#f0abfc)',
    '--success':'#34d399','--danger':'#fb7185','--warning':'#fbbf24','--info':'#38bdf8','--accent-violet':'#c084fc',
    '--text':'#f1eaf7','--text-muted':'#a99cb5','--text-disabled':'#6b5e7a',
    '--glow-1':'rgba(168,85,247,.12)','--glow-2':'rgba(240,171,252,.08)' }},
]

const KEY = 'mca-theme'
export function getThemeId(): string { try { return localStorage.getItem(KEY) || 'cockpit' } catch { return 'cockpit' } }
export function applyTheme(id: string) {
  const t = THEMES.find(x => x.id === id) || THEMES[0]
  const root = document.documentElement
  Object.entries(t.vars).forEach(([k,v]) => root.style.setProperty(k, v))
  try { localStorage.setItem(KEY, t.id) } catch {}
}
