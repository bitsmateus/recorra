export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold" style={{ color: accent || '#16233A' }}>
        {value}
      </div>
    </div>
  );
}

const bandMap: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  BOM: { label: 'Bom pagador', bg: '#E4F4EA', fg: '#0F6E56', dot: '#22A45D' },
  ATENCAO: { label: 'Atenção', bg: '#FCF0DE', fg: '#854F0B', dot: '#F0A93B' },
  RISCO: { label: 'Risco', bg: '#FCEBEB', fg: '#A32D2D', dot: '#EF4444' },
};

export function RiskBadge({ faixa }: { faixa?: string }) {
  const b = bandMap[faixa || ''] || { label: '—', bg: '#F1F5F9', fg: '#64748B', dot: '#94A3B8' };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: b.bg, color: b.fg }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: b.dot }} />
      {b.label}
    </span>
  );
}

export function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
