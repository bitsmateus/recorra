/**
 * Montagem do relatório "Disparos × Recuperado" a partir das linhas agregadas
 * do banco — pura e testável (sem Prisma).
 */
export type Origem = 'REGUA' | 'MANUAL' | 'CAMPANHA' | 'SEM_CONTATO';
export const ORIGENS: Origem[] = ['REGUA', 'MANUAL', 'CAMPANHA', 'SEM_CONTATO'];

export interface LinhaDisparo { origem: string; canal: string; contaId: string | null; operadorId: string | null; n: number }
export interface LinhaRecuperado {
  origem: string | null; operadorId: string | null; carteira: string | null;
  canal: string | null; contaId: string | null; dia: string; n: number; valor: number;
}

export interface Soma { valor: number; faturas: number }
type PorOrigem = Record<Origem, Soma>;

export interface LinhaOperador {
  id: string | null;
  nome: string;
  carteira: string | null;
  ativo: boolean;
  clientesNaCarteira: number;
  disparosAutomaticos: number; // régua + campanha para clientes dela
  disparosManuais: number; // enviados por ela
  clientesContatados: number;
  recuperado: PorOrigem;
  recuperadoComContato: Soma; // régua + manual + campanha (o que conta como recuperação)
}

export interface Relatorio {
  periodo: { de: string; ate: string };
  janelaDias: number;
  pendentesAtribuicao: number;
  totais: {
    disparos: { total: number; regua: number; manual: number; campanha: number };
    clientesContatados: number;
    recuperado: PorOrigem;
    recuperadoComContato: Soma;
    recebido: Soma;
  };
  operadores: LinhaOperador[];
  carteiras: { nome: string; recuperado: PorOrigem; faturas: number; valor: number }[];
  canais: { canal: string; conta: string; disparosRegua: number; disparosManuais: number; faturas: number; valor: number }[];
  serie: ({ dia: string } & Record<Origem, number>)[];
}

export interface EntradaRelatorio {
  de: Date;
  ate: Date;
  janelaDias: number;
  disparos: LinhaDisparo[];
  contatadosPorOp: { operadorId: string | null; n: number }[];
  contatadosTotal: number;
  recuperados: LinhaRecuperado[];
  usuarios: { id: string; nome: string; role: string; ativo: boolean; carteira: string | null }[];
  carteiras: string[];
  contas: { id: string; canal: string; apelido: string | null; numero: string | null }[];
  pendentesAtribuicao: number;
  clientesPorOp: { operadorId: string; n: number }[];
}

const zero = (): Soma => ({ valor: 0, faturas: 0 });
const porOrigemZero = (): PorOrigem => ({ REGUA: zero(), MANUAL: zero(), CAMPANHA: zero(), SEM_CONTATO: zero() });
const origemDe = (o: string | null): Origem => (ORIGENS.includes(o as Origem) ? (o as Origem) : 'SEM_CONTATO');
const somar = (s: Soma, valor: number, n: number) => { s.valor = round2(s.valor + valor); s.faturas += n; };
const round2 = (v: number) => Math.round(v * 100) / 100;
const comContato = (p: PorOrigem): Soma => ({
  valor: round2(p.REGUA.valor + p.MANUAL.valor + p.CAMPANHA.valor),
  faturas: p.REGUA.faturas + p.MANUAL.faturas + p.CAMPANHA.faturas,
});
const ymd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const NOME_CANAL: Record<string, string> = {
  WHATSAPP_CLOUD: 'WhatsApp (oficial)', WHATSAPP_EVOLUTION: 'WhatsApp', WHATSAPP_UAZAPI: 'WhatsApp',
  NX_SYSTEMS: 'WhatsApp (NX)', EMAIL: 'E-mail', SMS: 'SMS',
  NOTA: 'Nota/promessa da operadora',
};

export const nomeCanal = (canal: string | null | undefined) => NOME_CANAL[canal ?? ''] ?? canal ?? '';

export function montarRelatorio(e: EntradaRelatorio): Relatorio {
  // ---- Operadores (linha por usuário que aparece em algo + operadores com carteira) ----
  const ops = new Map<string | null, LinhaOperador>();
  const usuario = new Map(e.usuarios.map((u) => [u.id, u]));
  const op = (id: string | null): LinhaOperador => {
    const chave = id && usuario.has(id) ? id : null;
    let l = ops.get(chave);
    if (!l) {
      const u = chave ? usuario.get(chave)! : null;
      l = {
        id: chave, nome: u?.nome ?? 'Sem responsável', carteira: u?.carteira ?? null, ativo: u?.ativo ?? true,
        clientesNaCarteira: 0, disparosAutomaticos: 0, disparosManuais: 0, clientesContatados: 0,
        recuperado: porOrigemZero(), recuperadoComContato: zero(),
      };
      ops.set(chave, l);
    }
    return l;
  };
  // Todo operador vinculado a uma carteira aparece, mesmo zerado (é a equipe).
  for (const u of e.usuarios) if (u.carteira && u.ativo) op(u.id);

  const totDisp = { total: 0, regua: 0, manual: 0, campanha: 0 };
  const canais = new Map<string, Relatorio['canais'][number]>();
  const conta = new Map(e.contas.map((c) => [c.id, c]));
  const canalLinha = (canal: string | null, contaId: string | null) => {
    const c = contaId ? conta.get(contaId) : undefined;
    const chave = `${canal ?? '-'}|${contaId ?? '-'}`;
    let l = canais.get(chave);
    if (!l) {
      l = {
        canal: NOME_CANAL[canal ?? ''] ?? canal ?? '—',
        conta: c ? [c.apelido, c.numero].filter(Boolean).join(' · ') || '—' : '—',
        disparosRegua: 0, disparosManuais: 0, faturas: 0, valor: 0,
      };
      canais.set(chave, l);
    }
    return l;
  };

  for (const d of e.disparos) {
    totDisp.total += d.n;
    const linha = op(d.operadorId);
    const cl = canalLinha(d.canal, d.contaId);
    if (d.origem === 'MANUAL') { totDisp.manual += d.n; linha.disparosManuais += d.n; cl.disparosManuais += d.n; }
    else {
      if (d.origem === 'CAMPANHA') totDisp.campanha += d.n; else totDisp.regua += d.n;
      linha.disparosAutomaticos += d.n;
      cl.disparosRegua += d.n;
    }
  }
  for (const c of e.contatadosPorOp) op(c.operadorId).clientesContatados += c.n;
  for (const c of e.clientesPorOp) op(c.operadorId).clientesNaCarteira += c.n;

  // ---- Recuperado ----
  const totRec = porOrigemZero();
  const recebido = zero();
  const carteiras = new Map<string, Relatorio['carteiras'][number]>();
  for (const nome of e.carteiras) carteiras.set(nome, { nome, recuperado: porOrigemZero(), faturas: 0, valor: 0 });
  const serie = new Map<string, { dia: string } & Record<Origem, number>>();

  for (const r of e.recuperados) {
    const o = origemDe(r.origem);
    somar(totRec[o], r.valor, r.n);
    somar(recebido, r.valor, r.n);
    somar(op(r.operadorId).recuperado[o], r.valor, r.n);

    const nomeCart = r.carteira ?? 'Antes da carteira (em dia / poucos dias)';
    let c = carteiras.get(nomeCart);
    if (!c) { c = { nome: nomeCart, recuperado: porOrigemZero(), faturas: 0, valor: 0 }; carteiras.set(nomeCart, c); }
    somar(c.recuperado[o], r.valor, r.n);
    c.faturas += r.n;
    c.valor = round2(c.valor + r.valor);

    if (o !== 'SEM_CONTATO') {
      // Contato manual sem disparo = nota/promessa registrada pela operadora (ex.: conversa no chat do NX).
      const cl = r.canal ? canalLinha(r.canal, r.contaId) : canalLinha('NOTA', null);
      cl.faturas += r.n;
      cl.valor = round2(cl.valor + r.valor);
    }

    let s = serie.get(r.dia);
    if (!s) { s = { dia: r.dia, REGUA: 0, MANUAL: 0, CAMPANHA: 0, SEM_CONTATO: 0 }; serie.set(r.dia, s); }
    s[o] = round2(s[o] + r.valor);
  }

  const operadores = [...ops.values()].map((l) => ({ ...l, recuperadoComContato: comContato(l.recuperado) }));
  operadores.sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : 0)
    || (a.carteira ?? '￿').localeCompare(b.carteira ?? '￿')
    || b.recuperadoComContato.valor - a.recuperadoComContato.valor
    || a.nome.localeCompare(b.nome));

  return {
    periodo: { de: ymd(e.de), ate: ymd(e.ate) },
    janelaDias: e.janelaDias,
    pendentesAtribuicao: e.pendentesAtribuicao,
    totais: {
      disparos: totDisp,
      clientesContatados: e.contatadosTotal,
      recuperado: totRec,
      recuperadoComContato: comContato(totRec),
      recebido,
    },
    // Linha "Sem responsável" só aparece se tiver algo.
    operadores: operadores.filter((o) => o.id !== null || o.disparosAutomaticos + o.disparosManuais + o.recuperadoComContato.faturas + o.recuperado.SEM_CONTATO.faturas > 0),
    carteiras: [...carteiras.values()],
    canais: [...canais.values()].sort((a, b) => b.valor - a.valor || b.disparosRegua + b.disparosManuais - (a.disparosRegua + a.disparosManuais)),
    serie: [...serie.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}
