import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { env } from '@/config/env';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { MailModule } from '@/common/mail/mail.module';
import { UsersModule } from '@/modules/users/users.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { InboxModule } from '@/modules/inbox/inbox.module';
import { ReportsModule } from '@/modules/reports/reports.module';
import { DunningModule } from '@/modules/dunning/dunning.module';
import { RiskModule } from '@/modules/risk/risk.module';
import { ImportsModule } from '@/modules/imports/imports.module';
import { SettingsModule } from '@/modules/settings/settings.module';
import { IngestModule } from '@/modules/ingest/ingest.module';
import { PlatformModule } from '@/modules/platform/platform.module';
import { DispatchesModule } from '@/modules/dispatches/dispatches.module';
import { TutorialsModule } from '@/modules/tutorials/tutorials.module';
import { CampaignsModule } from '@/modules/campaigns/campaigns.module';
import { AiModule } from '@/modules/ai/ai.module';
import { HealthController } from '@/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Logs estruturados (JSON) com mascaramento de PII/segredos (LGPD).
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.body.senha',
            'req.body.password',
            'req.body.token',
            'req.body.refreshToken',
            'req.body.codigo',
            'req.body.credentials',
            '*.senhaHash',
            '*.credentials',
            '*.twoFaSecret',
            '*.apiKey',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ConnectorsModule,
    PaymentsModule,
    BillingModule,
    ChannelsModule,
    InboxModule,
    ReportsModule,
    DunningModule,
    RiskModule,
    ImportsModule,
    SettingsModule,
    IngestModule,
    PlatformModule,
    DispatchesModule,
    TutorialsModule,
    CampaignsModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
