import React, { useState } from 'react';
import {
  CalendarDays,
  Images,
  Scissors,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { useSmartDockVisibility } from '../../hooks/useSmartDockVisibility';
import type { AdminTab } from '../../types/booking';
import { AdminScheduleTab } from './AdminScheduleTab';
import { AdminClientsTab } from './AdminClientsTab';
import { AdminMediaTab } from './AdminMediaTab';
import {
  AdminProfessionalsTab,
  AdminServicesTab,
} from './AdminCatalogTab';
import { AdminSettingsTab } from './AdminSettingsTab';

const ADMIN_NAV: Array<{
  id: AdminTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'schedule', label: 'Agenda e Horários', mobileLabel: 'Agenda', icon: CalendarDays },
  { id: 'clients', label: 'Clientes', mobileLabel: 'Clientes', icon: Users },
  { id: 'services', label: 'Serviços', mobileLabel: 'Serviços', icon: Scissors },
  { id: 'professionals', label: 'Profissionais', mobileLabel: 'Equipe', icon: UserCheck },
  { id: 'media', label: 'Galeria', mobileLabel: 'Galeria', icon: Images },
  { id: 'settings', label: 'Configurações', mobileLabel: 'Ajustes', icon: Settings },
];

export function AdminDashboard() {
  const { firebaseUser, settings } = useBooking();
  const [activeTab, setActiveTab] = useState<AdminTab>('schedule');
  const isMobileDockVisible = useSmartDockVisibility(`admin:${activeTab}`);

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-5 lg:py-7">
      <div className="flex flex-col lg:flex-row gap-5 lg:gap-6 items-start">
        {/* Desktop iOS Dark Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 space-y-4 sticky top-20">
          <nav
            aria-label="Navegação do painel administrativo"
            className="flex flex-col gap-1.5 rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-2"
          >
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] text-sm font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-[#8c1d0e] text-white shadow-sm'
                      : 'text-[#aeaeb2] hover:text-white hover:bg-[#2c2c2e]/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {firebaseUser && (
            <div className="flex items-center gap-3 rounded-[18px] bg-[#1c1c1e] border border-white/[0.08] p-3.5 text-xs">
              {settings.adminAvatarUrl ? (
                <img
                  src={settings.adminAvatarUrl}
                  alt="Perfil do administrador"
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-white/15 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#30d158]/15 text-[#30d158] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-semibold text-[#f5f5f7]">Sessão protegida</div>
                <div className="text-[#8e8e93] truncate">{firebaseUser.email}</div>
              </div>
            </div>
          )}
        </aside>

        {/* Main Workspace */}
        <div className="flex-1 min-w-0 w-full">
          {activeTab === 'schedule' && <AdminScheduleTab />}
          {activeTab === 'clients' && <AdminClientsTab />}
          {activeTab === 'services' && <AdminServicesTab />}
          {activeTab === 'professionals' && <AdminProfessionalsTab />}
          {activeTab === 'media' && <AdminMediaTab />}
          {activeTab === 'settings' && <AdminSettingsTab />}
        </div>
      </div>

      {/* Mobile & iOS Floating Glass Bottom Tab Bar */}
      <div
        className={`lg:hidden fixed bottom-3 inset-x-0 z-40 pb-safe px-3 flex justify-center pointer-events-none transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isMobileDockVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-[140%] opacity-0'
        }`}
      >
        <nav
          aria-label="Navegação rápida do painel"
          data-dock-visible={isMobileDockVisible ? 'true' : 'false'}
          className={`w-full max-w-md grid grid-cols-6 gap-0.5 p-1.5 rounded-[28px] bg-[#161618]/88 backdrop-blur-2xl border border-white/[0.14] ring-1 ring-inset ring-white/[0.06] shadow-[0_14px_38px_rgba(0,0,0,0.72)] ${
            isMobileDockVisible ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                tabIndex={isMobileDockVisible ? 0 : -1}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => selectTab(item.id)}
                className={`min-h-[48px] px-1 py-1.5 rounded-[20px] flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                  isActive
                    ? 'bg-[#8c1d0e] text-white shadow-[0_4px_12px_rgba(140,29,14,0.45)]'
                    : 'text-[#8e8e93] hover:text-[#f5f5f7]'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="text-[10px] font-semibold leading-none whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
