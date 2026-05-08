
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../store';
import { 
  Search, Send, Users, Smartphone, Sparkles, ChevronRight, History, 
  CheckCircle2, Variable, ArrowLeft, Filter, Building2, Mail, FileUp, 
  Plus, ChevronDown, Check, MousePointerClick, XCircle, MessageCircle, 
  BarChart3, X, Calendar, Clock, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  ChevronLeft
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  AreaChart, Area, CartesianGrid, Cell, PieChart, Pie, Legend
} from 'recharts';

export const Broadcast: React.FC = () => {
  const { contacts, createBroadcast, broadcasts, importContactsFromCSV, customColumns, addCustomColumn } = useApp();
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  
  // Creation State
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [step, setStep] = useState(1); // 1: Audience, 2: Content
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [showAddColumn, setShowAddColumn] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  
  // Analytics State
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const selectedCampaign = useMemo(() => 
    broadcasts.find(b => b.id === selectedCampaignId), 
  [selectedCampaignId, broadcasts]);

  // Mock Data Generators for Analytics
  const analyticsData = useMemo(() => {
    if (!selectedCampaign || !selectedCampaign.stats) return null;
    const { recipientCount, stats } = selectedCampaign;
    
    // Funnel Data
    const funnelData = [
      { name: 'Sent', value: recipientCount, fill: '#64748B' },
      { name: 'Delivered', value: stats.delivered, fill: '#3B82F6' },
      { name: 'Read', value: stats.read, fill: '#10B981' },
      { name: 'Replied', value: stats.replied, fill: '#8B5CF6' },
    ];

    // Timeline Data (Mock)
    const timelineData = [
      { time: '0m', open: 0, reply: 0 },
      { time: '10m', open: Math.floor(stats.read * 0.2), reply: Math.floor(stats.replied * 0.1) },
      { time: '30m', open: Math.floor(stats.read * 0.5), reply: Math.floor(stats.replied * 0.3) },
      { time: '1h', open: Math.floor(stats.read * 0.8), reply: Math.floor(stats.replied * 0.6) },
      { time: '2h', open: stats.read, reply: stats.replied },
    ];

    return { funnelData, timelineData };
  }, [selectedCampaign]);

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination Logic
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentContacts = filteredContacts.slice(indexOfFirstItem, indexOfLastItem);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedContactIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedContactIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const insertVariable = (variable: string) => {
    setMessage(prev => prev + ` {{${variable}}}`);
  };

  const handleSend = () => {
    if (!campaignName) {
      alert("Please name your campaign");
      return;
    }
    createBroadcast(campaignName, message, selectedContactIds.size);
    setStep(1);
    setSelectedContactIds(new Set());
    setMessage('');
    setCampaignName('');
    setActiveTab('history');
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const content = evt.target?.result as string;
            importContactsFromCSV(content);
        };
        reader.readAsText(file);
    }
  };
  
  const handleAddColumn = () => {
      if(newColumnName) {
          addCustomColumn(newColumnName);
          setNewColumnName('');
          setShowAddColumn(false);
      }
  };

  const MessagePreview = () => (
    <div className="w-[360px] h-[720px] bg-slate-900 rounded-[3.5rem] p-4 shadow-2xl relative ring-1 ring-slate-950/50 mx-auto transform border-4 border-slate-800">
      <div className="h-full w-full bg-[#E5DDD5] rounded-[2.5rem] overflow-hidden relative flex flex-col font-sans">
        <div className="bg-[#005c4b] h-28 pt-12 px-5 flex items-center justify-between shrink-0 shadow-sm z-10 text-white">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold border border-white/10 backdrop-blur-sm">B</div>
             <div>
               <p className="text-sm font-bold leading-none mb-1 text-white">My Business</p>
               <p className="text-[10px] opacity-80 font-medium">Business Account</p>
             </div>
           </div>
        </div>
        <div className="flex-1 p-5 overflow-y-auto space-y-4" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
           <div className="flex justify-center my-4">
             <span className="bg-[#E9EDEF] text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 uppercase tracking-wide">Today</span>
           </div>
           <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[90%] text-[15px] text-slate-800 leading-snug relative">
              {message ? (
                 message.split('\n').map((line, i) => <p key={i} className="min-h-[1.2em]">{line}</p>)
              ) : (
                <span className="text-slate-400 italic">Type your message...</span>
              )}
              <div className="flex justify-end items-end gap-1 mt-2 opacity-60">
                 <span className="text-[10px] font-medium">10:42 AM</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col space-y-8 w-full pb-6 relative">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 flex-shrink-0">
        <div>
           <h2 className="font-display font-bold text-3xl text-slate-900 tracking-tight">Broadcasts</h2>
           <p className="text-slate-500 text-lg font-medium mt-1">Manage bulk messaging campaigns.</p>
        </div>
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex">
           <button 
             onClick={() => setActiveTab('create')}
             className={`px-8 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'create' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
           >
             Create Campaign
           </button>
           <button 
             onClick={() => setActiveTab('history')}
             className={`px-8 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
           >
             History
           </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card flex-1 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          {broadcasts.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-400">
               <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                 <History size={48} className="opacity-40" />
               </div>
               <p className="font-bold text-xl text-slate-600">No campaigns sent yet</p>
               <p className="text-base font-medium opacity-70 mt-1">Create your first broadcast to get started.</p>
             </div>
          ) : (
            <div className="overflow-x-auto h-full">
              <table className="w-full">
                <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left px-10 py-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Campaign</th>
                    <th className="text-left px-10 py-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-10 py-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Recipients</th>
                    <th className="text-left px-10 py-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-10 py-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Overview</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {broadcasts.map(b => (
                    <tr 
                        key={b.id}
                        className="hover:bg-slate-50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedCampaignId(b.id)}
                    >
                      <td className="px-10 py-6 font-bold text-slate-900 text-lg">{b.name}</td>
                      <td className="px-10 py-6">
                        <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-wide">
                          {b.status}
                        </span>
                      </td>
                      <td className="px-10 py-6 text-slate-600 font-bold flex items-center gap-3 text-base">
                        <Users size={20} className="text-slate-400" />
                        {b.recipientCount}
                      </td>
                      <td className="px-10 py-6 text-slate-500 text-base font-medium">{new Date(b.dateSent).toLocaleDateString()}</td>
                      <td className="px-10 py-6">
                         <div className="flex items-center gap-6">
                            <div>
                               <span className="block text-base font-bold text-slate-900">{b.stats?.read ? Math.round((b.stats.read / b.recipientCount) * 100) : 0}%</span>
                               <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Read Rate</span>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-6 text-slate-400">
                        <div className="p-2 rounded-full hover:bg-slate-200 transition-colors">
                           <ChevronRight size={20} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        // CREATE TAB
        <div className="flex flex-col xl:flex-row gap-8 h-full min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-card flex flex-col overflow-hidden">
             {/* Step Indicator */}
             <div className="px-12 py-10 border-b border-slate-100 bg-slate-50/30">
               <div className="flex items-center justify-between max-w-3xl mx-auto relative">
                 <div className="absolute top-1/2 left-0 w-full h-1.5 bg-slate-100 -translate-y-1/2 -z-10 rounded-full"></div>
                 <div className="absolute top-1/2 left-0 h-1.5 bg-primary -translate-y-1/2 -z-10 rounded-full transition-all duration-500 ease-in-out" style={{ width: step === 2 ? '100%' : '0%' }}></div>
                 
                 <div className={`flex items-center gap-4 transition-colors bg-white pr-6 ${step === 1 ? 'text-primary' : 'text-slate-400'}`}>
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base border-2 transition-all ${step >= 1 ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-110' : 'bg-white border-slate-300'}`}>1</div>
                   <span className="font-bold text-base tracking-wide">Select Audience</span>
                 </div>
                 
                 <div className={`flex items-center gap-4 transition-colors bg-white pl-6 ${step === 2 ? 'text-primary' : 'text-slate-400'}`}>
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base border-2 transition-all ${step >= 2 ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-110' : 'bg-white border-slate-300'}`}>2</div>
                   <span className="font-bold text-base tracking-wide">Compose Message</span>
                 </div>
               </div>
            </div>

            {/* Steps Content */}
            <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
              {step === 1 ? (
                  // AUDIENCE STEP
                  <div className="h-full flex flex-col">
                      {/* Toolbar */}
                      <div className="p-8 border-b border-slate-100 flex gap-6 bg-white z-20 items-center shadow-sm">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={22} />
                            <input 
                            type="text" 
                            placeholder="Search contacts..." 
                            className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none text-base font-bold text-slate-900 placeholder:text-slate-400 transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl text-base font-bold hover:bg-slate-50 transition-colors shadow-sm">
                                <FileUp size={20} /> <span>Import CSV</span>
                            </button>
                            <div className="flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-2xl text-base font-bold shadow-lg shadow-slate-900/10">
                                <Users size={20} /> <span>{selectedContactIds.size} Selected</span>
                            </div>
                        </div>
                      </div>
                      
                      {/* Table Area */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                         <table className="w-full border-separate border-spacing-0">
                            <thead className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 text-left w-16 border-b border-slate-200"><input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" onChange={toggleSelectAll} checked={selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0} /></th>
                                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Contact</th>
                                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Company</th>
                                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Tags</th>
                                    {customColumns.map(col => (<th key={col} className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{col}</th>))}
                                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                        {showAddColumn ? (
                                            <div className="flex items-center gap-2"><input type="text" autoFocus className="w-24 text-xs px-2 py-1 border rounded" placeholder="Col Name" value={newColumnName} onChange={e => setNewColumnName(e.target.value)} onBlur={() => !newColumnName && setShowAddColumn(false)} /><button onClick={handleAddColumn} className="text-primary"><Check size={14} /></button></div>
                                        ) : (<button onClick={() => setShowAddColumn(true)} className="flex items-center gap-1 text-primary"><Plus size={14} /> Col</button>)}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {currentContacts.length === 0 ? (
                                   <tr>
                                     <td colSpan={5 + customColumns.length} className="text-center py-20 text-slate-400">
                                       <div className="flex flex-col items-center">
                                         <Search size={48} className="opacity-20 mb-4" />
                                         <p className="text-lg font-bold">No contacts found</p>
                                         <p className="text-sm">Try importing a CSV or adding new contacts</p>
                                       </div>
                                     </td>
                                   </tr>
                                ) : (
                                  currentContacts.map(c => (
                                      <tr key={c.id} onClick={() => toggleSelect(c.id)} className={`cursor-pointer group transition-all duration-200 ${selectedContactIds.has(c.id) ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                                          <td className="px-6 py-3 border-b border-slate-50"><div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${selectedContactIds.has(c.id) ? 'bg-primary border-primary' : 'border-slate-300 bg-white'}`}>{selectedContactIds.has(c.id) && <CheckCircle2 size={16} className="text-white" />}</div></td>
                                          <td className="px-4 py-3 border-b border-slate-50"><div className="flex items-center gap-5"><img src={c.avatar} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" alt="" /><div><p className={`text-sm font-bold ${selectedContactIds.has(c.id) ? 'text-primary' : 'text-slate-900'}`}>{c.name}</p><p className="text-xs text-slate-500 font-medium">{c.phone}</p></div></div></td>
                                          <td className="px-4 py-3 border-b border-slate-50"><div className="flex items-center gap-2 text-slate-600"><Building2 size={16} className="text-slate-400" /><span className="font-medium text-sm">{c.company || '-'}</span></div></td>
                                          <td className="px-4 py-3 border-b border-slate-50"><div className="flex flex-wrap gap-2">{c.tags.slice(0, 2).map(t => (<span key={t} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 text-[10px] rounded-lg font-bold uppercase tracking-wide shadow-sm">{t}</span>))}{c.tags.length > 2 && <span className="text-[10px] text-slate-400 font-bold px-1.5 py-1">+{c.tags.length - 2}</span>}</div></td>
                                          {customColumns.map(col => (<td key={col} className="px-4 py-3 border-b border-slate-50 text-sm text-slate-600">{c.customFields?.[col] || '-'}</td>))}
                                          <td className="px-4 py-3 border-b border-slate-50"></td>
                                      </tr>
                                  ))
                                )}
                            </tbody>
                         </table>
                      </div>

                      {/* Pagination & Footer */}
                      <div className="border-t border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-4">
                         {/* Pagination Bar */}
                         <div className="flex justify-between items-center px-4">
                            <div className="text-sm font-bold text-slate-500">
                               Showing <span className="text-slate-900">{filteredContacts.length > 0 ? indexOfFirstItem + 1 : 0}</span> to <span className="text-slate-900">{Math.min(indexOfLastItem, filteredContacts.length)}</span> of <span className="text-slate-900">{filteredContacts.length}</span> contacts
                            </div>
                            <div className="flex items-center gap-6">
                               <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-400 uppercase">Rows per page:</span>
                                  <select 
                                    value={itemsPerPage} 
                                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                    className="bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20"
                                  >
                                    <option value={10}>10</option>
                                    <option value={15}>15</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                  </select>
                               </div>
                               <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <ChevronLeft size={16} />
                                  </button>
                                  <span className="text-sm font-bold text-slate-700 w-12 text-center">
                                     Page {currentPage}
                                  </span>
                                  <button 
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <ChevronRight size={16} />
                                  </button>
                               </div>
                            </div>
                         </div>
                         
                         {/* Action Footer */}
                         <div className="flex justify-end pt-2 border-t border-slate-200/50">
                            <button onClick={() => setStep(2)} disabled={selectedContactIds.size === 0} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-slate-900/10 transition-all flex items-center gap-3 active:scale-95 transform hover:-translate-y-0.5"><span className="text-base">Continue to Compose</span><ChevronRight size={20} /></button>
                         </div>
                      </div>
                  </div>
              ) : (
                  // COMPOSE STEP (Same as before)
                  <div className="h-full flex flex-col p-10 animate-in fade-in slide-in-from-right-4 duration-300 overflow-y-auto custom-scrollbar bg-slate-50/10">
                      <div className="max-w-4xl mx-auto w-full space-y-10 py-6">
                          <div className="space-y-4"><label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Campaign Name</label><input type="text" placeholder="e.g. Summer Sale Promo 2024" className="w-full px-6 py-5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none font-bold text-slate-900 placeholder:text-slate-300 transition-all shadow-sm text-lg hover:border-slate-300" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></div>
                          <div className="space-y-4">
                              <div className="flex justify-between items-end px-1"><label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Message Content</label><button className="text-xs font-bold text-indigo-600 flex items-center gap-2 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors border border-transparent hover:border-indigo-100"><Sparkles size={16} /><span>AI Assistant</span></button></div>
                              <div className="relative group bg-white rounded-3xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary hover:border-slate-300 transition-all">
                                  <textarea className="w-full h-80 p-8 bg-transparent border-none rounded-2xl focus:ring-0 outline-none resize-none text-base text-slate-900 font-medium leading-relaxed placeholder:text-slate-300" placeholder="Hello {{name}}, we have a special offer for you..." value={message} onChange={(e) => setMessage(e.target.value)} />
                                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                      <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-1 max-w-[70%]"><button onClick={() => insertVariable('name')} className="px-4 py-2 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"><Variable size={14} className="text-primary" /><span>Name</span></button><button onClick={() => insertVariable('company')} className="px-4 py-2 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"><Variable size={14} className="text-primary" /><span>Company</span></button>{customColumns.map(col => (<button key={col} onClick={() => insertVariable(col)} className="px-4 py-2 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"><Variable size={14} className="text-primary" /><span>{col}</span></button>))}</div>
                                      <span className="text-xs font-bold text-slate-400 px-3 py-1">{message.length} chars</span>
                                  </div>
                              </div>
                          </div>
                          <div className="pt-10 flex items-center justify-between border-t border-slate-200">
                              <button onClick={() => setStep(1)} className="text-base font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 rounded-xl"><ArrowLeft size={20} /> Back</button>
                              <div className="flex items-center gap-8">
                                  <div className="text-right hidden sm:block"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Estimated Reach</p><div className="flex items-center justify-end gap-2"><Users size={20} className="text-primary" /><p className="text-xl font-bold text-slate-900">{selectedContactIds.size}</p></div></div>
                                  <button onClick={handleSend} disabled={!message || !campaignName} className="px-10 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-hover shadow-lg shadow-primary/30 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-3 transform active:scale-95 hover:-translate-y-0.5 text-base"><Send size={20} /><span>Send Campaign</span></button>
                              </div>
                          </div>
                      </div>
                  </div>
              )}
            </div>
          </div>
          <div className="hidden 2xl:flex flex-col items-center w-[400px] flex-shrink-0 animate-in fade-in slide-in-from-right-8 duration-500 delay-100 pt-8">
             <div className="sticky top-6">
               <div className="text-center mb-10"><h3 className="font-display font-bold text-slate-900 text-2xl">Live Preview</h3><p className="text-base text-slate-500 font-medium mt-1">See how it looks on a device</p></div>
               <MessagePreview />
             </div>
          </div>
        </div>
      )}

      {/* Analytics Overlay Drawer */}
      {selectedCampaign && analyticsData && (
        <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={() => setSelectedCampaignId(null)}
            ></div>

            {/* Drawer Content */}
            <div className="w-[900px] h-full bg-slate-50 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col relative overflow-hidden">
                {/* Header */}
                <div className="px-8 py-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                   <div>
                       <div className="flex items-center gap-3 mb-1">
                           <h2 className="font-display font-bold text-2xl text-slate-900">{selectedCampaign.name}</h2>
                           <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 uppercase tracking-wide">
                               {selectedCampaign.status}
                           </span>
                       </div>
                       <p className="text-slate-500 font-medium text-sm flex items-center gap-2">
                           <Clock size={14} /> Sent on {new Date(selectedCampaign.dateSent).toLocaleString()}
                       </p>
                   </div>
                   <button 
                        onClick={() => setSelectedCampaignId(null)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                   >
                       <X size={24} />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Delivered</p>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-bold text-slate-900">{selectedCampaign.stats?.delivered}</p>
                                <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">98%</div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Read Rate</p>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-bold text-slate-900">{selectedCampaign.stats ? Math.round((selectedCampaign.stats.read / selectedCampaign.stats.delivered) * 100) : 0}%</p>
                                <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg flex items-center gap-1"><ArrowUpRight size={12}/> 4%</div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Replies</p>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-bold text-slate-900">{selectedCampaign.stats?.replied}</p>
                                <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1">
                                    <MessageCircle size={12} /> {selectedCampaign.stats ? Math.round((selectedCampaign.stats.replied / selectedCampaign.stats.read) * 100) : 0}%
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Clicks</p>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-bold text-slate-900">{selectedCampaign.stats?.clicked}</p>
                                <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">N/A</div>
                            </div>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-2 gap-6 h-[400px]">
                        {/* Funnel Chart */}
                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
                            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <BarChart3 size={20} className="text-primary" />
                                Conversion Funnel
                            </h3>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analyticsData.funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12, fontWeight: 600}} width={60} />
                                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none'}} itemStyle={{color: '#fff'}} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                                            {analyticsData.funnelData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Engagement Timeline */}
                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
                            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <Clock size={20} className="text-primary" />
                                Engagement Over Time
                            </h3>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={analyticsData.timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorOpen" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorReply" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12}} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12}} />
                                        <Tooltip contentStyle={{backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none'}} />
                                        <Area type="monotone" dataKey="open" stroke="#10B981" fillOpacity={1} fill="url(#colorOpen)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="reply" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorReply)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Activity Feed */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-900 text-lg">Recent Activity</h3>
                            <button className="text-sm font-bold text-primary hover:underline">View All</button>
                        </div>
                        <div className="space-y-6">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex gap-4 items-start">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                                        JD
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-slate-800 font-medium">
                                            <span className="font-bold text-slate-900">John Doe</span> {i === 1 ? 'replied to message' : i % 2 === 0 ? 'read message' : 'received message'}
                                        </p>
                                        <p className="text-xs text-slate-400 font-medium mt-1">2 mins ago</p>
                                    </div>
                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${i === 1 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {i === 1 ? 'Replied' : i % 2 === 0 ? 'Read' : 'Delivered'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
    