// src/chatbot/chatbot.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ChatbotService } from './chatbot.service';

class ChatDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

@Controller()
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  private getMessage(body: ChatDto): string {
    return (body.message || body.text || '').trim();
  }

  private async buildResponse(body: ChatDto) {
    const userMessage = this.getMessage(body);

    if (!userMessage) {
      return { reply: 'Please provide a message.' };
    }

    const result = await this.chatbotService.handleUserQuery(userMessage, body.userId);
    if (typeof result === 'string') {
      return { reply: result };
    }

    return {
      reply: result.text ?? undefined,
      ...result,
    };
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async handleChat(@Body() body: ChatDto) {
    return this.buildResponse(body);
  }

  @Post('chatbot/ask')
  @HttpCode(HttpStatus.OK)
  async handleChatAsk(@Body() body: ChatDto) {
    return this.buildResponse(body);
  }
}