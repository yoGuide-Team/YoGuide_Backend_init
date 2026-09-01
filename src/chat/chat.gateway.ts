import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    const userId =
      client.handshake.auth?.userId ||
      (client.handshake.headers['x-user-id'] as string);
    client.data.userId = userId;
  }

  handleDisconnect(client: Socket) {}

  @SubscribeMessage('join_thread')
  handleJoinThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { threadId: string },
  ) {
    client.join(`thread_${data.threadId}`);
    return { status: 'joined', threadId: data.threadId };
  }

  @SubscribeMessage('leave_thread')
  handleLeaveThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { threadId: string },
  ) {
    client.leave(`thread_${data.threadId}`);
    return { status: 'left', threadId: data.threadId };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { threadId?: string; participantId?: string; body: string },
  ) {
    const senderId = client.data.userId || client.handshake.auth?.userId;
    let threadId = payload.threadId;

    if (!threadId && payload.participantId) {
      let thread = await this.prisma.messageThread.findFirst({
        where: {
          OR: [
            { participantA: senderId, participantB: payload.participantId },
            { participantA: payload.participantId, participantB: senderId },
          ],
        },
      });

      if (!thread) {
        thread = await this.prisma.messageThread.create({
          data: {
            participantA: senderId,
            participantB: payload.participantId,
          },
        });
      }
      threadId = thread.id;
      client.join(`thread_${threadId}`);
    }

    if (!threadId) {
      return { error: 'threadId or participantId is required' };
    }

    const message = await this.prisma.threadMessage.create({
      data: {
        threadId: threadId,
        senderId: senderId,
        body: payload.body,
      },
    });

    const responsePayload = {
      id: message.id,
      threadId: message.threadId,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };

    // Emit event to every socket in this thread room
    this.server.to(`thread_${threadId}`).emit('new_message', responsePayload);

    return responsePayload;
  }
}