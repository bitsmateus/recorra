import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  empresa!: string; // nome do tenant

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsString()
  @MinLength(2)
  nome!: string; // nome do usuário owner

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter no mínimo 8 caracteres' })
  senha!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  senha!: string;

  // código TOTP quando o usuário tem 2FA ativo
  @IsOptional()
  @IsString()
  codigo?: string;
}
