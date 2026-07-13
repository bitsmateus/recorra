import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Recorra — Cobrança e notificação inteligente',
  description: 'Régua de cobrança e recuperação de recebíveis multi-nicho.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
