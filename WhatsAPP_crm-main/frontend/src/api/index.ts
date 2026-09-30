import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  Campaign, CampaignRecipient, Contact, DashboardData, Deal, Message, Stage, Task, TeamMember, Template,
  VariableSource, WhatsAppStatus
} from '../lib/types';
import type { MessagesPage } from '../lib/realtime';
import type { ImportRow } from '../lib/csv';

// ============ Conversations / Inbox ============

export type InboxFilter = 'all' | 'unread' | 'vip' | 'archived';
type ConversationsPage = { conversations: Contact[]; has_more: boolean; counts: { unread: number } };

export function useConversations(filter: InboxFilter, q: string) {
  return useInfiniteQuery({
    queryKey: ['conversations', filter, q],
    queryFn: ({ pageParam }) => api<ConversationsPage>('/api/conversations', { query: { filter, q, offset: pageParam, limit: 50 } }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.has_more ? pages.length * 50 : undefined),
    placeholderData: keepPreviousData
  });
}

export function useContact(waId: string | undefined) {
  return useQuery({
    queryKey: ['contact', waId],
    queryFn: () => api<{ contact: Contact }>(`/api/contacts/${waId}`).then(r => r.contact),
    enabled: !!waId
  });
}

export function useMessages(waId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['messages', waId],
    queryFn: ({ pageParam }) => api<MessagesPage>(`/api/conversations/${waId}/messages`, { query: { before: pageParam, limit: 50 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.has_more && last.messages.length > 0 ? last.messages[0].created_at : undefined),
    enabled: !!waId,
    staleTime: 60_000
  });
}

export type SendBody =
  | { type: 'text'; text: string }
  | { type: 'media'; kind: 'image' | 'video' | 'audio' | 'document'; url: string; caption?: string; filename?: string }
  | { type: 'template'; template_name: string; language: string; variables: Record<string, string>; header_media_url?: string };

export function sendMessage(waId: string, body: SendBody) {
  return api<{ message: Message }>(`/api/conversations/${waId}/messages`, { method: 'POST', body });
}

export function markRead(waId: string) {
  return api(`/api/conversations/${waId}/read`, { method: 'POST' });
}

export function setArchived(waId: string, archived: boolean) {
  return api<{ contact: Contact }>(`/api/conversations/${waId}/archive`, { method: 'POST', body: { archived } });
}

export function deleteConversation(waId: string) {
  return api(`/api/conversations/${waId}`, { method: 'DELETE' });
}

export async function uploadMedia(file: File) {
  const form = new FormData();
  form.append('file', file);
  return api<{ url: string; kind: 'image' | 'video' | 'audio' | 'document'; mime_type: string; filename: string; size: number }>('/api/media', {
    method: 'POST',
    form
  });
}

// ============ Contacts ============

export type ContactQuery = { q?: string; tag?: string; audience?: 'all' | 'inbox' | 'broadcast_only' | 'pipeline'; page?: number; page_size?: number };

export function useContacts(params: ContactQuery) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => api<{ contacts: Contact[]; total: number; page: number; page_size: number }>('/api/contacts', { query: params }),
    placeholderData: keepPreviousData
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['contacts', 'tags'],
    queryFn: () => api<{ tags: { name: string; count: number }[] }>('/api/contacts/tags').then(r => r.tags),
    staleTime: 60_000
  });
}

export function useCustomFields() {
  return useQuery({
    queryKey: ['contacts', 'fields'],
    queryFn: () => api<{ fields: string[] }>('/api/contacts/fields').then(r => r.fields),
    staleTime: 5 * 60_000
  });
}

export type ContactInput = { name: string; phone: string; email?: string; company?: string; tags?: string[]; notes?: string; add_to_inbox?: boolean };

export function createContact(body: ContactInput) {
  return api<{ contact: Contact }>('/api/contacts', { method: 'POST', body });
}

export function updateContact(waId: string, body: Partial<{ name: string; email: string | null; company: string | null; tags: string[]; notes: string; custom_fields: Record<string, unknown> }>) {
  return api<{ contact: Contact }>(`/api/contacts/${waId}`, { method: 'PATCH', body });
}

export function deleteContact(waId: string) {
  return api(`/api/contacts/${waId}`, { method: 'DELETE' });
}

export function importContacts(contacts: ImportRow[], tags: string[]) {
  return api<{ inserted: number; updated: number; invalid: { row: number; phone: string; reason: string }[] }>('/api/contacts/import', {
    method: 'POST',
    body: { contacts, tags }
  });
}

/** Optimistically patches a contact everywhere it is cached, then saves. */
export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ waId, patch }: { waId: string; patch: Parameters<typeof updateContact>[1] }) => updateContact(waId, patch),
    onSuccess: ({ contact }) => {
      qc.setQueryData(['contact', contact.wa_id], contact);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    }
  });
}

// ============ Pipeline ============

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api<{ stages: Stage[]; deals: Deal[] }>('/api/pipeline')
  });
}

export type DealInput = { wa_id?: string; name?: string; phone?: string; company?: string; title?: string; value?: number; notes?: string; tags?: string[]; stage_id?: number };

export function createDeal(body: DealInput) {
  return api<{ deal: Deal }>('/api/pipeline/deals', { method: 'POST', body });
}

export function updateDeal(id: number, body: Partial<{ title: string | null; value: number; notes: string; tags: string[]; stage_id: number }>) {
  return api<{ deal: Deal }>(`/api/pipeline/deals/${id}`, { method: 'PATCH', body });
}

export function deleteDeal(id: number) {
  return api(`/api/pipeline/deals/${id}`, { method: 'DELETE' });
}

// ============ Templates ============

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api<{ templates: Template[] }>('/api/templates').then(r => r.templates)
  });
}

export function syncTemplates() {
  return api<{ synced: number }>('/api/templates/sync', { method: 'POST' });
}

export type TemplateInput = {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  header_text?: string;
  header_media?: { format: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; url: string };
  body: string;
  footer?: string;
  examples?: Record<string, string>;
  buttons?: ({ type: 'QUICK_REPLY'; text: string } | { type: 'URL'; text: string; url: string } | { type: 'PHONE_NUMBER'; text: string; phone_number: string })[];
};

export function createTemplate(body: TemplateInput) {
  return api<{ template: Template }>('/api/templates', { method: 'POST', body });
}

export function deleteTemplate(name: string) {
  return api(`/api/templates/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ============ Campaigns ============

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<{ campaigns: Campaign[] }>('/api/campaigns').then(r => r.campaigns)
  });
}

export function useCampaign(id: number, status: string, page: number) {
  return useQuery({
    queryKey: ['campaign', id, status, page],
    queryFn: () =>
      api<{ campaign: Campaign; recipients: CampaignRecipient[]; recipients_total: number; page: number; page_size: number; follow_ups: { id: number; name: string; status: string; created_at: string }[] }>(
        `/api/campaigns/${id}`,
        { query: { status, page } }
      ),
    placeholderData: keepPreviousData
  });
}

export type Audience = { contact_ids?: number[]; tags?: string[]; audience?: 'all' | 'broadcast_only' | 'inbox' };

export type CampaignInput = {
  name: string;
  template_name: string;
  template_language: string;
  variables: Record<string, VariableSource>;
  header_media_url?: string | null;
  scheduled_at?: string | null;
  send: boolean;
};

export function audiencePreview(audience: Audience) {
  return api<{ count: number }>('/api/campaigns/audience-preview', { method: 'POST', body: audience });
}

export function createCampaign(body: CampaignInput & { audience: Audience }) {
  return api<{ campaign: Campaign }>('/api/campaigns', { method: 'POST', body });
}

export function createFollowUp(parentId: number, body: CampaignInput & { segment: 'not_replied' | 'not_read' | 'failed' | 'replied' }) {
  return api<{ campaign: Campaign }>(`/api/campaigns/${parentId}/follow-up`, { method: 'POST', body });
}

export function sendDraft(id: number, scheduled_at?: string | null) {
  return api<{ campaign: Campaign }>(`/api/campaigns/${id}/send`, { method: 'POST', body: { scheduled_at } });
}

export function cancelCampaign(id: number) {
  return api(`/api/campaigns/${id}/cancel`, { method: 'POST' });
}

export function deleteCampaign(id: number) {
  return api(`/api/campaigns/${id}`, { method: 'DELETE' });
}

// ============ Tasks ============

export function useTasks(params: { status?: 'open' | 'done' | 'all'; wa_id?: string; due_before?: string; limit?: number }) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => api<{ tasks: Task[] }>('/api/tasks', { query: params }).then(r => r.tasks)
  });
}

export function createTask(body: { title: string; due_at: string; wa_id?: string }) {
  return api<{ task: Task }>('/api/tasks', { method: 'POST', body });
}

export function updateTask(id: number, body: Partial<{ title: string; due_at: string; completed: boolean }>) {
  return api<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', body });
}

export function deleteTask(id: number) {
  return api(`/api/tasks/${id}`, { method: 'DELETE' });
}

// ============ Dashboard ============

export function useDashboard(days: number) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useQuery({
    queryKey: ['dashboard', days, tz],
    queryFn: () => api<DashboardData>('/api/dashboard', { query: { days, tz } }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000
  });
}

// ============ Team ============

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: () => api<{ members: TeamMember[] }>('/api/team').then(r => r.members)
  });
}

export function inviteMember(email: string, role: 'admin' | 'agent') {
  return api<{ member: TeamMember }>('/api/team/invite', { method: 'POST', body: { email, role } });
}

export function updateMember(id: number, role: 'admin' | 'agent') {
  return api<{ member: TeamMember }>(`/api/team/${id}`, { method: 'PATCH', body: { role } });
}

export function removeMember(id: number) {
  return api(`/api/team/${id}`, { method: 'DELETE' });
}

// ============ WhatsApp connection ============

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => api<WhatsAppStatus>('/api/whatsapp/status'),
    staleTime: 60_000
  });
}

export function getOAuthUrl() {
  return api<{ url: string }>('/api/whatsapp/oauth-url');
}

type ConnectResult = { waba_id: string; phone_numbers: number; webhooks_subscribed: boolean; templates_synced: number };

export function completeOnboarding(code: string, state?: string) {
  return api<ConnectResult>('/api/whatsapp/complete-onboarding', { method: 'POST', body: { code, state } });
}

export function connectManual(body: { waba_id: string; phone_number_id: string; access_token: string }) {
  return api<ConnectResult>('/api/whatsapp/connect-manual', { method: 'POST', body });
}

export function setDefaultSender(phone_number_id: string) {
  return api('/api/whatsapp/default-sender', { method: 'POST', body: { phone_number_id } });
}

export function disconnectWhatsApp() {
  return api('/api/whatsapp/disconnect', { method: 'POST' });
}

// ============ AI ============

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ configured: boolean; available: boolean }>('/api/ai/status'),
    staleTime: 5 * 60_000
  });
}

export function suggestReplies(waId: string) {
  return api<{ suggestions: { text: string; label: string }[] }>(`/api/conversations/${waId}/suggest-replies`, { method: 'POST' });
}

// ============ Billing ============

export type PlanInfo = {
  id: 'starter' | 'growth' | 'business';
  name: string;
  price: number;
  blurb: string;
  conversations: number | null;
  seats: number | null;
  features: { broadcasts: boolean; ai: boolean };
};

export type Billing = {
  enabled: boolean;
  plan: PlanInfo;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  usage: { conversations: number; seats: number };
  plans: PlanInfo[];
};

export function useBilling() {
  return useQuery({ queryKey: ['billing'], queryFn: () => api<Billing>('/api/billing'), staleTime: 60_000 });
}

export function startCheckout(plan: 'growth' | 'business') {
  return api<{ url: string }>('/api/billing/checkout', { method: 'POST', body: { plan } });
}

export function openBillingPortal() {
  return api<{ url: string }>('/api/billing/portal', { method: 'POST' });
}

// ============ Account ============

export function updateProfile(name: string) {
  return api('/api/auth/profile', { method: 'PATCH', body: { name } });
}

export function changePassword(current_password: string, new_password: string) {
  return api('/api/auth/password', { method: 'POST', body: { current_password, new_password } });
}

export function recoverPassword(email: string) {
  return api('/api/auth/recover', { method: 'POST', body: { email } });
}
