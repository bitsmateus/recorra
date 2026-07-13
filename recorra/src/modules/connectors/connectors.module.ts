import { Module } from '@nestjs/common';
import { ConnectorFactory } from './connector.factory';
import { SyncService } from './sync.service';
import { ConnectorsController } from './connectors.controller';

@Module({
  controllers: [ConnectorsController],
  providers: [ConnectorFactory, SyncService],
  exports: [ConnectorFactory, SyncService],
})
export class ConnectorsModule {}
