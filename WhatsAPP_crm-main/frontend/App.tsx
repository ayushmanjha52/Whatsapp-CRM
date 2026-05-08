import React, { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Pipeline } from './pages/Pipeline';
import { Broadcast } from './pages/Broadcast';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { LandingPage } from './pages/LandingPage';
import { useApp } from './store';
import { getMe, logout as apiLogout } from './api/auth';

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const { activePage, setActivePage } = useApp();

  useEffect(() => {
    getMe()
      .then(u => { if (u && u.id) setIsAuthenticated(true) })
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    if (qs.get('onboarded') === '1') {
      setActivePage('settings')
      try { history.replaceState(null, '', window.location.pathname) } catch {}
    }
  }, [])

  // Route: Landing Page (Public)
  if (activePage === 'landing') {
    return <LandingPage onGetStarted={() => setActivePage('dashboard')} />;
  }

  // Route: Authentication Guard
  if (!authChecked) {
    return null
  }
  if (!isAuthenticated) {
    return <Login onLogin={() => {
        setIsAuthenticated(true);
        setActivePage('dashboard');
    }} />;
  }

  // Routes: Authenticated Pages
  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />;
      case 'inbox': return <Inbox />;
      case 'pipeline': return <Pipeline />;
      case 'broadcast': return <Broadcast />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout 
      onLogout={async () => {
          try { await apiLogout() } catch {}
          setIsAuthenticated(false);
          setActivePage('landing');
      }}
    >
      {renderPage()}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AppContent />
  );
};

export default App;
