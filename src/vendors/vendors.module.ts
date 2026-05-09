import { Module } from '@nestjs/common';
import { AdminVendorsController, VendorsController } from './vendors.controller';

@Module({ controllers: [VendorsController, AdminVendorsController] })
export class VendorsModule {}
