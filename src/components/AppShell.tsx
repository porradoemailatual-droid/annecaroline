import React from 'react';
import {
  CalendarCheck2,
  ChevronLeft,
  ExternalLink,
  Lock,
  LogOut,
  Scissors,
} from 'lucide-react';
import { useBooking } from '../context/BookingContext';
import { useSmartDockVisibility } from '../hooks/useSmartDockVisibility';
import {
  getWatermarkOpacityClass,
  isValidHeaderLogoUrl,
  normalizeHeaderLogoMode,
} from '../utils/branding';
import type { AppRoute, ClientTab } from '../types/booking';

interface AppShellProps {
  route: AppRoute;
  clientTab: ClientTab;
  mobileBookingStep: 'services' | 'schedule';
  onNavigateRoute: (route: AppRoute) => void;
  onChangeClientTab: (tab: ClientTab) => void;
  onBackMobileStep: () => void;
  children: React.ReactNode;
}

export function AppShell({
  route,
  clientTab,
  mobileBookingStep,
  onNavigateRoute,
  onChangeClientTab,
  onBackMobileStep,
  children,
}: AppShellProps) {
  const { settings, isAdminUnlocked, lockAdminSession, toastMessage, clearToast } = useBooking();
  const isClientDockVisible = useSmartDockVisibility(`${route}:${clientTab}:${mobileBookingStep}`);

  const headerLogoUrl = isValidHeaderLogoUrl(settings.headerLogoUrl)
    ? settings.headerLogoUrl
    : '';
  const headerLogoMode = normalizeHeaderLogoMode(settings.headerLogoMode);
  const showHeaderLogo =
    Boolean(headerLogoUrl) && (headerLogoMode === 'logo' || headerLogoMode === 'both');
  const showHeaderWatermark =
    Boolean(headerLogoUrl) && (headerLogoMode === 'watermark' || headerLogoMode === 'both');
  const watermarkOpacityClass = getWatermarkOpacityClass(settings.headerWatermarkOpacity);

  // Admin locked screen renders its own full-viewport iOS Lock Screen
  if (route === 'admin' && !isAdminUnlocked) {
    return (
      <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col">
        <main className="flex-1 flex flex-col">{children}</main>
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm z-50 rounded-2xl bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 px-4 py-3 text-sm text-[#f5f5f7] shadow-2xl flex items-center justify-between gap-3"
          >
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={clearToast}
              aria-label="Fechar aviso"
              className="text-xs font-semibold text-[#e07a68] hover:text-white shrink-0 min-h-[36px] px-2"
            >
              OK
            </button>
          </div>
        )}
      </div>
    );
  }

  // Unlocked Admin Panel shell (iOS & Mobile optimized)
  if (route === 'admin' && isAdminUnlocked) {
    return (
      <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col">
        <header className="sticky top-0 z-30 pt-safe bg-[#121214]/88 backdrop-blur-2xl border-b border-white/[0.08] overflow-hidden">
          {showHeaderWatermark && (
            <div
              aria-hidden="true"
              className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden"
            >
              <img
                src={headerLogoUrl}
                alt=""
                className={`max-h-12 w-auto max-w-[220px] object-contain ${watermarkOpacityClass}`}
              />
            </div>
          )}
          <div className="relative z-10 max-w-7xl mx-auto h-14 px-3.5 sm:px-6 flex items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {showHeaderLogo ? (
                <img
                  src={headerLogoUrl}
                  alt={settings.businessName}
                  className="h-8 w-auto max-w-[80px] object-contain rounded-lg shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-[#8c1d0e] flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-sm sm:text-base font-semibold tracking-tight text-[#f5f5f7] truncate block leading-tight">
                  Painel
                </span>
                <span className="text-[11px] text-[#8e8e93] truncate block leading-tight">
                  {settings.businessName}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {settings.adminAvatarUrl && (
                <img
                  src={settings.adminAvatarUrl}
                  alt="Foto do perfil administrativo"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover border border-white/15 shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  onNavigateRoute('client');
                  onChangeClientTab('book');
                }}
                aria-label="Ver site público"
                className="min-h-[40px] px-3 sm:px-3.5 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-95 text-xs sm:text-sm font-medium text-[#f5f5f7] inline-flex items-center gap-1.5 whitespace-nowrap transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>Site</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await lockAdminSession();
                  onNavigateRoute('client');
                }}
                aria-label="Bloquear e sair do painel"
                className="min-h-[40px] px-3 sm:px-3.5 rounded-xl bg-[#3a1615] hover:bg-[#4e1d1b] active:scale-95 text-xs sm:text-sm font-medium text-[#ff6961] inline-flex items-center gap-1.5 whitespace-nowrap transition-all"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Bloquear / Sair</span>
                <span className="sm:hidden">Sair</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-28 lg:pb-12">{children}</main>

        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-24 lg:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 rounded-2xl bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 px-4 py-3 text-sm text-[#f5f5f7] shadow-2xl flex items-center justify-between gap-3"
          >
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={clearToast}
              aria-label="Fechar aviso"
              className="text-xs font-semibold text-[#e07a68] hover:text-white shrink-0 min-h-[36px] px-2"
            >
              OK
            </button>
          </div>
        )}
      </div>
    );
  }

  // Public Client Shell (Zero Admin Buttons in Header or Bottom Tab Bar)
  const mobileTitle =
    clientTab === 'appointments' ? 'Meus Horários' : settings.businessName;

  const showMobileBack = clientTab === 'book' && mobileBookingStep === 'schedule';

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col">
      {/* iOS Frosted Navigation Bar with Optional Logo / Watermark */}
      <header className="sticky top-0 z-30 pt-safe bg-[#121214]/82 backdrop-blur-2xl border-b border-white/[0.08] overflow-hidden">
        {showHeaderWatermark && (
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden px-6"
          >
            <img
              src={headerLogoUrl}
              alt=""
              className={`max-h-12 w-auto max-w-[240px] object-contain ${watermarkOpacityClass}`}
            />
          </div>
        )}

        <div className="relative z-10 max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center justify-between gap-6">
          {/* Mobile Back / Brand */}
          <div className="flex items-center gap-2 min-w-0">
            {showMobileBack && (
              <button
                type="button"
                onClick={onBackMobileStep}
                aria-label="Voltar para serviços"
                className="lg:hidden inline-flex items-center gap-0.5 -ml-2 pr-2 min-h-[44px] text-[#e07a68] active:opacity-70 text-sm font-medium shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Serviços</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onChangeClientTab('book');
                onBackMobileStep();
              }}
              className={`items-center gap-2.5 text-base sm:text-lg font-semibold tracking-tight text-[#f5f5f7] whitespace-nowrap min-w-0 ${
                showMobileBack ? 'hidden lg:inline-flex' : 'inline-flex'
              }`}
            >
              {showHeaderLogo && (
                <img
                  src={headerLogoUrl}
                  alt={settings.businessName}
                  className="h-8 w-auto max-w-[104px] object-contain rounded-lg shrink-0"
                />
              )}
              <span className="md:hidden truncate">{mobileTitle}</span>
              <span className="hidden md:inline truncate">{settings.businessName}</span>
            </button>
          </div>

          {/* Desktop 2-item iOS Segmented / Text Navigation (No Admin CTA) */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-[#1c1c1e]/90 border border-white/[0.07] shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeClientTab('book')}
              className={`px-4 py-1.5 rounded-[10px] text-sm font-medium whitespace-nowrap transition-all ${
                clientTab === 'book'
                  ? 'bg-[#8c1d0e] text-white shadow-sm'
                  : 'text-[#aeaeb2] hover:text-white'
              }`}
            >
              Agendar
            </button>
            <button
              type="button"
              onClick={() => onChangeClientTab('appointments')}
              className={`px-4 py-1.5 rounded-[10px] text-sm font-medium whitespace-nowrap transition-all ${
                clientTab === 'appointments'
                  ? 'bg-[#8c1d0e] text-white shadow-sm'
                  : 'text-[#aeaeb2] hover:text-white'
              }`}
            >
              Meus Horários
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Discreet Footer with Subtle Professional Area Link */}
      <footer className="border-t border-white/[0.06] mt-16 md:mt-10 pb-24 md:pb-8 pt-6 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#636366]">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1">
            <span className="text-[#8e8e93] font-medium">{settings.businessName}</span>
            {settings.address && (
              <>
                <span aria-hidden="true">·</span>
                <span>{settings.address}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigateRoute('admin')}
            className="inline-flex items-center gap-1.5 text-[#8e8e93] hover:text-[#f5f5f7] transition-colors py-1 min-h-[36px]"
          >
            <Lock className="w-3 h-3" />
            <span>Área do Profissional</span>
          </button>
        </div>
      </footer>

      {/* iOS Floating Toast Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 left-4 md:left-auto md:max-w-sm z-50 rounded-2xl bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 px-4 py-3 text-sm text-[#f5f5f7] shadow-2xl flex items-center justify-between gap-3 transition-[transform,bottom] duration-300 ${
            isClientDockVisible ? 'bottom-24 md:bottom-6' : 'bottom-6'
          }`}
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={clearToast}
            aria-label="Fechar aviso"
            className="text-xs font-semibold text-[#e07a68] hover:text-white shrink-0 min-h-[36px] px-2"
          >
            OK
          </button>
        </div>
      )}

      {/* Smart Floating iOS Glass Dock (Auto-hides while reading/typing/modal, appears only when needed) */}
      <div
        className={`md:hidden fixed bottom-4 inset-x-0 z-40 pb-safe flex justify-center px-4 pointer-events-none transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isClientDockVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-[145%] opacity-0'
        }`}
      >
        <nav
          aria-label="Navegação inferior"
          data-dock-visible={isClientDockVisible ? 'true' : 'false'}
          className={`inline-flex items-center gap-1.5 p-1.5 rounded-full bg-[#18181b]/80 backdrop-blur-2xl border border-white/[0.15] ring-1 ring-inset ring-white/[0.07] shadow-[0_14px_38px_rgba(0,0,0,0.72)] ${
            isClientDockVisible ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <button
            type="button"
            tabIndex={isClientDockVisible ? 0 : -1}
            aria-current={clientTab === 'book' ? 'page' : undefined}
            onClick={() => {
              onChangeClientTab('book');
              onBackMobileStep();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-h-[44px] px-5 rounded-full inline-flex items-center justify-center gap-2 text-[13px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
              clientTab === 'book'
                ? 'bg-[#8c1d0e] text-white shadow-[0_4px_14px_rgba(140,29,14,0.45)]'
                : 'text-[#aeaeb2] hover:text-white'
            }`}
          >
            <Scissors className="w-[17px] h-[17px] shrink-0" />
            <span>Agendar</span>
          </button>

          <button
            type="button"
            tabIndex={isClientDockVisible ? 0 : -1}
            aria-current={clientTab === 'appointments' ? 'page' : undefined}
            onClick={() => {
              onChangeClientTab('appointments');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-h-[44px] px-5 rounded-full inline-flex items-center justify-center gap-2 text-[13px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
              clientTab === 'appointments'
                ? 'bg-[#8c1d0e] text-white shadow-[0_4px_14px_rgba(140,29,14,0.45)]'
                : 'text-[#aeaeb2] hover:text-white'
            }`}
          >
            <CalendarCheck2 className="w-[17px] h-[17px] shrink-0" />
            <span>Meus Horários</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
