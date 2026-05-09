import { Module } from '@nestjs/common';
import { ItinerariesController } from './itineraries.controller';

@Module({ controllers: [ItinerariesController] })
export class ItinerariesModule {}
