import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { ChannelType, PaymentProviderType, SourceSystem } from '@prisma/client';

export class CreateIntegrationDto {
  @IsIn(['IXC', 'SGP', 'HUBSOFT', 'VOALLE', 'MKAUTH', 'CSV', 'API'])
  sistema!: SourceSystem;

  @IsString()
  urlBase!: string;

  // token e credenciais específicas do ERP (serão cifradas)
  @IsObject()
  credentials!: Record<string, unknown>;
}

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  urlBase?: string;

  // Se enviado (com chaves), recifra as credenciais. Vazio/ausente mantém as atuais.
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}

export class CreatePaymentAccountDto {
  @IsIn(['ASAAS', 'MERCADO_PAGO', 'EFI', 'STRIPE', 'BANCO_INTER', 'SICOOB', 'SICREDI', 'BANCO_BRASIL'])
  provider!: PaymentProviderType;

  @IsOptional()
  @IsString()
  apelido?: string;

  @IsIn(['sandbox', 'production'])
  ambiente!: string;

  // { apiKey, webhookToken } — cifrado
  @IsObject()
  credentials!: Record<string, unknown>;
}

export class UpdatePaymentAccountDto {
  @IsOptional()
  @IsString()
  apelido?: string;

  @IsOptional()
  @IsIn(['sandbox', 'production'])
  ambiente?: string;

  // Se enviado (com chaves), recifra as credenciais. Vazio/ausente mantém as atuais.
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}

export class CreateChannelAccountDto {
  @IsIn(['WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI', 'EMAIL', 'SMS', 'HTTP_GENERIC', 'NX_SYSTEMS'])
  canal!: ChannelType;

  @IsOptional()
  @IsString()
  apelido?: string;

  // credenciais específicas do canal — cifrado
  @IsObject()
  credentials!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
