import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChargesService } from './charges.service';
import { verificarPagamento } from './pay-token';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const esc = (s: string) =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const COR_PADRAO = '#0f6e56';
/** Cor hex válida ou o padrão — a cor entra no CSS, então precisa ser segura. */
const corSegura = (c?: string) => (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test((c ?? '').trim()) ? (c as string).trim() : COR_PADRAO);
/** Só http(s) vira src/href — evita javascript:/data: na página. */
const urlSegura = (u?: string) => (/^https?:\/\//i.test((u ?? '').trim()) ? (u as string).trim() : null);

/** Site da Recorrai para o selo no rodapé (promoção para o cliente final). */
const RECORRAI_SITE = 'https://recorrai.com.br';

interface Marca { empresa?: string; cor?: string; logoUrl?: string; assinatura?: string }

/**
 * Página pública de pagamento (`/pay/:token`) — o destino do botão do WhatsApp.
 * Mostra Pix copia-e-cola (com botão copiar) e o boleto. Os dados vêm da fonte
 * (gateway ou 2ª via do ERP) na hora, reusando ChargesService.buscarPagamento.
 */
@Injectable()
export class PayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: ChargesService,
  ) {}

  /** QR do Pix como SVG inline (sem dependência externa na página). Null se falhar. */
  private async qrSvg(pix: string): Promise<string | null> {
    try {
      // margin baixa; a cor segue o tema via currentColor não dá em <path fill> do lib,
      // então usamos preto no branco (fundo branco garante leitura em qualquer tema).
      return await QRCode.toString(pix, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    } catch {
      return null;
    }
  }

  /** URL do boleto para redirecionamento direto (botão "Boleto"). Null se não houver. */
  async urlBoleto(token: string): Promise<string | null> {
    const invoiceId = verificarPagamento(token);
    if (!invoiceId) return null;
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, tenantId: true, boletoUrl: true } });
    if (!inv) return null;
    if (inv.boletoUrl) return inv.boletoUrl;
    try {
      const d = await this.charges.buscarPagamento(inv.tenantId, inv.id);
      return d.boletoUrl ?? null;
    } catch {
      return null;
    }
  }

  async render(token: string): Promise<{ status: number; body: string }> {
    const invoiceId = verificarPagamento(token);
    if (!invoiceId) return { status: 404, body: this.pagina('Link inválido', '<p>Este link de pagamento não é válido ou expirou.</p>') };

    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: { select: { nome: true } }, tenant: { select: { nome: true, config: true } } },
    });
    if (!inv) return { status: 404, body: this.pagina('Cobrança não encontrada', '<p>Não encontramos esta cobrança.</p>') };

    const marca = ((inv.tenant?.config as { emailMarca?: Marca } | null)?.emailMarca) ?? {};
    const cor = corSegura(marca.cor);

    // Garante Pix/boleto atualizados (busca no SGP/gateway se ainda não tiver).
    let pix = inv.pixCopiaCola;
    let boletoUrl = inv.boletoUrl;
    let boletoLinha = inv.boletoLinha;
    try {
      const d = await this.charges.buscarPagamento(inv.tenantId, inv.id);
      pix = d.pixCopiaCola ?? pix;
      boletoUrl = d.boletoUrl ?? boletoUrl;
      boletoLinha = d.boletoLinha ?? boletoLinha;
    } catch { /* segue com o que já tem salvo */ }

    const empresa = esc(marca.empresa || inv.tenant?.nome || 'Pagamento');
    const logo = urlSegura(marca.logoUrl);
    const nome = esc(inv.customer?.nome?.split(' ')[0] || '');
    const venc = new Date(inv.vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

    const cabecalho = logo
      ? `<img class="logo" src="${esc(logo)}" alt="${empresa}">`
      : `<div class="empresa">${empresa}</div>`;
    const blocos: string[] = [
      `<div class="head">${cabecalho}<div class="valor">${brl(Number(inv.valor))}</div><div class="venc">Vencimento: ${venc}</div></div>`,
    ];
    if (pix) {
      const qr = await this.qrSvg(pix);
      blocos.push(`
        <div class="card">
          <div class="rot">Pague com Pix — escaneie o QR ou copie o código</div>
          ${qr ? `<div class="qr">${qr}</div>` : ''}
          <textarea id="pix" readonly>${esc(pix)}</textarea>
          <button class="btn primary" onclick="copiar()">Copiar código Pix</button>
          <div id="ok" class="ok">Copiado!</div>
        </div>`);
    }
    if (boletoUrl) {
      blocos.push(`<a class="btn" href="${esc(boletoUrl)}" target="_blank" rel="noreferrer">Abrir boleto</a>`);
    }
    if (boletoLinha && !boletoUrl) {
      blocos.push(`<div class="card"><div class="rot">Linha digitável do boleto</div><textarea readonly>${esc(boletoLinha)}</textarea></div>`);
    }
    if (!pix && !boletoUrl && !boletoLinha) {
      blocos.push('<p>No momento não há Pix ou boleto disponível para esta cobrança. Fale com a empresa.</p>');
    }

    const saudacao = nome ? `<p class="oi">Olá, ${nome}!</p>` : '';
    const assinatura = marca.assinatura ? `<div class="assinatura">${esc(marca.assinatura)}</div>` : '';
    // Selo da Recorrai: o cliente final vê quem faz a cobrança rodar (propaganda).
    const selo = `<div class="selo">Cobrança automatizada por <a href="${RECORRAI_SITE}" target="_blank" rel="noreferrer">Recorrai</a> · régua de cobrança e Pix no WhatsApp</div>`;
    return { status: 200, body: this.pagina(`Pagar · ${empresa}`, saudacao + blocos.join('\n') + assinatura + selo, cor) };
  }

  private pagina(titulo: string, conteudo: string, cor: string = COR_PADRAO): string {
    return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)}</title>
<style>
  :root{color-scheme:light dark;--cor:${cor}}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f5f4;color:#1b2320;display:flex;justify-content:center;padding:20px}
  .wrap{width:100%;max-width:440px}
  .head{text-align:center;margin:18px 0 22px}
  .empresa{font-size:16px;color:var(--cor);font-weight:700}
  .logo{max-height:56px;max-width:200px;object-fit:contain}
  .valor{font-size:34px;font-weight:800;margin-top:10px}
  .venc{font-size:13px;color:#5b6b64;margin-top:2px}
  .oi{text-align:center;color:#5b6b64;margin:0 0 14px}
  .card{background:#fff;border:1px solid #e3e8e6;border-radius:12px;padding:14px;margin-bottom:12px}
  .rot{font-size:12px;color:#5b6b64;margin-bottom:6px}
  .qr{background:#fff;border-radius:8px;padding:10px;margin:0 auto 10px;width:min(220px,60vw)}
  .qr svg{display:block;width:100%;height:auto}
  textarea{width:100%;min-height:74px;resize:none;border:1px solid #e3e8e6;border-radius:8px;padding:10px;font-family:ui-monospace,monospace;font-size:12px;background:#fafbfb;color:#1b2320}
  .btn{display:block;width:100%;text-align:center;text-decoration:none;border:1px solid #d7dedb;border-radius:10px;padding:13px;font-size:15px;font-weight:600;color:#1b2320;background:#fff;margin-top:10px;cursor:pointer}
  .btn.primary{background:var(--cor);border-color:var(--cor);color:#fff}
  .ok{display:none;text-align:center;color:var(--cor);font-size:13px;margin-top:8px}
  .assinatura{text-align:center;color:#5b6b64;font-size:12px;margin-top:16px;white-space:pre-line}
  .selo{text-align:center;color:#8a978f;font-size:11px;margin-top:22px;padding-top:14px;border-top:1px solid #e3e8e6}
  .selo a{color:var(--cor);font-weight:600;text-decoration:none}
  @media (prefers-color-scheme:dark){body{background:#0f1512;color:#e8ecea}.card{background:#161d1a;border-color:#232c28}textarea{background:#0f1512;color:#e8ecea;border-color:#232c28}.btn{background:#161d1a;color:#e8ecea;border-color:#232c28}.selo{border-color:#232c28}}
</style></head><body><div class="wrap">${conteudo}</div>
<script>
  function copiar(){var t=document.getElementById('pix');if(!t)return;t.select();t.setSelectionRange(0,99999);
    var done=function(){var o=document.getElementById('ok');if(o)o.style.display='block'};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){try{document.execCommand('copy');done()}catch(e){}})}
    else{try{document.execCommand('copy');done()}catch(e){}}}
</script></body></html>`;
  }
}
