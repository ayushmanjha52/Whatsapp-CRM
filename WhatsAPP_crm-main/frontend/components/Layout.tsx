import React, { useState, useEffect } from 'react';
import { LayoutDashboard, MessageSquare, Kanban, Radio, Settings, LogOut, Bell, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useApp } from '../store';

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

const SidebarItem: React.FC<{
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, isActive, isCollapsed, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-5'} py-4 rounded-xl transition-all duration-300 group relative ${
      isActive 
        ? 'bg-primary text-white shadow-glow' 
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
    }`}
    title={isCollapsed ? label : undefined}
  >
    <Icon size={22} className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'} flex-shrink-0 transition-colors`} />
    {!isCollapsed && (
        <span className="font-medium text-base tracking-wide whitespace-nowrap overflow-hidden">{label}</span>
    )}
    {isCollapsed && (
        <div className="absolute left-full ml-3 px-3 py-2 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg font-medium">
            {label}
        </div>
    )}
  </button>
);

const Toast: React.FC<{ message: string | null }> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-8 py-5 rounded-2xl shadow-2xl flex items-center space-x-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300 border border-slate-700/50">
      <div className="bg-emerald-500 rounded-full p-1.5 shadow-lg shadow-emerald-500/20">
        <CheckCircle2 size={20} className="text-white" />
      </div>
      <span className="font-bold text-base tracking-wide">{message}</span>
    </div>
  );
};

export const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const { currentUser, activePage, setActivePage, notification } = useApp();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans text-base">
      {/* Sidebar */}
      <aside 
        className={`${
          isCollapsed ? 'w-24' : 'w-72'
        } bg-slate-900 flex flex-col flex-shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out relative border-r border-slate-800`}
      >
        {/* Toggle Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-full p-1.5 shadow-lg z-30 transition-colors hover:scale-110 active:scale-95 hidden md:flex"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="p-5 flex flex-col h-full overflow-hidden">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-4'} text-white mb-12 mt-4 h-12 transition-all`}>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
              <MessageSquare size={24} className="text-white" />
            </div>
            {!isCollapsed && (
                <span className="font-display font-bold text-2xl tracking-tight whitespace-nowrap animate-in fade-in duration-300">WhatsApp CRM</span>
            )}
          </div>

          <nav className="space-y-2 flex-1">
            <SidebarItem 
              icon={LayoutDashboard} 
              label="Dashboard" 
              isActive={activePage === 'dashboard'} 
              isCollapsed={isCollapsed}
              onClick={() => setActivePage('dashboard')} 
            />
            <SidebarItem 
              icon={MessageSquare} 
              label="Inbox" 
              isActive={activePage === 'inbox'} 
              isCollapsed={isCollapsed}
              onClick={() => setActivePage('inbox')} 
            />
            <SidebarItem 
              icon={Kanban} 
              label="Pipeline" 
              isActive={activePage === 'pipeline'} 
              isCollapsed={isCollapsed}
              onClick={() => setActivePage('pipeline')} 
            />
            <SidebarItem 
              icon={Radio} 
              label="Broadcast" 
              isActive={activePage === 'broadcast'} 
              isCollapsed={isCollapsed}
              onClick={() => setActivePage('broadcast')} 
            />
          </nav>

          <div className="mt-auto pt-8 border-t border-slate-800/50">
            <div className="space-y-2">
                <SidebarItem 
                    icon={Settings} 
                    label="Settings" 
                    isActive={activePage === 'settings'} 
                    isCollapsed={isCollapsed}
                    onClick={() => setActivePage('settings')} 
                />
                <button 
                    onClick={onLogout}
                    className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-5'} py-4 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-xl transition-all group relative`}
                    title={isCollapsed ? "Logout" : ""}
                >
                    <LogOut size={22} className="flex-shrink-0" />
                    {!isCollapsed && <span className="font-medium text-base whitespace-nowrap">Logout</span>}
                    {isCollapsed && (
                        <div className="absolute left-full ml-3 px-3 py-2 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg font-medium">
                            Logout
                        </div>
                    )}
                </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative min-w-0 transition-all duration-300">
        {/* Top Header */}
        <header className="h-24 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-10 flex-shrink-0 z-10 sticky top-0">
          <h2 className="font-display font-bold text-3xl text-slate-800 capitalize tracking-tight">
            {activePage}
          </h2>
          
          <div className="flex items-center space-x-8">
            <button className="relative p-2.5 text-slate-400 hover:text-primary transition-colors">
              <Bell size={24} />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-danger rounded-full ring-2 ring-white"></span>
            </button>
            <div className="flex items-center space-x-4 pl-8 border-l border-slate-200">
              <div className="text-right hidden md:block leading-tight">
                <p className="text-base font-bold text-slate-900">{currentUser.name}</p>
                <p className="text-sm text-slate-500 font-medium">{currentUser.role}</p>
              </div>
              <img 
                src={currentUser.avatar} 
                alt="Profile" 
                className="w-12 h-12 rounded-full border-2 border-white shadow-md object-cover ring-2 ring-slate-100"
              />
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto bg-slate-50 p-8 lg:p-10">
          <div className="max-w-[1920px] mx-auto h-full">
            {children}
          </div>
        </div>
        
        {/* Global Toast Notification */}
        <Toast message={notification} />
      </main>
    </div>
  );
};