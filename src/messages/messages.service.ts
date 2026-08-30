import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every thread the user is a participant of, most recently active first. */
  listThreads(userId: string) {
    return this.prisma.messageThread.findMany({
      where: { OR: [{ participantA: userId }, { participantB: userId }] },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getThread(userId: string, threadId: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!thread) throw new NotFoundException(`Thread '${threadId}' not found.`);
    this.assertParticipant(thread, userId);
    return thread;
  }

  /**
   * Starts a conversation with `participantId`, or — if the two users
   * already have a thread — just appends to it instead of creating a
   * duplicate. Either way returns the thread with its messages so far.
   */
  async createThread(userId: string, participantId: string, firstMessage: string) {
    const existing = await this.prisma.messageThread.findFirst({
      where: {
        OR: [
          { participantA: userId, participantB: participantId },
          { participantA: participantId, participantB: userId },
        ],
      },
    });

    const thread =
      existing ??
      (await this.prisma.messageThread.create({
        data: { participantA: userId, participantB: participantId },
      }));

    await this.prisma.message.create({
      data: { threadId: thread.id, senderId: userId, body: firstMessage },
    });
    await this.prisma.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    return thread;
  }

  async sendMessage(userId: string, threadId: string, body: string) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException(`Thread '${threadId}' not found.`);
    this.assertParticipant(thread, userId);

    const message = await this.prisma.message.create({
      data: { threadId, senderId: userId, body },
    });
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
    return message;
  }

  private assertParticipant(
    thread: { participantA: string; participantB: string },
    userId: string,
  ) {
    if (thread.participantA !== userId && thread.participantB !== userId) {
      throw new ForbiddenException('Not a participant in this thread.');
    }
  }
}
