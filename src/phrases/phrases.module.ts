import { Module } from '@nestjs/common';
import { PhrasesController } from './phrases.controller';

@Module({ controllers: [PhrasesController] })
export class PhrasesModule {}
