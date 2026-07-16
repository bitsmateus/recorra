'use client';

import { useState } from 'react';
import { X, Check, ExternalLink, Mail, MessageCircle } from 'lucide-react';
import { LogoMark } from '@/components/Logo';

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

type Tipo = 'whatsapp' | 'email' | 'sms';

function tipoDoCanal(canal: string): Tipo {
  if (canal.startsWith('WHATSAPP')) return 'whatsapp';
  if (canal === 'EMAIL') return 'email';
  if (canal === 'SMS') return 'sms';
  return 'whatsapp';
}

export function MessagePreview({ canal, texto, empresa = 'Sua Empresa', onClose }: { canal: string; texto: string; empresa?: string; onClose: () => void }) {
  const tipo = tipoDoCanal(canal);
  const corpo = preencherExemplo(texto || '(mensagem vazia)');
  const temLink = /https?:\/\/|\{\{\s*(link|billing_url)\s*\}\}/.test(texto);

  const titulo = tipo === 'whatsapp' ? 'Pré-visualizar WhatsApp' : tipo === 'email' ? 'Pré-visualizar e-mail' : 'Pré-visualizar SMS';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
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

        {tipo === 'email' && (
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-3">
              <LogoMark size={30} />
              <div className="leading-tight">
                <div className="text-sm font-semibold text-ink">{empresa}</div>
                <div className="text-[11px] text-muted">no-reply@recorra.app</div>
              </div>
            </div>
            <div className="bg-surface p-4">
              <p className="whitespace-pre-wrap text-sm text-ink">{corpo}</p>
              {temLink && (
                <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Pagar fatura</button>
              )}
            </div>
            <div className="border-t border-line bg-canvas px-4 py-3 text-[11px] text-muted">
              Você recebeu este e-mail porque possui uma cobrança em aberto. Recorrai.
            </div>
          </div>
        )}

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
export function PreviewButton({ canal, texto, empresa }: { canal: string; texto: string; empresa?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:bg-canvas hover:text-primary">
        <MessageCircle size={13} /> Pré-visualizar
      </button>
      {open && <MessagePreview canal={canal} texto={texto} empresa={empresa} onClose={() => setOpen(false)} />}
    </>
  );
}
