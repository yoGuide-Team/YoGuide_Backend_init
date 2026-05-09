import { Module } from '@nestjs/common';
import { AdminGuidesController, GuidesController } from './guides.controller';

@Module({ controllers: [GuidesController, AdminGuidesController] })
export class GuidesModule {}
