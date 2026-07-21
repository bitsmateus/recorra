'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, ChevronDown, CircleAlert, FileText, PlayCircle, Search, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import { HELP_CATALOG_UPDATED_AT, HELP_CATALOG_VERSION, HELP_SECTIONS, HELP_TOPICS } from '@/content/help-catalog';

interface Tutorial {
  id: string;
  secao: string;
  titulo: string;
  tipo: 'VIDEO' | 'TEXTO';
  videoUrl?: string;
  conteudo?: string;
}

function toEmbed(url: string): string {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vi = url.match(/vimeo\.com\/(\d+)/);
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
  return url;
}

export default function AjudaPage() {
  const params = useSearchParams();
  const secaoInicial = params.get('secao') || '';
  const [busca, setBusca] = useState('');
  const [secao, setSecao] = useState(secaoInicial);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({ 'primeiros-passos': true });
  const [tutoriais, setTutoriais] = useState<Tutorial[]>([]);

  useEffect(() => { api<Tutorial[]>('/ajuda').then(setTutoriais).catch(() => setTutoriais([])); }, []);

  const topicos = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    return HELP_TOPICS.filter((t) => {
      if (secao && t.section.toLocaleLowerCase('pt-BR') !== secao.toLocaleLowerCase('pt-BR')) return false;
      if (!q) return true;
      return [t.title, t.summary, t.section, ...t.steps, ...t.rules, ...(t.notes ?? []), ...(t.keywords ?? [])].join(' ').toLocaleLowerCase('pt-BR').includes(q);
    });
  }, [busca, secao]);

  function toggle(id: string) { setAbertos((s) => ({ ...s, [id]: !s[id] })); }

  return (
    <div>
      <PageTitle title="Central de Ajuda" subtitle="Manual oficial, regras de negócio e passo a passo do Recorrai" />

      <div className="mb-5 rounded-lg border border-primary/20 bg-primary-tint p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary"><BookOpen size={20} /></div>
          <div><p className="font-medium text-ink">Documentação funcional publicada</p><p className="text-xs text-muted">Versão {HELP_CATALOG_VERSION} · revisada em {HELP_CATALOG_UPDATED_AT}</p></div>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success-tint px-3 py-1 text-xs font-medium text-success"><ShieldCheck size={13} /> Verificada junto com o código</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na ajuda" className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" /></label>
          <nav className="mt-3 rounded-lg border border-line bg-surface p-2">
            <button onClick={() => setSecao('')} className={`w-full rounded px-3 py-2 text-left text-sm ${!secao ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'}`}>Todas as áreas</button>
            {HELP_SECTIONS.map((s) => <button key={s} onClick={() => setSecao(s)} className={`w-full rounded px-3 py-2 text-left text-sm ${secao === s ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'}`}>{s}</button>)}
          </nav>
        </aside>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm text-muted">{topicos.length} guia(s) encontrado(s)</p>{(busca || secao) && <button onClick={() => { setBusca(''); setSecao(''); }} className="text-xs font-medium text-primary hover:underline">Limpar busca</button>}</div>
          <div className="space-y-3">
            {topicos.map((topic) => {
              const aberto = !!abertos[topic.id];
              return (
                <article key={topic.id} id={topic.id} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <button onClick={() => toggle(topic.id)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-canvas/60">
                    <FileText size={18} className="mt-0.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold uppercase tracking-wide text-muted">{topic.section}</span><span className="mt-0.5 block font-medium text-ink">{topic.title}</span><span className="mt-1 block text-sm text-muted">{topic.summary}</span></span>
                    <ChevronDown size={18} className={`mt-1 shrink-0 text-muted transition ${aberto ? 'rotate-180' : ''}`} />
                  </button>
                  {aberto && <div className="border-t border-line px-5 py-4">
                    <h3 className="mb-2 text-sm font-semibold text-ink">Passo a passo</h3>
                    <ol className="space-y-2">{topic.steps.map((step, i) => <li key={step} className="flex gap-3 text-sm text-muted"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint text-xs font-semibold text-primary">{i + 1}</span><span>{step}</span></li>)}</ol>
                    <div className="mt-5 rounded-lg border border-warning/25 bg-warning-tint p-4"><h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><CircleAlert size={15} className="text-warning" /> Regras de negócio atuais</h3><ul className="space-y-1.5">{topic.rules.map((rule) => <li key={rule} className="flex gap-2 text-sm text-muted"><span className="text-warning">•</span><span>{rule}</span></li>)}</ul></div>
                    {topic.notes?.length ? <div className="mt-3 text-sm text-muted">{topic.notes.map((note) => <p key={note}>{note}</p>)}</div> : null}
                  </div>}
                </article>
              );
            })}
            {topicos.length === 0 && <div className="rounded-lg border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">Nenhum guia corresponde à busca.</div>}
          </div>

          {tutoriais.length > 0 && <section className="mt-10"><h2 className="mb-1 text-lg font-semibold text-ink">Vídeos e conteúdos complementares</h2><p className="mb-4 text-sm text-muted">Materiais adicionais publicados pela equipe do Recorrai.</p><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{tutoriais.map((t) => <div key={t.id} className="rounded-lg border border-line bg-surface p-4"><div className="mb-2 flex items-center gap-2 font-medium text-ink">{t.tipo === 'VIDEO' ? <PlayCircle size={16} className="text-primary" /> : <FileText size={16} className="text-primary" />}{t.titulo}</div>{t.tipo === 'VIDEO' && t.videoUrl && <div className="mb-2 aspect-video overflow-hidden rounded"><iframe src={toEmbed(t.videoUrl)} className="h-full w-full" allowFullScreen title={t.titulo} /></div>}{t.conteudo && <p className="whitespace-pre-wrap text-sm text-muted">{t.conteudo}</p>}</div>)}</div></section>}
        </div>
      </div>
    </div>
  );
}
