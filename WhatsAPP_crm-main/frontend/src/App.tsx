import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Toaster } from './components/Toaster';
import { PageLoader } from './components/ui';
import { LandingPage } from './pages/Landing';
import { Login } from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inbox = lazy(() => import('./pages/inbox/Inbox'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Broadcasts = lazy(() => import('./pages/broadcast/Broadcasts'));
const CampaignWizard = lazy(() => import('./pages/broadcast/CampaignWizard'));
const CampaignDetail = lazy(() => import('./pages/broadcast/CampaignDetail'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Templates = lazy(() => import('./pages/Templates'));
const Settings = lazy(() => import('./pages/Settings'));

const Splash: React.FC = () => (
  <div className="h-screen flex items-center justify-center bg-background">
    <PageLoader />
  </div>
);

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
};

const PublicOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') ? next : '/dashboard'} replace />;
  }
  return <>{children}</>;
};

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  return <LandingPage onGetStarted={() => navigate(user ? '/dashboard' : '/signup')} />;
};

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<PublicOnly><Login mode="login" /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Login mode="signup" /></PublicOnly>} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
              <Route path="/inbox" element={<Suspense fallback={<PageLoader />}><Inbox /></Suspense>} />
              <Route path="/inbox/:waId" element={<Suspense fallback={<PageLoader />}><Inbox /></Suspense>} />
              <Route path="/pipeline" element={<Suspense fallback={<PageLoader />}><Pipeline /></Suspense>} />
              <Route path="/broadcast" element={<Suspense fallback={<PageLoader />}><Broadcasts /></Suspense>} />
              <Route path="/broadcast/new" element={<Suspense fallback={<PageLoader />}><CampaignWizard /></Suspense>} />
              <Route path="/broadcast/:id" element={<Suspense fallback={<PageLoader />}><CampaignDetail /></Suspense>} />
              <Route path="/contacts" element={<Suspense fallback={<PageLoader />}><Contacts /></Suspense>} />
              <Route path="/templates" element={<Suspense fallback={<PageLoader />}><Templates /></Suspense>} />
              <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
