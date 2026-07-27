import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChargesService } from './charges.service';
import { verificarPagamento } from './pay-token';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const esc = (s: string) =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

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

  async render(token: string): Promise<{ status: number; body: string }> {
    const invoiceId = verificarPagamento(token);
    if (!invoiceId) return { status: 404, body: this.pagina('Link inválido', '<p>Este link de pagamento não é válido ou expirou.</p>') };

    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: { select: { nome: true } }, tenant: { select: { nome: true } } },
    });
    if (!inv) return { status: 404, body: this.pagina('Cobrança não encontrada', '<p>Não encontramos esta cobrança.</p>') };

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

    const empresa = esc(inv.tenant?.nome || 'Pagamento');
    const nome = esc(inv.customer?.nome?.split(' ')[0] || '');
    const venc = new Date(inv.vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

    const blocos: string[] = [
      `<div class="head"><div class="empresa">${empresa}</div><div class="valor">${brl(Number(inv.valor))}</div><div class="venc">Vencimento: ${venc}</div></div>`,
    ];
    if (pix) {
      blocos.push(`
        <div class="card">
          <div class="rot">Pix copia e cola</div>
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
    return { status: 200, body: this.pagina(`Pagar · ${empresa}`, saudacao + blocos.join('\n')) };
  }

  private pagina(titulo: string, conteudo: string): string {
    return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)}</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f5f4;color:#1b2320;display:flex;justify-content:center;padding:20px}
  .wrap{width:100%;max-width:440px}
  .head{text-align:center;margin:18px 0 22px}
  .empresa{font-size:14px;color:#5b6b64;font-weight:600}
  .valor{font-size:34px;font-weight:800;margin-top:6px}
  .venc{font-size:13px;color:#5b6b64;margin-top:2px}
  .oi{text-align:center;color:#5b6b64;margin:0 0 14px}
  .card{background:#fff;border:1px solid #e3e8e6;border-radius:12px;padding:14px;margin-bottom:12px}
  .rot{font-size:12px;color:#5b6b64;margin-bottom:6px}
  textarea{width:100%;min-height:74px;resize:none;border:1px solid #e3e8e6;border-radius:8px;padding:10px;font-family:ui-monospace,monospace;font-size:12px;background:#fafbfb;color:#1b2320}
  .btn{display:block;width:100%;text-align:center;text-decoration:none;border:1px solid #d7dedb;border-radius:10px;padding:13px;font-size:15px;font-weight:600;color:#1b2320;background:#fff;margin-top:10px;cursor:pointer}
  .btn.primary{background:#0f6e56;border-color:#0f6e56;color:#fff}
  .ok{display:none;text-align:center;color:#0f6e56;font-size:13px;margin-top:8px}
  @media (prefers-color-scheme:dark){body{background:#0f1512;color:#e8ecea}.card{background:#161d1a;border-color:#232c28}textarea{background:#0f1512;color:#e8ecea;border-color:#232c28}.btn{background:#161d1a;color:#e8ecea;border-color:#232c28}}
</style></head><body><div class="wrap">${conteudo}</div>
<script>
  function copiar(){var t=document.getElementById('pix');if(!t)return;t.select();t.setSelectionRange(0,99999);
    var done=function(){var o=document.getElementById('ok');if(o)o.style.display='block'};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){try{document.execCommand('copy');done()}catch(e){}})}
    else{try{document.execCommand('copy');done()}catch(e){}}}
</script></body></html>`;
  }
}
