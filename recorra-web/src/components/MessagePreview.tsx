'use client';

import { useEffect, useState } from 'react';
import { X, Check, ExternalLink, Mail, MessageCircle } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { api } from '@/lib/api';

// Substitui variáveis {{...}} por valores de exemplo, para pré-visualização.
const EXEMPLOS: Record<string, string> = {
  nome: 'João Silva',
  customer_name: 'João Silva',
  valor: 'R$ 149,90',
  vencimento: '15/07/2026',
  billing_due_date: '15/07/2026',
  billing_days_until_due_date: '3',
  company_name: 'Sua Empresa',
  pix: '00020126...br.gov.bcb.pix',
  link: 'https://pag.recorra.app/f/abc123',
  billing_url: 'https://pag.recorra.app/f/abc123',
  contrato: 'CT-1234',
};

export function preencherExemplo(texto: string): string {
  return texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, chave) => EXEMPLOS[chave] ?? `{{${chave}}}`);
}

/**
 * Prévia de e-mail: pede o HTML ao backend em vez de imitar o layout aqui.
 *
 * A versão anterior desenhava um e-mail à mão enquanto o backend mandava um
 * `<p>` cru — a prévia mostrava algo que o cliente nunca recebia. Buscando o
 * HTML de /modelos-email/previa, o que aparece é literalmente o que sai no envio.
 */
function PreviaEmail({ assunto, corpo }: { assunto?: string; corpo: string }) {
  const [dados, setDados] = useState<{ assunto: string; html: string } | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    api<{ assunto: string; html: string }>('/modelos-email/previa', { method: 'POST', body: { assunto, corpo } })
      .then((r) => { if (vivo) setDados(r); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao gerar a prévia'); });
    return () => { vivo = false; };
  }, [assunto, corpo]);

  if (erro) return <p className="rounded bg-danger-tint px-3 py-2 text-sm text-danger">{erro}</p>;
  if (!dados) return <p className="py-8 text-center text-sm text-muted">Gerando prévia...</p>;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="border-b border-line bg-canvas px-4 py-2.5">
        <div className="text-[11px] uppercase tracking-wide text-muted">Assunto</div>
        <div className="truncate text-sm font-medium text-ink">{dados.assunto}</div>
      </div>
      {/* iframe: o HTML do e-mail traz estilos próprios e não pode herdar/vazar o CSS do painel. */}
      <iframe
        title="Prévia do e-mail"
        srcDoc={dados.html}
        sandbox=""
        className="h-[420px] w-full border-0 bg-white"
      />
    </div>
  );
}

type Tipo = 'whatsapp' | 'email' | 'sms';

function tipoDoCanal(canal: string): Tipo {
  if (canal.startsWith('WHATSAPP')) return 'whatsapp';
  if (canal === 'EMAIL') return 'email';
  if (canal === 'SMS') return 'sms';
  return 'whatsapp';
}

export function MessagePreview({ canal, texto, assunto, empresa = 'Sua Empresa', onClose }: { canal: string; texto: string; assunto?: string; empresa?: string; onClose: () => void }) {
  const tipo = tipoDoCanal(canal);
  const corpo = preencherExemplo(texto || '(mensagem vazia)');
  const temLink = /https?:\/\/|\{\{\s*(link|billing_url)\s*\}\}/.test(texto);

  const titulo = tipo === 'whatsapp' ? 'Pré-visualizar WhatsApp' : tipo === 'email' ? 'Pré-visualizar e-mail' : 'Pré-visualizar SMS';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`max-h-[90vh] w-full ${tipo === 'email' ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-lg bg-surface p-5 shadow-lg`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            {tipo === 'email' ? <Mail size={17} className="text-primary" /> : <MessageCircle size={17} className="text-primary" />} {titulo}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        {tipo === 'whatsapp' && (
          <div className="rounded-xl bg-[#E5DDD5] p-3">
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
              <LogoMark size={26} />
              <div className="leading-tight">
                <div className="flex items-center gap-1 text-sm font-semibold text-ink">{empresa} <Check size={13} className="text-primary" /></div>
                <div className="text-[11px] text-muted">Conta comercial</div>
              </div>
            </div>
            <div className="ml-1 max-w-[90%] rounded-lg rounded-tl-none bg-white p-3 shadow-sm">
              <p className="whitespace-pre-wrap text-sm text-ink">{corpo}</p>
              {temLink && (
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  <button className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-primary"><ExternalLink size={14} /> Ver fatura</button>
                </div>
              )}
              <div className="mt-1 text-right text-[10px] text-muted">agora</div>
            </div>
          </div>
        )}

        {tipo === 'email' && <PreviaEmail assunto={assunto} corpo={texto} />}

        {tipo === 'sms' && (
          <div className="rounded-xl bg-canvas p-4">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-[#E9E9EB] p-3">
              <p className="whitespace-pre-wrap text-sm text-ink">{corpo}</p>
            </div>
            <div className="mt-1 text-[10px] text-muted">SMS · agora</div>
          </div>
        )}

        <p className="mt-4 text-xs text-muted">Prévia com dados de exemplo — as variáveis serão preenchidas com os dados reais do cliente no envio.</p>
      </div>
    </div>
  );
}

// Botão que abre a prévia; encapsula o estado do modal.
export function PreviewButton({ canal, texto, assunto, empresa }: { canal: string; texto: string; assunto?: string; empresa?: string }) {
  const [open, setOpen] = useState(false);
  const Icone = tipoDoCanal(canal) === 'email' ? Mail : MessageCircle;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:bg-canvas hover:text-primary">
        <Icone size={13} /> Pré-visualizar
      </button>
      {open && <MessagePreview canal={canal} texto={texto} assunto={assunto} empresa={empresa} onClose={() => setOpen(false)} />}
    </>
  );
}
