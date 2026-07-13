import { IsArray, IsOptional, IsString, IsNumber, MaxLength } from 'class-validator';

export class UpsertCustomerDto {
  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsString()
  doc!: string; // CPF/CNPJ (validado no service)

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  contrato?: string;

  @IsOptional()
  @IsString()
  plano?: string;

  @IsOptional()
  @IsNumber()
  valorPlano?: number;

  @IsOptional()
  @IsString()
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
