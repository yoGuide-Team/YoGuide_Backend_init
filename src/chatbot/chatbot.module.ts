import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { PrismaModule } from '../prisma/prisma.module'; // Adjust this path to your Prisma module location

@Module({
  imports: [PrismaModule], // This gives the service access to your database via PrismaService
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}