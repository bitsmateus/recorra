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

export class CreatePaymentAccountDto {
  @IsIn(['ASAAS', 'MERCADO_PAGO', 'EFI', 'STRIPE'])
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

export class CreateChannelAccountDto {
  @IsIn(['WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI', 'EMAIL', 'SMS', 'HTTP_GENERIC'])
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
