import { Module } from '@nestjs/common';
import { AdminCitiesController, CitiesController } from './cities.controller';

@Module({
  controllers: [CitiesController, AdminCitiesController],
})
export class CitiesModule {}
