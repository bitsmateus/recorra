'use client';

import { useEffect, useState, useCallback } from 'react';
import { Send, Check, Bot } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface Conversation {
  id: string;
  contato: string;
  status: string;
  ultimaMensagem?: string;
  naoLidas: number;
  customer?: { nome: string };
}
interface Message {
  id: string;
  direcao: 'IN' | 'OUT';
  texto: string;
  autor?: string;
  intent?: string;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  ABERTA: 'bg-success-tint text-[#0F6E56]',
  PENDENTE: 'bg-warning-tint text-[#854F0B]',
  RESOLVIDA: 'bg-canvas text-muted',
};

export default function InboxPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [sel, setSel] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [texto, setTexto] = useState('');

  const loadConvs = useCallback(async () => {
    setConvs(await api<Conversation[]>('/inbox/conversas').catch(() => []));
  }, []);
  useEffect(() => { loadConvs(); }, [loadConvs]);

  const abrir = useCallback(async (c: Conversation) => {
    setSel(c);
    setMsgs(await api<Message[]>(`/inbox/conversas/${c.id}/mensagens`).catch(() => []));
    loadConvs();
  }, [loadConvs]);

  async function responder() {
    if (!sel || !texto.trim()) return;
    await api(`/inbox/conversas/${sel.id}/responder`, { method: 'POST', body: { texto } }).catch(() => {});
    setTexto('');
    abrir(sel);
  }
  async function resolver() {
    if (!sel) return;
    await api(`/inbox/conversas/${sel.id}/resolver`, { method: 'POST' }).catch(() => {});
    loadConvs();
    setSel(null);
  }

  return (
    <div>
      <PageTitle title="Caixa de entrada" subtitle="Respostas dos clientes e chatbot de negociação" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]" style={{ minHeight: 460 }}>
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {convs.map((c) => (
            <button key={c.id} onClick={() => abrir(c)} className={`flex w-full flex-col items-start border-b border-line px-4 py-3 text-left last:border-0 hover:bg-canvas ${sel?.id === c.id ? 'bg-primary-tint' : ''}`}>
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium text-ink">{c.customer?.nome || c.contato}</span>
                {c.naoLidas > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-white">{c.naoLidas}</span>}
              </div>
              <span className="line-clamp-1 text-xs text-muted">{c.ultimaMensagem}</span>
              <span className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[c.status]}`}>{c.status}</span>
            </button>
          ))}
          {convs.length === 0 && <p className="p-4 text-sm text-muted">Nenhuma conversa ainda.</p>}
        </div>

        <div className="flex flex-col rounded-lg border border-line bg-surface">
          {sel ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-sm font-medium text-ink">{sel.customer?.nome || sel.contato}</span>
                <button onClick={resolver} className="flex items-center gap-1 rounded border border-line px-3 py-1 text-xs hover:bg-canvas"><Check size={13} /> Resolver</button>
              </div>
              <div className="flex-1 space-y-2 overflow-auto p-4">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.direcao === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direcao === 'OUT' ? 'bg-primary-tint text-ink' : 'bg-canvas text-ink'}`}>
                      {m.autor === 'bot' && <div className="mb-0.5 flex items-center gap-1 text-[10px] text-primary"><Bot size={11} /> chatbot</div>}
                      {m.texto}
                      {m.intent && <div className="mt-0.5 text-[10px] text-muted">intenção: {m.intent}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 border-t border-line p-3">
                <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && responder()} placeholder="Responder..." className="flex-1 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                <button onClick={responder} className="flex items-center gap-1 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Send size={15} /></button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">Selecione uma conversa.</div>
          )}
        </div>
      </div>
    </div>
  );
}
