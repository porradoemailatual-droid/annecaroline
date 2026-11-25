import React, { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BookingProvider, useBooking } from './context/BookingContext';
import { AppShell } from './components/AppShell';
import { BookingFlow } from './components/client/BookingFlow';
import { MyAppointmentsView } from './components/client/MyAppointmentsView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminAuthGate } from './components/admin/AdminAuthGate';
import type { AppRoute, ClientTab } from './types/booking';

function resolveRouteFromPath(pathname: string): AppRoute {
  return pathname.startsWith('/admin') ? 'admin' : 'client';
}

function AppContent() {
  const { isAdminUnlocked } = useBooking();
  const [route, setRoute] = useState<AppRoute>(() =>
    resolveRouteFromPath(window.location.pathname)
  );
  const [clientTab, setClientTab] = useState<ClientTab>('book');
  const [mobileBookingStep, setMobileBookingStep] = useState<'services' | 'schedule'>('services');

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateRoute = useCallback((nextRoute: AppRoute) => {
    const targetPath = nextRoute === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <AppShell
      route={route}
      clientTab={clientTab}
      mobileBookingStep={mobileBookingStep}
      onNavigateRoute={navigateRoute}
      onChangeClientTab={(nextTab) => {
        setClientTab(nextTab);
        if (nextTab === 'book') {
          setMobileBookingStep('services');
        }
      }}
      onBackMobileStep={() => setMobileBookingStep('services')}
    >
      {route === 'admin' ? (
        isAdminUnlocked ? (
          <AdminDashboard />
        ) : (
          <AdminAuthGate onBackToSite={() => navigateRoute('client')} />
        )
      ) : clientTab === 'book' ? (
        <BookingFlow
          mobileStep={mobileBookingStep}
          onChangeMobileStep={setMobileBookingStep}
          onGoToAppointments={() => setClientTab('appointments')}
        />
      ) : (
        <MyAppointmentsView
          onNewBooking={() => {
            setClientTab('book');
            setMobileBookingStep('services');
          }}
        />
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BookingProvider>
        <AppContent />
      </BookingProvider>
    </ErrorBoundary>
  );
}
