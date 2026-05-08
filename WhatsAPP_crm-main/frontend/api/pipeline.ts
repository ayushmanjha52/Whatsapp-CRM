import { apiUrl, EXTRA_HEADERS } from "../config"

// Types for Pipeline API
export interface PipelineStage {
  id: number
  name: string
  ord: number
}

export interface DealContact {
  id: number
  wa_id: string
  display_name?: string
  profile_image_url?: string
  phone_e164?: string
  tags?: string[]
  company?: string
}

export interface Deal {
  id: number
  value: number
  notes?: string
  tags?: string[]
  stage_id: number
  contact_id: number
  created_at?: string
  contact?: DealContact
  stage?: PipelineStage
}

// Get all pipeline stages for the tenant
export async function getPipelineStages(): Promise<{ stages: PipelineStage[] }> {
  const r = await fetch(apiUrl("/api/pipeline/stages"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS }
  })
  if (!r.ok) throw new Error("fetch_stages_failed")
  return r.json()
}

// Get all deals with contact and stage info
export async function getDeals(): Promise<{ deals: Deal[]; stages: PipelineStage[] }> {
  const r = await fetch(apiUrl("/api/deals"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS }
  })
  if (!r.ok) throw new Error("fetch_deals_failed")
  return r.json()
}

// Create a new deal (also creates contact if needed)
export interface CreateDealPayload {
  name: string
  phone: string
  company?: string
  value?: number
  notes?: string
  tags?: string[]
  stage_name?: string
}

export async function createDeal(payload: CreateDealPayload): Promise<{ success: boolean; deal: Deal }> {
  const r = await fetch(apiUrl("/api/deals"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(payload)
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || "create_deal_failed")
  }
  return r.json()
}

// Update an existing deal
export interface UpdateDealPayload {
  value?: number
  notes?: string
  tags?: string[]
  stage_id?: number
  stage_name?: string
}

export async function updateDeal(dealId: number, payload: UpdateDealPayload): Promise<{ success: boolean; deal: Deal }> {
  const r = await fetch(apiUrl(`/api/deals/${dealId}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(payload)
  })
  if (!r.ok) throw new Error("update_deal_failed")
  return r.json()
}

// Delete a deal
export async function deleteDeal(dealId: number): Promise<{ success: boolean }> {
  const r = await fetch(apiUrl(`/api/deals/${dealId}`), {
    method: "DELETE",
    credentials: "include",
    headers: { ...EXTRA_HEADERS }
  })
  if (!r.ok) throw new Error("delete_deal_failed")
  return r.json()
}

// Add an existing inbox contact to pipeline
export interface AddToPipelinePayload {
  wa_id: string
  value?: number
  stage_name?: string
}

export async function addContactToPipeline(payload: AddToPipelinePayload): Promise<{ success: boolean; deal: Deal }> {
  const r = await fetch(apiUrl("/api/pipeline/add-contact"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(payload)
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || "add_to_pipeline_failed")
  }
  return r.json()
}
