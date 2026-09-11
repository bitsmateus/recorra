import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Promessa de pagamento registrada na linha do tempo do cliente. */
export class CreatePromessaDto {
  @IsDateString()
  dataPromessa!: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  valor?: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}
