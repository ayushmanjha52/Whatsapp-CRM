
import { Contact, FollowUpTask, Message, PipelineStage, User } from './types';

export const CURRENT_USER: User = {
  id: 'u1',
  name: 'Alex Morgan',
  role: 'Sales Manager',
  avatar: '', // Will use letter-based avatar
  email: 'alex.morgan@company.com',
  phone: '+1 (555) 123-4567',
  whatsappConfig: {
    phoneNumberId: '1092837465',
    wabaId: '2938475610',
    accessToken: 'EAAG...',
    verifyToken: 'my_secure_verify_token'
  }
};

export const INITIAL_CONTACTS: Contact[] = [
  {
    id: 'c1',
    name: 'John Doe',
    phone: '+1 234 567 8900',
    avatar: 'https://picsum.photos/id/1/200/200',
    stage: PipelineStage.NEW,
    tags: ['Design', 'VIP'],
    notes: 'Interested in the enterprise plan. Needs a demo next week.',
    lastMessage: 'Thanks for the info, I will get back to you.',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 2).toISOString(), // 2 mins ago
    unreadCount: 1,
    email: 'john@example.com',
    company: 'Acme Corp',
    dealValue: 12500,
    archived: false,
    isInPipeline: true
  },
  {
    id: 'c2',
    name: 'Sarah Smith',
    phone: '+1 987 654 3210',
    avatar: 'https://picsum.photos/id/5/200/200',
    stage: PipelineStage.ACTIVE,
    tags: ['Hot Lead'],
    notes: 'Budget is approved. Waiting for contract signature.',
    lastMessage: 'When can we meet to discuss the final terms?',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
    unreadCount: 0,
    email: 'sarah@tech.io',
    company: 'Tech Solutions',
    dealValue: 28000,
    archived: false,
    isInPipeline: true
  },
  {
    id: 'c3',
    name: 'Mike Johnson',
    phone: '+44 20 7123 4567',
    avatar: 'https://picsum.photos/id/12/200/200',
    stage: PipelineStage.FOLLOW_UP,
    tags: ['Referral'],
    notes: 'Sent proposal on Monday. Need to follow up today.',
    lastMessage: 'I received the proposal. Let me review it.',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    unreadCount: 0,
    email: 'mike@studio.co.uk',
    company: 'Creative Studio',
    dealValue: 5400,
    archived: false,
    isInPipeline: true
  },
  {
    id: 'c4',
    name: 'Alice Williams',
    phone: '+1 555 0199 8888',
    avatar: 'https://picsum.photos/id/22/200/200',
    stage: PipelineStage.CONVERTED,
    tags: ['Enterprise'],
    notes: 'Onboarding scheduled for next Friday.',
    lastMessage: 'Payment sent! Excited to get started.',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    unreadCount: 0,
    email: 'alice@enterprise.global',
    company: 'Global Systems',
    dealValue: 45000,
    archived: false,
    isInPipeline: true
  },
  {
    id: 'c5',
    name: 'Emma Wilson',
    phone: '+61 400 123 456',
    avatar: 'https://picsum.photos/id/35/200/200',
    stage: PipelineStage.NEW,
    tags: [],
    notes: 'Inquired about pricing via website.',
    lastMessage: 'Do you offer non-profit discounts?',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
    unreadCount: 2,
    email: 'emma@foundation.org',
    company: 'Care Foundation',
    dealValue: 1200,
    archived: false,
    isInPipeline: false // Example: Inbox only contact
  }
];

export const INITIAL_MESSAGES: Message[] = [
  {
    id: 'm1',
    contactId: 'c1',
    content: 'Hi, I am interested in your product.',
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    isOutbound: false,
    status: 'read'
  },
  {
    id: 'm2',
    contactId: 'c1',
    content: 'Hello John! Great to hear. What specific features are you looking for?',
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    isOutbound: true,
    status: 'read'
  },
  {
    id: 'm3',
    contactId: 'c1',
    content: 'Mostly the automation tools and the CRM integration.',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    isOutbound: false,
    status: 'read'
  },
  {
    id: 'm4',
    contactId: 'c1',
    content: 'Thanks for the info, I will get back to you.',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    isOutbound: false,
    status: 'read'
  }
];

export const INITIAL_TASKS: FollowUpTask[] = [
  {
    id: 't1',
    contactId: 'c3',
    contactName: 'Mike Johnson',
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString(), // In 3 hours
    note: 'Follow up on proposal sent Monday',
    completed: false
  },
  {
    id: 't2',
    contactId: 'c4',
    contactName: 'Alice Williams',
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // Tomorrow
    note: 'Send onboarding packet',
    completed: false
  }
];
