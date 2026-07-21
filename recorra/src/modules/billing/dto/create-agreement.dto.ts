import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Max, Min, IsDateString, MaxLength } from 'class-validator';

/**
 * Acordo/renegociação. Validado pelo ValidationPipe global (classe, não
 * interface — senão o pipe não engancha). O limite de `parcelas` evita o
 * DoS de gerar milhões de faturas numa transação.
 */
export class CreateAgreementDto {
  @IsString()
  customerId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  faturaIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  descontoPct?: number;

  @IsInt()
  @Min(1)
  @Max(72)
  parcelas!: number;

  @IsOptional()
  @IsDateString()
  primeiraData?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
