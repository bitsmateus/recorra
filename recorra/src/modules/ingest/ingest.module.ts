import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { IngestController } from './ingest.controller';
import { ApiKeysController } from './apikeys.controller';

@Module({
  controllers: [IngestController, ApiKeysController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService],
})
export class IngestModule {}
