import { Module } from '@nestjs/common';
import { RecuperacaoController } from './recuperacao.controller';
import { RelatorioRecuperacaoService } from './relatorio.service';
import { AtribuicaoService } from './atribuicao.service';
import { DistribuicaoService } from './distribuicao.service';

@Module({
  controllers: [RecuperacaoController],
  providers: [RelatorioRecuperacaoService, AtribuicaoService, DistribuicaoService],
  exports: [AtribuicaoService, DistribuicaoService],
})
export class RecuperacaoModule {}
