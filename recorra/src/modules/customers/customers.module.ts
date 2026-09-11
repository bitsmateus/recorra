import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { DashboardController } from '@/modules/dashboard/dashboard.controller';
import { RiskModule } from '@/modules/risk/risk.module';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';

@Module({
  imports: [RiskModule, ConnectorsModule],
  controllers: [CustomersController, DashboardController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
