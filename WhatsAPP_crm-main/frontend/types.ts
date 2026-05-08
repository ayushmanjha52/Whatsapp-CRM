
export enum PipelineStage {
  NEW = 'New',
  ACTIVE = 'Active',
  FOLLOW_UP = 'Follow Up',
  CONVERTED = 'Converted'
}

export interface WhatsAppConfig {
  phoneNumberId: string;
  wabaId: string;
  accessToken?: string;
  verifyToken?: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: string;
  email?: string;
  phone?: string;
  whatsappConfig?: WhatsAppConfig;
}

export interface Contact {
  id: string;
  waId?: string;
  name: string;
  phone: string;
  avatar: string;
  stage: PipelineStage;
  tags: string[];
  notes: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  email?: string;
  company?: string;
  dealValue?: number; // Value of the deal in USD
  archived?: boolean;
  isInPipeline?: boolean; // Determines if contact shows on Kanban board
  isBroadcastOnly?: boolean; // Hidden from main lists until reply
  customFields?: Record<string, string>;
}

export interface Message {
  id: string;
  contactId: string;
  content: string;
  timestamp: string; // ISO string
  isOutbound: boolean;
  status: 'sent' | 'delivered' | 'read';
}

export interface FollowUpTask {
  id: string;
  contactId: string;
  contactName: string;
  dueDate: string; // ISO string
  note: string;
  completed: boolean;
}

export interface Broadcast {
  id: string;
  name: string;
  message: string;
  recipientCount: number;
  dateSent: string;
  status: 'Draft' | 'Sent' | 'Scheduled';
  stats?: {
    delivered: number;
    read: number;
    replied: number;
    clicked: number;
    failed: number;
  }
}
