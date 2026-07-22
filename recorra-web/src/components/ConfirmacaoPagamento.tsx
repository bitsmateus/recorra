'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Pref { ativo: boolean; canal: string; templateName: string; assunto: string; conteudo: string }
interface Canal { id: string; canal: string; apelido?: string; ativo?: boolean }

const LABEL: Record<string, string> = {
  WHATSAPP_CLOUD: 'WhatsApp API oficial', WHATSAPP_EVOLUTION: 'WhatsApp (Evolution)', WHATSAPP_UAZAPI: 'WhatsApp (uazapi)',
  EMAIL: 'E-mail', SMS: 'SMS', HTTP_GENERIC: 'API genérica (HTTP)', NX_SYSTEMS: 'NX Systems',
};
const ehWhatsapp = (c: string) => c.startsWith('WHATSAPP');

/**
 * Mensagem automática enviada ao cliente quando a fatura recebe baixa
 * (por webhook do gateway ou pela conciliação). Antes o texto e o canal
 * eram fixos no código; agora ficam em Tenant.config.pagamentoRecebido.
 */
export default function ConfirmacaoPagamento() {
  const [p, setP] = useState<Pref | null>(null);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api<Pref>('/config/pagamento-recebido').then(setP).catch(() => {});
    api<Canal[]>('/config/canais').then(setCanais).catch(() => setCanais([]));
  }, []);

  if (!p) return null;
  const set = (k: keyof Pref, v: string | boolean) => setP((s) => (s ? { ...s, [k]: v } : s));
  const disponiveis = [...new Set(canais.filter((c) => c.ativo !== false).map((c) => c.canal))];
  const canalEfetivo = p.canal || disponiveis[0] || '';
  const precisaTemplate = ehWhatsapp(canalEfetivo);
  const semTemplate = precisaTemplate && !p.templateName.trim();

  async function salvar() {
    setSalvando(true); setMsg('');
    try {
      const r = await api<Pref>('/config/pagamento-recebido', { method: 'PUT', body: p });
      setP(r);
      setMsg('✓ Configuração salva.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink">Confirmação de pagamento</h2>
        <p className="text-sm text-muted">Mensagem enviada automaticamente ao cliente quando a cobrança recebe baixa (pelo gateway ou pela conciliação).</p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 cursor-pointer accent-primary" />
          <span className="font-medium text-ink">Enviar confirmação quando o pagamento for recebido</span>
        </label>

        {p.ativo && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Canal</span>
                <select value={p.canal} onChange={(e) => set('canal', e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="">Automático (primeiro canal ativo{disponiveis[0] ? ` — ${LABEL[disponiveis[0]] || disponiveis[0]}` : ''})</option>
                  {disponiveis.map((c) => <option key={c} value={c}>{LABEL[c] || c}</option>)}
                </select>
              </label>

              {precisaTemplate ? (
                <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Template do WhatsApp (HSM aprovado) *</span>
                  <input value={p.templateName} onChange={(e) => set('templateName', e.target.value)} placeholder="ex.: confirmacao_pagamento" className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
              ) : canalEfetivo === 'EMAIL' ? (
                <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Assunto do e-mail</span>
                  <input value={p.assunto} onChange={(e) => set('assunto', e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
              ) : <div />}
            </div>

            <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-muted">Mensagem</span>
              <textarea value={p.conteudo} onChange={(e) => set('conteudo', e.target.value)} rows={3} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            </label>
            <p className="mt-1 text-xs text-muted">Variáveis: <code className="rounded bg-canvas px-1">{'{{nome}}'}</code> <code className="rounded bg-canvas px-1">{'{{valor}}'}</code> <code className="rounded bg-canvas px-1">{'{{vencimento}}'}</code></p>

            {disponiveis.length === 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-warning"><AlertCircle size={14} className="mt-px shrink-0" /> Nenhum canal ativo. Adicione um canal acima para a confirmação poder ser enviada.</p>
            )}
            {semTemplate && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-warning"><AlertCircle size={14} className="mt-px shrink-0" /> O WhatsApp só aceita templates aprovados pela Meta — sem o nome do template, a confirmação não é enviada. Informe o template ou escolha outro canal.</p>
            )}
          </>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={salvar} disabled={salvando} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{salvando ? 'Salvando...' : 'Salvar'}</button>
          {msg && <span className="flex items-center gap-1 text-sm text-primary">{msg.startsWith('✓') && <CheckCircle2 size={14} />}{msg}</span>}
        </div>
      </div>
    </section>
  );
}
