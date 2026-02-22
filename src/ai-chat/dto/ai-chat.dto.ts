import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================================
// Chat Context & Status
// ============================================================

export const CHAT_CONTEXTS = ['TAX', 'ZUS', 'INVOICE', 'KPiR', 'GENERAL'] as const;
export type ChatContext = (typeof CHAT_CONTEXTS)[number];

export const CONVERSATION_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_ROLES = ['USER', 'ASSISTANT', 'SYSTEM'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

// ============================================================
// Conversation DTOs
// ============================================================

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(CHAT_CONTEXTS)
  context?: ChatContext;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}

export class ListConversationsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: ConversationStatus;
}

// ============================================================
// WebSocket DTOs
// ============================================================

export class WsMessageDto {
  @IsString()
  conversationId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}

// ============================================================
// Response interfaces
// ============================================================

export interface ConversationResponse {
  id: string;
  title: string | null;
  context: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount?: number;
  lastMessage?: {
    role: string;
    content: string;
    createdAt: Date;
  } | null;
}

export interface PaginatedConversationsResponse {
  conversations: ConversationResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ChatMessageResponse {
  id: string;
  role: string;
  content: string;
  metadata: any;
  createdAt: Date;
}

export interface SuggestedQuestion {
  question: string;
  context: ChatContext;
}
