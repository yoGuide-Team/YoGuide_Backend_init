import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class StartThreadDto {
  @IsString() participantId!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) firstMessage!: string;
}

class SendMessageDto {
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}

@ApiTags('Messages')
@ApiBearerAuth('access-token')
@Controller('messages')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('threads')
  @ApiOperation({ summary: 'My message threads' })
  threads(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.messageThread.findMany({
      where: { OR: [{ participantA: user.id }, { participantB: user.id }] },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  @Get('threads/:id')
  @ApiOperation({ summary: 'Messages in a thread (newest first)' })
  async messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Thread not found.');
    if (thread.participantA !== user.id && thread.participantB !== user.id) {
      throw new ForbiddenException('Not your thread.');
    }
    return {
      thread,
      messages: await this.prisma.message.findMany({
        where: { threadId: id },
        orderBy: { createdAt: 'asc' },
      }),
    };
  }

  @Post('threads')
  @ApiOperation({
    summary: 'Start a new thread',
    description: 'Creates the thread and sends the first message in one shot.',
  })
  async startThread(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartThreadDto,
  ) {
    if (dto.participantId === user.id) {
      throw new BadRequestException("You can't message yourself.");
    }
    const thread = await this.prisma.messageThread.create({
      data: {
        participantA: user.id,
        participantB: dto.participantId,
        subject: dto.subject,
      },
    });
    await this.prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: user.id,
        body: dto.firstMessage,
      },
    });
    return this.prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  @Post('threads/:id')
  @ApiOperation({ summary: 'Send a message in a thread' })
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Thread not found.');
    if (thread.participantA !== user.id && thread.participantB !== user.id) {
      throw new ForbiddenException('Not your thread.');
    }
    const msg = await this.prisma.message.create({
      data: {
        threadId: id,
        senderId: user.id,
        body: dto.body,
        attachments: dto.attachments ?? [],
      },
    });
    await this.prisma.messageThread.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });
    return msg;
  }
}
