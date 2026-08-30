import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CreateThreadDto, SendMessageDto } from './messages.dto';

@ApiTags('Messages')
@ApiBearerAuth('access-token')
@Controller('messages/threads')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List every message thread the signed-in user is part of.' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.listThreads(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a thread with its full message history.' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.messages.getThread(user.id, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Start a conversation with another user',
    description:
      'Reuses the existing thread with that user if one already exists, instead of creating a duplicate.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateThreadDto) {
    return this.messages.createThread(user.id, dto.participantId, dto.firstMessage);
  }

  @Post(':id')
  @ApiOperation({ summary: 'Send a message into an existing thread.' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.sendMessage(user.id, id, dto.body);
  }
}
