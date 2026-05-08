
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../store';
import {
  Search, Send, Paperclip, MoreVertical, Phone, Tag,
  Clock, Calendar, ChevronRight, Filter, Smile, Mic,
  Check, CheckCheck, Archive, Trash2, User, Mail, Briefcase,
  Image as ImageIcon, FileText, Video, X, Save, RefreshCw,
  MessageSquare, Plus, Pen, BarChart3, Loader2
} from 'lucide-react';
import { Contact, PipelineStage, Message } from '../types';
import { getMe } from '../api/auth';
import { getThreads, getMessages, sendTextMessage, getDefaultSenderNumberId, getContactDetails, getAllContacts } from '../api/inbox';
import * as pipelineApi from '../api/pipeline';
import { connectInboxEvents } from '../realtime';

export const Inbox: React.FC = () => {
  const {
    contacts, messages, tasks,
    addMessage, updateContactStage, addContactTag, removeContactTag, addFollowUpTask, getContactMessages,
    selectedContactId, setSelectedContactId, archiveContact, unarchiveContact, updateContact, deleteContact,
    addContact, addToPipeline, setContacts, setMessagesForContact
  } = useApp();

  // Local UI State
  const [messageInput, setMessageInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'vip' | 'archived'>('all');
  const [loading, setLoading] = useState(true);
  
  // Edit States
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [isEditingContactInfo, setIsEditingContactInfo] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Header Name/Company Edit State
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  
  // Tag Edit State
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  
  // Follow up modal state
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');

  // Add Contact Modal State
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Derived data
  const selectedContact = contacts.find(c => c.id === selectedContactId);
  const currentMessages = selectedContactId ? getContactMessages(selectedContactId) : [];
  
  function mapThreadToContact(t: { wa_id: string; display_name?: string; profile_image_url?: string; phone_e164?: string; last_message?: string; last_message_time?: string }): Contact {
    // Format wa_id as phone number for display (wa_id is the normalized phone number)
    const formatPhone = (waId: string) => {
      // If it's a long number, format it nicely
      if (waId.length >= 10) {
        // Try to format as Indian number (91 + 10 digits)
        if (waId.startsWith('91') && waId.length === 12) {
          const number = waId.substring(2);
          return `+91 ${number.substring(0, 5)} ${number.substring(5)}`;
        }
        // Generic formatting for other numbers
        return `+${waId}`;
      }
      return waId;
    };

    return {
      id: t.wa_id,
      waId: t.wa_id,
      name: t.display_name || t.wa_id,
      phone: t.phone_e164 || formatPhone(t.wa_id), // Use wa_id if phone_e164 is null
      avatar: t.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.display_name || t.wa_id)}&background=random`,
      stage: PipelineStage.NEW,
      tags: [],
      notes: '',
      lastMessage: t.last_message || '',
      lastMessageTime: t.last_message_time || new Date().toISOString(),
      unreadCount: 0,
      archived: false,
      isInPipeline: false
    }
  }

  function mapContactRowToContact(row: { wa_id: string; display_name?: string; profile_image_url?: string; phone_e164?: string; company?: string; tags?: string[] }): Contact {
    // Format wa_id as phone number for display (wa_id is the normalized phone number)
    const formatPhone = (waId: string) => {
      // If it's a long number, format it nicely
      if (waId.length >= 10) {
        // Try to format as Indian number (91 + 10 digits)
        if (waId.startsWith('91') && waId.length === 12) {
          const number = waId.substring(2);
          return `+91 ${number.substring(0, 5)} ${number.substring(5)}`;
        }
        // Generic formatting for other numbers
        return `+${waId}`;
      }
      return waId;
    };

    return {
      id: row.wa_id,
      waId: row.wa_id,
      name: row.display_name || row.wa_id,
      phone: row.phone_e164 || formatPhone(row.wa_id), // Use wa_id if phone_e164 is null
      company: row.company,
      avatar: row.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(row.display_name || row.wa_id)}&background=random`,
      stage: PipelineStage.NEW,
      tags: row.tags || [],
      notes: '',
      lastMessage: '',
      lastMessageTime: new Date().toISOString(),
      unreadCount: 0,
      archived: false,
      isInPipeline: false
    }
  }

  function normalizeContent(item: any): string {
    const p = item.payload || item.payload_json || {}
    const t = item.type || p.type
    if (t === 'text') return p.text?.body || ''
    if (t === 'image') return '[Image]'
    if (t === 'video') return '[Video]'
    if (t === 'audio') return '[Audio]'
    if (t === 'document') return '[Document]'
    if (t === 'sticker') return '[Sticker]'
    return ''
  }

  function mapBackendMessages(waId: string, list: any[]): Message[] {
    return list
      .map((it: any) => {
        // Handle both timestamp (number from Redis/mapped DB) and created_at fallback
        let timestamp: number
        if (typeof it.timestamp === 'number') {
          timestamp = it.timestamp
        } else if (it.created_at) {
          timestamp = new Date(it.created_at).getTime()
        } else {
          timestamp = Date.now()
        }

        return {
          id: it.id || `${waId}-${timestamp}`,
          contactId: waId,
          content: normalizeContent(it),
          timestamp: new Date(timestamp).toISOString(),
          isOutbound: it.direction === 'out',
          status: 'sent'
        }
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }

  useEffect(() => {
    let stop: { disconnect: () => void } | null = null
    let pipelineStop: { disconnect: () => void } | null = null
    let defaultSender: string | undefined

    // Initial load with loading state - wait for ALL initial data before showing
    const loadAllInitialData = async () => {
      setLoading(true)
      try {
        // Load contacts, threads, AND deals in parallel to sync pipeline state
        const [contactsRows, threadsResult, dealsResult] = await Promise.all([
          getAllContacts(),
          getThreads(),
          pipelineApi.getDeals() // Load deals to sync pipeline state
        ])

        const st = (useApp as any).getState()
        const existing = st.contacts as Contact[]

        // Merge existing contacts (with pipeline state) with new contacts from backend
        // Start with ALL existing contacts to preserve pipeline state
        const existingMap = new Map(existing.map(c => [c.id, c]))
        const mergedFromContacts = [...existing] // Start with all existing contacts

        // Update with fresh data from API
        for (const row of contactsRows) {
          const mapped = mapContactRowToContact(row)
          const existingContact = existingMap.get(mapped.id)
          if (existingContact) {
            // Update existing contact with fresh data but preserve pipeline state
            const idx = mergedFromContacts.findIndex(c => c.id === mapped.id)
            if (idx >= 0) {
              mergedFromContacts[idx] = { ...mapped, ...existingContact }
            }
          } else {
            // Add new contact from API
            mergedFromContacts.push(mapped)
          }
        }

        // Now merge with threads data (last message info)
        const ids = new Set(mergedFromContacts.map(c => c.id))
        const finalMerged = [...mergedFromContacts]
        for (const t of threadsResult.threads || []) {
          if (ids.has(t.wa_id)) {
            // Update existing contact with last message info
            const idx = finalMerged.findIndex(c => c.id === t.wa_id)
            if (idx >= 0) {
              finalMerged[idx] = {
                ...finalMerged[idx],
                lastMessage: t.last_message || finalMerged[idx].lastMessage,
                lastMessageTime: t.last_message_time || finalMerged[idx].lastMessageTime
              }
            }
          } else {
            // Add new contact from thread
            finalMerged.push(mapThreadToContact(t))
          }
        }

        // IMPORTANT: Sync with pipeline deals to get correct isInPipeline and stage
        const deals = dealsResult.deals || []
        const contactsWithPipelineState = finalMerged.map(contact => {
          const deal = deals.find(d => d.contact?.wa_id === contact.id)
          if (deal) {
            const stageName = deal.stage?.name || 'New'
            const stageMapping: Record<string, PipelineStage> = {
              'New': PipelineStage.NEW,
              'Active': PipelineStage.ACTIVE,
              'Follow Up': PipelineStage.FOLLOW_UP,
              'Converted': PipelineStage.CONVERTED
            }
            const frontendStage = stageMapping[stageName] || PipelineStage.NEW

            return {
              ...contact,
              isInPipeline: true,
              stage: frontendStage
            }
          }
          return contact
        })

        console.info('[Inbox] Loaded contacts with pipeline state sync:', {
          contacts: contactsWithPipelineState.length,
          inPipeline: contactsWithPipelineState.filter(c => c.isInPipeline).length
        })

        setContacts(contactsWithPipelineState)
      } catch (err) {
        console.error('Failed to load contacts:', err)
      } finally {
        setLoading(false)
      }
    }

    loadAllInitialData()
    getDefaultSenderNumberId().then(id => { defaultSender = id || undefined }).catch(() => {})
    stop = connectInboxEvents(async () => {
      const u = await getMe(); return u?.id || ''
    }, async (ev) => {
      const wa = ev.wa_id || ''
      if (!wa) return
      try { console.info('[Inbox] Event received', { event: ev.event, wa_id: wa }) } catch {}
      try {
        const msgs = await getMessages(wa)
        const mapped = mapBackendMessages(wa, msgs.messages || [])
        setMessagesForContact(wa, mapped)
        try { console.info('[Inbox] Messages updated', { wa_id: wa, count: mapped.length }) } catch {}
        const last = mapped[mapped.length - 1]
        const st = (useApp as any).getState()
        const cur = st.contacts as Contact[]
        const sel = st.selectedContactId as string | null
        let next = cur.map(c => c.id === wa ? { ...c, lastMessage: last?.content || c.lastMessage, lastMessageTime: last?.timestamp || c.lastMessageTime, unreadCount: sel === wa ? 0 : c.unreadCount + (ev.event === 'inbound_message' ? 1 : 0) } : c)
        try { const existing = cur.find(c => c.id === wa); console.info('[Inbox] Contact updated', { wa_id: wa, unread: existing ? (sel === wa ? 0 : (existing.unreadCount + (ev.event === 'inbound_message' ? 1 : 0))) : 1 }) } catch {}
        if (!next.some(c => c.id === wa)) {
          const details = await getContactDetails(wa)
          const newC = mapThreadToContact({ wa_id: wa, display_name: details?.display_name, profile_image_url: details?.profile_image_url, phone_e164: details?.phone_e164 })
          next = [newC, ...next]
          try { console.info('[Inbox] New contact added', { wa_id: wa }) } catch {}
        }
        setContacts(next)
      } catch {}
    })

    // Also listen to pipeline events to sync stage changes
    import('../realtime').then(({ connectPipelineEvents }) => {
      pipelineStop = connectPipelineEvents(async () => {
        const u = await getMe(); return u?.id || ''
      }, (event) => {
        console.info('[Inbox] Pipeline event received:', event)

        // Map backend stage name to frontend enum
        const stageMapping: Record<string, PipelineStage> = {
          'New': PipelineStage.NEW,
          'Active': PipelineStage.ACTIVE,
          'Follow Up': PipelineStage.FOLLOW_UP,
          'Converted': PipelineStage.CONVERTED
        }

        if (event.event === 'deal_updated' && event.deal) {
          const waId = event.deal.contact?.wa_id
          const newStage = event.deal.stage?.name || 'New'
          const frontendStage = stageMapping[newStage] || PipelineStage.NEW

          console.info('[Inbox] Updating contact pipeline state:', {
            dealId: event.deal.id,
            waId,
            oldStage: 'unknown',
            newStage: frontendStage,
            contactExists: useApp.getState().contacts.find(c => c.id === waId)
          })
          updateContact(waId, { isInPipeline: true, stage: frontendStage })
        }

        if (event.event === 'deal_created' && event.deal) {
          const waId = event.deal.contact?.wa_id
          const newStage = event.deal.stage?.name || 'New'
          const frontendStage = stageMapping[newStage] || PipelineStage.NEW

          console.info('[Inbox] Adding contact to pipeline:', {
            dealId: event.deal.id,
            waId,
            stage: frontendStage,
            contactExists: useApp.getState().contacts.find(c => c.id === waId)
          })
          updateContact(waId, { isInPipeline: true, stage: frontendStage })
        }

        if (event.event === 'deal_deleted' && event.deal_id) {
          // When deal is deleted, mark contact as not in pipeline
          console.info('[Inbox] Deal deleted, removing from pipeline:', { deal_id: event.deal_id })
          // We need to refetch deals to find which contact was affected
          pipelineApi.getDeals()
            .then(({ deals }) => {
              // Find which deal was deleted by comparing with our current contacts
              const currentContacts = useApp.getState().contacts
              currentContacts.forEach(contact => {
                const deal = deals.find((d: any) => d.contact?.wa_id === contact.id)
                if (!deal && contact.isInPipeline) {
                  // This contact's deal was deleted
                  console.info('[Inbox] Removing contact from pipeline:', contact.id)
                  updateContact(contact.id, { isInPipeline: false, stage: PipelineStage.NEW })
                }
              })
            })
            .catch(err => console.error('[Inbox] Failed to fetch deals for deletion sync:', err))
        }
      })
    })

    return () => {
      try { stop?.disconnect() } catch {}
      try { pipelineStop?.disconnect() } catch {}
    }
  }, [])

  // Reset local edit states when contact changes
  useEffect(() => {
    if (selectedContact) {
      setNoteContent(selectedContact.notes || '');
      setEditEmail(selectedContact.email || '');
      setEditPhone(selectedContact.phone || '');
      setEditName(selectedContact.name || '');
      setEditCompany(selectedContact.company || '');
      setIsEditingNote(false);
      setIsEditingContactInfo(false);
      setIsEditingHeader(false);
      setIsAddingTag(false);
      setNewTag('');
    }
  }, [selectedContactId, selectedContact]);
  useEffect(() => {
    if (!selectedContactId) return
    const wa = deriveWaId(selectedContact)
    if (!wa) return
    getMessages(wa)
      .then(r => setMessagesForContact(wa, mapBackendMessages(wa, r.messages || [])))
      .catch(() => {})
  }, [selectedContactId])
  
  const filteredContacts = contacts.filter(c => {
    // Hide Broadcast-only contacts from Inbox until they reply
    if (c.isBroadcastOnly) return false;

    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.lastMessage.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    
    // Archiving Logic
    if (filterType === 'archived') return c.archived;
    if (c.archived) return false; // Hide archived from other tabs
    
    if (filterType === 'unread') return c.unreadCount > 0;
    if (filterType === 'vip') return c.tags.includes('VIP');
    return true; 
  });

  const getStageBadgeColor = (stage: PipelineStage) => {
    switch (stage) {
      case PipelineStage.NEW: return 'bg-blue-100 text-blue-700 border-blue-200';
      case PipelineStage.ACTIVE: return 'bg-amber-100 text-amber-700 border-amber-200';
      case PipelineStage.FOLLOW_UP: return 'bg-violet-100 text-violet-700 border-violet-200';
      case PipelineStage.CONVERTED: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStageShortName = (stage: PipelineStage) => {
    switch (stage) {
      case PipelineStage.NEW: return 'New';
      case PipelineStage.ACTIVE: return 'Active';
      case PipelineStage.FOLLOW_UP: return 'F-Up';
      case PipelineStage.CONVERTED: return 'Won';
      default: return '';
    }
  };

  // Scroll handling
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages.length, selectedContactId]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedContactId) return;
    const wa = deriveWaId(selectedContact)
    addMessage(deriveWaId(selectedContact), messageInput, true);
    if (wa) sendTextMessage(wa, messageInput).catch(() => {})
    setMessageInput('');
  };

  const handleScheduleFollowUp = () => {
    if (selectedContact && followUpDate && followUpNote) {
      addFollowUpTask({
        contactId: selectedContact.id,
        contactName: selectedContact.name,
        dueDate: new Date(followUpDate).toISOString(),
        note: followUpNote,
      });
      setShowFollowUpModal(false);
      setFollowUpDate('');
      setFollowUpNote('');
    }
  };

  const handleArchive = () => {
      if (selectedContact) {
          if (selectedContact.archived) {
              unarchiveContact(selectedContact.id);
          } else {
              archiveContact(selectedContact.id);
          }
      }
  };

  const handleDelete = () => {
    if (selectedContact && window.confirm("Are you sure you want to permanently delete this conversation and contact? This action cannot be undone.")) {
      deleteContact(selectedContact.id);
    }
  };

  const handleSaveNote = () => {
      if (selectedContact) {
          updateContact(selectedContact.id, { notes: noteContent });
          setIsEditingNote(false);
      }
  };

  const handleSaveContactInfo = () => {
      if (selectedContact) {
          updateContact(selectedContact.id, { email: editEmail, phone: editPhone });
          setIsEditingContactInfo(false);
      }
  };

  const handleSaveHeader = () => {
    if (selectedContact) {
      updateContact(selectedContact.id, { name: editName, company: editCompany });
      setIsEditingHeader(false);
    }
  };

  const handleAddTagSubmit = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (selectedContact && newTag.trim()) {
          addContactTag(selectedContact.id, newTag.trim());
          setNewTag('');
          setIsAddingTag(false);
      }
  };

  const handleAddContact = (e: React.FormEvent) => {
      e.preventDefault();
      if(newContactName && newContactPhone) {
          addContact({
              name: newContactName,
              phone: newContactPhone,
              isInPipeline: false // Default to Inbox only
          });
          setNewContactName('');
          setNewContactPhone('');
          setShowAddContactModal(false);
      }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
    return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  return (
    <div className="flex h-full gap-8 max-h-[calc(100vh-8rem)] font-sans relative">
      {/* Simple loading spinner */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center rounded-3xl">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      )}

      {/* LEFT PANEL: Contact List */}
      <div className="w-[420px] flex-shrink-0 bg-white rounded-3xl shadow-card border border-slate-200 flex flex-col overflow-hidden">
        
        {/* Search & Filter Header */}
        <div className="p-6 border-b border-slate-100 space-y-5 bg-white z-10">
          <div className="flex justify-between items-center">
             <h2 className="font-display font-bold text-2xl text-slate-900">Inbox</h2>
             <div className="flex items-center gap-2">
                 <button 
                    onClick={() => setShowAddContactModal(true)}
                    className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-full transition-colors cursor-pointer"
                    title="Add Contact"
                 >
                     <Plus size={20} />
                 </button>
                 <div className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-primary transition-colors cursor-pointer">
                   <Filter size={20} />
                 </div>
             </div>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Search conversations..." 
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-base transition-all placeholder:text-slate-400 font-medium text-slate-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Custom Tab Switcher */}
          <div className="flex p-1.5 bg-slate-50 rounded-xl border border-slate-100">
            {(['all', 'unread', 'vip', 'archived'] as const).map(type => (
              <button 
                key={type}
                onClick={() => setFilterType(type)}
                className={`flex-1 py-2 px-3 text-xs font-bold uppercase tracking-wide rounded-lg transition-all ${
                  filterType === type 
                    ? 'bg-white text-primary shadow-sm ring-1 ring-slate-100' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center px-6">
               <div className="p-4 bg-slate-50 rounded-full mb-4">
                 <Search size={32} className="opacity-40" />
               </div>
               <p className="text-base font-medium">No conversations found</p>
               <p className="text-sm mt-1 opacity-70">Try adjusting your filters</p>
            </div>
          ) : (
            filteredContacts.map(contact => (
              <div 
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={`relative p-5 cursor-pointer transition-all border-b border-slate-50 hover:bg-slate-50 group overflow-hidden ${
                  selectedContactId === contact.id ? 'bg-blue-50/80' : ''
                }`}
              >
                {/* The "Color Slide" Effect */}
                {selectedContactId === contact.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary shadow-[0_0_10px_rgba(37,99,235,0.5)] animate-in slide-in-from-left-1 duration-300"></div>
                )}

                <div className={`flex items-start space-x-4 transition-transform duration-300 ${selectedContactId === contact.id ? 'translate-x-1.5' : ''}`}>
                  <div className="relative flex-shrink-0">
                    <img 
                      src={contact.avatar} 
                      alt="" 
                      className={`w-14 h-14 rounded-full object-cover border-2 transition-colors ${selectedContactId === contact.id ? 'border-primary ring-2 ring-primary/10' : 'border-white shadow-sm'}`} 
                    />
                    {contact.unreadCount > 0 && (
                       <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary border-2 border-white rounded-full"></span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className={`text-base font-bold truncate ${selectedContactId === contact.id ? 'text-primary' : 'text-slate-900'}`}>
                        {contact.name}
                      </h4>
                      <span className={`text-xs font-bold whitespace-nowrap ml-2 ${contact.unreadCount > 0 ? 'text-primary' : 'text-slate-400'}`}>
                        {formatTime(contact.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <p className={`text-sm truncate leading-relaxed max-w-[85%] ${contact.unreadCount > 0 ? 'text-slate-800 font-semibold' : 'text-slate-500'}`}>
                        {contact.lastMessage}
                        </p>
                        {contact.unreadCount > 0 && (
                        <span className="min-w-[20px] h-[20px] bg-primary text-white text-[10px] font-bold px-1.5 rounded-full flex items-center justify-center">
                            {contact.unreadCount}
                        </span>
                        )}
                    </div>
                    
                    {/* Tags & Stage in list */}
                    <div className="flex flex-wrap gap-2 mt-2.5 items-center">
                      {contact.isInPipeline && contact.stage !== PipelineStage.NEW && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${getStageBadgeColor(contact.stage)}`}>
                            {getStageShortName(contact.stage)}
                          </span>
                      )}
                      {contact.tags.length > 0 && (
                        contact.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                            {tag}
                          </span>
                        ))
                      )}
                      {contact.archived && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 uppercase">
                              Archived
                          </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MIDDLE PANEL: Chat Area */}
      <div className="flex-1 rounded-3xl border border-slate-200 shadow-card flex flex-col overflow-hidden relative">
        {/* WhatsApp-like chat background pattern */}
        <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><defs><pattern id=%22grid%22 width=%228%22 height=%228%22 patternUnits=%22userSpaceOnUse%22><path d=%22M 8 0 L 0 0 0 8%22 fill=%22none%22 stroke=%22%23000%22 stroke-width=%220.5%22/></pattern></defs><rect width=%22100%22 height=%22100%22 fill=%22url(%23grid)%22 /></svg>')] pointer-events-none"></div>
        
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-slate-200/80 bg-[#f0f2f5] z-20 flex justify-between items-center sticky top-0 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <img src={selectedContact.avatar} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-100 shadow-sm" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                </div>
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-lg leading-tight">{selectedContact.name}</h3>
                  <div className="flex items-center text-xs font-medium text-slate-500 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                    Online
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                 <button className="p-2.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-xl transition-colors">
                    <Phone size={20} />
                 </button>
                 <button className="p-2.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-xl transition-colors">
                    <Video size={20} />
                 </button>
                 <div className="w-px h-8 bg-slate-200 mx-2"></div>
                 <button className="p-2.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-xl transition-colors">
                    <MoreVertical size={20} />
                 </button>
              </div>
            </div>

            {/* Messages Area */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#f0f2f5]"
            >
              {currentMessages.length > 0 && (
                <div className="flex justify-center mb-6">
                  <span className="bg-white/90 text-slate-600 text-xs font-semibold px-4 py-1.5 rounded-lg shadow-sm border border-slate-200/50">
                    {formatMessageDate(currentMessages[0].timestamp)}
                  </span>
                </div>
              )}

              {currentMessages.map((msg, idx) => {
                const prevMsg = idx > 0 ? currentMessages[idx - 1] : null;
                const nextMsg = idx < currentMessages.length - 1 ? currentMessages[idx + 1] : null;

                const isConsecutive = prevMsg && prevMsg.isOutbound === msg.isOutbound;
                const isLastInGroup = !nextMsg || nextMsg.isOutbound !== msg.isOutbound;

                const showAvatar = !isConsecutive && !msg.isOutbound;
                const showBubble = !isConsecutive || isLastInGroup;

                return (
                  <div key={msg.id} className={`flex ${msg.isOutbound ? 'justify-end' : 'justify-start'} mb-2 animate-in slide-in-from-bottom-2 duration-200`}>
                    <div className={`flex items-end max-w-[75%] ${msg.isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Avatar for incoming messages */}
                      {!msg.isOutbound && !isConsecutive && (
                        <img
                          src={selectedContact.avatar}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover mr-2 mb-1 shadow-sm"
                        />
                      )}
                      {!msg.isOutbound && isConsecutive && <div className="w-10 mr-2"></div>}

                      {/* Message content */}
                      <div
                        className={`relative ${
                          msg.isOutbound
                            ? isConsecutive
                              ? 'mr-2'
                              : 'mr-2'
                            : isConsecutive
                            ? 'ml-2'
                            : 'ml-0'
                        }`}
                      >
                        {/* Show name for first incoming message in a group */}
                        {!msg.isOutbound && !isConsecutive && (
                          <div className="text-xs font-semibold text-slate-600 mb-1 ml-3">
                            {selectedContact.name}
                          </div>
                        )}

                        {/* Message bubble */}
                        <div
                          className={`text-[14.2px] leading-[1.35] ${
                            msg.isOutbound
                              ? msg.isOutbound && isConsecutive
                                ? 'bg-[#0e93a6] text-white'
                                : 'bg-[#0e93a6] text-white rounded-tr-lg rounded-tl-lg'
                              : 'bg-white text-slate-800 rounded-tr-lg rounded-tl-lg'
                          } ${
                            isConsecutive
                              ? msg.isOutbound
                                ? 'rounded-tr-sm'
                                : 'rounded-tl-sm'
                              : ''
                          } ${
                            isLastInGroup
                              ? msg.isOutbound
                                ? 'rounded-bl-lg'
                                : 'rounded-br-lg'
                              : ''
                          } ${
                            showBubble ? 'shadow-sm' : ''
                          } px-3 py-2.5 max-w-[420px] break-words`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>

                          {/* Time and status */}
                          <div
                            className={`flex justify-end items-center gap-1.5 mt-1 ${
                              msg.isOutbound ? 'text-white/70' : 'text-slate-400'
                            }`}
                          >
                            <span className="text-[10px] font-medium">
                              {formatTime(msg.timestamp)}
                            </span>
                            {msg.isOutbound && (
                              <div className="mb-0.5">
                                {msg.status === 'read' ? (
                                  <CheckCheck size={16} className="text-blue-300" />
                                ) : (
                                  <CheckCheck size={16} className="opacity-70" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-[#f0f2f5] border-t border-slate-200/80 z-20">
              <form onSubmit={handleSendMessage} className="flex items-end space-x-2 bg-white p-2 rounded-2xl border border-slate-200/50 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-sm">
                <button type="button" className="p-3 text-slate-400 hover:text-primary hover:bg-white rounded-full transition-colors">
                  <Smile size={22} />
                </button>
                <button type="button" className="p-3 text-slate-400 hover:text-primary hover:bg-white rounded-full transition-colors">
                  <Paperclip size={22} />
                </button>
                
                <textarea 
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                      }
                  }}
                  placeholder="Type a message..." 
                  className="flex-1 bg-transparent border-none focus:ring-0 !outline-none !ring-0 text-slate-900 placeholder:text-slate-400 max-h-32 min-h-[48px] resize-none py-3 px-2 text-base"
                  rows={1}
                />
                
                {messageInput.trim() ? (
                  <button 
                    type="submit" 
                    className="p-3 bg-primary text-white rounded-2xl hover:bg-blue-700 shadow-md transition-all transform active:scale-95"
                  >
                    <Send size={20} className="ml-0.5" />
                  </button>
                ) : (
                  <button type="button" className="p-3 text-slate-400 hover:text-primary hover:bg-white rounded-full transition-colors">
                    <Mic size={22} />
                  </button>
                )}
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-10 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
               <MessageSquare size={48} className="text-slate-300" />
            </div>
            <h3 className="text-slate-900 font-bold text-2xl mb-2">Welcome to Inbox</h3>
            <p className="text-slate-500 font-medium max-w-sm">Select a conversation from the list to start messaging your customers.</p>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Contact Details */}
      {selectedContact && (
        <div className="w-[380px] flex-shrink-0 bg-white rounded-3xl shadow-card border border-slate-200 flex flex-col overflow-y-auto custom-scrollbar">
          
          {/* Profile Header */}
          <div className="p-8 text-center border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/50 relative group/header">
             
            <button 
               onClick={() => setIsEditingHeader(!isEditingHeader)}
               className="absolute top-4 right-4 p-2 text-slate-400 hover:text-primary bg-white hover:bg-blue-50 rounded-full shadow-sm opacity-0 group-hover/header:opacity-100 transition-all"
            >
               <Pen size={14} />
            </button>

            <div className="relative inline-block mb-4">
               <img src={selectedContact.avatar} alt="" className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-md" />
            </div>
            
            {isEditingHeader ? (
              <div className="space-y-3 px-2 animate-in fade-in">
                 <input 
                   type="text" 
                   value={editName}
                   onChange={(e) => setEditName(e.target.value)}
                   className="w-full text-center font-display font-bold text-xl text-slate-900 border-b-2 border-primary focus:outline-none bg-transparent"
                   placeholder="Name"
                 />
                 <input 
                   type="text" 
                   value={editCompany}
                   onChange={(e) => setEditCompany(e.target.value)}
                   className="w-full text-center text-xs font-bold text-slate-600 border-b border-slate-300 focus:border-primary focus:outline-none bg-transparent uppercase tracking-wide"
                   placeholder="Company"
                 />
                 <div className="flex gap-2 justify-center pt-2">
                   <button onClick={() => setIsEditingHeader(false)} className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1">Cancel</button>
                   <button onClick={handleSaveHeader} className="text-xs bg-primary text-white px-3 py-1 rounded-full font-bold">Save</button>
                 </div>
              </div>
            ) : (
              <>
                <h2 className="font-display font-bold text-2xl text-slate-900 mb-1">{selectedContact.name}</h2>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600 border border-slate-200 uppercase tracking-wide">
                    {selectedContact.company || 'Individual'}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="p-6 space-y-8">
            
            {/* Pipeline Stage Card */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Pipeline Stage</h4>
                  {!selectedContact.isInPipeline && (
                      <button 
                        onClick={() => addToPipeline(selectedContact.id)}
                        className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                          <BarChart3 size={12} /> Add to Pipeline
                      </button>
                  )}
              </div>
              
              {selectedContact.isInPipeline ? (
                  <div className="relative">
                    <select 
                      value={selectedContact.stage}
                      onChange={(e) => updateContactStage(selectedContact.id, e.target.value as PipelineStage)}
                      className="w-full appearance-none bg-white border border-slate-200 text-slate-800 text-sm font-bold rounded-xl py-3.5 px-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all cursor-pointer hover:border-slate-300"
                    >
                      {Object.values(PipelineStage).map(stage => (
                        <option key={stage} value={stage}>{stage}</option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </div>
              ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center text-sm text-slate-500 italic">
                      Not in sales pipeline
                  </div>
              )}
            </div>

            {/* Notes Card */}
            <div className="space-y-3">
               <div className="flex justify-between items-end">
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Notes</h4>
                 <button onClick={() => setIsEditingNote(!isEditingNote)} className="text-xs font-bold text-primary hover:underline">
                   {isEditingNote ? 'Cancel' : 'Edit'}
                 </button>
               </div>
               
               {isEditingNote ? (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <textarea 
                      className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white min-h-[100px] text-slate-900 shadow-sm"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Add a note..."
                    />
                    <button 
                      onClick={handleSaveNote} 
                      className="w-full py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      Save Note
                    </button>
                  </div>
               ) : (
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-sm text-slate-800 leading-relaxed shadow-sm relative overflow-hidden">
                     {/* Sticky Note Stripe */}
                     <div className="absolute top-0 left-0 w-full h-1 bg-amber-200/50"></div>
                     {selectedContact.notes ? (
                        <p>{selectedContact.notes}</p>
                     ) : (
                        <span className="text-slate-500 italic opacity-70">No notes added yet.</span>
                     )}
                  </div>
               )}
            </div>

            {/* Info Card */}
            <div className="space-y-4">
               <div className="flex justify-between items-center px-1">
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Info</h4>
                 <button onClick={() => setIsEditingContactInfo(!isEditingContactInfo)} className="text-xs font-bold text-primary hover:underline">
                    {isEditingContactInfo ? 'Cancel' : 'Edit'}
                 </button>
               </div>
               
               <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
                  <div className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                     <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                        <Mail size={18} />
                     </div>
                     <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-0.5">Email</p>
                        {isEditingContactInfo ? (
                            <input 
                                type="text"
                                className="w-full text-sm font-semibold text-slate-900 border-b border-slate-300 focus:border-primary outline-none bg-transparent"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                            />
                        ) : (
                            <p className="text-sm font-semibold text-slate-900 truncate">{selectedContact.email || "No email"}</p>
                        )}
                     </div>
                  </div>
                  <div className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                     <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                        <Phone size={18} />
                     </div>
                     <div className="flex-1">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-0.5">Phone</p>
                         {isEditingContactInfo ? (
                            <input 
                                type="text"
                                className="w-full text-sm font-semibold text-slate-900 border-b border-slate-300 focus:border-primary outline-none bg-transparent"
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                            />
                        ) : (
                            <p className="text-sm font-semibold text-slate-900">{selectedContact.phone}</p>
                        )}
                     </div>
                  </div>
                  {isEditingContactInfo && (
                      <div className="p-3 bg-slate-50">
                        <button 
                            onClick={handleSaveContactInfo}
                            className="w-full py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover shadow-sm"
                        >
                            Save Details
                        </button>
                      </div>
                  )}
               </div>
            </div>

            {/* Tags */}
            <div className="space-y-3">
               <div className="flex justify-between items-center px-1">
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tags</h4>
                 {!isAddingTag && (
                    <button onClick={() => setIsAddingTag(true)} className="text-xs font-bold text-primary hover:bg-blue-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1">
                        <Plus size={14} /> Add
                    </button>
                 )}
               </div>
               
               {isAddingTag && (
                   <form onSubmit={handleAddTagSubmit} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                       <input 
                           autoFocus
                           type="text" 
                           className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-slate-800"
                           placeholder="New tag..."
                           value={newTag}
                           onChange={(e) => setNewTag(e.target.value)}
                           onBlur={() => !newTag && setIsAddingTag(false)}
                       />
                       <button type="submit" className="text-primary hover:bg-blue-50 p-1 rounded-md">
                           <Check size={16} />
                       </button>
                       <button type="button" onClick={() => setIsAddingTag(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md">
                           <X size={16} />
                       </button>
                   </form>
               )}

               <div className="flex flex-wrap gap-2">
                  {selectedContact.tags.length > 0 ? (
                    selectedContact.tags.map(tag => (
                      <div key={tag} className="group relative">
                          <span className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200 flex items-center gap-1 pr-6 hover:bg-slate-200 transition-colors cursor-default">
                            {tag}
                          </span>
                          <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                removeContactTag(selectedContact.id, tag);
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 hover:bg-white rounded-md p-0.5 opacity-0 group-hover:opacity-100 transition-all"
                            title="Remove tag"
                          >
                              <X size={12} strokeWidth={3} />
                          </button>
                      </div>
                    ))
                  ) : (
                    !isAddingTag && <span className="text-sm text-slate-400 italic pl-1">No tags</span>
                  )}
               </div>
            </div>

            {/* Actions */}
            <div className="pt-4 space-y-3">
               <button 
                type="button"
                onClick={() => setShowFollowUpModal(true)}
                className="w-full py-3.5 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 hover:-translate-y-0.5"
               >
                 <Clock size={18} />
                 <span>Schedule Reminder</span>
               </button>
               <button 
                type="button"
                onClick={handleArchive}
                className={`w-full py-3.5 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 border ${
                    selectedContact.archived 
                    ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' 
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
               >
                 {selectedContact.archived ? <RefreshCw size={18} /> : <Archive size={18} />}
                 <span>{selectedContact.archived ? 'Restore to Inbox' : 'Archive Conversation'}</span>
               </button>
               <button 
                  type="button"
                  onClick={handleDelete}
                  className="w-full py-3.5 bg-white text-rose-500 font-bold text-sm rounded-xl hover:bg-rose-50 border border-rose-100 transition-all flex items-center justify-center gap-2"
               >
                  <Trash2 size={18} />
                  <span>Delete Conversation</span>
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow Up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-display font-bold text-xl text-slate-900">Schedule Reminder</h3>
              <p className="text-sm text-slate-500 font-medium mt-1">Set a follow-up task for {selectedContact?.name}</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Date & Time</label>
                <input 
                  type="datetime-local" 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium text-slate-900"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Note</label>
                <textarea 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none h-32 resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium text-slate-900"
                  placeholder="What needs to be done?"
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-50 bg-slate-50/30 flex justify-end gap-3">
              <button 
                onClick={() => setShowFollowUpModal(false)} 
                className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={handleScheduleFollowUp} 
                disabled={!followUpDate || !followUpNote}
                className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all text-sm disabled:opacity-50 disabled:shadow-none"
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-xl text-slate-900">Add New Contact</h3>
                <p className="text-sm text-slate-500 font-medium mt-1">Add a new conversation manually</p>
              </div>
              <button onClick={() => setShowAddContactModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAddContact} className="p-8 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Full Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Michael Scott"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium text-slate-900 text-base shadow-sm"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Phone Number</label>
                <input 
                  type="tel" 
                  required
                  placeholder="+1 555 123 4567"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium text-slate-900 text-base shadow-sm"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                />
              </div>
              
              <div className="pt-4 flex justify-end">
                <button 
                  type="submit"
                  className="w-full py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary-hover shadow-lg shadow-primary/25 transition-all text-sm flex items-center justify-center transform active:scale-95"
                >
                  Create Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
  function deriveWaId(c?: Contact | null): string {
    if (!c) return ''
    const raw = (c.waId && c.waId.trim()) || (c.phone && c.phone.trim()) || c.id
    if (!raw) return ''
    // Normalize phone/wa_id to digits-only to match backend thread_id
    const digits = raw.replace(/\D/g, '')
    return digits || raw
  }
