import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';
import { PaymentsModule } from '@/modules/payments/payments.module';

@Module({
  imports: [ConnectorsModule, PaymentsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
