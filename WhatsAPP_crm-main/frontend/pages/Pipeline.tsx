
import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../store';
import { PipelineStage } from '../types';
import { MoreHorizontal, MessageSquare, Search, Filter, Plus, DollarSign, Calendar, X, Check, Trash2, Loader2 } from 'lucide-react';
import * as pipelineApi from '../api/pipeline';
import { connectPipelineEvents, PipelineEvent } from '../realtime';
import { getMe } from '../api/auth';

// Local type for deal display
interface DealCard {
  id: number;
  name: string;
  phone: string;
  company?: string;
  avatar: string;
  stage: PipelineStage;
  tags: string[];
  dealValue: number;
  lastMessageTime: string;
  waId: string;
  unreadCount: number;
}

export const Pipeline: React.FC = () => {
  const { setActivePage, setSelectedContactId, showNotification } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDealName, setNewDealName] = useState('');
  const [newDealPhone, setNewDealPhone] = useState('');
  const [newDealCompany, setNewDealCompany] = useState('');
  const [newDealValue, setNewDealValue] = useState('');

  // Map backend stage name to frontend enum
  const mapStageName = (name: string): PipelineStage => {
    const mapping: Record<string, PipelineStage> = {
      'New': PipelineStage.NEW,
      'Active': PipelineStage.ACTIVE,
      'Follow Up': PipelineStage.FOLLOW_UP,
      'Converted': PipelineStage.CONVERTED
    };
    return mapping[name] || PipelineStage.NEW;
  };

  // Convert API deal to DealCard
  const mapApiDealToCard = useCallback((deal: any): DealCard => {
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
      id: deal.id,
      name: deal.contact?.display_name || 'Unknown',
      phone: deal.contact?.phone_e164 || formatPhone(deal.contact?.wa_id || ''), // Use wa_id if phone_e164 is null
      company: deal.contact?.company || undefined,
      avatar: deal.contact?.profile_image_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(deal.contact?.display_name || 'U')}&background=random`,
      stage: mapStageName(deal.stage?.name || 'New'),
      tags: deal.tags || [],
      dealValue: Number(deal.value) || 0,
      lastMessageTime: deal.created_at || new Date().toISOString(),
      waId: deal.contact?.wa_id || '',
      unreadCount: 0
    };
  }, []);

  // Fetch deals from API (only on initial load or manual refresh)
  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { deals: apiDeals } = await pipelineApi.getDeals();
      const mappedDeals = apiDeals.map(mapApiDealToCard);

      console.info('[Pipeline] Loaded deals:', {
        total: mappedDeals.length,
        byStage: Object.groupBy(mappedDeals, d => d.stage)
      });

      setDeals(mappedDeals);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
      setError('Failed to load deals');
    } finally {
      setLoading(false);
    }
  }, [mapApiDealToCard]);

  // Initial fetch and refetch on page visibility changes
  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  // Refetch when page becomes visible (handles navigation back to pipeline)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchDeals();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchDeals]);

  // Real-time WebSocket updates
  useEffect(() => {
    const connection = connectPipelineEvents(
      async () => {
        const user = await getMe();
        return user?.id || '';
      },
      (event: PipelineEvent) => {
        console.info('[Pipeline] Real-time event:', event);

        if (!event.event) return;

        switch (event.event) {
          case 'deal_created':
            if (event.deal) {
              const newDeal = mapApiDealToCard(event.deal);
              setDeals(prev => {
                // Check if deal already exists (avoid duplicates)
                if (prev.some(d => d.id === newDeal.id)) return prev;
                return [newDeal, ...prev];
              });
              showNotification('New deal added');
            }
            break;

          case 'deal_updated':
            if (event.deal) {
              const updatedDeal = mapApiDealToCard(event.deal);
              setDeals(prev => prev.map(d =>
                d.id === updatedDeal.id ? updatedDeal : d
              ));
            }
            break;

          case 'deal_deleted':
            if (event.deal_id) {
              setDeals(prev => prev.filter(d => d.id !== event.deal_id));
            }
            break;
        }
      }
    );

    return () => {
      connection.disconnect();
    };
  }, [mapApiDealToCard, showNotification]);

  // Filter deals based on search
  const filteredContacts = deals.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStageColor = (stage: PipelineStage) => {
    switch (stage) {
      case PipelineStage.NEW: return 'bg-blue-500 text-blue-500';
      case PipelineStage.ACTIVE: return 'bg-amber-500 text-amber-500';
      case PipelineStage.FOLLOW_UP: return 'bg-violet-500 text-violet-500';
      case PipelineStage.CONVERTED: return 'bg-emerald-500 text-emerald-500';
      default: return 'bg-slate-500 text-slate-500';
    }
  };

  const calculateTotalValue = (stage: PipelineStage) => {
    return filteredContacts
      .filter(c => c.stage === stage)
      .reduce((sum, c) => sum + (c.dealValue || 0), 0)
      .toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  };

  const handleDragStart = (e: React.DragEvent, dealId: number) => {
    e.dataTransfer.setData('dealId', dealId.toString());
    e.currentTarget.classList.add('opacity-50', 'scale-95');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50', 'scale-95');
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    const dealId = parseInt(e.dataTransfer.getData('dealId'));
    if (!dealId) return;

    // Optimistic update
    setDeals(prev => prev.map(d =>
      d.id === dealId ? { ...d, stage } : d
    ));

    try {
      await pipelineApi.updateDeal(dealId, { stage_name: stage });
      // No need to fetch - WebSocket will update if needed
    } catch (err) {
      console.error('Failed to update stage:', err);
      showNotification('Failed to update stage');
      fetchDeals(); // Only revert on error
    }
  };

  const handleChatClick = (waId: string) => {
    setSelectedContactId(waId);
    setActivePage('inbox');
  };

  const handleDeleteDeal = async (dealId: number) => {
    if (!window.confirm("Are you sure you want to delete this deal? This action cannot be undone.")) {
      return;
    }

    // Optimistic update
    setDeals(prev => prev.filter(d => d.id !== dealId));

    try {
      await pipelineApi.deleteDeal(dealId);
      // No need to show notification - WebSocket handles it
    } catch (err) {
      console.error('Failed to delete deal:', err);
      showNotification('Failed to delete deal');
      fetchDeals(); // Only revert on error
    }
  };

  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDealName || !newDealPhone) return;

    setIsSubmitting(true);
    try {
      const result = await pipelineApi.createDeal({
        name: newDealName,
        phone: newDealPhone,
        company: newDealCompany || undefined,
        value: Number(newDealValue) || 0,
        stage_name: 'New'
      });

      // Optimistically add the deal (WebSocket will confirm)
      if (result.deal) {
        const newDeal = mapApiDealToCard(result.deal);
        setDeals(prev => {
          if (prev.some(d => d.id === newDeal.id)) return prev;
          return [newDeal, ...prev];
        });
      }

      // Reset and close
      setNewDealName('');
      setNewDealPhone('');
      setNewDealCompany('');
      setNewDealValue('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to create deal:', err);
      showNotification('Failed to create deal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-8 relative font-sans">

      {/* Simple loading spinner */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center rounded-3xl">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
          {error} <button onClick={fetchDeals} className="underline ml-2">Retry</button>
        </div>
      )}
      
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-card flex-shrink-0">
        <div>
           <h2 className="font-display font-bold text-2xl text-slate-900">Deals Pipeline</h2>
           <p className="text-slate-500 text-base font-medium mt-1">Manage your sales process and track revenue.</p>
        </div>
        
        <div className="flex items-center space-x-4 w-full md:w-auto">
          <div className="relative group flex-1 md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Search deals..." 
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="p-3.5 text-slate-500 hover:text-primary hover:bg-slate-50 border border-slate-200 rounded-2xl transition-all shadow-sm">
            <Filter size={20} />
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-3.5 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/25 hover:bg-primary-hover transition-all flex items-center space-x-2 transform active:scale-95"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">New Deal</span>
          </button>
        </div>
      </div>

      {/* Kanban Board - Fit to Screen */}
      <div className="flex-1 min-h-0 overflow-hidden pb-4">
        <div className="flex gap-8 h-full">
          {Object.values(PipelineStage).map(stage => {
            const stageContacts = filteredContacts.filter(c => c.stage === stage);
            const totalValue = calculateTotalValue(stage);
            const { bg: dotBg, text: textColor } = {
               bg: getStageColor(stage).split(' ')[0],
               text: getStageColor(stage).split(' ')[1]
            };

            return (
              <div 
                key={stage} 
                className="flex-1 min-w-0 flex flex-col h-full rounded-3xl bg-slate-100 border border-slate-200/60 transition-colors"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage)}
              >
                {/* Column Header */}
                <div className="p-5 bg-white rounded-t-3xl border-b border-slate-200/60 flex-shrink-0 sticky top-0 z-10 shadow-sm">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center space-x-3 truncate">
                      <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${dotBg} shadow-sm`}></div>
                      <h3 className="font-bold text-slate-800 text-base uppercase tracking-wide truncate">{stage}</h3>
                    </div>
                    <span className="bg-slate-50 text-slate-600 px-3 py-1 rounded-xl text-sm font-bold border border-slate-200 flex-shrink-0">
                      {stageContacts.length}
                    </span>
                  </div>
                  <div className="text-right mt-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Value: </span>
                    <span className={`text-base font-bold font-mono ${textColor}`}>{totalValue}</span>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {stageContacts.map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      onDragEnd={handleDragEnd}
                      className="bg-white p-5 rounded-2xl shadow-card border border-transparent hover:border-primary/30 hover:shadow-card-hover cursor-grab active:cursor-grabbing transition-all duration-200 group relative transform hover:-translate-y-1"
                    >
                      {/* Left colored accent bar */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${dotBg} opacity-0 group-hover:opacity-100 transition-opacity`} />

                      <div className="flex justify-between items-start mb-4 pl-3">
                        <div className="flex items-center space-x-4 min-w-0">
                           <div className="relative flex-shrink-0">
                             <img src={deal.avatar} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-100 shadow-sm" />
                             {deal.unreadCount > 0 && (
                               <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white"></div>
                             )}
                           </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-base text-slate-900 leading-tight mb-1 truncate">{deal.name}</h4>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide truncate">{deal.company || 'No Company'}</p>
                          </div>
                        </div>

                        {/* Direct Delete Button - Only visible on hover */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDeal(deal.id);
                            }}
                            className="text-slate-300 hover:text-rose-500 p-2 rounded-xl hover:bg-rose-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                            title="Delete Deal"
                        >
                            <Trash2 size={18} />
                        </button>
                      </div>

                      {/* Deal Value Badge */}
                      <div className="flex justify-between items-center mb-5 pl-3">
                        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100/50 shadow-sm">
                          <DollarSign size={14} strokeWidth={3} className="mr-0.5 flex-shrink-0" />
                          <span className="text-sm font-bold truncate">{deal.dealValue?.toLocaleString()}</span>
                        </div>
                        {deal.tags[0] && (
                          <span className="text-xs px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg border border-slate-100 font-bold truncate max-w-[100px]">
                            {deal.tags[0]}
                          </span>
                        )}
                      </div>

                      {/* Last Interaction */}
                      <div className="flex items-center justify-between pt-4 border-t border-slate-50 pl-3">
                        <div className="flex items-center text-xs text-slate-400 font-bold truncate">
                           <Calendar size={14} className="mr-2 flex-shrink-0 opacity-70" />
                           <span className="truncate">{new Date(deal.lastMessageTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <button
                           onClick={() => handleChatClick(deal.waId)}
                           className="flex items-center space-x-2 text-slate-400 hover:text-primary transition-colors flex-shrink-0 cursor-pointer px-3 py-1.5 rounded-lg hover:bg-blue-50"
                        >
                           <MessageSquare size={16} />
                           <span className="text-xs font-bold">Chat</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {/* Empty State Drop Zone */}
                  {stageContacts.length === 0 && (
                    <div className="h-40 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-3 opacity-60 hover:opacity-100 hover:border-slate-300 transition-all">
                      <Plus size={32} />
                      <span className="text-sm font-bold">Drag deals here</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Deal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-display font-bold text-2xl text-slate-900">Add New Deal</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAddDeal} className="p-8 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Contact Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Jane Doe"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium text-slate-900 text-base shadow-sm"
                  value={newDealName}
                  onChange={(e) => setNewDealName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Phone Number (Required)</label>
                <input 
                  type="tel" 
                  required
                  placeholder="+1 234 567 8900"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium text-slate-900 text-base shadow-sm"
                  value={newDealPhone}
                  onChange={(e) => setNewDealPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Company</label>
                <input 
                  type="text" 
                  placeholder="e.g. Acme Inc"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium text-slate-900 text-base shadow-sm"
                  value={newDealCompany}
                  onChange={(e) => setNewDealCompany(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Estimated Value ($)</label>
                <input 
                  type="number" 
                  placeholder="0"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium text-slate-900 text-base shadow-sm"
                  value={newDealValue}
                  onChange={(e) => setNewDealValue(e.target.value)}
                />
              </div>

              <div className="pt-6 flex justify-end space-x-4 border-t border-slate-50 mt-4">
                 <button
                   type="button"
                   onClick={() => setIsModalOpen(false)}
                   disabled={isSubmitting}
                   className="px-8 py-3.5 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-colors text-sm disabled:opacity-50"
                 >
                   Cancel
                 </button>
                 <button
                   type="submit"
                   disabled={isSubmitting}
                   className="px-8 py-3.5 bg-primary text-white font-bold rounded-2xl hover:bg-primary-hover shadow-lg shadow-primary/25 transition-all text-sm flex items-center transform active:scale-95 disabled:opacity-50"
                 >
                   {isSubmitting ? (
                     <Loader2 size={20} className="mr-2 animate-spin" />
                   ) : (
                     <Check size={20} className="mr-2" />
                   )}
                   {isSubmitting ? 'Creating...' : 'Create Deal'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};