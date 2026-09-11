'use client';

import { useEffect, useState, useCallback } from 'react';
import { Send, Handshake, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { brl } from '@/components/ui';

interface TimelineItem {
  id: string;
  tipo: 'nota' | 'promessa' | 'disparo';
  data: string;
  texto: string;
  autor?: string | null;
  dataPromessa?: string | null;
  valorPrometido?: number | null;
  erpSincronizado?: boolean | null;
  erpErro?: string | null;
  canal?: string;
  status?: string;
}

const canalLabel: Record<string, string> = {
  WHATSAPP_CLOUD: 'WhatsApp', NX_SYSTEMS: 'WhatsApp', WHATSAPP_EVOLUTION: 'WhatsApp', WHATSAPP_UAZAPI: 'WhatsApp',
  EMAIL: 'E-mail', SMS: 'SMS', HTTP_GENERIC: 'API',
};
const statusLabel: Record<string, string> = {
  ENVIADO: 'enviado', ENTREGUE: 'entregue', LIDO: 'lido', FALHA: 'falhou', IGNORADO: 'ignorado',
};
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dataCurta = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/**
 * Linha do tempo do cliente: notas manuais, promessas de pagamento e disparos já
 * concluídos, em ordem cronológica. Usado tanto no perfil do cliente quanto num
 * modal direto no card da esteira — mesma leitura e mesmo lugar pra registrar.
 */
interface Etiqueta { nome: string; cor: string | null }
interface UsuarioTenant { id: string; nome: string; ativo: boolean }

export function Timeline({ customerId, onChange }: { customerId: string; onChange?: () => void }) {
  const [itens, setItens] = useState<TimelineItem[] | null>(null);
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState<'nota' | 'promessa'>('nota');
  const [texto, setTexto] = useState('');
  const [dataPromessa, setDataPromessa] = useState('');
  const [valor, setValor] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogo, setCatalogo] = useState<Etiqueta[]>([]);
  const [tagsCliente, setTagsCliente] = useState<string[] | null>(null);
  const [tagBusy, setTagBusy] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioTenant[]>([]);
  const [responsavelId, setResponsavelId] = useState<string | null>(null);
  const [salvandoResp, setSalvandoResp] = useState(false);

  const carregar = useCallback(() => {
    api<TimelineItem[]>(`/clientes/${customerId}/timeline`).then(setItens).catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar'));
  }, [customerId]);
  useEffect(() => { carregar(); }, [carregar]);

  const carregarTags = useCallback(() => {
    api<Etiqueta[]>('/clientes/etiquetas').then(setCatalogo).catch(() => {});
    api<{ tags: string[]; responsavelId: string | null }>(`/clientes/${customerId}`).then((c) => { setTagsCliente(c.tags); setResponsavelId(c.responsavelId ?? null); }).catch(() => {});
  }, [customerId]);
  useEffect(() => { carregarTags(); }, [carregarTags]);
  useEffect(() => { api<UsuarioTenant[]>('/usuarios').then((us) => setUsuarios(us.filter((u) => u.ativo))).catch(() => {}); }, []);

  async function toggleTag(tag: string) {
    setTagBusy(tag);
    try {
      await api(`/clientes/${customerId}/tags/toggle`, { method: 'PATCH', body: { tag } });
      carregarTags();
      onChange?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao marcar etiqueta'); }
    finally { setTagBusy(null); }
  }

  async function mudarResponsavel(id: string) {
    setSalvandoResp(true);
    try {
      await api(`/clientes/${customerId}/responsavel`, { method: 'PATCH', body: { responsavelId: id || null } });
      setResponsavelId(id || null);
      onChange?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao definir responsável'); }
    finally { setSalvandoResp(false); }
  }

  async function enviarNota() {
    const limpo = texto.trim();
    if (!limpo) return;
    setBusy(true); setErro('');
    try {
      await api(`/clientes/${customerId}/notas`, { method: 'POST', body: { texto: limpo } });
      setTexto('');
      carregar();
      onChange?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar nota'); }
    finally { setBusy(false); }
  }

  async function enviarPromessa() {
    if (!dataPromessa) return setErro('Escolha a data da promessa.');
    setBusy(true); setErro('');
    try {
      await api(`/clientes/${customerId}/promessas`, {
        method: 'POST',
        body: { dataPromessa, valor: valor ? Number(valor) : undefined, observacao: texto.trim() || undefined },
      });
      setTexto(''); setDataPromessa(''); setValor('');
      carregar();
      onChange?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao registrar promessa'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="border-b border-line p-2">
        <div className="mb-1 text-xs font-medium text-muted">Etiquetas</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {catalogo.length === 0 && <span className="text-xs text-muted">Nenhuma etiqueta cadastrada — crie em Clientes &gt; Etiquetas.</span>}
          {catalogo.map((et) => {
            const ativa = !!tagsCliente?.includes(et.nome);
            return (
              <button
                key={et.nome} type="button" disabled={tagBusy === et.nome} onClick={() => toggleTag(et.nome)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${ativa ? 'border-primary bg-primary text-white' : 'border-line text-muted hover:border-primary/40 hover:text-primary'}`}
              >{et.nome}</button>
            );
          })}
        </div>

        <label className="text-xs"><span className="mb-1 block text-[11px] text-muted">Responsável (filtro "por pessoa" na esteira)</span>
          <select
            value={responsavelId ?? ''} disabled={salvandoResp}
            onChange={(e) => mudarResponsavel(e.target.value)}
            className="w-full max-w-xs rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          >
            <option value="">Sem responsável</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
      </div>

      <div className="border-b border-line p-2">
        <div className="mb-2 flex gap-1">
          <button
            type="button" onClick={() => setModo('nota')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${modo === 'nota' ? 'bg-primary text-white' : 'bg-canvas text-muted hover:text-ink'}`}
          ><MessageSquare size={12} /> Nota</button>
          <button
            type="button" onClick={() => setModo('promessa')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${modo === 'promessa' ? 'bg-primary text-white' : 'bg-canvas text-muted hover:text-ink'}`}
          ><Handshake size={12} /> Promessa de pagamento</button>
        </div>

        {modo === 'promessa' && (
          <div className="mb-2 flex flex-wrap gap-2">
            <label className="text-xs"><span className="mb-1 block text-[11px] text-muted">Data prometida</span>
              <input type="date" value={dataPromessa} onChange={(e) => setDataPromessa(e.target.value)} className="rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-primary" />
            </label>
            <label className="text-xs"><span className="mb-1 block text-[11px] text-muted">Valor (opcional)</span>
              <input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$" className="w-28 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-primary" />
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (modo === 'nota' ? enviarNota() : enviarPromessa()); }}
            placeholder={modo === 'nota' ? 'Registrar ligação, combinado...' : 'Observação da promessa (opcional)'}
            rows={2}
            className="flex-1 resize-none rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={modo === 'nota' ? enviarNota : enviarPromessa}
            disabled={busy || (modo === 'nota' ? !texto.trim() : !dataPromessa)}
            title={modo === 'nota' ? 'Salvar nota (Ctrl+Enter)' : 'Registrar promessa (Ctrl+Enter)'}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
          ><Send size={15} /></button>
        </div>
        {erro && <p className="mt-1 text-xs text-danger">{erro}</p>}
      </div>

      <div className="max-h-80 overflow-auto p-2">
        {itens === null && !erro && <p className="px-2 py-4 text-center text-sm text-muted">Carregando...</p>}
        {itens?.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">Nenhum registro ainda.</p>}
        {itens?.map((it) => {
          if (it.tipo === 'promessa') {
            return (
              <div key={it.id} className="mb-1.5 rounded border border-primary/30 bg-primary-tint px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary"><Handshake size={12} /> Promessa de pagamento — {it.dataPromessa ? dataCurta(it.dataPromessa) : '—'}{it.valorPrometido ? ` · ${brl(it.valorPrometido)}` : ''}</div>
                {it.texto && <div className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{it.texto}</div>}
                <div className="mt-1 text-[11px] text-muted">{it.autor ?? 'Usuário removido'} · registrada em {dataHora(it.data)}</div>
                {it.erpSincronizado === true && <div className="mt-0.5 text-[11px] font-medium text-[#0F6E56]">✓ sincronizada com o ERP</div>}
                {it.erpSincronizado === false && <div className="mt-0.5 text-[11px] font-medium text-[#A32D2D]">⚠ não sincronizada com o ERP{it.erpErro ? `: ${it.erpErro}` : ''}</div>}
              </div>
            );
          }
          if (it.tipo === 'disparo') {
            return (
              <div key={it.id} className="mb-1.5 border-b border-line px-2 py-1.5 text-xs last:border-0">
                <span className="text-muted">{dataHora(it.data)} · {canalLabel[it.canal ?? ''] ?? it.canal} · {statusLabel[it.status ?? ''] ?? it.status}</span>
                {it.texto && <div className="mt-0.5 line-clamp-1 text-ink">{it.texto}</div>}
              </div>
            );
          }
          return (
            <div key={it.id} className="mb-1.5 border-b border-line px-2 py-1.5 last:border-0">
              <div className="text-[11px] text-muted">{it.autor ?? 'Usuário removido'} · {dataHora(it.data)}</div>
              <div className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{it.texto}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
