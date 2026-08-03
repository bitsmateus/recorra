'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Trash2, Pencil, X, Database, CalendarClock, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import GatewayPagamento from '@/components/GatewayPagamento';

// ERPs com integração nativa (puxam clientes + cobranças automaticamente).
type CampoCred = { key: string; label: string; placeholder?: string; extra?: boolean };
const ERPS: { id: string; nome: string; desc: string; campos: CampoCred[] }[] = [
  { id: 'IXC', nome: 'IXC Soft', desc: 'API REST. Puxa clientes, boletos, Pix e vencimentos.', campos: [
    { key: 'token', label: 'Token da API', placeholder: 'Token gerado no IXC' },
  ] },
  { id: 'SGP', nome: 'SGP', desc: 'Token em Administração > Integrações > Tokens.', campos: [
    { key: 'token', label: 'Token da API' },
    { key: 'app', label: 'App (opcional)', placeholder: 'recorra', extra: true },
  ] },
  { id: 'HUBSOFT', nome: 'HubSoft', desc: 'API REST com OAuth2 (grant password).', campos: [
    { key: 'client_id', label: 'Client ID', extra: true },
    { key: 'client_secret', label: 'Client Secret', extra: true },
    { key: 'username', label: 'Usuário', extra: true },
    { key: 'password', label: 'Senha', extra: true },
  ] },
  { id: 'VOALLE', nome: 'Voalle', desc: 'API do ERP com OAuth2 (client_credentials).', campos: [
    { key: 'client_id', label: 'Client ID', extra: true },
    { key: 'client_secret', label: 'Client Secret', extra: true },
    { key: 'syndata', label: 'Syndata', extra: true },
  ] },
  { id: 'MKAUTH', nome: 'MK-Auth', desc: 'Requer o add-on de integração no servidor.', campos: [
    { key: 'token', label: 'Token da API (Bearer)' },
  ] },
];

interface Integracao { id: string; sistema: string; urlBase?: string | null; status: string; diasHistorico?: number | null }

// Janela de importação: quanto de passado o ERP pode trazer como cobrança nova.
const JANELAS = [30, 60, 90, 180, 365];
const DIAS_HISTORICO_PADRAO = 90;
const janelaLabel = (d?: number | null) => (d == null ? 'sem limite' : `últimos ${d} dias`);

export default function IntegracoesPage() {
  const [lista, setLista] = useState<Integracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Integracao | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState<Integracao | null>(null);
  const [corte, setCorte] = useState<Integracao | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setLista(await api<Integracao[]>('/config/integracoes').catch(() => []));
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // O sync roda no servidor; aqui só acompanhamos o progresso. Sem isto a tela
  // ficava "Sincronizando..." para sempre em ERP grande (estoura o timeout).
  const [sincronizando, setSincronizando] = useState<string | null>(null);

  async function sincronizar(id: string) {
    setMsg('Sincronizando... isso roda no servidor, pode fechar a tela.');
    setSincronizando(id);
    try {
      const r = await api<{ iniciado: boolean; jaRodando: boolean }>(`/integracoes/${id}/sincronizar`, { method: 'POST' });
      if (!r.iniciado && r.jaRodando) setMsg('Já existe uma sincronização em andamento — acompanhando...');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao sincronizar');
      setSincronizando(null);
    }
  }

  interface SyncEtapa { quantidade: number; erros: number; detalhe: string | null; emCurso: boolean }
  interface SyncStatus { rodando: boolean; erro: string | null; clientes: SyncEtapa | null; faturas: SyncEtapa | null }

  useEffect(() => {
    if (!sincronizando) return;
    const id = sincronizando;
    let vivo = true;
    const tick = async () => {
      const s = await api<SyncStatus>(`/integracoes/${id}/sync-status`).catch(() => null);
      if (!vivo || !s) return;
      const partes = [
        s.clientes ? `${s.clientes.quantidade} cliente(s)` : null,
        s.faturas ? `${s.faturas.quantidade} fatura(s)` : null,
      ].filter(Boolean).join(' · ');
      if (s.rodando) {
        setMsg(`Sincronizando... ${partes || 'buscando dados no ERP'}`);
        return;
      }
      setSincronizando(null);
      carregar();
      if (s.erro) setMsg(`✗ Falha na sincronização: ${s.erro}`);
      else setMsg(`✓ Sincronização concluída — ${partes || 'nada novo'}`);
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [sincronizando, carregar]);
  const [testando, setTestando] = useState<string | null>(null);
  async function testar(id: string) {
    setTestando(id);
    setMsg('Testando conexão...');
    try {
      const r = await api<{ ok: boolean; erro?: string }>(`/config/integracoes/${id}/testar`, { method: 'POST' });
      setMsg(r.ok ? '✓ Conexão OK — a integração está respondendo.' : `✗ Falha na conexão${r.erro ? `: ${r.erro}` : ''}`);
      carregar();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao testar'); }
    finally { setTestando(null); }
  }
  async function excluir(i: Integracao) {
    await api(`/config/integracoes/${i.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  return (
    <div>
      <PageTitle title="Integrações" subtitle="Conecte seu ERP para trazer clientes e cobranças automaticamente. Canais de envio ficam em Canais." />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Sistemas de origem (ERP)</h2>
            <p className="text-sm text-muted">Ao conectar, o Recorrai puxa clientes e cobranças do seu ERP automaticamente.</p>
          </div>
          <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Adicionar integração</button>
        </div>
        {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {lista.map((i) => (
            <div key={i.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2"><Database size={18} className="text-muted" /><span className="font-medium text-ink">{erpNome(i.sistema)}</span></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditando(i)} title="Editar integração" className="rounded p-1 text-muted hover:bg-canvas hover:text-ink"><Pencil size={14} /></button>
                  <button onClick={() => setConfirmarExclusao(i)} title="Remover integração" className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
                </div>
              </div>
              {i.urlBase && <div className="mb-2 truncate font-mono text-[11px] text-muted">{i.urlBase}</div>}
              <div className="mb-2 flex flex-wrap items-center gap-2"><StatusChip status={i.status} /><JanelaChip dias={i.diasHistorico} /></div>
              <div className="mb-3">
                <button onClick={() => setCorte(i)} className="flex items-center gap-1 text-xs text-primary hover:underline"><CalendarClock size={12} /> Aplicar corte no histórico já importado</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => testar(i.id)} disabled={testando === i.id} className="rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas disabled:opacity-60">{testando === i.id ? 'Testando...' : 'Testar'}</button>
                <button onClick={() => sincronizar(i.id)} disabled={sincronizando === i.id} className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-60"><RefreshCw size={12} className={sincronizando === i.id ? 'animate-spin' : ''} /> {sincronizando === i.id ? 'Sincronizando...' : 'Sincronizar'}</button>
              </div>
            </div>
          ))}
          {!loading && lista.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">Nenhum ERP conectado. Clique em "Adicionar integração" para começar a puxar seus clientes e cobranças.</div>}
        </div>
      </section>

      <GatewayPagamento />

      {corte && <CorteHistoricoModal integracao={corte} onClose={() => setCorte(null)} onAplicado={(n) => { setCorte(null); setMsg(`✓ ${n} fatura(s) antiga(s) pausada(s) — saíram da cobrança automática.`); }} />}
      {novo && <NovaIntegracaoModal onClose={() => setNovo(false)} onCreated={() => { setNovo(false); carregar(); }} />}
      {editando && <NovaIntegracaoModal editando={editando} onClose={() => setEditando(null)} onCreated={() => { setEditando(null); carregar(); }} />}
      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Remover integração"
          mensagem={<>Remover a integração <b className="text-ink">{erpNome(confirmarExclusao.sistema)}</b>? Os clientes/faturas já importados permanecem.</>}
          confirmLabel="Remover"
          danger
          onConfirm={() => { const i = confirmarExclusao; setConfirmarExclusao(null); excluir(i); }}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
    </div>
  );
}

function erpNome(id: string): string {
  return ERPS.find((e) => e.id === id)?.nome || id;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: 'Conectado', cls: 'bg-success-tint text-[#0F6E56]' },
    configurada: { label: 'Configurado', cls: 'bg-primary-tint text-primary' },
    falha: { label: 'Falha na conexão', cls: 'bg-danger-tint text-[#A32D2D]' },
  };
  const s = map[status] || { label: status, cls: 'bg-canvas text-muted' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

/** Janela de importação da integração. Sem limite é o estado de risco — destaca. */
function JanelaChip({ dias }: { dias?: number | null }) {
  const semLimite = dias == null;
  return (
    <span
      title={semLimite
        ? 'Sem janela: o sync traz todo o histórico em aberto do ERP, inclusive dívida antiga de contrato cancelado.'
        : `Só entram faturas vencidas nos últimos ${dias} dias.`}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${semLimite ? 'bg-warning-tint text-[#854F0B]' : 'bg-canvas text-muted'}`}
    >
      {semLimite ? <AlertTriangle size={11} /> : <CalendarClock size={11} />} Importa: {janelaLabel(dias)}
    </span>
  );
}

interface CortePreview { diasHistorico: number | null; corte: string | null; emAberto: number; aPausar: number }

/**
 * Aplica a janela ao que JÁ está na base. O corte no sync só impede faturas novas
 * — o passivo importado antes continua na esteira até ser pausado aqui.
 */
function CorteHistoricoModal({ integracao, onClose, onAplicado }: { integracao: Integracao; onClose: () => void; onAplicado: (n: number) => void }) {
  const [prev, setPrev] = useState<CortePreview | null>(null);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CortePreview>(`/integracoes/${integracao.id}/corte-historico`)
      .then(setPrev)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar'));
  }, [integracao.id]);

  async function aplicar() {
    setBusy(true); setErro('');
    try {
      const r = await api<{ pausadas: number }>(`/integracoes/${integracao.id}/corte-historico`, { method: 'POST' });
      onAplicado(r.pausadas);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao aplicar'); setBusy(false); }
  }

  const semJanela = prev && prev.diasHistorico == null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Corte no histórico já importado</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        {!prev && !erro && <p className="py-6 text-sm text-muted">Calculando...</p>}
        {prev && (
          <div className="mb-4 space-y-3 text-sm">
            {semJanela ? (
              <p className="rounded-lg bg-warning-tint p-3 text-[#854F0B]">
                Esta integração está <b>sem janela de importação</b>. Edite a integração e escolha uma janela
                (ex.: últimos 90 dias) antes de aplicar o corte.
              </p>
            ) : (
              <>
                <p className="text-muted">Janela atual: <b className="text-ink">{janelaLabel(prev.diasHistorico)}</b> — corte em <b className="text-ink">{prev.corte ? new Date(prev.corte).toLocaleDateString('pt-BR') : '—'}</b>.</p>
                <div className="rounded-lg border border-line bg-canvas p-3">
                  <div className="flex justify-between py-0.5"><span className="text-muted">Faturas em aberto deste ERP</span><b className="tabular text-ink">{prev.emAberto}</b></div>
                  <div className="flex justify-between py-0.5"><span className="text-muted">Serão pausadas (anteriores ao corte)</span><b className="tabular text-[#854F0B]">{prev.aPausar}</b></div>
                  <div className="flex justify-between border-t border-line pt-1.5 mt-1.5"><span className="text-muted">Seguem em cobrança</span><b className="tabular text-primary">{prev.emAberto - prev.aPausar}</b></div>
                </div>
                <p className="text-xs text-muted">
                  Pausar tira a fatura da cobrança automática e bloqueia o disparo manual — nada é apagado,
                  nem aqui nem no ERP, e dá para retomar caso a caso pela Esteira.
                </p>
              </>
            )}
          </div>
        )}
        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={aplicar} disabled={busy || !prev || semJanela || prev.aPausar === 0} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">
            {busy ? 'Aplicando...' : `Pausar ${prev?.aPausar ?? 0} fatura(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary';

function NovaIntegracaoModal({ editando, onClose, onCreated }: { editando?: Integracao; onClose: () => void; onCreated: () => void }) {
  const edicao = !!editando;
  // Na edição o sistema é fixo (define o conector) e a URL já vem preenchida.
  const [sistema, setSistema] = useState(editando?.sistema ?? ERPS[0].id);
  const [urlBase, setUrlBase] = useState(editando?.urlBase ?? '');
  // Na edição respeita o que está salvo (inclusive null = sem limite); nova já
  // nasce com a janela padrão.
  const [dias, setDias] = useState<number | null>(edicao ? editando!.diasHistorico ?? null : DIAS_HISTORICO_PADRAO);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const erp = ERPS.find((e) => e.id === sistema) ?? ERPS[0];

  function set(k: string, v: string) { setVals((s) => ({ ...s, [k]: v })); }

  async function salvar() {
    if (!/^https?:\/\//i.test(urlBase.trim())) return setMsg('Informe a URL base do ERP (http/https).');
    // Monta credentials: campos "extra" vão em credentials.extra; os demais direto.
    const credentials: Record<string, unknown> = {};
    const extra: Record<string, string> = {};
    for (const c of erp.campos) {
      const v = (vals[c.key] || '').trim();
      if (!v) continue;
      if (c.extra) extra[c.key] = v; else credentials[c.key] = v;
    }
    if (Object.keys(extra).length) credentials.extra = extra;
    setBusy(true); setMsg('');
    try {
      if (edicao) {
        // Sem credenciais preenchidas → mantém as atuais (backend só recifra se vier algo).
        const body: Record<string, unknown> = { urlBase: urlBase.trim(), diasHistorico: dias };
        if (Object.keys(credentials).length) body.credentials = credentials;
        await api(`/config/integracoes/${editando!.id}`, { method: 'PATCH', body });
      } else {
        await api('/config/integracoes', { method: 'POST', body: { sistema, urlBase: urlBase.trim(), credentials, diasHistorico: dias } });
      }
      onCreated();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{edicao ? `Editar integração — ${erp.nome}` : 'Adicionar integração de origem'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Sistema (ERP)</span>
          <select value={sistema} onChange={(e) => { setSistema(e.target.value); setVals({}); }} disabled={edicao} className={`${inputCls} disabled:opacity-60`}>
            {ERPS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted">{erp.desc}</span>
        </label>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">URL base</span>
          <input value={urlBase} onChange={(e) => setUrlBase(e.target.value)} placeholder="https://seu-erp.com.br" className={`${inputCls} font-mono text-xs`} />
        </label>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Janela de importação</span>
          <select value={String(dias ?? '')} onChange={(e) => setDias(e.target.value === '' ? null : Number(e.target.value))} className={inputCls}>
            {JANELAS.map((d) => <option key={d} value={d}>Só faturas dos últimos {d} dias</option>)}
            <option value="">Sem limite — trazer todo o histórico</option>
          </select>
          <span className="mt-1 block text-xs text-muted">
            ERP de provedor guarda título em aberto para sempre. Sem janela, o primeiro sync traz o passivo
            histórico inteiro (dívida de anos, de contrato já cancelado) e ele entra na esteira como cobrança
            a fazer. A janela decide o que <b>entra</b> — nada é apagado no ERP.
          </span>
        </label>

        {erp.campos.map((c) => (
          <label key={c.key} className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">{c.label}</span>
            <input value={vals[c.key] || ''} onChange={(e) => set(c.key, e.target.value)} placeholder={edicao ? 'Deixe em branco para manter o atual' : c.placeholder} className={inputCls} />
          </label>
        ))}

        {edicao && <p className="mb-2 text-xs text-muted">Por segurança, as credenciais salvas não são exibidas. Preencha um campo apenas se quiser substituí-lo.</p>}
        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar'}</button>
        </div>
        <p className="mt-3 text-xs text-muted">Depois de salvar, use <b>Testar</b> para validar e <b>Sincronizar</b> para puxar os clientes e cobranças.</p>
      </div>
    </div>
  );
}
