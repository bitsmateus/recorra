import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { OnboardingController } from './onboarding.controller';

@Module({
  controllers: [UsersController, OnboardingController],
  providers: [UsersService],
})
export class UsersModule {}
