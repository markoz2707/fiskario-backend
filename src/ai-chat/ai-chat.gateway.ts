import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AiChatService } from './ai-chat.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    tenantId: string;
    email: string;
  };
}

interface WsMessagePayload {
  conversationId: string;
  content: string;
}

interface JoinConversationPayload {
  conversationId: string;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
  },
})
export class AiChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AiChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  // ============================================================
  // Connection lifecycle
  // ============================================================

  /**
   * Handle new WebSocket connection.
   * Validates JWT token from handshake auth or query parameters.
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake (auth header or query param)
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (client.handshake.query?.token as string);

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'fallback-secret',
      });

      // Validate user exists
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        this.logger.warn(`Client ${client.id} - user not found: ${payload.sub}`);
        client.emit('error', { message: 'User not found' });
        client.disconnect();
        return;
      }

      // Store user data in socket
      client.data = {
        userId: user.id,
        tenantId: user.tenant_id,
        email: user.email,
      };

      this.logger.log(
        `Client connected: ${client.id} (user: ${user.email}, tenant: ${user.tenant_id})`,
      );
    } catch (error) {
      this.logger.warn(
        `Client ${client.id} authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect();
    }
  }

  /**
   * Handle WebSocket disconnection.
   */
  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(
      `Client disconnected: ${client.id} (user: ${client.data?.email || 'unknown'})`,
    );
  }

  // ============================================================
  // Message handlers
  // ============================================================

  /**
   * Handle 'joinConversation' event.
   * Adds the client to a conversation-specific room for real-time updates.
   */
  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinConversationPayload,
  ) {
    if (!client.data?.tenantId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { conversationId } = payload;

    if (!conversationId) {
      client.emit('error', { message: 'conversationId is required' });
      return;
    }

    try {
      // Verify the conversation belongs to this tenant
      const conversation = await this.prisma.chatConversation.findFirst({
        where: {
          id: conversationId,
          tenant_id: client.data.tenantId,
        },
      });

      if (!conversation) {
        client.emit('error', {
          message: `Conversation ${conversationId} not found`,
        });
        return;
      }

      // Join the room
      const room = `conversation:${conversationId}`;
      await client.join(room);

      this.logger.log(
        `Client ${client.id} joined room ${room}`,
      );

      client.emit('joinedConversation', {
        conversationId,
        status: 'joined',
      });
    } catch (error) {
      this.logger.error(`Failed to join conversation: ${error}`);
      client.emit('error', {
        message: 'Failed to join conversation',
      });
    }
  }

  /**
   * Handle 'sendMessage' event.
   * Receives a user message, sends it through the AI pipeline,
   * and streams the response back to the client.
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsMessagePayload,
  ) {
    if (!client.data?.tenantId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { conversationId, content } = payload;

    if (!conversationId || !content) {
      client.emit('error', {
        message: 'conversationId and content are required',
      });
      return;
    }

    if (content.length > 4000) {
      client.emit('error', {
        message: 'Message content exceeds maximum length (4000 characters)',
      });
      return;
    }

    const room = `conversation:${conversationId}`;

    try {
      // Emit typing indicator to the conversation room
      this.server.to(room).emit('typing', {
        conversationId,
        isTyping: true,
      });

      // Process the message through the AI service
      const result = await this.aiChatService.sendMessage(
        client.data.tenantId,
        conversationId,
        content,
      );

      // Stop typing indicator
      this.server.to(room).emit('typing', {
        conversationId,
        isTyping: false,
      });

      // Emit the user message to the room
      this.server.to(room).emit('message', {
        conversationId,
        message: {
          id: result.userMessage.id,
          role: result.userMessage.role,
          content: result.userMessage.content,
          createdAt: result.userMessage.createdAt,
        },
      });

      // Emit the assistant response to the room
      this.server.to(room).emit('message', {
        conversationId,
        message: {
          id: result.assistantMessage.id,
          role: result.assistantMessage.role,
          content: result.assistantMessage.content,
          createdAt: result.assistantMessage.createdAt,
          metadata: {
            tokensUsed: result.tokensUsed,
            model: result.model,
            isMock: result.isMock,
          },
        },
      });
    } catch (error) {
      this.logger.error(`WebSocket message handling failed: ${error}`);

      // Stop typing indicator on error
      this.server.to(room).emit('typing', {
        conversationId,
        isTyping: false,
      });

      client.emit('error', {
        conversationId,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to process message',
      });
    }
  }
}
