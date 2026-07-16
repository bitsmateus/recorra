/**
 * Layout do e-mail — FONTE ÚNICA.
 *
 * O envio (EmailChannel) e a pré-visualização do painel chamam esta mesma função.
 * Antes o backend mandava `<p>${texto}</p>` enquanto o painel desenhava um e-mail
 * bonito à mão: a prévia mostrava algo que o cliente nunca recebia. Qualquer mudança
 * de layout tem que acontecer AQUI, e não no componente de prévia.
 */

/** Marca do tenant (fica em Tenant.config.emailMarca). */
export interface EmailMarca {
  /** Nome exibido no cabeçalho e no rodapé. Default: nome do tenant. */
  empresa?: string;
  /** Cor do cabeçalho e do botão (hex). */
  cor?: string;
  /** URL absoluta de uma logo. Sem ela, mostramos o nome da empresa. */
  logoUrl?: string;
  /** Linha extra no rodapé (endereço, CNPJ, contato). */
  assinatura?: string;
}

export interface EmailConteudo {
  assunto: string;
  /** Texto do corpo, com as variáveis já resolvidas. Quebras de linha viram <br>. */
  texto: string;
  /** Quando presente, vira um botão de ação no fim do e-mail. */
  botaoUrl?: string;
  botaoLabel?: string;
}

const COR_PADRAO = '#14857C';

/** Escapa HTML: o corpo vem do usuário e vai para dentro de um documento. */
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Aceita só http(s): evita javascript:/data: virando link clicável no e-mail. */
function urlSegura(u?: string): string | null {
  const v = (u ?? '').trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

/** Cor hex válida (#rgb ou #rrggbb); qualquer outra coisa cai no padrão. */
function corSegura(c?: string): string {
  const v = (c ?? '').trim();
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? v : COR_PADRAO;
}

/**
 * Acha a primeira URL do texto para virar botão. Cobre o caso comum de a mensagem
 * terminar com "{{link}}" já resolvido.
 */
export function primeiraUrl(texto: string): string | null {
  const m = (texto || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

/**
 * Se a URL do botão está sozinha numa linha, tira essa linha do corpo: ela vira o
 * botão logo abaixo e repetir o endereço cru deixa o e-mail poluído. URL no meio de
 * uma frase fica onde está — remover quebraria o texto.
 */
function semUrlSolta(texto: string, url?: string | null): string {
  if (!url) return texto;
  return (texto || '')
    .split('\n')
    .filter((l) => l.trim() !== url)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Texto do corpo → HTML: escapa, transforma quebras em <br> e linka URLs soltas. */
function corpoHtml(texto: string): string {
  const escapado = escapeHtml(texto);
  const comLinks = escapado.replace(
    /https?:\/\/[^\s<>"']+/gi,
    (u) => `<a href="${u}" style="color:inherit;word-break:break-all;">${u}</a>`,
  );
  return comLinks.replace(/\n/g, '<br>');
}

/**
 * Monta o e-mail completo. HTML de e-mail é conservador de propósito: tabelas e
 * estilos inline, porque Gmail/Outlook ignoram <style> e flex/grid.
 */
export function renderEmail(conteudo: EmailConteudo, marca: EmailMarca = {}): string {
  const cor = corSegura(marca.cor);
  const empresa = escapeHtml((marca.empresa || '').trim() || 'Cobrança');
  const logo = urlSegura(marca.logoUrl);
  const botaoUrl = urlSegura(conteudo.botaoUrl);
  const botaoLabel = escapeHtml(conteudo.botaoLabel || 'Pagar agora');
  const assinatura = marca.assinatura ? escapeHtml(marca.assinatura) : '';

  const cabecalho = logo
    ? `<img src="${logo}" alt="${empresa}" height="32" style="height:32px;max-width:200px;display:block;border:0;">`
    : `<span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.2px;">${empresa}</span>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(conteudo.assunto)}</title>
</head>
<body style="margin:0;padding:0;background:#eef4f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef4f3;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="background:${cor};padding:20px 24px;">${cabecalho}</td></tr>
      <tr><td style="padding:24px;color:#16233a;font-size:15px;line-height:1.6;">
        ${corpoHtml(semUrlSolta(conteudo.texto, botaoUrl))}
      </td></tr>
      ${botaoUrl ? `<tr><td style="padding:0 24px 24px;">
        <a href="${botaoUrl}" style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">${botaoLabel}</a>
      </td></tr>` : ''}
      <tr><td style="border-top:1px solid #e2e8f0;padding:16px 24px;color:#64748b;font-size:12px;line-height:1.5;">
        Você recebeu este e-mail porque possui uma cobrança em aberto${empresa ? ` com ${empresa}` : ''}.
        ${assinatura ? `<br>${assinatura}` : ''}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
