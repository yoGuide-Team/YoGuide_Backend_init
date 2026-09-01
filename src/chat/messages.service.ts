import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all message threads where the user is a participant, including other user info.
   */
  async getUserThreads(userId: string) {
    const threads = await this.prisma.messageThread.findMany({
      where: {
        OR: [
          { participantA: userId },
          { participantB: userId },
        ],
      },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }, // Get preview of latest message
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Enrich each thread with the other participant's user & profile data
    const enrichedThreads = await Promise.all(
      threads.map(async (thread) => {
        const otherUserId =
          thread.participantA === userId ? thread.participantB : thread.participantA;

        const otherUser = await this.prisma.user.findUnique({
          where: { id: otherUserId },
          include: { guideProfile: true },
        });

        return {
          ...thread,
          otherUser: otherUser
            ? {
                id: otherUser.id,
                fullName: otherUser.fullName,
                profileImage: otherUser.profileImage,
                role: otherUser.role,
              }
            : null,
        };
      }),
    );

    return enrichedThreads;
  }

  /**
   * Get detail for a specific thread including all conversation messages.
   */
 async getThreadById(threadId: string, userId: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }, // In-order chat history
        },
      },
    });

    if (!thread) {
      throw new NotFoundException(`Thread with ID ${threadId} not found`);
    }

    if (thread.participantA !== userId && thread.participantB !== userId) {
      throw new ForbiddenException('You do not have access to this conversation');
    }

    // Find the other user's info for the header
    const otherUserId = thread.participantA === userId ? thread.participantB : thread.participantA;
    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherUserId },
    });

    return {
      ...thread,
      otherUser: otherUser
        ? {
            id: otherUser.id,
            fullName: otherUser.fullName,
            profileImage: otherUser.profileImage,
            role: otherUser.role,
          }
        : null,
    };
  }

  /**
   * Optional: Create or start a new thread via REST
   */
  async createThread(userId: string, participantId: string, firstMessage?: string) {
    let thread = await this.prisma.messageThread.findFirst({
      where: {
        OR: [
          { participantA: userId, participantB: participantId },
          { participantA: participantId, participantB: userId },
        ],
      },
    });

    if (!thread) {
      thread = await this.prisma.messageThread.create({
        data: {
          participantA: userId,
          participantB: participantId,
        },
      });
    }

    if (firstMessage) {
      await this.prisma.threadMessage.create({
        data: {
          threadId: thread.id,
          senderId: userId,
          body: firstMessage,
        },
      });
    }

    return this.getThreadById(thread.id, userId);
  }

  /**
   * Optional: Post a message via REST fallback
   */
  async addMessage(threadId: string, userId: string, body: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException(`Thread with ID ${threadId} not found`);
    }

    if (thread.participantA !== userId && thread.participantB !== userId) {
      throw new ForbiddenException('You cannot post to this conversation');
    }

    const message = await this.prisma.threadMessage.create({
      data: {
        threadId,
        senderId: userId,
        body,
      },
    });

    // Update parent thread updatedAt timestamp
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return message;
  }
}