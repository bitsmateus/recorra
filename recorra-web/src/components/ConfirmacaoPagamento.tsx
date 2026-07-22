'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Pref { ativo: boolean; canal: string; templateName: string; templateParams: string[]; assunto: string; conteudo: string }
interface Canal { id: string; canal: string; apelido?: string; ativo?: boolean }
interface TemplateWa { id: string; nome: string; corpo: string; status: string; idioma?: string }
interface ModeloEmail { id: string; nome: string; assunto: string; corpo: string }

const LABEL: Record<string, string> = {
  WHATSAPP_CLOUD: 'WhatsApp API oficial', NX_SYSTEMS: 'WhatsApp oficial (NX Systems)',
  WHATSAPP_EVOLUTION: 'WhatsApp (Evolution)', WHATSAPP_UAZAPI: 'WhatsApp (uazapi)',
  EMAIL: 'E-mail', SMS: 'SMS', HTTP_GENERIC: 'API genérica (HTTP)',
};
/** Canais que só entregam via template aprovado — mesma lista do DispatchService. */
const ehWhatsapp = (c: string) => c.startsWith('WHATSAPP') || c === 'NX_SYSTEMS';

/** Variáveis {{1}}, {{2}}... presentes no corpo de um template HSM. */
function variaveisDoCorpo(corpo: string): number[] {
  const nums = [...corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(nums)].sort((a, b) => a - b);
}

const SUGESTOES = ['{{nome}}', '{{valor}}', '{{vencimento}}'];

/**
 * Mensagem automática enviada ao cliente quando a fatura recebe baixa
 * (por webhook do gateway ou pela conciliação). Antes o texto e o canal
 * eram fixos no código; agora ficam em Tenant.config.pagamentoRecebido.
 */
export default function ConfirmacaoPagamento() {
  const [p, setP] = useState<Pref | null>(null);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [templates, setTemplates] = useState<TemplateWa[]>([]);
  const [modelos, setModelos] = useState<ModeloEmail[]>([]);
  const [modeloEmailId, setModeloEmailId] = useState('');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api<Pref>('/config/pagamento-recebido').then((r) => setP({ ...r, templateParams: r.templateParams ?? [] })).catch(() => {});
    api<Canal[]>('/config/canais').then(setCanais).catch(() => setCanais([]));
    api<TemplateWa[]>('/config/templates').then(setTemplates).catch(() => setTemplates([]));
    api<ModeloEmail[]>('/modelos-email').then(setModelos).catch(() => setModelos([]));
  }, []);

  if (!p) return null;
  const set = (k: keyof Pref, v: string | boolean | string[]) => setP((s) => (s ? { ...s, [k]: v } : s));
  const disponiveis = [...new Set(canais.filter((c) => c.ativo !== false).map((c) => c.canal))];
  const canalEfetivo = p.canal || disponiveis[0] || '';
  const precisaTemplate = ehWhatsapp(canalEfetivo);
  const semTemplate = precisaTemplate && !p.templateName.trim();

  const aprovados = templates.filter((t) => t.status === 'APROVADO');
  const selecionado = aprovados.find((t) => t.nome === p.templateName);
  const vars = selecionado ? variaveisDoCorpo(selecionado.corpo) : [];

  /** Trocar de template zera os parâmetros: as variáveis do anterior não valem para o novo. */
  function escolherTemplate(nome: string) {
    const t = aprovados.find((x) => x.nome === nome);
    const n = t ? variaveisDoCorpo(t.corpo).length : 0;
    setP((s) => (s ? { ...s, templateName: nome, templateParams: Array.from({ length: n }, (_, i) => SUGESTOES[i] ?? '') } : s));
  }

  function setParam(i: number, v: string) {
    setP((s) => {
      if (!s) return s;
      const arr = [...s.templateParams];
      arr[i] = v;
      return { ...s, templateParams: arr };
    });
  }

  /** Aplica um modelo de e-mail copiando assunto e corpo — depois dá para editar aqui. */
  function aplicarModelo(id: string) {
    setModeloEmailId(id);
    const m = modelos.find((x) => x.id === id);
    if (m) setP((s) => (s ? { ...s, assunto: m.assunto, conteudo: m.corpo } : s));
  }

  async function salvar() {
    setSalvando(true); setMsg('');
    try {
      const r = await api<Pref>('/config/pagamento-recebido', { method: 'PUT', body: p });
      setP({ ...r, templateParams: r.templateParams ?? [] });
      setMsg('✓ Configuração salva.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  const inputCls = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary';

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
                <select value={p.canal} onChange={(e) => set('canal', e.target.value)} className={inputCls}>
                  <option value="">Automático (primeiro canal ativo{disponiveis[0] ? ` — ${LABEL[disponiveis[0]] || disponiveis[0]}` : ''})</option>
                  {disponiveis.map((c) => <option key={c} value={c}>{LABEL[c] || c}</option>)}
                </select>
              </label>

              {precisaTemplate ? (
                <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Template aprovado na Meta *</span>
                  <select value={p.templateName} onChange={(e) => escolherTemplate(e.target.value)} className={inputCls}>
                    <option value="">Selecione um template...</option>
                    {aprovados.map((t) => <option key={t.id} value={t.nome}>{t.nome}{t.idioma ? ` (${t.idioma})` : ''}</option>)}
                  </select>
                </label>
              ) : canalEfetivo === 'EMAIL' ? (
                <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Modelo de e-mail</span>
                  <select value={modeloEmailId} onChange={(e) => aplicarModelo(e.target.value)} className={inputCls}>
                    <option value="">Escrever do zero (ou aplicar um modelo...)</option>
                    {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </label>
              ) : <div />}
            </div>

            {precisaTemplate ? (
              <>
                {selecionado && (
                  <div className="mt-3 rounded border border-line bg-canvas p-3">
                    <div className="mb-1 text-xs text-muted">Texto do template (definido na Meta, não editável aqui)</div>
                    <p className="whitespace-pre-wrap text-sm text-ink">{selecionado.corpo}</p>
                  </div>
                )}
                {vars.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-muted">O que enviar em cada variável do template</div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {vars.map((n, i) => (
                        <label key={n} className="flex items-center gap-2 text-sm">
                          <span className="w-12 shrink-0 rounded bg-canvas px-1 py-0.5 text-center text-xs text-muted">{`{{${n}}}`}</span>
                          <input value={p.templateParams[i] ?? ''} onChange={(e) => setParam(i, e.target.value)} placeholder="{{nome}} ou texto fixo" className={inputCls} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {aprovados.length === 0 && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-warning"><AlertCircle size={14} className="mt-px shrink-0" /> Nenhum template aprovado ainda. Crie e aguarde a aprovação da Meta em <strong>Canais → Templates</strong>.</p>
                )}
              </>
            ) : (
              <>
                {canalEfetivo === 'EMAIL' && (
                  <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-muted">Assunto do e-mail</span>
                    <input value={p.assunto} onChange={(e) => set('assunto', e.target.value)} className={inputCls} />
                  </label>
                )}
                <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-muted">Mensagem</span>
                  <textarea value={p.conteudo} onChange={(e) => set('conteudo', e.target.value)} rows={4} className={inputCls} />
                </label>
              </>
            )}

            <p className="mt-1 text-xs text-muted">Variáveis: <code className="rounded bg-canvas px-1">{'{{nome}}'}</code> <code className="rounded bg-canvas px-1">{'{{valor}}'}</code> <code className="rounded bg-canvas px-1">{'{{vencimento}}'}</code></p>

            {disponiveis.length === 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-warning"><AlertCircle size={14} className="mt-px shrink-0" /> Nenhum canal ativo. Adicione um canal acima para a confirmação poder ser enviada.</p>
            )}
            {semTemplate && aprovados.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-warning"><AlertCircle size={14} className="mt-px shrink-0" /> O WhatsApp só aceita templates aprovados pela Meta — sem escolher um template, a confirmação não é enviada.</p>
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
