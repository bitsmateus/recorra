import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '@/common/prisma/prisma.service';
import { onlyDigits, parseMoney } from '@/common/util/normalize';
import { isValidCpfCnpj, isValidEmail, toE164BR } from '@/common/util/validators';

export interface ImportResult {
  clientes: number;
  faturas: number;
  erros: string[];
}

@Injectable()
export class ImportService {
  private static readonly MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
  private static readonly MAX_ROWS = 50_000;

  constructor(private readonly prisma: PrismaService) {}

  /** Barra uploads grandes demais (mitiga DoS/ReDoS no parser de planilha). */
  private assertUploadSize(buf: Buffer) {
    if (buf.length > ImportService.MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Arquivo muito grande (limite de 15 MB).');
    }
  }

  private assertRowCount(len: number) {
    if (len > ImportService.MAX_ROWS) {
      throw new BadRequestException(`Planilha com linhas demais (limite de ${ImportService.MAX_ROWS}).`);
    }
  }

  async importCsv(tenantId: string, csv: string): Promise<ImportResult> {
    const linhas = (csv ?? '').split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (linhas.length < 2) return { clientes: 0, faturas: 0, erros: [] };
    const header = this.parseLine(linhas[0]).map((h) => h.trim().toLowerCase());
    const rows = linhas.slice(1).map((l) => this.parseLine(l));
    return this.processRows(tenantId, header, rows);
  }

  async importXlsx(tenantId: string, base64: string): Promise<ImportResult> {
    const buf = Buffer.from(base64.replace(/^data:.*;base64,/, ''), 'base64');
    this.assertUploadSize(buf);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    this.assertRowCount(matrix.length);
    if (matrix.length < 2) return { clientes: 0, faturas: 0, erros: [] };
    const header = matrix[0].map((h) => String(h).trim().toLowerCase());
    return this.processRows(tenantId, header, matrix.slice(1));
  }

  private async processRows(tenantId: string, header: string[], rows: string[][]): Promise<ImportResult> {
    const result: ImportResult = { clientes: 0, faturas: 0, erros: [] };
    const idx = (nome: string) => header.indexOf(nome);
    const cell = (cols: string[], nome: string) => (idx(nome) >= 0 ? String(cols[idx(nome)] ?? '').trim() : '');

    for (let i = 0; i < rows.length; i++) {
      const cols = rows[i];
      const linha = i + 2;
      const doc = onlyDigits(cell(cols, 'cpfcnpj'));
      const nome = cell(cols, 'nome');
      if (!nome && !doc) continue;

      if (!isValidCpfCnpj(doc)) {
        result.erros.push(`Linha ${linha}: CPF/CNPJ invalido (${cell(cols, 'cpfcnpj')})`);
        continue;
      }
      const emailRaw = cell(cols, 'email');
      if (emailRaw && !isValidEmail(emailRaw)) {
        result.erros.push(`Linha ${linha}: e-mail invalido (${emailRaw})`);
        continue;
      }
      const telefone = cell(cols, 'telefone') ? toE164BR(cell(cols, 'telefone')) : null;

      try {
        const customer = await this.prisma.customer.upsert({
          where: { tenantId_doc: { tenantId, doc } },
          create: {
            tenantId,
            nome,
            doc,
            email: emailRaw || null,
            telefone,
            contrato: cell(cols, 'contrato') || null,
            plano: cell(cols, 'plano') || null,
            cidade: cell(cols, 'cidade') || null,
            uf: cell(cols, 'uf').toUpperCase() || null,
            sourceSystem: 'CSV',
          },
          update: {
            nome,
            email: emailRaw || undefined,
            telefone: telefone ?? undefined,
            contrato: cell(cols, 'contrato') || undefined,
            plano: cell(cols, 'plano') || undefined,
            cidade: cell(cols, 'cidade') || undefined,
            uf: cell(cols, 'uf').toUpperCase() || undefined,
          },
        });
        result.clientes++;

        const valorRaw = cell(cols, 'valor');
        const vencRaw = cell(cols, 'vencimento');
        if (valorRaw && vencRaw) {
          const valor = parseMoney(valorRaw);
          const vencimento = this.parseDate(vencRaw);
          if (valor > 0 && vencimento) {
            await this.prisma.invoice.create({
              data: {
                tenantId,
                customerId: customer.id,
                valor,
                vencimento,
                status: vencimento < new Date() ? 'VENCIDA' : 'PENDENTE',
                sourceSystem: 'CSV',
              },
            });
            result.faturas++;
          }
        }
      } catch (e) {
        result.erros.push(`Linha ${linha}: ${String(e)}`);
      }
    }
    return result;
  }

  // ===== Importação assistida (com mapeamento de colunas) =====

  /** Lê um arquivo (base64 de xlsx/csv/txt) e devolve matriz [header, ...rows]. */
  private lerArquivo(data: string): { header: string[]; rows: string[][] } {
    const raw = data.replace(/^data:.*;base64,/, '');
    const buf = Buffer.from(raw, 'base64');
    this.assertUploadSize(buf);
    const wb = XLSX.read(buf, { type: 'buffer', codepage: 65001 });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    this.assertRowCount(matrix.length);
    if (!matrix.length) return { header: [], rows: [] };
    const header = matrix[0].map((h) => String(h ?? '').trim());
    const rows = matrix.slice(1).map((r) => r.map((c) => String(c ?? '')));
    return { header, rows };
  }

  /** Preview: cabeçalhos + primeiras linhas + total. */
  async preview(data: string) {
    const { header, rows } = this.lerArquivo(data);
    const naoVazias = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
    const amostra = naoVazias.slice(0, 5).map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => (obj[h] = r[i] ?? ''));
      return obj;
    });
    return { header, amostra, total: naoVazias.length };
  }

  /** Normaliza telefone aplicando DDI/DDD padrão quando faltarem. */
  private montarTelefone(raw: string, ddi?: string, ddd?: string): string | null {
    let d = onlyDigits(raw);
    if (!d) return null;
    const ddiN = onlyDigits(ddi ?? '');
    const dddN = onlyDigits(ddd ?? '');
    // sem DDD (8-9 dígitos) -> aplica DDD padrão
    if (d.length <= 9 && dddN) d = dddN + d;
    // sem DDI (10-11 dígitos) -> aplica DDI padrão
    if (ddiN && d.length <= 11) d = ddiN + d;
    return d.length >= 10 ? d : null;
  }

  /**
   * Importa com mapeamento de colunas.
   * mapping: { campoRecorra: 'Nome da coluna na planilha' }
   * Campos suportados: nome, cpfCnpj, email, telefone, plano, contrato, cidade, uf, valor, vencimento, descricao
   */
  async importMapeado(
    tenantId: string,
    opts: {
      data: string;
      mapping: Record<string, string>;
      ddi?: string;
      ddd?: string;
      etiquetas?: string[];
      criarCobrancas?: boolean;
    },
  ): Promise<ImportResult> {
    const { header, rows } = this.lerArquivo(opts.data);
    const result: ImportResult = { clientes: 0, faturas: 0, erros: [] };
    const mapIdx: Record<string, number> = {};
    for (const [campo, coluna] of Object.entries(opts.mapping)) {
      if (coluna) mapIdx[campo] = header.indexOf(coluna);
    }
    const val = (cols: string[], campo: string) => {
      const i = mapIdx[campo];
      return i != null && i >= 0 ? String(cols[i] ?? '').trim() : '';
    };
    const etiquetas = (opts.etiquetas ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
    // registra etiquetas no catálogo
    for (const nome of etiquetas) {
      await this.prisma.tag.upsert({ where: { tenantId_nome: { tenantId, nome } }, create: { tenantId, nome }, update: {} }).catch(() => undefined);
    }

    for (let i = 0; i < rows.length; i++) {
      const cols = rows[i];
      const linha = i + 2;
      if (!cols.some((c) => String(c).trim() !== '')) continue;
      const doc = onlyDigits(val(cols, 'cpfCnpj'));
      const nome = val(cols, 'nome');
      if (!nome && !doc) continue;
      if (!isValidCpfCnpj(doc)) {
        result.erros.push(`Linha ${linha}: CPF/CNPJ invalido (${val(cols, 'cpfCnpj') || 'vazio'})`);
        continue;
      }
      const emailRaw = val(cols, 'email');
      if (emailRaw && !isValidEmail(emailRaw)) {
        result.erros.push(`Linha ${linha}: e-mail invalido (${emailRaw})`);
        continue;
      }
      const telefone = val(cols, 'telefone') ? this.montarTelefone(val(cols, 'telefone'), opts.ddi, opts.ddd) : null;
      try {
        const existente = await this.prisma.customer.findUnique({ where: { tenantId_doc: { tenantId, doc } }, select: { tags: true } });
        const tagsFinais = [...new Set([...(existente?.tags ?? []), ...etiquetas])];
        const customer = await this.prisma.customer.upsert({
          where: { tenantId_doc: { tenantId, doc } },
          create: {
            tenantId, nome, doc,
            email: emailRaw || null,
            telefone,
            plano: val(cols, 'plano') || null,
            contrato: val(cols, 'contrato') || null,
            cidade: val(cols, 'cidade') || null,
            uf: val(cols, 'uf').toUpperCase().slice(0, 2) || null,
            tags: tagsFinais,
            sourceSystem: 'CSV',
          },
          update: {
            nome,
            email: emailRaw || undefined,
            telefone: telefone ?? undefined,
            plano: val(cols, 'plano') || undefined,
            contrato: val(cols, 'contrato') || undefined,
            cidade: val(cols, 'cidade') || undefined,
            uf: val(cols, 'uf').toUpperCase().slice(0, 2) || undefined,
            tags: tagsFinais,
          },
        });
        result.clientes++;

        if (opts.criarCobrancas) {
          const valorRaw = val(cols, 'valor');
          const vencRaw = val(cols, 'vencimento');
          if (valorRaw && vencRaw) {
            const valor = parseMoney(valorRaw);
            const vencimento = this.parseDate(vencRaw);
            if (valor > 0 && vencimento) {
              await this.prisma.invoice.create({
                data: {
                  tenantId, customerId: customer.id, valor, vencimento,
                  descricao: val(cols, 'descricao') || null,
                  status: vencimento < new Date() ? 'VENCIDA' : 'PENDENTE',
                  sourceSystem: 'CSV',
                },
              });
              result.faturas++;
            }
          }
        }
      } catch (e) {
        result.erros.push(`Linha ${linha}: ${String(e)}`);
      }
    }
    return result;
  }

  private parseLine(line: string): string[] {
    const sep = line.includes(';') && !line.includes(',') ? ';' : ',';
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === sep && !inQuotes) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.replace(/^"|"$/g, ''));
  }

  private parseDate(v: string): Date | null {
    const s = v.trim();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
}
