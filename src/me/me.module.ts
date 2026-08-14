import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeTripsController } from './trips.controller';

@Module({
  controllers: [MeController, MeTripsController],
})
export class MeModule {}
