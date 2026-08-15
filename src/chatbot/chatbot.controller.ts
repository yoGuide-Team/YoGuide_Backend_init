import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatQueryDto } from './dto/chat-query.dto';

@Controller()
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  private getMessage(body: ChatQueryDto): string {
    return (body.message || body.text || '').trim();
  }

  private async buildResponse(body: ChatQueryDto) {
    const userMessage = this.getMessage(body);

    if (!userMessage) {
      return {
        text: 'Please provide a message.',
        reply: 'Please provide a message.',
      };
    }

    const history = Array.isArray(body.history) ? body.history : [];
    const result = await this.chatbotService.handleUserQuery(
      userMessage,
      body.userId,
      history,
    );
    return {
      text: result.text ?? 'How can I help you today?',
      reply: result.text ?? 'How can I help you today?',
      grounded: result.grounded ?? false,
      contextSummary: result.contextSummary,
    };
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async handleChat(@Body() body: ChatQueryDto) {
    return this.buildResponse(body);
  }

  @Post('chatbot/ask')
  @HttpCode(HttpStatus.OK)
  async handleChatAsk(@Body() body: ChatQueryDto) {
    return this.buildResponse(body);
  }

  @Post('chatbot')
  @HttpCode(HttpStatus.OK)
  async handleChatbotAlias(@Body() body: ChatQueryDto) {
    return this.buildResponse(body);
  }
}