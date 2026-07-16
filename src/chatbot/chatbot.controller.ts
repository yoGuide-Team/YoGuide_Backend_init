import { Controller, Post, Body } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';

@Controller('api/chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

@Post('ask') // Matches the mapped route: /api/chatbot/ask
  async handleQuery(@Body() body: { text: string; userId?: string }) {
    // Directly hands off to our newly fixed Gemini processQuery method
    return this.chatbotService.processQuery(body.text, body.userId);
  }
}