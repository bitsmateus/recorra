import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const FORMAS_PAGAMENTO = ['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA', 'OUTRO'] as const;
export const STATUS_ACORDO = ['ATIVO', 'QUITADO', 'QUEBRADO', 'CANCELADO'] as const;

/** Campos comuns do registro de acordo (o que foi combinado com o cliente). */
class CamposAcordo {
  /** Quando foi combinado (padrão: hoje). */
  @IsOptional() @IsDateString()
  dataAcordo?: string;

  /** Data combinada para pagar (ou da 1ª parcela). */
  @IsOptional() @IsDateString()
  dataPrevista?: string;

  /** Valor da dívida antes do acordo (opcional). */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000)
  valorOriginal?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000)
  valorAcordado?: number;

  @IsOptional() @IsInt() @Min(1) @Max(72)
  parcelas?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  observacao?: string;
}

export class RegistrarAcordoDto extends CamposAcordo {
  @IsString()
  customerId!: string;

  /** Texto livre: "Parcelamento", "Desconto à vista", "Troca de vencimento"... Obrigatório ao criar. */
  @IsString() @MinLength(2) @MaxLength(60)
  tipo!: string;

  @IsIn(FORMAS_PAGAMENTO as unknown as string[])
  formaPagamento!: string;
}

export class AtualizarAcordoDto extends CamposAcordo {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  tipo?: string;

  @IsOptional() @IsIn(FORMAS_PAGAMENTO as unknown as string[])
  formaPagamento?: string;

  @IsOptional() @IsIn(STATUS_ACORDO as unknown as string[])
  status?: string;
}
