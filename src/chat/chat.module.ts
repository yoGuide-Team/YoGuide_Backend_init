import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MessagesController],
  providers: [ChatGateway, MessagesService],
  exports: [ChatGateway, MessagesService],
})
export class ChatModule {}