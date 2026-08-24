import { Module } from '@nestjs/common';
import { HotelSearchProxyController } from './hotel-search-proxy.controller';

@Module({
  controllers: [HotelSearchProxyController],
})
export class HotelSearchProxyModule {}
