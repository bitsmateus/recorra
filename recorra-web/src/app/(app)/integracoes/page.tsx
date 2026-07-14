'use client';

import { useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import EnvioIntegracoes from './envio-integracoes';

const sistemas = [
  { id: 'IXC', nome: 'IXC Soft', desc: 'API REST + webhook. Clientes, boletos, Pix e vencimentos.' },
  { id: 'SGP', nome: 'SGP', desc: 'API com token (Admin > Integrações > Tokens).' },
  { id: 'HUBSOFT', nome: 'HubSoft', desc: 'API REST com OAuth2.' },
  { id: 'VOALLE', nome: 'Voalle', desc: 'API do ERP com OAuth2.' },
  { id: 'MKAUTH', nome: 'MK-Auth', desc: 'Requer add-on de integração no servidor.' },
  { id: 'CSV', nome: 'CSV / Excel', desc: 'Importação manual (fallback universal).' },
];

export default function IntegracoesPage() {
  const [integrationId, setIntegrationId] = useState('');
  const [status, setStatus] = useState<string>('');

  async function sincronizar() {
    if (!integrationId) return;
    setStatus('Sincronizando...');
    try {
      const r = await api<{ clientes: number; faturas: number }>(
        `/integracoes/${integrationId}/sincronizar`,
        { method: 'POST' },
      );
      setStatus(`✓ ${r.clientes} clientes e ${r.faturas} faturas sincronizados`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Erro ao sincronizar');
    }
  }

  return (
    <div>
      <PageTitle
        title="Integrações"
        subtitle="Conecte sistemas de origem (clientes/faturas) e plataformas de envio de mensagens"
      />

      <h2 className="mb-3 text-sm font-semibold text-ink">Sistemas de origem</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sistemas.map((s) => (
          <div key={s.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-1 font-medium text-ink">{s.nome}</div>
            <p className="text-sm text-muted">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-ink">Sincronizar agora</h2>
        <p className="mb-3 text-sm text-muted">
          Informe o ID de uma integração já configurada e dispare a sincronização.
        </p>
        <div className="flex gap-2">
          <input
            value={integrationId}
            onChange={(e) => setIntegrationId(e.target.value)}
            placeholder="ID da integração"
            className="w-72 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={sincronizar}
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            <RefreshCw size={16} />
            Sincronizar
          </button>
        </div>
        {status && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
            <Check size={16} /> {status}
          </p>
        )}
      </div>

      <EnvioIntegracoes />
    </div>
  );
}
