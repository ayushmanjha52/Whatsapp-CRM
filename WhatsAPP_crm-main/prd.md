
# 📄 **PRODUCT REQUIREMENTS DOCUMENT (PRD)**

### **Product:** WhatsApp CRM & Marketing SaaS

### **Version:** v1.0

### **Owner:** Founder

### **Purpose:** Provide a unified WhatsApp CRM + Marketing automation platform for small businesses, agencies, and sales teams.

---

# 1. **PRODUCT OVERVIEW**

## 1.1 Mission

To empower businesses to manage WhatsApp conversations, track deals, automate broadcasts, and convert leads — all from one clean, ultra-simple CRM dashboard.

## 1.2 Core Value

A powerful WhatsApp-native CRM that includes:

* Real-time Inbox
* Sales Pipeline (Kanban)
* Broadcast/Marketing automation
* Templates, campaigns, dashboards
* Team collaboration
* Unified customer records

---

# 2. **USER ROLES**

### **Admin**

* Can manage Pipeline, Inbox, Broadcast
* Can import leads
* Can send campaigns
* Can modify templates
* Can manage team members

### **Agent / Team Member**

* Can view Inbox
* Can respond to messages
* Can view Pipeline but limited editing

---

# 3. **CORE MODULES**

## 3.1 Module A — **Inbox (Real-time Messaging)**

### **Purpose**

To handle all WhatsApp incoming/outgoing messages in one place.

### **Key Features**

* Real-time chat feed
* Search conversations
* Filters (All, Unread, VIP, Archived)
* Contact info sidebar
* Notes section
* Tags
* Pipeline stage shown *only if contact exists in Pipeline*
* Message sending through WhatsApp Cloud API
* Message delivery/read indicators

### **Rules**

1. **Any WhatsApp message received will instantly appear in Inbox.**
2. Contacts from Inbox **do NOT appear in Pipeline by default**.
3. Admin must manually “Add to Pipeline” from Inbox.
4. If a broadcast lead replies, they appear in Inbox as a new chat.
5. Inbox contact detail syncs with Pipeline only if the contact already exists in Pipeline.

---

## 3.2 Module B — **Pipeline (Kanban Sales CRM)**

### **Purpose**

Track deals and lead progress across pipeline stages.

### **Pipeline Stages**

* New
* Active
* Follow-Up
* Converted

### **Key Features**

* Drag-and-drop cards
* Deal value tracking
* Notes, tags, contact details
* Stage-level analytics

### **Rules**

1. **Pipeline contacts appear in Inbox as identified contacts.**
2. **Inbox-only contacts do NOT appear here unless manually added.**
3. If Pipeline contact receives a new WhatsApp message:

   * Inbox updates normally
   * Pipeline card stays in its stage
4. Pipeline does not sync back from Inbox unless explicitly triggered.

---

## 3.3 Module C — **Broadcast / Marketing Automation**

### **Purpose**

Send bulk WhatsApp campaigns to targeted lists.

### **Key Features**

* Import leads (CSV, manual entry)
* Select audience
* Create message templates
* Create campaigns
* Follow-up workflows
* AI-powered suggestions (optional)
* Message previews
* Delivery analytics dashboard

### **Rules**

1. Broadcast leads **stay inside Broadcast module only**.
2. They **do NOT appear in Pipeline** unless admin manually adds them.
3. They **do NOT appear in Inbox** unless they reply to a message.
4. Broadcast analytics include:

   * Sent
   * Delivered
   * Read
   * Failed
   * Replied

---

## 3.4 Module D — **Templates**

### **Features**

* Create WhatsApp-approved templates
* Support for variables
* Support for media templates
* Status tracking (approved / pending / rejected)

---

## 3.5 Module E — **Contacts**

Contacts are unified but behave differently based on origin:

### **Contact Types**

* Inbox Contact (message-first)
* Pipeline Contact (deal-first)
* Broadcast Contact (marketing-first)

### **Rules**

* Pipeline → Inbox = sync
* Inbox → Pipeline = manual
* Broadcast → Inbox only after user replies

---

# 4. **SYSTEM LOGIC**

## 4.1 Contact Sync Logic (Final Rules)

| Source                  | Appears in Inbox? | Appears in Pipeline?   | Appears in Broadcast? |
| ----------------------- | ----------------- | ---------------------- | --------------------- |
| WhatsApp message        | YES               | NO (unless admin adds) | NO                    |
| Pipeline manual contact | YES               | YES                    | Optional              |
| Broadcast imported lead | NO                | NO                     | YES                   |
| Broadcast reply         | YES               | NO (unless admin adds) | YES                   |

---

# 5. **PRODUCT FLOWS**

## **5.1 Onboarding Flow**

(As per your uploaded sequence diagram — included in PRD)

### Steps:

1. User creates account
2. Email verification
3. WhatsApp Embedded Signup
4. OAuth token exchange
5. Store WABA ID, phone number, namespace
6. Stripe subscription
7. Redirect to Dashboard

---

## **5.2 Inbox Flow**

* Receive webhook
* Enqueue message
* Worker saves message
* UI updates contact
* Show chat in Inbox

---

## **5.3 Pipeline Flow**

* Admin adds new lead
* Contact stored with pipeline metadata
* Contact appears in Inbox
* Pipeline stage determines CRM analytics

---

## **5.4 Broadcast Flow**

* Import list
* Select audience
* Pick template
* Schedule or send immediately
* Worker processes queue
* WhatsApp sends messages
* Replies feed back into Inbox
* Campaign dashboard updates

---

# 6. **ANALYTICS**

### Inbox Analytics

* Avg response time
* Missed messages
* Daily conversations

### Pipeline

* Value per stage
* Win rate
* Deal cycle length

### Broadcast

* Sent
* Delivered
* Read
* Failed
* Reply rate
* Follow-up success rate

---

# 7. **NON-FUNCTIONAL REQUIREMENTS**

### **Reliability**

* Message delivery guaranteed through retry queues
* Workers autoscaled
* Redis + Postgres as source of truth

### **Performance**

* Inbox messages delivered <2 seconds
* Pipeline open <300ms
* Broadcast supports 100k messages/day per tenant (depending on WABA limits)

### **Security**

* Token encryption
* Webhook signature verification
* Multi-tenant isolation

---

# 8. **ACCEPTANCE CRITERIA**

### Inbox

* Messages appear instantly
* Contacts do not appear in Pipeline unless manually added

### Pipeline

* Pipeline contact appears in Inbox
* Inbox-only leads do not appear in Pipeline

### Broadcast

* Broadcast-only leads remain separate
* Replies create new chats in Inbox

---

# 🎉 **PRD complete.**
