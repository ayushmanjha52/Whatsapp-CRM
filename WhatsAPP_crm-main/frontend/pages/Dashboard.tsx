import React from 'react';
import { useApp } from '../store';
import { ArrowUpRight, ArrowDownRight, Users, MessageSquare, Clock, AlertCircle, CheckCircle2, MoreHorizontal, Sparkles, Shield, TrendingUp } from 'lucide-react';
import { PipelineStage } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  LineChart, Line, CartesianGrid, Cell
} from 'recharts';

// --- Components ---

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: React.ElementType;
  variant?: 'default' | 'danger' | 'warning';
}> = ({ title, value, subValue, trend, trendValue, icon: Icon, variant = 'default' }) => {
  const getColors = () => {
    switch (variant) {
      case 'danger': return 'bg-danger/10 text-danger';
      case 'warning': return 'bg-warning/10 text-warning';
      default: return 'bg-blue-50 text-primary';
    }
  };

  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-slate-400';
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : TrendingUp;

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 group">
      <div className="flex justify-between items-start mb-6">
        <div className={`p-4 rounded-2xl ${getColors()} transition-transform group-hover:scale-110`}>
          <Icon className="w-7 h-7" strokeWidth={2.5} />
        </div>
        {trend && (
          <div className={`flex items-center text-sm font-bold ${trendColor} bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100`}>
            {trendValue} <TrendIcon size={14} className="ml-1.5" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider">{title}</h3>
        <p className="text-5xl font-display font-bold text-slate-900 tracking-tight">{value}</p>
        {subValue && <p className="text-sm text-slate-400 font-medium pt-1">{subValue}</p>}
      </div>
    </div>
  );
};

const AIInsightCard: React.FC = () => (
  <div className="bg-gradient-to-br from-primary to-violet-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 h-full flex flex-col justify-center">
    <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-white/20 transition-all"></div>
    <div className="flex items-center space-x-3 mb-4 relative z-10">
      <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
         <Sparkles className="w-5 h-5 text-amber-300" />
      </div>
      <span className="text-sm font-bold uppercase tracking-wider text-blue-100">AI Insight</span>
    </div>
    <p className="text-base font-medium leading-relaxed opacity-90 relative z-10">
      Your lead response rate improved by <span className="font-bold text-white text-xl">12%</span> this week. 
      Peak customer activity is <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded-lg">10am - 1pm</span>.
    </p>
  </div>
);

// --- Mock Data ---

const VOLUME_DATA = [
  { name: 'Mon', inbound: 45, outbound: 32 },
  { name: 'Tue', inbound: 52, outbound: 48 },
  { name: 'Wed', inbound: 38, outbound: 45 },
  { name: 'Thu', inbound: 65, outbound: 55 },
  { name: 'Fri', inbound: 48, outbound: 52 },
  { name: 'Sat', inbound: 25, outbound: 15 },
  { name: 'Sun', inbound: 18, outbound: 12 },
];

const RESPONSE_TIME_DATA = [
  { range: '< 5m', count: 45 },
  { range: '5-30m', count: 32 },
  { range: '1-4h', count: 12 },
  { range: '> 24h', count: 5 },
];

// --- Main Component ---

export const Dashboard: React.FC = () => {
  const { contacts, tasks, setActivePage, setSelectedContactId } = useApp();

  // Metric Calculations
  const activeLeads = contacts.filter(c => c.stage === PipelineStage.ACTIVE || c.stage === PipelineStage.NEW);
  const missedMessages = contacts.filter(c => c.unreadCount > 0).length;
  
  const today = new Date();
  const followUpsToday = tasks.filter(t => {
    const taskDate = new Date(t.dueDate);
    return !t.completed && 
           taskDate.getDate() === today.getDate() &&
           taskDate.getMonth() === today.getMonth() &&
           taskDate.getFullYear() === today.getFullYear();
  });

  const recentConversations = [...contacts].sort((a, b) => 
    new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
  ).slice(0, 5);

  const navigateToContact = (contactId: string) => {
    setSelectedContactId(contactId);
    setActivePage('inbox');
  };

  return (
    <div className="space-y-10 pb-12">
      
      {/* Header Section with Date & Health */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="font-display font-bold text-4xl text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 font-medium mt-2 text-lg">Overview of your WhatsApp performance</p>
        </div>
        <div className="flex items-center space-x-4 bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
           <div className="flex items-center space-x-3 border-r border-slate-200 pr-6">
              <Shield className="w-5 h-5 text-emerald-500" strokeWidth={2.5} />
              <span className="text-base font-bold text-slate-700">Health: Good</span>
           </div>
           <select className="text-base font-bold text-slate-600 bg-transparent outline-none cursor-pointer">
             <option>Last 7 Days</option>
             <option>Last 30 Days</option>
             <option>This Month</option>
           </select>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <MetricCard 
          title="Avg Response Time" 
          value="12m" 
          subValue="2m faster than last week"
          trend="up"
          trendValue="14%"
          icon={Clock} 
        />
        <MetricCard 
          title="Missed Messages" 
          value={missedMessages} 
          subValue="Action required immediately"
          variant={missedMessages > 0 ? "danger" : "default"}
          trend={missedMessages > 0 ? "down" : "neutral"}
          trendValue="Needs Fix"
          icon={AlertCircle} 
        />
        <MetricCard 
          title="Follow-ups Today" 
          value={followUpsToday.length} 
          subValue={`${tasks.filter(t => !t.completed).length} total pending`}
          variant="warning"
          trend="neutral"
          trendValue="On Track"
          icon={CheckCircle2} 
        />
        <MetricCard 
          title="Active Leads" 
          value={activeLeads.length} 
          subValue="In pipeline"
          trend="up"
          trendValue="+3"
          icon={Users} 
        />
        {/* On smaller screens, the AI card might wrap or be hidden, but fits nicely in 5-col grid */}
        <div className="hidden xl:block">
           <AIInsightCard />
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Chart: Inbound vs Outbound */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-card flex flex-col h-[500px]">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="font-display font-bold text-xl text-slate-900">Message Volume</h3>
              <p className="text-base text-slate-400 font-medium">Inbound vs Outbound traffic</p>
            </div>
            <div className="flex space-x-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
               <span className="flex items-center text-sm font-bold text-slate-600 px-3 py-1"><div className="w-3 h-3 rounded-full bg-primary mr-2.5"></div> Inbound</span>
               <span className="flex items-center text-sm font-bold text-slate-600 px-3 py-1"><div className="w-3 h-3 rounded-full bg-slate-300 mr-2.5"></div> Outbound</span>
            </div>
          </div>
          <div className="flex-1 w-full -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={VOLUME_DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94A3B8', fontSize: 14, fontWeight: 500}} 
                  dy={15} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94A3B8', fontSize: 14, fontWeight: 500}} 
                />
                <Tooltip 
                  contentStyle={{backgroundColor: '#0F172A', color: '#fff', borderRadius: '16px', border: 'none', padding: '12px 16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'}} 
                  itemStyle={{color: '#fff', fontSize: '14px', fontWeight: 600}}
                  cursor={{stroke: '#E2E8F0', strokeWidth: 2}}
                />
                <Line 
                  type="monotone" 
                  dataKey="inbound" 
                  stroke="#2563EB" 
                  strokeWidth={5} 
                  dot={{r: 6, fill: '#2563EB', strokeWidth: 3, stroke: '#fff'}} 
                  activeDot={{r: 8, strokeWidth: 0}}
                />
                <Line 
                  type="monotone" 
                  dataKey="outbound" 
                  stroke="#CBD5E1" 
                  strokeWidth={5} 
                  dot={{r: 6, fill: '#CBD5E1', strokeWidth: 3, stroke: '#fff'}} 
                  activeDot={{r: 8, strokeWidth: 0}}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Secondary Chart: Response Time Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-card flex flex-col h-[500px]">
          <div className="mb-8">
            <h3 className="font-display font-bold text-xl text-slate-900">Reply Time</h3>
            <p className="text-base text-slate-400 font-medium">Speed distribution</p>
          </div>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={RESPONSE_TIME_DATA} layout="vertical" barSize={32}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#F1F5F9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="range" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false}
                  width={70}
                  tick={{fill: '#64748B', fontSize: 14, fontWeight: 600}} 
                />
                <Tooltip 
                   cursor={{fill: 'transparent'}}
                   contentStyle={{backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none', padding: '10px 14px'}} 
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {RESPONSE_TIME_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : index === 1 ? '#2563EB' : index === 2 ? '#F59E0B' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
             <p className="text-base text-slate-500 font-medium">
               <span className="font-bold text-slate-900">77%</span> of messages replied within 30m
             </p>
          </div>
        </div>
      </div>

      {/* Row 3: Actionable Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Recent Conversations */}
        <div className="lg:col-span-1 bg-white p-0 rounded-3xl border border-slate-100 shadow-card overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-display font-bold text-lg text-slate-900">Priority Inbox</h3>
            <button 
                onClick={() => setActivePage('inbox')}
                className="text-primary text-sm font-bold hover:underline"
            >
                View All
            </button>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[400px] custom-scrollbar">
            {recentConversations.map(contact => (
              <div 
                key={contact.id} 
                onClick={() => navigateToContact(contact.id)}
                className="p-5 border-b border-slate-50 hover:bg-blue-50/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-start space-x-5">
                  <div className="relative">
                     <img src={contact.avatar} alt="" className="w-14 h-14 rounded-full object-cover ring-4 ring-white shadow-sm group-hover:ring-blue-100 transition-all" />
                     {contact.unreadCount > 0 && (
                       <span className="absolute -top-1 -right-1 w-6 h-6 bg-danger border-2 border-white rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm">
                         {contact.unreadCount}
                       </span>
                     )}
                  </div>
                  <div className="flex-1 min-w-0 py-1">
                    <div className="flex justify-between items-baseline mb-1.5">
                      <h4 className={`text-base font-bold truncate ${contact.unreadCount > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                        {contact.name}
                      </h4>
                      <span className="text-xs text-slate-400 font-bold whitespace-nowrap ml-2">
                        {new Date(contact.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-sm truncate leading-relaxed ${contact.unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500 font-medium'}`}>
                      {contact.lastMessage}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Summary */}
        <div className="lg:col-span-1 bg-white p-8 rounded-3xl border border-slate-100 shadow-card flex flex-col min-h-[400px]">
           <div className="flex justify-between items-center mb-8">
             <h3 className="font-display font-bold text-xl text-slate-900">Pipeline Health</h3>
             <MoreHorizontal className="text-slate-400 w-6 h-6 cursor-pointer hover:text-slate-600" />
           </div>
           
           <div className="space-y-6 flex-1">
             {[
               { stage: PipelineStage.NEW, count: contacts.filter(c => c.stage === PipelineStage.NEW).length, color: 'bg-blue-500' },
               { stage: PipelineStage.ACTIVE, count: contacts.filter(c => c.stage === PipelineStage.ACTIVE).length, color: 'bg-amber-500' },
               { stage: PipelineStage.FOLLOW_UP, count: contacts.filter(c => c.stage === PipelineStage.FOLLOW_UP).length, color: 'bg-violet-500' },
               { stage: PipelineStage.CONVERTED, count: contacts.filter(c => c.stage === PipelineStage.CONVERTED).length, color: 'bg-emerald-500' },
             ].map((item) => (
               <div key={item.stage} className="space-y-3">
                 <div className="flex justify-between text-sm font-bold">
                   <span className="text-slate-500 uppercase tracking-wider">{item.stage}</span>
                   <span className="text-slate-900 text-base">{item.count}</span>
                 </div>
                 <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                   <div 
                     className={`h-full rounded-full ${item.color} shadow-sm`} 
                     style={{ width: `${(item.count / contacts.length) * 100}%` }}
                   />
                 </div>
               </div>
             ))}
           </div>
           
           <div className="mt-8 pt-6 border-t border-slate-100">
                <button 
                    onClick={() => setActivePage('pipeline')}
                    className="w-full py-4 bg-slate-50 text-slate-700 text-sm font-bold rounded-2xl hover:bg-slate-100 hover:text-slate-900 transition-colors uppercase tracking-wide"
                >
                    Manage Deals
                </button>
           </div>
        </div>

        {/* Today's Follow-ups */}
        <div className="lg:col-span-1 bg-white p-8 rounded-3xl border border-slate-100 shadow-card flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-display font-bold text-xl text-slate-900">Follow-ups Today</h3>
            <span className="text-xs font-bold text-warning bg-warning/10 px-3 py-1.5 rounded-lg border border-warning/10">
              {followUpsToday.length} Pending
            </span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar max-h-[400px]">
            {followUpsToday.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-4 py-10">
                 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 opacity-30" />
                 </div>
                 <p className="text-base font-medium">All caught up for today!</p>
               </div>
            ) : (
              followUpsToday.map(task => (
                <div 
                    key={task.id} 
                    onClick={() => navigateToContact(task.contactId)}
                    className="p-5 bg-slate-50 border border-slate-100 rounded-2xl hover:border-warning/30 hover:shadow-md transition-all group cursor-pointer hover:bg-white"
                >
                   <div className="flex justify-between items-start mb-3">
                     <span className="text-xs font-bold text-slate-500 uppercase flex items-center bg-white px-2.5 py-1 rounded-lg border border-slate-100 shadow-sm">
                       <Clock size={12} className="mr-1.5" />
                       {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     </span>
                     <button className="text-slate-300 hover:text-emerald-500 transition-colors p-1.5 hover:bg-emerald-50 rounded-lg">
                       <CheckCircle2 size={20} />
                     </button>
                   </div>
                   <p className="text-base font-semibold text-slate-800 mb-2 leading-snug">{task.note}</p>
                   <p className="text-sm text-slate-500 font-medium">Contact: <span className="text-primary font-bold">{task.contactName}</span></p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};