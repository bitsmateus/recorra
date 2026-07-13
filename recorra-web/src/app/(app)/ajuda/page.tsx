'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlayCircle, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface Tutorial {
  id: string;
  secao: string;
  titulo: string;
  tipo: 'VIDEO' | 'TEXTO';
  videoUrl?: string;
  conteudo?: string;
}

const secaoLabel: Record<string, string> = {
  geral: 'Primeiros passos',
  configuracoes: 'Configurações',
  canais: 'Canais (WhatsApp/E-mail/SMS)',
  gateways: 'Gateways de pagamento',
  integracoes: 'Integrações (ERP)',
  reguas: 'Réguas de cobrança',
  clientes: 'Clientes',
  cobrancas: 'Cobranças',
};

function toEmbed(url: string): string {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vi = url.match(/vimeo\.com\/(\d+)/);
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
  return url;
}

export default function AjudaPage() {
  const params = useSearchParams();
  const secaoFiltro = params.get('secao') || '';
  const [tutoriais, setTutoriais] = useState<Tutorial[]>([]);

  useEffect(() => {
    api<Tutorial[]>(`/ajuda${secaoFiltro ? `?secao=${secaoFiltro}` : ''}`).then(setTutoriais).catch(() => {});
  }, [secaoFiltro]);

  const secoes = [...new Set(tutoriais.map((t) => t.secao))];

  return (
    <div>
      <PageTitle title="Central de Ajuda" subtitle="Vídeos e passo a passo para configurar e usar o Recorra" />

      {tutoriais.length === 0 && <p className="text-sm text-muted">Nenhum tutorial cadastrado ainda.</p>}

      <div className="space-y-8">
        {secoes.map((secao) => (
          <div key={secao}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{secaoLabel[secao] || secao}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {tutoriais.filter((t) => t.secao === secao).map((t) => (
                <div key={t.id} className="rounded-lg border border-line bg-surface p-4">
                  <div className="mb-2 flex items-center gap-2 font-medium text-ink">
                    {t.tipo === 'VIDEO' ? <PlayCircle size={16} className="text-primary" /> : <FileText size={16} className="text-primary" />}
                    {t.titulo}
                  </div>
                  {t.tipo === 'VIDEO' && t.videoUrl && (
                    <div className="mb-2 aspect-video w-full overflow-hidden rounded">
                      <iframe src={toEmbed(t.videoUrl)} className="h-full w-full" allowFullScreen title={t.titulo} />
                    </div>
                  )}
                  {t.conteudo && <p className="whitespace-pre-wrap text-sm text-muted">{t.conteudo}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
