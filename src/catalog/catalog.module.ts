import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { AppCompatController } from './app-compat.controller';

@Module({
  controllers: [CatalogController, AppCompatController],
})
export class CatalogModule {}
