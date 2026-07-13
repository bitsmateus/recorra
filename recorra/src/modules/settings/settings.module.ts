import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';

@Module({
  imports: [ConnectorsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
