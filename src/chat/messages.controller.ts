import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { MessagesService } from './messages.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

// Define explicit DTOs for Swagger schema generation
class CreateThreadDto {
  @ApiProperty({ description: 'The backend user ID of the guide' })
  @IsString()
  participantId!: string;

  @ApiProperty({ description: 'Optional initial message body', required: false })
  @IsOptional()
  @IsString()
  firstMessage?: string;
}

class PostMessageDto {
  @ApiProperty({ description: 'The body text of the message' })
  @IsString()
  body!: string;
}

@ApiTags('Messages')
@ApiBearerAuth('access-token')
@Controller('messages/threads')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active threads for current user' })
  async getThreads(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.getUserThreads(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get thread detail and messages history' })
  async getThreadById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messagesService.getThreadById(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Start a new conversation thread with a participant' })
  async createThread(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateThreadDto, // <-- Uses explicit DTO class
  ) {
    return this.messagesService.createThread(
      user.id,
      dto.participantId,
      dto.firstMessage,
    );
  }

  @Post(':id')
  @ApiOperation({ summary: 'Post a message to an existing thread' })
  async postMessage(
    @Param('id') threadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PostMessageDto, // <-- Uses explicit DTO class
  ) {
    return this.messagesService.addMessage(threadId, user.id, dto.body);
  }
}