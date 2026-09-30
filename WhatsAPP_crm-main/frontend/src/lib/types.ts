export type Role = 'admin' | 'agent';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenant_id: string;
  tenant_name: string;
}

export interface DealSummary {
  id: number;
  value: number;
  stage_id: number | null;
  stage_name: string | null;
}

export interface Contact {
  id: number;
  wa_id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  tags: string[];
  notes: string;
  custom_fields: Record<string, unknown>;
  origin: 'inbox' | 'pipeline' | 'broadcast' | 'manual' | string;
  in_inbox: boolean;
  archived: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: 'in' | 'out' | null;
  last_inbound_at: string | null;
  window_open: boolean;
  opted_out: boolean;
  created_at: string;
  deal: DealSummary | null;
}

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';

export interface Message {
  id: string;
  wa_id: string;
  direction: 'in' | 'out';
  type: string;
  text: string;
  status: MessageStatus | null;
  error: { title?: string; message?: string; details?: string; code?: number } | null;
  created_at: string;
  campaign_id: number | null;
  media: { kind: string; url?: string; mime_type?: string; filename?: string; caption?: string } | null;
  reply_to: string | null;
  payload: any;
}

export interface Stage {
  id: number;
  name: string;
  ord: number;
}

export interface Deal {
  id: number;
  title: string | null;
  value: number;
  notes: string;
  tags: string[];
  stage_id: number;
  created_at: string;
  stage_changed_at: string | null;
  converted_at: string | null;
  contact: {
    id: number;
    wa_id: string;
    name: string;
    phone: string;
    company: string | null;
    avatar_url: string | null;
    unread_count: number;
    last_message_at: string | null;
    last_message_preview: string | null;
  } | null;
}

export interface Task {
  id: number;
  title: string;
  due_at: string;
  completed_at: string | null;
  created_at?: string;
  contact: { wa_id: string; name: string } | null;
}

export interface TemplateShape {
  headerFormat: string | null;
  headerText: string | null;
  headerVars: string[];
  bodyText: string;
  bodyVars: string[];
  footerText: string | null;
  buttons: { type: string; text: string; url?: string; phone_number?: string }[];
  urlButtons: { index: number; variable: string; url: string }[];
  dynamicUrlButtons: number;
}

export interface Template {
  id: number;
  meta_id: string | null;
  name: string;
  language: string;
  category: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string;
  rejected_reason: string | null;
  parameter_format: string | null;
  components: any[];
  shape: TemplateShape;
  sample_media_url: string | null;
  updated_at: string;
}

export type VariableSource =
  | { source: 'field'; field: string; fallback?: string }
  | { source: 'static'; value: string };

export interface CampaignStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  reply_rate: number;
  read_rate: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled' | 'failed';

export interface Campaign {
  id: number;
  name: string;
  status: CampaignStatus;
  template_name: string;
  template_language: string;
  variables: Record<string, VariableSource>;
  header_media_url: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  parent_campaign_id: number | null;
  last_error: string | null;
  stats: CampaignStats;
}

export interface CampaignRecipient {
  id: number;
  status: string;
  error: { title?: string; message?: string; details?: string } | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  replied_at: string | null;
  contact: { wa_id: string; name: string; phone: string; in_inbox: boolean } | null;
}

export interface TeamMember {
  id: number;
  user_id: string | null;
  email: string;
  name: string | null;
  role: Role;
  status: 'invited' | 'active';
  created_at: string;
  is_you: boolean;
}

export interface WhatsAppNumber {
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string | null;
  quality_rating: string | null;
  account_mode: string | null;
  default_sender: boolean;
}

export interface WhatsAppStatus {
  connected: boolean;
  waba_id: string | null;
  numbers: WhatsAppNumber[];
  webhook: { callback_url: string | null; verify_token: string | null };
  oauth_available: boolean;
}

export interface DashboardData {
  range: { days: number; since: string; tz: string };
  kpis: {
    open_conversations: number;
    unread_conversations: number;
    messages_in: number;
    messages_out: number;
    new_contacts: number;
    tasks_due_today: number;
    overdue_tasks: number;
  };
  volume: { date: string; inbound: number; outbound: number }[];
  response: {
    turns: number;
    answered: number;
    avg_seconds: number;
    within_30m_pct: number | null;
    buckets: { range: string; count: number }[];
    unanswered: number;
  };
  pipeline: {
    stages: { id: number; name: string; count: number; value: number }[];
    total_deals: number;
    open_value: number;
    won_value: number;
    win_rate: number | null;
    avg_cycle_days: number | null;
  };
  broadcast: { recipients: number; sent: number; delivered: number; read: number; failed: number; replied: number };
  priority_inbox: Contact[];
  tasks_today: Task[];
  recent_campaigns: { id: number; name: string; status: CampaignStatus; created_at: string }[];
}
