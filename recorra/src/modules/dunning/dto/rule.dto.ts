import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ChannelType, RiskBand } from '@prisma/client';

export class StepDto {
  @IsInt()
  ordem!: number;

  @IsInt()
  @Min(-60)
  @Max(90)
  offsetDias!: number;

  @IsIn(['WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI', 'EMAIL', 'SMS', 'HTTP_GENERIC'])
  canal!: ChannelType;

  @IsOptional()
  @IsString()
  channelAccountId?: string;

  @IsOptional()
  @IsArray()
  @IsIn(['WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI', 'EMAIL', 'SMS', 'HTTP_GENERIC'], { each: true })
  canaisFallback?: ChannelType[];

  @IsString()
  template!: string;

  @IsOptional()
  @IsString()
  templateB?: string;

  @IsOptional()
  @IsBoolean()
  abTest?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class SaveRuleDto {
  @IsString()
  nome!: string;

  @IsOptional()
  @IsString()
  nicho?: string;

  @IsOptional()
  @IsIn(['BOM', 'ATENCAO', 'RISCO'])
  faixaRisco?: RiskBand;

  @IsOptional()
  @IsBoolean()
  apenasNotificar?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  janelaInicio?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  janelaFim?: number;

  @IsOptional()
  @IsBoolean()
  diasUteisSomente?: boolean;

  @IsOptional()
  @IsInt()
  maxMsgsDia?: number;

  @IsOptional()
  @IsBoolean()
  roteamentoPorCusto?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps!: StepDto[];
}
