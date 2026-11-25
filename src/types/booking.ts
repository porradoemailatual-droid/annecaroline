export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface ServiceItem {
  id: string;
  name: string;
  category: string;
  price: number;
  durationMinutes: number;
  imageUrl?: string;
  imageKey?: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Professional {
  id: string;
  name: string;
  specialty: string;
  avatarInitials: string;
  avatarUrl?: string;
  avatarKey?: string;
  active: boolean;
  /** 0 = Domingo ... 6 = Sábado */
  workDays: number[];
  createdAt: string;
  updatedAt: string;
}

export interface DaySchedule {
  open: boolean;
  start: string; // HH:mm
  end: string; // HH:mm
  breakStart?: string; // HH:mm
  breakEnd?: string; // HH:mm
}

export type WeeklySchedule = Record<string, DaySchedule>;

export type HeaderLogoMode = 'logo' | 'watermark' | 'both';
export type R2AssetCategory =
  | 'branding'
  | 'services'
  | 'profiles'
  | 'banners'
  | 'gallery'
  | 'private';

export interface MediaAsset {
  id: string;
  fileName: string;
  objectKey: string;
  category: R2AssetCategory;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  caption?: string;
  imageUrl: string;
  imageKey: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
export type PixProofMode = 'receipt_and_confirm' | 'whatsapp' | 'both';
export type PixPaymentStatus = 'not_required' | 'awaiting_verification' | 'paid' | 'rejected';

export interface BusinessSettings {
  businessName: string;
  phone: string;
  address: string;
  slotIntervalMinutes: number;
  weeklySchedule: WeeklySchedule;
  closedDates: string[]; // YYYY-MM-DD
  headerLogoKey?: string;
  headerLogoUrl?: string;
  headerLogoFileName?: string;
  headerLogoMimeType?: string;
  headerLogoSize?: number;
  headerLogoMode?: HeaderLogoMode;
  headerWatermarkOpacity?: number; // 6..35
  heroBannerKey?: string;
  heroBannerUrl?: string;
  heroBannerSubtitle?: string;
  adminAvatarKey?: string;
  adminAvatarUrl?: string;
  requireAdminConfirmation?: boolean;
  pixFeeEnabled?: boolean;
  pixFeePercentage?: number; // 1..100
  pixKeyType?: PixKeyType;
  pixKey?: string;
  pixBankName?: string;
  pixHolderName?: string;
  pixCity?: string;
  pixProofMode?: PixProofMode;
  pixWhatsappPhone?: string;
  updatedAt: string;
}

export interface BusySlot {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes: number;
  professionalId: string;
  kind: 'appointment' | 'blocked';
  ownerId: string;
  appointmentId?: string;
  reason?: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  userId: string;
  clientName: string;
  clientPhone: string;
  phoneHash: string;
  cancelToken: string;
  forSomeoneElse: boolean;
  guestName?: string;
  guestPhone?: string;
  professionalId: string;
  professionalName: string;
  serviceIds: string[];
  serviceNames: string[];
  totalPrice: number;
  totalDurationMinutes: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  notes?: string;
  status: AppointmentStatus;
  pixFeePercentage?: number;
  pixFeeAmount?: number;
  pixPaymentStatus?: PixPaymentStatus;
  pixReceiptKey?: string;
  pixReceiptFileName?: string;
  pixReceiptMimeType?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientLookupBooking {
  appointmentId: string;
  phoneHash: string;
  cancelToken: string;
  clientName?: string;
  clientPhone?: string;
  professionalId: string;
  professionalName: string;
  serviceNames: string[];
  totalPrice: number;
  totalDurationMinutes: number;
  date: string;
  startTime: string;
  notes?: string;
  status: AppointmentStatus;
  pixFeePercentage?: number;
  pixFeeAmount?: number;
  pixPaymentStatus?: PixPaymentStatus;
  hasPixReceipt?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientRecord {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  loyaltyPoints: number;
  totalVisits: number;
  totalSpent: number;
  lastVisitDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type ClientTab = 'book' | 'appointments';
export type AdminTab = 'schedule' | 'clients' | 'services' | 'professionals' | 'media' | 'settings';
export type AppRoute = 'client' | 'admin';
