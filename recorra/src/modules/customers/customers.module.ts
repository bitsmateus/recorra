import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { DashboardController } from '@/modules/dashboard/dashboard.controller';
import { RiskModule } from '@/modules/risk/risk.module';

@Module({
  imports: [RiskModule],
  controllers: [CustomersController, DashboardController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
