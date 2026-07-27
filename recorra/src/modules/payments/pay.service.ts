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
/** Logo horizontal da Recorrai embutida (a página é servida pela API, sem acesso ao /public do painel). */
const RECORRAI_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 696.2 119.5"><g transform="translate(14 21.359999999999992) scale(3.2)" fill="#14857C"><path d="M12 3.2a6.2 6.2 0 0 1 6.2 6.2v3.1l1.9 3.4a1.1 1.1 0 0 1-1 1.6H4.9a1.1 1.1 0 0 1-1-1.6l1.9-3.4V9.4A6.2 6.2 0 0 1 12 3.2z"/><circle cx="12" cy="20.2" r="1.9"/></g><g transform="translate(14 21.359999999999992) scale(3.2)" fill="#22A45D"><circle cx="18.8" cy="5.2" r="3.2"/></g><g transform="translate(102.77000000000001 103.76) scale(0.11 -0.11)"><g fill="#14857C"><path d="M595 0 381 278H262V0H73V750H510Q594 750 657.0 720.5Q720 691 755.0 637.5Q790 584 790 513Q790 425 736.0 365.0Q682 305 590 285L814 0ZM485 606H262V420H485Q539 420 569.5 444.5Q600 469 600 513Q600 557 569.5 581.5Q539 606 485 606Z" transform="translate(0 0)"/><path d="M387 -16Q285 -16 204.5 22.0Q124 60 78.0 128.0Q32 196 32 287Q32 376 76.0 443.5Q120 511 197.0 548.5Q274 586 373 586Q473 586 545.0 542.0Q617 498 656.0 418.0Q695 338 695 230H232Q252 178 304.5 150.0Q357 122 437 122Q501 122 564.5 139.5Q628 157 680 189V68Q622 29 547.0 6.5Q472 -16 387 -16ZM376 452Q317 452 277.5 423.5Q238 395 225 347H519Q505 397 468.0 424.5Q431 452 376 452Z" transform="translate(840 0)"/><path d="M726 237Q718 161 671.0 104.5Q624 48 549.0 16.0Q474 -16 381 -16Q277 -16 198.5 22.0Q120 60 76.0 128.0Q32 196 32 285Q32 374 76.0 442.0Q120 510 198.5 548.0Q277 586 381 586Q474 586 548.5 554.5Q623 523 670.5 466.0Q718 409 726 333H541Q530 387 486.5 417.0Q443 447 381 447Q307 447 263.0 404.5Q219 362 219 285Q219 208 263.0 166.0Q307 124 381 124Q443 124 486.5 154.5Q530 185 541 237Z" transform="translate(1568 0)"/><path d="M392 -16Q284 -16 203.0 22.0Q122 60 77.0 127.5Q32 195 32 285Q32 375 77.0 442.5Q122 510 203.0 548.0Q284 586 392 586Q500 586 581.5 548.0Q663 510 708.0 442.5Q753 375 753 285Q753 195 708.0 127.5Q663 60 581.5 22.0Q500 -16 392 -16ZM392 124Q473 124 519.0 167.0Q565 210 565 285Q565 360 519.0 403.5Q473 447 392 447Q312 447 265.5 403.5Q219 360 219 285Q219 210 265.5 167.0Q312 124 392 124Z" transform="translate(2320 0)"/><path d="M33 570H221L246 418Q272 492 322.0 539.0Q372 586 455 586Q491 586 527 578V418Q500 424 473.5 427.0Q447 430 425 430Q377 430 338.5 410.5Q300 391 277.5 349.0Q255 307 255 240V0H69V381Z" transform="translate(3105 0)"/><path d="M33 570H221L246 418Q272 492 322.0 539.0Q372 586 455 586Q491 586 527 578V418Q500 424 473.5 427.0Q447 430 425 430Q377 430 338.5 410.5Q300 391 277.5 349.0Q255 307 255 240V0H69V381Z" transform="translate(3647 0)"/></g><g fill="#22A45D" transform="translate(4189 0)"><path d="M578 0 563 122Q522 57 458.5 20.5Q395 -16 317 -16Q233 -16 169.5 22.0Q106 60 70.0 127.5Q34 195 34 285Q34 375 70.0 442.5Q106 510 169.5 548.0Q233 586 317 586Q395 586 458.5 550.0Q522 514 564 450L578 570H771L736 285L771 0ZM222 285Q222 216 263.5 171.5Q305 127 371 127Q437 127 491.0 171.5Q545 216 569 285Q545 354 491.0 398.5Q437 443 371 443Q327 443 293.5 422.5Q260 402 241.0 366.5Q222 331 222 285Z" transform="translate(0 0)"/><path d="M60 578 152 559 245 578V0H60ZM153 630Q103 630 72.5 655.5Q42 681 42 723Q42 766 72.5 791.0Q103 816 153 816Q202 816 232.5 791.0Q263 766 263 723Q263 681 232.5 655.5Q202 630 153 630Z" transform="translate(816 0)"/></g></g></svg>';

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
          <button id="btnpix" class="btn primary" type="button">Copiar código Pix</button>
          <div id="ok" class="ok">Código copiado! Cole no app do seu banco.</div>
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
    // Selo da Recorrai: o cliente final vê quem faz a cobrança rodar (propaganda + CTA).
    const selo = `<a class="selo" href="${RECORRAI_SITE}" target="_blank" rel="noreferrer">${RECORRAI_LOGO}<span>Sua empresa também quer cobrar no automático? <b>Conheça &rarr;</b></span></a>`;
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
  .selo{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;color:#6b7a72;font-size:12px;line-height:1.35;margin-top:26px;padding-top:18px;border-top:1px solid #e3e8e6;text-decoration:none}
  .selo svg{height:22px;width:auto}
  .selo b{color:#14857C;font-weight:700}
  @media (prefers-color-scheme:dark){body{background:#0f1512;color:#e8ecea}.card{background:#161d1a;border-color:#232c28}textarea{background:#0f1512;color:#e8ecea;border-color:#232c28}.btn{background:#161d1a;color:#e8ecea;border-color:#232c28}.selo{border-color:#232c28;color:#8a978f}}
</style></head><body><div class="wrap">${conteudo}</div>
<script>
  function copiar(){
    var t=document.getElementById('pix'); if(!t) return;
    var texto=t.value;
    function ok(){var b=document.getElementById('btnpix'); if(b) b.textContent='✓ Copiado'; var o=document.getElementById('ok'); if(o) o.style.display='block';}
    function manual(){
      // Fallback: tira o readonly, seleciona e usa execCommand; se nao rolar, abre o prompt para o usuario copiar.
      try{ t.removeAttribute('readonly'); t.focus(); t.select(); t.setSelectionRange(0, texto.length);
        var c=document.execCommand('copy'); t.setAttribute('readonly','readonly');
        if(c){ ok(); } else { window.prompt('Selecione e copie o codigo Pix:', texto); }
      }catch(e){ try{ window.prompt('Selecione e copie o codigo Pix:', texto); }catch(_){} }
    }
    if(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext){
      navigator.clipboard.writeText(texto).then(ok, manual);
    } else { manual(); }
  }
  (function(){var b=document.getElementById('btnpix'); if(b) b.addEventListener('click', copiar);})();
</script></body></html>`;
  }
}
