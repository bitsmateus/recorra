import { IsInt, IsString, Max, Min } from 'class-validator';

/** Carteira/equipe de cobrança configurável por tenant (model Carteira). */
export class SaveCarteiraDto {
  @IsString()
  nome!: string;

  // A partir deste dia de atraso (inclusive) a carteira assume o cliente.
  @IsInt()
  @Min(0)
  @Max(3650)
  diaMinimo!: number;
}
