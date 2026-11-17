'use client';

import { useEffect, useState } from 'react';
import { Plus, PhoneCall } from 'lucide-react';
import { api, papelAtual } from '@/lib/api';

interface Origem { id: string; nome: string }
interface Usuario { id: string; nome: string; ativo: boolean }

/**
 * "Origem do atendimento" de uma cobrança: de onde veio a negociação/pagamento (Ligação, Omni, Chamado...)
 * e quem negociou. Cada empresa cria as suas opções. Com "negociado por", o crédito da recuperação vai
 * para essa pessoa. Operador registra em seu nome; gestão escolhe qualquer pessoa.
 */
export function OrigemFatura({ invoiceId, origem, negociadoPorId, negociadoPorNome, onSaved }: {
  invoiceId: string; origem?: string | null; negociadoPorId?: string | null; negociadoPorNome?: string | null; onSaved?: () => void;
}) {
  const [opcoes, setOpcoes] = useState<Origem[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [valor, setValor] = useState(origem ?? '');
  const [pessoa, setPessoa] = useState(negociadoPorId ?? '');
  const [nova, setNova] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const gestao = ['OWNER', 'ADMIN', 'FINANCEIRO'].includes(papelAtual() ?? '');

  useEffect(() => { api<Origem[]>('/cobrancas/origens').then(setOpcoes).catch(() => {}); }, []);
  useEffect(() => { if (gestao) api<Usuario[]>('/usuarios').then((u) => setUsuarios(u.filter((x) => x.ativo))).catch(() => {}); }, [gestao]);
  useEffect(() => { setValor(origem ?? ''); setPessoa(negociadoPorId ?? ''); }, [origem, negociadoPorId]);

  async function salvar(o: string, p: string) {
    setBusy(true); setMsg('');
    try {
      await api(`/cobrancas/${invoiceId}/origem`, { method: 'PUT', body: { origem: o || null, ...(gestao && o ? { negociadoPorId: p || null } : {}) } });
      setMsg('✓ salvo'); onSaved?.();
      api<Origem[]>('/cobrancas/origens').then(setOpcoes).catch(() => {});
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setBusy(false); }
  }
  async function criar() {
    const nome = (nova ?? '').trim();
    if (!nome) { setNova(null); return; }
    await api('/cobrancas/origens', { method: 'POST', body: { nome } }).catch(() => {});
    setNova(null); setValor(nome); await salvar(nome, pessoa);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <PhoneCall size={13} className="text-muted" aria-hidden />
      <label className="flex items-center gap-1.5 text-muted">Origem
        <select value={valor} disabled={busy} onChange={(e) => { if (e.target.value === '__nova') { setNova(''); return; } setValor(e.target.value); salvar(e.target.value, pessoa); }}
          className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-primary disabled:opacity-60">
          <option value="">Sem origem (régua/automático)</option>
          {opcoes.map((o) => <option key={o.id} value={o.nome}>{o.nome}</option>)}
          {valor && !opcoes.some((o) => o.nome === valor) && <option value={valor}>{valor}</option>}
          <option value="__nova">+ Nova origem…</option>
        </select>
      </label>
      {nova !== null && (
        <span className="flex items-center gap-1">
          <input autoFocus value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') setNova(null); }} maxLength={40} placeholder="Ex.: Presencial" className="w-32 rounded border border-line px-2 py-1 text-xs outline-none focus:border-primary" />
          <button onClick={criar} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-white hover:bg-primary-hover"><Plus size={11} /> Adicionar</button>
        </span>
      )}
      {valor && (gestao ? (
        <label className="flex items-center gap-1.5 text-muted">Negociado por
          <select value={pessoa} disabled={busy} onChange={(e) => { setPessoa(e.target.value); salvar(valor, e.target.value); }} className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-primary disabled:opacity-60">
            <option value="">Eu</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
      ) : negociadoPorNome ? <span className="text-muted">Negociado por <b className="text-ink">{negociadoPorNome}</b></span> : null)}
      {msg && <span className={msg.startsWith('✓') ? 'text-success' : 'text-danger'}>{msg}</span>}
    </div>
  );
}
