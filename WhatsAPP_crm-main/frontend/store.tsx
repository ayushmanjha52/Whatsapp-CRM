
import React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Contact, Message, FollowUpTask, PipelineStage, Broadcast, User } from './types';
import { INITIAL_CONTACTS, INITIAL_MESSAGES, INITIAL_TASKS, CURRENT_USER } from './mockData';

interface AppState {
  // Navigation & Selection State
  activePage: string;
  selectedContactId: string | null;
  
  // Feedback State
  notification: string | null;
  
  // Data State
  contacts: Contact[];
  messages: Message[];
  tasks: FollowUpTask[];
  broadcasts: Broadcast[];
  currentUser: User;
  customColumns: string[];
  
  // Actions
  setActivePage: (page: string) => void;
  setSelectedContactId: (id: string | null) => void;
  showNotification: (message: string) => void;
  setContacts: (contacts: Contact[]) => void;
  
  addContact: (contact: Partial<Contact>) => void;
  deleteContact: (contactId: string) => void;
  addMessage: (contactId: string, content: string, isOutbound: boolean) => Promise<void>;
  setMessagesForContact: (contactId: string, messages: Message[]) => void;
  markContactAsRead: (contactId: string) => Promise<void>;
  updateContactStage: (contactId: string, stage: PipelineStage) => void;
  addToPipeline: (contactId: string) => void;
  addContactTag: (contactId: string, tag: string) => void;
  removeContactTag: (contactId: string, tag: string) => void;
  updateContact: (contactId: string, updates: Partial<Contact>) => void;
  archiveContact: (contactId: string) => void;
  unarchiveContact: (contactId: string) => void;
  
  addFollowUpTask: (task: Omit<FollowUpTask, 'id' | 'completed'>) => void;
  markTaskComplete: (taskId: string) => void;
  createBroadcast: (name: string, message: string, recipientCount: number) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  
  // Advanced Broadcast Features
  importContactsFromCSV: (csvContent: string) => void;
  addCustomColumn: (columnName: string) => void;

  // Helpers
  getContactMessages: (contactId: string) => Message[];
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial State
      activePage: 'landing', 
      selectedContactId: null, 
      notification: null,
      contacts: INITIAL_CONTACTS,
      messages: INITIAL_MESSAGES,
      tasks: INITIAL_TASKS,
      broadcasts: [],
      currentUser: CURRENT_USER,
      customColumns: ['Region', 'Source'], // Default custom columns

      // Navigation Actions
      setActivePage: (page) => set({ activePage: page }),
      setSelectedContactId: (id) => {
        set({ selectedContactId: id });
        if (id) {
            get().markContactAsRead(id);
        }
      },
      
      showNotification: (message) => {
        set({ notification: message });
        setTimeout(() => set({ notification: null }), 3000);
      },

      setContacts: (contacts: Contact[]) => {
        set({ contacts })
      },

      // Data Actions
      addContact: (contactData) => {
        const generatedId = `c${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const rawPhone = contactData.phone || ''
        const normalized = rawPhone.replace(/\D/g, '')
        const idForBackend = normalized || generatedId
        const newContact: Contact = {
          id: idForBackend,
          name: contactData.name || 'New Contact',
          phone: rawPhone,
          avatar: `https://ui-avatars.com/api/?name=${contactData.name || 'New+Contact'}&background=random`,
          stage: PipelineStage.NEW,
          tags: contactData.tags || [],
          notes: '',
          lastMessage: '',
          lastMessageTime: new Date().toISOString(),
          unreadCount: 0,
          dealValue: contactData.dealValue || 0,
          company: contactData.company || '',
          email: contactData.email || '',
          archived: false,
          isInPipeline: contactData.isInPipeline !== undefined ? contactData.isInPipeline : true, // Default: If manually adding via 'New Deal', it goes to pipeline.
          isBroadcastOnly: false,
          customFields: contactData.customFields || {}
        };
        if (normalized) (newContact as any).waId = normalized

        set((state) => ({
          contacts: [newContact, ...state.contacts],
          selectedContactId: newContact.id,
          notification: `New contact created for ${newContact.name}`
        }));
        setTimeout(() => set({ notification: null }), 3000);

        try {
          import('./api/inbox').then(mod => {
            const upsert = (mod as any).upsertContact
            if (typeof upsert === 'function') upsert(idForBackend, contactData.name || '', normalized || '')
          }).catch(() => {})
        } catch {}
      },

      deleteContact: (contactId: string) => {
        set((state) => {
          const newContacts = state.contacts.filter(c => c.id !== contactId);
          const newMessages = state.messages.filter(m => m.contactId !== contactId);
          const newTasks = state.tasks.filter(t => t.contactId !== contactId);

          const newSelectedId = state.selectedContactId === contactId ? null : state.selectedContactId;

          return {
            contacts: newContacts,
            messages: newMessages,
            tasks: newTasks,
            selectedContactId: newSelectedId,
            notification: 'Conversation deleted permanently'
          };
        });
        setTimeout(() => set({ notification: null }), 3000);

        // Call backend API to permanently delete the conversation
        import('./api/inbox').then(mod => {
          const deleteConv = (mod as any).deleteConversation
          if (typeof deleteConv === 'function') {
            deleteConv(contactId).catch((err: any) => {
              console.warn('Failed to delete conversation from backend:', err)
            })
          }
        }).catch(() => {})
      },

      addMessage: async (contactId: string, content: string, isOutbound: boolean) => {
        const tempId = `m${Date.now()}`;
        const newMessage: Message = {
          id: tempId,
          contactId,
          content,
          timestamp: new Date().toISOString(),
          isOutbound,
          status: 'sent'
        };

        set((state) => {
          const updatedMessages = [...state.messages, newMessage];
          
          // Logic: If message is inbound and contact was "Broadcast Only", promote them to Inbox.
          // If creating a NEW contact from inbound (hypothetically), isInPipeline should be false.

          const updatedContacts = state.contacts.map((c) => {
            if (c.id === contactId) {
              return {
                ...c,
                lastMessage: content,
                lastMessageTime: new Date().toISOString(),
                unreadCount: isOutbound ? 0 : c.unreadCount,
                archived: false,
                isBroadcastOnly: false // Promote to Inbox on interaction
              };
            }
            return c;
          });

          return {
            messages: updatedMessages,
            contacts: updatedContacts,
          };
        });

        // DEMO MODE: Simulated delay without API call
        if (isOutbound) {
            setTimeout(() => {
               set(state => ({
                   messages: state.messages.map(m => m.id === tempId ? { ...m, status: 'delivered' } : m)
               }));
            }, 1000);
        }
      },

      setMessagesForContact: (contactId: string, messages: Message[]) => {
        set((state) => ({
          messages: [
            ...state.messages.filter(m => m.contactId !== contactId),
            ...messages
          ]
        }))
      },

      markContactAsRead: async (contactId: string) => {
        const { contacts } = get();
        const contact = contacts.find(c => c.id === contactId);
        
        if (!contact || contact.unreadCount === 0) return;

        set((state) => ({
          contacts: state.contacts.map(c => c.id === contactId ? { ...c, unreadCount: 0 } : c)
        }));
      },

      updateContactStage: async (contactId: string, stage: PipelineStage) => {
        // First update local state
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === contactId ? { ...c, stage, isInPipeline: true } : c
          ),
          notification: `Stage updated to ${stage}`
        }));
        setTimeout(() => set({ notification: null }), 3000);

        // Then sync with backend
        try {
          const { updateDeal, getDeals } = await import('./api/pipeline')
          const { deals } = await getDeals()
          const deal = deals.find((d: any) => d.contact?.wa_id === contactId)

          if (deal) {
            await updateDeal(deal.id, { stage_name: stage })
            console.info('[Store] Stage synced to backend:', { contactId, stage })
          }
        } catch (err) {
          console.warn('Failed to sync stage to backend:', err)
          // Don't revert on failure - the user sees it as updated locally
        }
      },

      addToPipeline: (contactId: string) => {
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === contactId ? { ...c, isInPipeline: true, stage: PipelineStage.NEW } : c
          ),
          notification: 'Contact added to pipeline'
        }));
        setTimeout(() => set({ notification: null }), 3000);

        // Call backend API to create deal for this contact
        import('./api/pipeline').then(mod => {
          const addToPipelineApi = (mod as any).addContactToPipeline
          if (typeof addToPipelineApi === 'function') {
            addToPipelineApi({ wa_id: contactId })
              .then((result: any) => {
                console.info('[Store] Successfully added to pipeline:', result)
              })
              .catch((err: any) => {
                console.warn('Failed to sync add to pipeline:', err)
                // Revert optimistic update on failure
                set((state) => ({
                  contacts: state.contacts.map((c) =>
                    c.id === contactId ? { ...c, isInPipeline: false, stage: PipelineStage.NEW } : c
                  ),
                  notification: 'Failed to add to pipeline'
                }));
                setTimeout(() => set({ notification: null }), 3000);
              })
          }
        }).catch((err) => {
          console.warn('Failed to call add to pipeline API:', err)
        })
      },

      addContactTag: (contactId: string, tag: string) => {
        set((state) => ({
          contacts: state.contacts.map((c) => {
            if (c.id === contactId && !c.tags.includes(tag)) {
              return { ...c, tags: [...c.tags, tag] };
            }
            return c;
          }),
          notification: `Tag "${tag}" added`
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      removeContactTag: (contactId: string, tag: string) => {
        set((state) => ({
            contacts: state.contacts.map((c) => {
                if (c.id === contactId) {
                    return { ...c, tags: c.tags.filter(t => t !== tag) };
                }
                return c;
            }),
            notification: `Tag "${tag}" removed`
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      updateContact: (contactId: string, updates: Partial<Contact>) => {
        set((state) => ({
          contacts: state.contacts.map((c) => 
            c.id === contactId ? { ...c, ...updates } : c
          ),
          notification: 'Contact details updated'
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      archiveContact: (contactId: string) => {
        set((state) => {
            const nextContacts = state.contacts.map(c => c.id === contactId ? { ...c, archived: true } : c);
            let nextSelectedId = state.selectedContactId;
            if (state.selectedContactId === contactId) {
                const visibleContacts = nextContacts.filter(c => !c.archived && !c.isBroadcastOnly);
                nextSelectedId = visibleContacts.length > 0 ? visibleContacts[0].id : null;
            }
            return {
                contacts: nextContacts,
                selectedContactId: nextSelectedId,
                notification: 'Conversation archived'
            };
        });
        setTimeout(() => set({ notification: null }), 3000);
      },

      unarchiveContact: (contactId: string) => {
        set((state) => ({
            contacts: state.contacts.map(c => c.id === contactId ? { ...c, archived: false } : c),
            notification: 'Conversation restored to Inbox'
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      addFollowUpTask: (task: Omit<FollowUpTask, 'id' | 'completed'>) => {
        const newTask: FollowUpTask = {
          ...task,
          id: `t${Date.now()}`,
          completed: false
        };
        set((state) => ({
          tasks: [...state.tasks, newTask],
          notification: 'Follow-up task scheduled'
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      markTaskComplete: (taskId: string) => {
        set((state) => ({
          tasks: state.tasks.map((t) => 
            t.id === taskId ? { ...t, completed: true } : t
          ),
          notification: 'Task marked as complete'
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      createBroadcast: (name: string, message: string, recipientCount: number) => {
        // Generate realistic mock stats based on recipient count
        const delivered = Math.floor(recipientCount * 0.98);
        const read = Math.floor(delivered * 0.75);
        const replied = Math.floor(read * 0.15);
        const clicked = Math.floor(read * 0.25);
        const failed = recipientCount - delivered;

        const newBroadcast: Broadcast = {
          id: `b${Date.now()}`,
          name,
          message,
          recipientCount,
          dateSent: new Date().toISOString(),
          status: 'Sent',
          stats: {
            delivered,
            read,
            replied,
            clicked,
            failed
          }
        };
        set((state) => ({
          broadcasts: [newBroadcast, ...state.broadcasts],
          notification: `Broadcast "${name}" sent to ${recipientCount} contacts`
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      updateCurrentUser: (updates: Partial<User>) => {
        set((state) => ({
            currentUser: { ...state.currentUser, ...updates },
            notification: 'Profile settings saved'
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },
      
      addCustomColumn: (columnName: string) => {
        set((state) => ({
          customColumns: [...state.customColumns, columnName],
          notification: `Column "${columnName}" added`
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      importContactsFromCSV: (csvContent: string) => {
        // Simple CSV Parser
        const lines = csvContent.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const newContacts: Contact[] = [];
        
        // Find mapped indexes
        const nameIdx = headers.findIndex(h => h.toLowerCase().includes('name'));
        const phoneIdx = headers.findIndex(h => h.toLowerCase().includes('phone'));
        const emailIdx = headers.findIndex(h => h.toLowerCase().includes('email'));
        const companyIdx = headers.findIndex(h => h.toLowerCase().includes('company'));

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim());
            
            // Extract Custom Fields (headers that aren't standard)
            const customFields: Record<string, string> = {};
            headers.forEach((h, idx) => {
                if (!['name', 'phone', 'email', 'company'].some(std => h.toLowerCase().includes(std))) {
                    customFields[h] = values[idx] || '';
                }
            });

            newContacts.push({
                id: `c${Date.now()}-${i}`,
                name: values[nameIdx] || 'Imported Contact',
                phone: values[phoneIdx] || '',
                email: values[emailIdx] || '',
                company: values[companyIdx] || '',
                avatar: `https://ui-avatars.com/api/?name=${values[nameIdx] || 'Imported'}&background=random`,
                stage: PipelineStage.NEW,
                tags: ['Imported'],
                notes: '',
                lastMessage: '',
                lastMessageTime: new Date().toISOString(),
                unreadCount: 0,
                dealValue: 0,
                archived: false,
                isInPipeline: false, // Imported contacts start as Inbox-only (not in pipeline)
                isBroadcastOnly: true, // Imported for broadcast, so hidden from inbox initially
                customFields
            });
        }
        
        set((state) => ({
            contacts: [...newContacts, ...state.contacts],
            notification: `Imported ${newContacts.length} contacts successfully`
        }));
        setTimeout(() => set({ notification: null }), 3000);
      },

      getContactMessages: (contactId: string) => {
        const { messages } = get();
        return messages
          .filter((m) => m.contactId === contactId)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }
    }),
    {
      name: 'whatsapp-crm-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};
