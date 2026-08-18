import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { AppCompatController } from './app-compat.controller';
import { GastronomyCatalogController } from './gastronomy-catalog.controller';

@Module({
  controllers: [CatalogController, AppCompatController, GastronomyCatalogController],
})
export class CatalogModule {}
