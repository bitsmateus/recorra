# Recorra — Web (painel)

Frontend do Recorra em **Next.js 15 + Tailwind** com a identidade **Teal**.

## Rodar

```bash
npm install
cp .env.example .env.local   # aponte para a API
npm run dev                  # http://localhost:3001
```

A API (backend) precisa estar rodando em `http://localhost:3000` (ver `../recorra`).
Login demo (após o seed do backend): `admin@demo.com` / `recorra123`.

## Estrutura

```
src/
├── app/
│   ├── login/            tela de login
│   ├── (app)/            área autenticada (sidebar)
│   │   ├── dashboard/    KPIs do mês
│   │   ├── clientes/     lista + faixa de risco (IA)
│   │   ├── cobrancas/    faturas (placeholder)
│   │   └── integracoes/  sincronizar ERPs
│   └── layout.tsx
├── components/           Logo, UI (Metric, RiskBadge)
└── lib/api.ts            cliente HTTP + token
```

## Deploy no EasyPanel

Serviço **web** (build Next.js). Variável `NEXT_PUBLIC_API_URL` apontando para a URL pública da API.
Cores e tokens em `../design/tokens.css` e `tailwind.config.ts`.
