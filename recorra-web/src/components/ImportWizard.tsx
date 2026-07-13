'use client';

import { useEffect, useRef, useState } from 'react';
import { UploadCloud, X, Check, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { api } from '@/lib/api';

type Campo = { key: string; label: string; cobranca?: boolean };
const CAMPOS: Campo[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'cpfCnpj', label: 'CPF/CNPJ' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'plano', label: 'Plano' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'uf', label: 'UF' },
  { key: 'valor', label: 'Valor', cobranca: true },
  { key: 'vencimento', label: 'Vencimento', cobranca: true },
  { key: 'descricao', label: 'Descrição', cobranca: true },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const PALPITES: Record<string, string[]> = {
  nome: ['nome', 'name', 'cliente', 'razaosocial'],
  cpfCnpj: ['cpfcnpj', 'cpf', 'cnpj', 'documento', 'doc'],
  telefone: ['telefone', 'celular', 'numero', 'phone', 'whatsapp', 'fone'],
  email: ['email', 'mail', 'correio'],
  plano: ['plano', 'plan', 'produto'],
  contrato: ['contrato', 'contract'],
  cidade: ['cidade', 'city', 'municipio'],
  uf: ['uf', 'estado', 'state'],
  valor: ['valor', 'value', 'preco', 'preço', 'amount', 'mensalidade'],
  vencimento: ['vencimento', 'venc', 'duedate', 'datavencimento'],
  descricao: ['descricao', 'descrição', 'description', 'obs'],
};

interface Etiqueta { nome: string; cor?: string | null }

export function ImportWizard({ criarCobrancas, onClose, onDone }: { criarCobrancas: boolean; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<{ header: string[]; amostra: Record<string, string>[]; total: number } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [ddi, setDdi] = useState('55');
  const [ddd, setDdd] = useState('');
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<{ clientes: number; faturas: number; erros: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const campos = CAMPOS.filter((c) => criarCobrancas || !c.cobranca);

  async function onFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setBusy(true); setMsg('Lendo arquivo...');
    const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
    setData(b64);
    try {
      const p = await api<{ header: string[]; amostra: Record<string, string>[]; total: number }>('/clientes/importar/preview', { method: 'POST', body: { data: b64 } });
      setPreview(p);
      // auto-mapeia
      const guess: Record<string, string> = {};
      for (const campo of campos) {
        const alvo = PALPITES[campo.key] || [];
        const found = p.header.find((h) => alvo.includes(norm(h)));
        if (found) guess[campo.key] = found;
      }
      setMapping(guess);
      setMsg(''); setStep(2);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao ler arquivo'); }
    setBusy(false);
  }

  async function aplicar() {
    if (!mapping.nome && !mapping.cpfCnpj) { setMsg('Mapeie ao menos Nome ou CPF/CNPJ.'); return; }
    setBusy(true); setMsg('Importando...');
    try {
      const r = await api<{ clientes: number; faturas: number; erros: string[] }>('/clientes/importar/aplicar', {
        method: 'POST',
        body: { data, mapping, ddi: ddi || undefined, ddd: ddd || undefined, etiquetas, criarCobrancas },
      });
      setResultado(r); setMsg(''); setStep(4);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro na importação'); }
    setBusy(false);
  }

  const passos = ['Origem', 'Estrutura', 'Identificação'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Importação inteligente {criarCobrancas ? 'de cobranças' : 'de contatos'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        <div className="mb-6 flex items-center gap-2 text-sm">
          {passos.map((p, i) => {
            const n = i + 1;
            const done = step > n || step === 4;
            const active = step === n;
            return (
              <div key={p} className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${done ? 'bg-success text-white' : active ? 'bg-primary text-white' : 'bg-canvas text-muted'}`}>{done ? <Check size={13} /> : n}</span>
                <span className={active ? 'font-medium text-ink' : 'text-muted'}>{p}</span>
                {i < passos.length - 1 && <ChevronRight size={14} className="text-muted" />}
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <div>
            <div onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line py-16 text-center hover:border-primary hover:bg-canvas">
              <UploadCloud size={40} className="text-muted" />
              <p className="text-ink">Arraste o arquivo aqui ou clique para selecionar</p>
              <p className="text-xs text-muted">CSV, XLS, XLSX · máx. 30MB</p>
            </div>
            <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}

        {step === 2 && preview && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm"><span className="font-medium text-ink">{fileName}</span><span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{preview.total} linha(s)</span></div>
            <div className="overflow-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="bg-canvas text-left text-muted"><tr>{preview.header.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>{preview.amostra.map((row, i) => <tr key={i} className="border-t border-line">{preview.header.map((h) => <td key={h} className="whitespace-nowrap px-3 py-2 text-muted">{row[h]}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Exibindo as primeiras linhas para conferência.</p>
          </div>
        )}

        {step === 3 && preview && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">Mapeamento de colunas</h3>
            <div className="space-y-2">
              {campos.map((c) => (
                <div key={c.key} className="grid grid-cols-2 items-center gap-3">
                  <span className="text-sm text-ink">{c.label}{(c.key === 'nome' || c.key === 'cpfCnpj') && <span className="text-danger"> *</span>}{c.cobranca && <span className="ml-1 text-xs text-muted">(cobrança)</span>}</span>
                  <select value={mapping[c.key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [c.key]: e.target.value }))} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">— ignorar —</option>
                    {preview.header.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-sm"><span className="mb-1 block text-xs text-muted">Código do país padrão (ex: 55)</span><input value={ddi} onChange={(e) => setDdi(e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
              <label className="text-sm"><span className="mb-1 block text-xs text-muted">Código de área padrão (ex: 11)</span><input value={ddd} onChange={(e) => setDdd(e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
            </div>
            <p className="mt-1 text-xs text-warning">Aplicado a números sem DDI/DDD. Deixe em branco para não aplicar.</p>

            <div className="mt-4">
              <span className="mb-1 block text-xs text-muted">Etiquetas (aplicadas a todos os importados)</span>
              <EtiquetaPicker selecionadas={etiquetas} onChange={setEtiquetas} />
            </div>
          </div>
        )}

        {step === 4 && resultado && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success-tint"><Check size={28} className="text-success" /></div>
            <h3 className="text-lg font-semibold text-ink">Importação concluída!</h3>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line p-4"><div className="text-2xl font-semibold text-success">{resultado.clientes}</div><div className="text-xs text-muted">Clientes</div></div>
              <div className="rounded-lg border border-line p-4"><div className="text-2xl font-semibold text-primary">{criarCobrancas ? resultado.faturas : '—'}</div><div className="text-xs text-muted">Cobranças</div></div>
              <div className="rounded-lg border border-line p-4"><div className="text-2xl font-semibold text-danger">{resultado.erros.length}</div><div className="text-xs text-muted">Erros</div></div>
            </div>
            {resultado.erros.length > 0 && (
              <div className="mt-3 max-h-32 overflow-auto rounded border border-line p-2 text-left text-xs text-danger">
                {resultado.erros.slice(0, 30).map((er, i) => <div key={i}>{er}</div>)}
              </div>
            )}
          </div>
        )}

        {msg && <p className="mt-3 text-sm text-primary">{msg}</p>}

        <div className="mt-6 flex items-center justify-end gap-2">
          {step === 4 ? (
            <button onClick={onDone} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover">Fechar</button>
          ) : (
            <>
              {step > 1 && step < 4 && <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><ChevronLeft size={15} /> Voltar</button>}
              <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
              {step === 2 && <button onClick={() => setStep(3)} className="flex items-center gap-1 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Próximo <ChevronRight size={15} /></button>}
              {step === 3 && <button onClick={aplicar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Importando...' : 'Importar'}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function EtiquetaPicker({ selecionadas, onChange }: { selecionadas: string[]; onChange: (v: string[]) => void }) {
  const [todas, setTodas] = useState<Etiqueta[]>([]);
  const [nova, setNova] = useState('');

  async function carregar() { setTodas(await api<Etiqueta[]>('/clientes/etiquetas').catch(() => [])); }
  useEffect(() => { carregar(); }, []);

  function toggle(nome: string) {
    onChange(selecionadas.includes(nome) ? selecionadas.filter((t) => t !== nome) : [...selecionadas, nome]);
  }
  async function criar() {
    const n = nova.trim().toLowerCase();
    if (!n) return;
    await api('/clientes/etiquetas', { method: 'POST', body: { nome: n } }).catch(() => {});
    setNova('');
    await carregar();
    if (!selecionadas.includes(n)) onChange([...selecionadas, n]);
  }

  return (
    <div className="rounded border border-line p-2">
      <div className="flex flex-wrap gap-1">
        {todas.map((t) => (
          <button key={t.nome} onClick={() => toggle(t.nome)} className={`rounded-full px-2.5 py-1 text-xs ${selecionadas.includes(t.nome) ? 'bg-primary text-white' : 'bg-canvas text-muted hover:bg-primary-tint'}`}>{t.nome}</button>
        ))}
        {todas.length === 0 && <span className="px-1 py-1 text-xs text-muted">Nenhuma etiqueta ainda.</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), criar())} placeholder="Criar nova etiqueta" className="flex-1 rounded border border-line px-2 py-1 text-xs outline-none focus:border-primary" />
        <button onClick={criar} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-hover"><Plus size={12} /> Criar</button>
      </div>
    </div>
  );
}
