import { Module } from '@nestjs/common';
import { AdminProductsController, ProductsController } from './products.controller';

@Module({ controllers: [ProductsController, AdminProductsController] })
export class ProductsModule {}
