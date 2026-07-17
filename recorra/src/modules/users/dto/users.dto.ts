import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsEmail()
  email!: string;

  // Mesmo piso do cadastro público (auth/register): 8 caracteres.
  @IsString()
  @MinLength(8, { message: 'A senha precisa ter no mínimo 8 caracteres' })
  senha!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'A senha precisa ter no mínimo 8 caracteres' })
  senha!: string;
}
