import { Module } from '@nestjs/common';
import { TutorialsService } from './tutorials.service';
import { AjudaController } from './ajuda.controller';

@Module({
  controllers: [AjudaController],
  providers: [TutorialsService],
  exports: [TutorialsService],
})
export class TutorialsModule {}
