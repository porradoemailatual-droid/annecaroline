import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import { createSeedData } from '../data/seedData';
import type {
  Appointment,
  AppointmentStatus,
  BusinessSettings,
  BusySlot,
  ClientLookupBooking,
  ClientRecord,
  GalleryItem,
  MediaAsset,
  PixPaymentStatus,
  Professional,
  R2AssetCategory,
  ServiceItem,
} from '../types/booking';
import {
  applyDocumentBranding,
  clampWatermarkOpacity,
  isValidHeaderLogoUrl,
  isValidR2ProxyUrl,
  normalizeHeaderLogoMode,
} from '../utils/branding';
import {
  clampPixFeePercentage,
  normalizePixKeyType,
  normalizePixPaymentStatus,
  normalizePixProofMode,
} from '../utils/pix';
import { deleteFileFromR2, uploadFileToR2 } from '../utils/r2Client';
import {
  formatDateISO,
  generateCancelToken,
  hashPhoneDigits,
  normalizePhoneDigits,
} from '../utils/schedule';
import {
  sanitizeClosedDates,
  sanitizeWeeklySchedule,
} from '../utils/settingsValidation';

const STORAGE_KEY = 'esmalteria_beleza_state_v2';
const LEGACY_STORAGE_KEY = 'esmalteria_beleza_state_v1';

interface LocalStoreShape {
  services: ServiceItem[];
  professionals: Professional[];
  settings: BusinessSettings;
  clients: ClientRecord[];
  appointments: Appointment[];
  busySlots: BusySlot[];
  deviceBookings: ClientLookupBooking[];
}

function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now()}-${rand}`;
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function loadInitialLocalStore(): LocalStoreShape {
  const seed = createSeedData(formatDateISO(new Date()));
  try {
    // Purge legacy v1 storage so stale prefilled profile data is completely cleared
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        services: seed.services,
        professionals: seed.professionals,
        settings: seed.settings,
        clients: seed.clients,
        appointments: seed.appointments,
        busySlots: seed.busySlots,
        deviceBookings: [],
      };
    }
    const parsed = JSON.parse(raw) as Partial<LocalStoreShape>;
    return {
      services:
        Array.isArray(parsed.services) && parsed.services.length > 0
          ? parsed.services
          : seed.services,
      professionals:
        Array.isArray(parsed.professionals) && parsed.professionals.length > 0
          ? parsed.professionals
          : seed.professionals,
      settings: parsed.settings ?? seed.settings,
      clients: Array.isArray(parsed.clients) ? parsed.clients : seed.clients,
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : seed.appointments,
      busySlots: Array.isArray(parsed.busySlots) ? parsed.busySlots : seed.busySlots,
      deviceBookings: Array.isArray(parsed.deviceBookings) ? parsed.deviceBookings : [],
    };
  } catch {
    return {
      services: seed.services,
      professionals: seed.professionals,
      settings: seed.settings,
      clients: seed.clients,
      appointments: seed.appointments,
      busySlots: seed.busySlots,
      deviceBookings: [],
    };
  }
}

export interface CreateBookingPayload {
  clientName: string;
  clientPhone: string;
  forSomeoneElse: boolean;
  guestName?: string;
  guestPhone?: string;
  professionalId: string;
  serviceIds: string[];
  date: string;
  startTime: string;
  notes?: string;
  status?: AppointmentStatus;
  saveToDevice?: boolean;
  pixFeePercentage?: number;
  pixFeeAmount?: number;
  pixPaymentStatus?: PixPaymentStatus;
  pixReceiptKey?: string;
  pixReceiptFileName?: string;
  pixReceiptMimeType?: string;
}

export interface PinVerificationResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

export interface BookingContextValue {
  authReady: boolean;
  adminCheckingActivation: boolean;
  firebaseUser: User | null;
  isAdminUser: boolean;
  isAdminUnlocked: boolean;
  cloudSynced: boolean;
  services: ServiceItem[];
  professionals: Professional[];
  settings: BusinessSettings;
  clients: ClientRecord[];
  appointments: Appointment[];
  busySlots: BusySlot[];
  mediaAssets: MediaAsset[];
  galleryItems: GalleryItem[];
  deviceBookings: ClientLookupBooking[];
  toastMessage: string | null;
  clearToast: () => void;
  showToast: (msg: string) => void;
  signInAdminGoogle: () => Promise<{ ok: boolean; error?: string }>;
  verifyAdminPin: (pin: string) => Promise<PinVerificationResult>;
  lockAdminSession: () => Promise<void>;
  uploadMediaAsset: (file: File, category: R2AssetCategory) => Promise<MediaAsset>;
  deleteMediaAsset: (asset: MediaAsset) => Promise<void>;
  cleanupR2ObjectByKey: (objectKey: string) => Promise<void>;
  addGalleryItem: (file: File, title: string, caption?: string) => Promise<GalleryItem>;
  replaceGalleryItemPhoto: (item: GalleryItem, file: File) => Promise<void>;
  deleteGalleryItem: (item: GalleryItem) => Promise<void>;
  createAppointment: (payload: CreateBookingPayload) => Promise<Appointment>;
  lookupBookingsByPhone: (phone: string) => Promise<ClientLookupBooking[]>;
  cancelClientBooking: (booking: ClientLookupBooking) => Promise<void>;
  rescheduleClientBooking: (
    booking: ClientLookupBooking,
    nextDate: string,
    nextStartTime: string
  ) => Promise<void>;
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  rescheduleAppointment: (
    appointmentId: string,
    nextDate: string,
    nextStartTime: string,
    nextProfessionalId?: string
  ) => Promise<void>;
  deleteAppointment: (appointmentId: string) => Promise<void>;
  toggleSlotBlock: (
    dateISO: string,
    startTime: string,
    professionalId: string,
    durationMinutes?: number,
    reason?: string
  ) => Promise<void>;
  toggleDayClosed: (dateISO: string) => Promise<void>;
  saveClient: (
    client: Omit<ClientRecord, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<ClientRecord>;
  deleteClient: (clientId: string) => Promise<void>;
  saveService: (
    service: Omit<ServiceItem, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;
  saveProfessional: (
    pro: Omit<Professional, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  deleteProfessional: (professionalId: string) => Promise<void>;
  saveSettings: (nextSettings: BusinessSettings) => Promise<void>;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState<LocalStoreShape>(() => loadInitialLocalStore());
  const [authReady, setAuthReady] = useState(false);
  const [adminCheckingActivation, setAdminCheckingActivation] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isAdminActivated, setIsAdminActivated] = useState(false);
  // Kept strictly in JS/React memory (never persisted to localStorage or sessionStorage)
  const [adminPinToken, setAdminPinToken] = useState<string | null>(null);
  const [cloudSynced, setCloudSynced] = useState(false);

  const [services, setServices] = useState<ServiceItem[]>(initial.services);
  const [professionals, setProfessionals] = useState<Professional[]>(initial.professionals);
  const [settings, setSettings] = useState<BusinessSettings>(initial.settings);
  const [clients, setClients] = useState<ClientRecord[]>(initial.clients);
  const [appointments, setAppointments] = useState<Appointment[]>(initial.appointments);
  const [busySlots, setBusySlots] = useState<BusySlot[]>(initial.busySlots);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [deviceBookings, setDeviceBookings] = useState<ClientLookupBooking[]>(
    initial.deviceBookings
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Any verified Google account that has activated once via PIN enters directly without re-entering PIN
  const isAdminUser = Boolean(firebaseUser && firebaseUser.emailVerified && isAdminActivated);
  const isAdminUnlocked = isAdminUser;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const clearToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Sync browser page title & favicon dynamically whenever header branding metadata changes
  useEffect(() => {
    applyDocumentBranding(
      settings.businessName,
      settings.headerLogoUrl,
      settings.headerLogoMimeType
    );
  }, [settings.businessName, settings.headerLogoUrl, settings.headerLogoMimeType]);

  // Persist local catalog and device-owned bookings (never stores admin PIN tokens)
  useEffect(() => {
    try {
      const payload: LocalStoreShape = {
        services,
        professionals,
        settings,
        clients,
        appointments,
        busySlots,
        deviceBookings,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [services, professionals, settings, clients, appointments, busySlots, deviceBookings]);

  // Boot connection check and Firebase Auth observer (checks one-time PIN activation in /admins/{uid})
  useEffect(() => {
    void testConnection();

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        setAdminCheckingActivation(true);
        try {
          const adminSnap = await getDoc(doc(db, 'admins', user.uid));
          setIsAdminActivated(adminSnap.exists());
        } catch {
          setIsAdminActivated(false);
        } finally {
          setAdminCheckingActivation(false);
        }
      } else {
        setIsAdminActivated(false);
        setAdminPinToken(null);
        setAdminCheckingActivation(false);
        setCloudSynced(false);
      }
      setAuthReady(true);
    });

    return () => unsubAuth();
  }, []);

  // Load public catalog (services, professionals, settings, non-PII busySlots) with rules-aligned filters
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    const loadPublicCatalog = async () => {
      try {
        const servicesQuery = query(
          collection(db, 'services'),
          where('active', 'in', [true, false])
        );
        const professionalsQuery = query(
          collection(db, 'professionals'),
          where('active', 'in', [true, false])
        );
        const busySlotsQuery = query(
          collection(db, 'busySlots'),
          where('kind', 'in', ['appointment', 'blocked'])
        );
        const galleryQuery = query(
          collection(db, 'galleryItems'),
          where('active', 'in', [true, false])
        );

        const [srvSnap, proSnap, settingsSnap, busySnap, gallerySnap] = await Promise.all([
          getDocs(servicesQuery),
          getDocs(professionalsQuery),
          getDoc(doc(db, 'settings', 'main')),
          getDocs(busySlotsQuery),
          getDocs(galleryQuery),
        ]);
        if (cancelled) return;

        if (!srvSnap.empty) {
          setServices(
            srvSnap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                name: String(data.name || ''),
                category: String(data.category || 'Geral'),
                price: Number(data.price || 0),
                durationMinutes: Number(data.durationMinutes || 30),
                imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
                imageKey: typeof data.imageKey === 'string' ? data.imageKey : undefined,
                description: typeof data.description === 'string' ? data.description : undefined,
                active: Boolean(data.active),
                createdAt: toIsoString(data.createdAt),
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        }

        if (!proSnap.empty) {
          setProfessionals(
            proSnap.docs.map((d) => {
              const data = d.data();
              const avatarUrl = isValidR2ProxyUrl(data.avatarUrl, 'profiles')
                ? data.avatarUrl
                : '';
              return {
                id: d.id,
                name: String(data.name || ''),
                specialty: String(data.specialty || ''),
                avatarInitials: String(data.avatarInitials || 'PR'),
                avatarUrl: avatarUrl || undefined,
                avatarKey: typeof data.avatarKey === 'string' ? data.avatarKey : undefined,
                active: Boolean(data.active),
                workDays: Array.isArray(data.workDays) ? data.workDays.map(Number) : [1, 2, 3, 4, 5, 6],
                createdAt: toIsoString(data.createdAt),
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        }

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          const logoUrl = isValidHeaderLogoUrl(data.headerLogoUrl) ? data.headerLogoUrl : '';
          const heroBannerUrl = isValidR2ProxyUrl(data.heroBannerUrl, 'banners')
            ? data.heroBannerUrl
            : '';
          const adminAvatarUrl = isValidR2ProxyUrl(data.adminAvatarUrl, 'profiles')
            ? data.adminAvatarUrl
            : '';
          setSettings({
            businessName: String(data.businessName || 'Esmalteria&beleza'),
            phone: String(data.phone || ''),
            address: String(data.address || ''),
            slotIntervalMinutes: Number(data.slotIntervalMinutes || 30),
            weeklySchedule: data.weeklySchedule || initial.settings.weeklySchedule,
            closedDates: Array.isArray(data.closedDates) ? data.closedDates.map(String) : [],
            headerLogoKey: typeof data.headerLogoKey === 'string' ? data.headerLogoKey : '',
            headerLogoUrl: logoUrl,
            headerLogoFileName:
              typeof data.headerLogoFileName === 'string' ? data.headerLogoFileName : '',
            headerLogoMimeType:
              typeof data.headerLogoMimeType === 'string' ? data.headerLogoMimeType : '',
            headerLogoSize: Number(data.headerLogoSize || 0),
            headerLogoMode: normalizeHeaderLogoMode(data.headerLogoMode),
            headerWatermarkOpacity: clampWatermarkOpacity(data.headerWatermarkOpacity),
            heroBannerKey: typeof data.heroBannerKey === 'string' ? data.heroBannerKey : '',
            heroBannerUrl,
            heroBannerSubtitle:
              typeof data.heroBannerSubtitle === 'string' ? data.heroBannerSubtitle : '',
            adminAvatarKey: typeof data.adminAvatarKey === 'string' ? data.adminAvatarKey : '',
            adminAvatarUrl,
            requireAdminConfirmation: Boolean(data.requireAdminConfirmation),
            pixFeeEnabled: Boolean(data.pixFeeEnabled),
            pixFeePercentage: clampPixFeePercentage(data.pixFeePercentage),
            pixKeyType: normalizePixKeyType(data.pixKeyType),
            pixKey: typeof data.pixKey === 'string' ? data.pixKey : '',
            pixBankName: typeof data.pixBankName === 'string' ? data.pixBankName : '',
            pixHolderName: typeof data.pixHolderName === 'string' ? data.pixHolderName : '',
            pixCity: typeof data.pixCity === 'string' ? data.pixCity : 'Sao Paulo',
            pixProofMode: normalizePixProofMode(data.pixProofMode),
            pixWhatsappPhone: typeof data.pixWhatsappPhone === 'string' ? data.pixWhatsappPhone : '',
            updatedAt: toIsoString(data.updatedAt),
          });
        }

        if (!busySnap.empty) {
          setBusySlots(
            busySnap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                date: String(data.date || ''),
                startTime: String(data.startTime || ''),
                durationMinutes: Number(data.durationMinutes || 30),
                professionalId: String(data.professionalId || ''),
                kind: data.kind === 'blocked' ? 'blocked' : 'appointment',
                ownerId: String(data.ownerId || ''),
                appointmentId: typeof data.appointmentId === 'string' ? data.appointmentId : undefined,
                reason: typeof data.reason === 'string' ? data.reason : undefined,
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        }

        setGalleryItems(
          gallerySnap.docs
            .map((d) => {
              const data = d.data();
              const imgUrl = isValidR2ProxyUrl(data.imageUrl, 'gallery') ? data.imageUrl : '';
              return {
                id: d.id,
                title: String(data.title || 'Trabalho realizado'),
                caption: typeof data.caption === 'string' ? data.caption : '',
                imageUrl: imgUrl,
                imageKey: String(data.imageKey || ''),
                active: Boolean(data.active),
                createdAt: toIsoString(data.createdAt),
                updatedAt: toIsoString(data.updatedAt),
              };
            })
            .filter((item) => Boolean(item.imageUrl))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      } catch {
        // Fallback smoothly to local catalog if offline or unseeded
      }
    };

    void loadPublicCatalog();
    return () => {
      cancelled = true;
    };
  }, [authReady, initial.settings.weeklySchedule]);

  // Real-time Firestore sync strictly when an authorized Admin is authenticated AND activated
  useEffect(() => {
    if (!authReady || !isAdminUnlocked || !firebaseUser) {
      return;
    }

    const unsubscribers: Array<() => void> = [];
    setCloudSynced(true);

    const servicesQuery = query(
      collection(db, 'services'),
      where('active', 'in', [true, false])
    );
    const professionalsQuery = query(
      collection(db, 'professionals'),
      where('active', 'in', [true, false])
    );
    const busySlotsQuery = query(
      collection(db, 'busySlots'),
      where('kind', 'in', ['appointment', 'blocked'])
    );
    const galleryQuery = query(
      collection(db, 'galleryItems'),
      where('active', 'in', [true, false])
    );

    // Seed cloud catalog once when admin opens an empty Firestore database
    void (async () => {
      try {
        const existingSrv = await getDocs(servicesQuery);
        if (existingSrv.empty) {
          const seed = createSeedData(formatDateISO(new Date()));
          const batch = writeBatch(db);
          for (const s of seed.services) {
            batch.set(doc(db, 'services', s.id), {
              name: s.name,
              category: s.category,
              price: s.price,
              durationMinutes: s.durationMinutes,
              imageUrl: s.imageUrl || '',
              imageKey: '',
              description: s.description || '',
              active: s.active,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          for (const p of seed.professionals) {
            batch.set(doc(db, 'professionals', p.id), {
              name: p.name,
              specialty: p.specialty,
              avatarInitials: p.avatarInitials,
              avatarUrl: '',
              avatarKey: '',
              active: p.active,
              workDays: p.workDays,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          batch.set(doc(db, 'settings', 'main'), {
            businessName: seed.settings.businessName,
            phone: seed.settings.phone,
            address: seed.settings.address,
            slotIntervalMinutes: seed.settings.slotIntervalMinutes,
            weeklySchedule: seed.settings.weeklySchedule,
            closedDates: seed.settings.closedDates,
            headerLogoKey: '',
            headerLogoUrl: '',
            headerLogoFileName: '',
            headerLogoMimeType: '',
            headerLogoSize: 0,
            headerLogoMode: 'logo',
            headerWatermarkOpacity: 14,
            heroBannerKey: '',
            heroBannerUrl: '',
            heroBannerSubtitle: '',
            adminAvatarKey: '',
            adminAvatarUrl: '',
            requireAdminConfirmation: false,
            pixFeeEnabled: false,
            pixFeePercentage: 30,
            pixKeyType: 'phone',
            pixKey: '',
            pixBankName: '',
            pixHolderName: '',
            pixCity: 'Sao Paulo',
            pixProofMode: 'both',
            pixWhatsappPhone: '',
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        }
      } catch (err) {
        console.error('Seed cloud catalog warning:', err);
      }
    })();

    unsubscribers.push(
      onSnapshot(
        servicesQuery,
        (snap) => {
          if (snap.empty) return;
          setServices(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                name: String(data.name || ''),
                category: String(data.category || 'Geral'),
                price: Number(data.price || 0),
                durationMinutes: Number(data.durationMinutes || 30),
                imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
                imageKey: typeof data.imageKey === 'string' ? data.imageKey : undefined,
                description: typeof data.description === 'string' ? data.description : undefined,
                active: Boolean(data.active),
                createdAt: toIsoString(data.createdAt),
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'services')
      )
    );

    unsubscribers.push(
      onSnapshot(
        professionalsQuery,
        (snap) => {
          if (snap.empty) return;
          setProfessionals(
            snap.docs.map((d) => {
              const data = d.data();
              const avatarUrl = isValidR2ProxyUrl(data.avatarUrl, 'profiles')
                ? data.avatarUrl
                : '';
              return {
                id: d.id,
                name: String(data.name || ''),
                specialty: String(data.specialty || ''),
                avatarInitials: String(data.avatarInitials || 'PR'),
                avatarUrl: avatarUrl || undefined,
                avatarKey: typeof data.avatarKey === 'string' ? data.avatarKey : undefined,
                active: Boolean(data.active),
                workDays: Array.isArray(data.workDays) ? data.workDays.map(Number) : [1, 2, 3, 4, 5, 6],
                createdAt: toIsoString(data.createdAt),
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'professionals')
      )
    );

    unsubscribers.push(
      onSnapshot(
        doc(db, 'settings', 'main'),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          const logoUrl = isValidHeaderLogoUrl(data.headerLogoUrl) ? data.headerLogoUrl : '';
          const heroBannerUrl = isValidR2ProxyUrl(data.heroBannerUrl, 'banners')
            ? data.heroBannerUrl
            : '';
          const adminAvatarUrl = isValidR2ProxyUrl(data.adminAvatarUrl, 'profiles')
            ? data.adminAvatarUrl
            : '';
          setSettings({
            businessName: String(data.businessName || 'Esmalteria&beleza'),
            phone: String(data.phone || ''),
            address: String(data.address || ''),
            slotIntervalMinutes: Number(data.slotIntervalMinutes || 30),
            weeklySchedule: data.weeklySchedule || initial.settings.weeklySchedule,
            closedDates: Array.isArray(data.closedDates) ? data.closedDates.map(String) : [],
            headerLogoKey: typeof data.headerLogoKey === 'string' ? data.headerLogoKey : '',
            headerLogoUrl: logoUrl,
            headerLogoFileName:
              typeof data.headerLogoFileName === 'string' ? data.headerLogoFileName : '',
            headerLogoMimeType:
              typeof data.headerLogoMimeType === 'string' ? data.headerLogoMimeType : '',
            headerLogoSize: Number(data.headerLogoSize || 0),
            headerLogoMode: normalizeHeaderLogoMode(data.headerLogoMode),
            headerWatermarkOpacity: clampWatermarkOpacity(data.headerWatermarkOpacity),
            heroBannerKey: typeof data.heroBannerKey === 'string' ? data.heroBannerKey : '',
            heroBannerUrl,
            heroBannerSubtitle:
              typeof data.heroBannerSubtitle === 'string' ? data.heroBannerSubtitle : '',
            adminAvatarKey: typeof data.adminAvatarKey === 'string' ? data.adminAvatarKey : '',
            adminAvatarUrl,
            requireAdminConfirmation: Boolean(data.requireAdminConfirmation),
            pixFeeEnabled: Boolean(data.pixFeeEnabled),
            pixFeePercentage: clampPixFeePercentage(data.pixFeePercentage),
            pixKeyType: normalizePixKeyType(data.pixKeyType),
            pixKey: typeof data.pixKey === 'string' ? data.pixKey : '',
            pixBankName: typeof data.pixBankName === 'string' ? data.pixBankName : '',
            pixHolderName: typeof data.pixHolderName === 'string' ? data.pixHolderName : '',
            pixCity: typeof data.pixCity === 'string' ? data.pixCity : 'Sao Paulo',
            pixProofMode: normalizePixProofMode(data.pixProofMode),
            pixWhatsappPhone: typeof data.pixWhatsappPhone === 'string' ? data.pixWhatsappPhone : '',
            updatedAt: toIsoString(data.updatedAt),
          });
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'settings/main')
      )
    );

    unsubscribers.push(
      onSnapshot(
        galleryQuery,
        (snap) => {
          setGalleryItems(
            snap.docs
              .map((d) => {
                const data = d.data();
                const imgUrl = isValidR2ProxyUrl(data.imageUrl, 'gallery') ? data.imageUrl : '';
                return {
                  id: d.id,
                  title: String(data.title || 'Trabalho realizado'),
                  caption: typeof data.caption === 'string' ? data.caption : '',
                  imageUrl: imgUrl,
                  imageKey: String(data.imageKey || ''),
                  active: Boolean(data.active),
                  createdAt: toIsoString(data.createdAt),
                  updatedAt: toIsoString(data.updatedAt),
                };
              })
              .filter((item) => Boolean(item.imageUrl))
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'galleryItems')
      )
    );

    unsubscribers.push(
      onSnapshot(
        busySlotsQuery,
        (snap) => {
          setBusySlots(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                date: String(data.date || ''),
                startTime: String(data.startTime || ''),
                durationMinutes: Number(data.durationMinutes || 30),
                professionalId: String(data.professionalId || ''),
                kind: data.kind === 'blocked' ? 'blocked' : 'appointment',
                ownerId: String(data.ownerId || ''),
                appointmentId: typeof data.appointmentId === 'string' ? data.appointmentId : undefined,
                reason: typeof data.reason === 'string' ? data.reason : undefined,
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'busySlots')
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, 'appointments'),
        (snap) => {
          setAppointments(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                userId: String(data.userId || 'guest'),
                clientName: String(data.clientName || ''),
                clientPhone: String(data.clientPhone || ''),
                phoneHash: String(data.phoneHash || ''),
                cancelToken: String(data.cancelToken || ''),
                forSomeoneElse: Boolean(data.forSomeoneElse),
                guestName: typeof data.guestName === 'string' ? data.guestName : undefined,
                guestPhone: typeof data.guestPhone === 'string' ? data.guestPhone : undefined,
                professionalId: String(data.professionalId || ''),
                professionalName: String(data.professionalName || ''),
                serviceIds: Array.isArray(data.serviceIds) ? data.serviceIds.map(String) : [],
                serviceNames: Array.isArray(data.serviceNames) ? data.serviceNames.map(String) : [],
                totalPrice: Number(data.totalPrice || 0),
                totalDurationMinutes: Number(data.totalDurationMinutes || 30),
                date: String(data.date || ''),
                startTime: String(data.startTime || ''),
                notes: typeof data.notes === 'string' ? data.notes : undefined,
                status: (data.status as AppointmentStatus) || 'confirmed',
                pixFeePercentage:
                  typeof data.pixFeePercentage === 'number' ? data.pixFeePercentage : 0,
                pixFeeAmount: typeof data.pixFeeAmount === 'number' ? data.pixFeeAmount : 0,
                pixPaymentStatus: normalizePixPaymentStatus(data.pixPaymentStatus),
                pixReceiptKey: typeof data.pixReceiptKey === 'string' ? data.pixReceiptKey : '',
                pixReceiptFileName:
                  typeof data.pixReceiptFileName === 'string' ? data.pixReceiptFileName : '',
                pixReceiptMimeType:
                  typeof data.pixReceiptMimeType === 'string' ? data.pixReceiptMimeType : '',
                confirmedAt: typeof data.confirmedAt === 'string' ? data.confirmedAt : '',
                confirmedBy: typeof data.confirmedBy === 'string' ? data.confirmedBy : '',
                createdAt: toIsoString(data.createdAt),
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'appointments')
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, 'clients'),
        (snap) => {
          setClients(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                name: String(data.name || ''),
                phone: String(data.phone || ''),
                email: typeof data.email === 'string' ? data.email : undefined,
                notes: typeof data.notes === 'string' ? data.notes : undefined,
                loyaltyPoints: Number(data.loyaltyPoints || 0),
                totalVisits: Number(data.totalVisits || 0),
                totalSpent: Number(data.totalSpent || 0),
                lastVisitDate: typeof data.lastVisitDate === 'string' ? data.lastVisitDate : undefined,
                createdAt: toIsoString(data.createdAt),
                updatedAt: toIsoString(data.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'clients')
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, 'mediaAssets'),
        (snap) => {
          setMediaAssets(
            snap.docs
              .map((d) => {
                const data = d.data();
                const cat =
                  data.category === 'branding' ||
                  data.category === 'services' ||
                  data.category === 'profiles' ||
                  data.category === 'banners' ||
                  data.category === 'gallery'
                    ? data.category
                    : 'private';
                return {
                  id: d.id,
                  fileName: String(data.fileName || ''),
                  objectKey: String(data.objectKey || ''),
                  category: cat as R2AssetCategory,
                  mimeType: String(data.mimeType || 'application/octet-stream'),
                  sizeBytes: Number(data.sizeBytes || 0),
                  url: String(data.url || ''),
                  uploadedByUid: String(data.uploadedByUid || ''),
                  createdAt: toIsoString(data.createdAt),
                  updatedAt: toIsoString(data.updatedAt),
                };
              })
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'mediaAssets')
      )
    );

    return () => {
      unsubscribers.forEach((u) => u());
    };
  }, [authReady, isAdminUnlocked, firebaseUser, initial.settings.weeklySchedule]);

  const signInAdminGoogle = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      if (!user || !user.emailVerified) {
        return { ok: false, error: 'Conta Google sem e-mail verificado.' };
      }
      setAdminCheckingActivation(true);
      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        const alreadyActivated = adminSnap.exists();
        setIsAdminActivated(alreadyActivated);
        if (alreadyActivated) {
          showToast('Bem-vindo de volta ao Painel Administrativo.');
        }
      } catch {
        setIsAdminActivated(false);
      } finally {
        setAdminCheckingActivation(false);
      }
      return { ok: true };
    } catch (err) {
      console.error('Admin Google Sign-In error:', err);
      return { ok: false, error: 'Não foi possível concluir o login com o Google.' };
    }
  }, [showToast]);

  const verifyAdminPin = useCallback(async (pin: string): Promise<PinVerificationResult> => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.emailVerified) {
      return { ok: false, error: 'Faça login com uma conta Google verificada primeiro.' };
    }

    try {
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        unlocked?: boolean;
        token?: string;
        activationProof?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!res.ok || !data.unlocked || !data.token || !data.activationProof) {
        return {
          ok: false,
          error: data.error || 'PIN incorreto. Tente novamente.',
          retryAfterSeconds: data.retryAfterSeconds,
        };
      }

      // Persist one-time activation for this Google account in Firestore so PIN is never requested again
      try {
        await setDoc(doc(db, 'admins', currentUser.uid), {
          uid: currentUser.uid,
          email: (currentUser.email || '').slice(0, 120),
          activationProof: data.activationProof,
          grantedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `admins/${currentUser.uid}`);
      }

      setAdminPinToken(data.token);
      setIsAdminActivated(true);
      showToast('Conta ativada! Nos próximos logins você entrará direto.');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Erro de conexão ao validar e ativar o PIN.' };
    }
  }, [showToast]);

  const lockAdminSession = useCallback(async () => {
    const tokenToRevoke = adminPinToken;
    setAdminPinToken(null);
    setIsAdminActivated(false);
    setCloudSynced(false);
    if (tokenToRevoke) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenToRevoke}` },
        });
      } catch {
        // Ignore network errors on logout
      }
    }
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch {
      // Ignore sign-out errors
    }
    showToast('Sessão administrativa encerrada.');
  }, [adminPinToken, showToast]);

  const uploadMediaAsset = useCallback(
    async (file: File, category: R2AssetCategory): Promise<MediaAsset> => {
      if (!isAdminUnlocked || !firebaseUser) {
        throw new Error('Autenticação administrativa necessária para enviar arquivos.');
      }
      const uploaded = await uploadFileToR2(file, category);
      const id = generateSafeId('med');
      const nowIso = new Date().toISOString();
      const record: MediaAsset = {
        id,
        fileName: uploaded.fileName,
        objectKey: uploaded.objectKey,
        category: uploaded.category,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        url: uploaded.url,
        uploadedByUid: firebaseUser.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setMediaAssets((prev) => [record, ...prev]);

      try {
        await setDoc(doc(db, 'mediaAssets', id), {
          fileName: record.fileName,
          objectKey: record.objectKey,
          category: record.category,
          mimeType: record.mimeType,
          sizeBytes: record.sizeBytes,
          url: record.url,
          uploadedByUid: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `mediaAssets/${id}`);
      }

      showToast(`Arquivo "${record.fileName}" enviado com segurança para o R2.`);
      return record;
    },
    [firebaseUser, isAdminUnlocked, showToast]
  );

  const deleteMediaAsset = useCallback(
    async (asset: MediaAsset) => {
      if (!isAdminUnlocked) {
        throw new Error('Autenticação administrativa necessária para excluir arquivos.');
      }
      await deleteFileFromR2(asset.objectKey);
      setMediaAssets((prev) => prev.filter((item) => item.id !== asset.id));

      try {
        await deleteDoc(doc(db, 'mediaAssets', asset.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `mediaAssets/${asset.id}`);
      }

      showToast(`Arquivo "${asset.fileName}" excluído do R2.`);
    },
    [isAdminUnlocked, showToast]
  );

  // Automatically deletes an old/replaced/orphaned R2 object and removes its metadata doc from Firestore
  const cleanupR2ObjectByKey = useCallback(
    async (objectKey: string) => {
      const trimmed = (objectKey || '').trim();
      if (!trimmed || !isAdminUnlocked) return;
      try {
        await deleteFileFromR2(trimmed);
      } catch (err) {
        console.warn('Falha ao limpar arquivo antigo no R2:', trimmed, err);
      }

      const matchingAssets = mediaAssets.filter((m) => m.objectKey === trimmed);
      if (matchingAssets.length > 0) {
        setMediaAssets((prev) => prev.filter((m) => m.objectKey !== trimmed));
        for (const asset of matchingAssets) {
          try {
            await deleteDoc(doc(db, 'mediaAssets', asset.id));
          } catch {
            // Non-blocking cleanup of old metadata entry
          }
        }
      }
    },
    [isAdminUnlocked, mediaAssets]
  );

  const addGalleryItem = useCallback(
    async (file: File, title: string, caption = ''): Promise<GalleryItem> => {
      if (!isAdminUnlocked || !firebaseUser) {
        throw new Error('Autenticação administrativa necessária para publicar na galeria.');
      }
      const uploaded = await uploadMediaAsset(file, 'gallery');
      const id = generateSafeId('gal');
      const nowIso = new Date().toISOString();
      const safeTitle = title.trim().slice(0, 80) || uploaded.fileName.replace(/\.[^.]+$/, '').slice(0, 80) || 'Trabalho realizado';
      const safeCaption = caption.trim().slice(0, 200);
      const record: GalleryItem = {
        id,
        title: safeTitle,
        caption: safeCaption,
        imageUrl: uploaded.url,
        imageKey: uploaded.objectKey,
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setGalleryItems((prev) => [record, ...prev]);

      try {
        await setDoc(doc(db, 'galleryItems', id), {
          title: record.title,
          caption: record.caption || '',
          imageUrl: record.imageUrl,
          imageKey: record.imageKey,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        await cleanupR2ObjectByKey(uploaded.objectKey);
        handleFirestoreError(err, OperationType.CREATE, `galleryItems/${id}`);
      }

      showToast('Foto publicada na galeria de trabalhos.');
      return record;
    },
    [cleanupR2ObjectByKey, firebaseUser, isAdminUnlocked, showToast, uploadMediaAsset]
  );

  const replaceGalleryItemPhoto = useCallback(
    async (item: GalleryItem, file: File) => {
      if (!isAdminUnlocked || !firebaseUser) {
        throw new Error('Autenticação administrativa necessária para trocar fotos da galeria.');
      }
      const oldKey = item.imageKey;
      const uploaded = await uploadMediaAsset(file, 'gallery');
      const nowIso = new Date().toISOString();

      setGalleryItems((prev) =>
        prev.map((g) =>
          g.id === item.id
            ? { ...g, imageUrl: uploaded.url, imageKey: uploaded.objectKey, updatedAt: nowIso }
            : g
        )
      );

      try {
        await updateDoc(doc(db, 'galleryItems', item.id), {
          imageUrl: uploaded.url,
          imageKey: uploaded.objectKey,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        await cleanupR2ObjectByKey(uploaded.objectKey);
        handleFirestoreError(err, OperationType.UPDATE, `galleryItems/${item.id}`);
      }

      if (oldKey && oldKey !== uploaded.objectKey) {
        await cleanupR2ObjectByKey(oldKey);
      }
      showToast('Foto da galeria substituída e imagem anterior removida.');
    },
    [cleanupR2ObjectByKey, firebaseUser, isAdminUnlocked, showToast, uploadMediaAsset]
  );

  const deleteGalleryItem = useCallback(
    async (item: GalleryItem) => {
      if (!isAdminUnlocked) {
        throw new Error('Autenticação administrativa necessária para excluir da galeria.');
      }
      setGalleryItems((prev) => prev.filter((g) => g.id !== item.id));
      try {
        await deleteDoc(doc(db, 'galleryItems', item.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `galleryItems/${item.id}`);
      }
      if (item.imageKey) {
        await cleanupR2ObjectByKey(item.imageKey);
      }
      showToast('Foto removida da galeria e do servidor R2.');
    },
    [cleanupR2ObjectByKey, isAdminUnlocked, showToast]
  );

  const createAppointment = useCallback(
    async (payload: CreateBookingPayload): Promise<Appointment> => {
      const selectedServices = services.filter((s) => payload.serviceIds.includes(s.id));
      const pro = professionals.find((p) => p.id === payload.professionalId);
      if (!pro || selectedServices.length === 0) {
        throw new Error('Selecione serviço e profissional válidos.');
      }

      const id = generateSafeId('apt');
      const nowIso = new Date().toISOString();
      const phoneHash = await hashPhoneDigits(payload.clientPhone);
      const cancelToken = generateCancelToken();
      const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
      const totalDurationMinutes = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);

      const pixFeePercentage =
        typeof payload.pixFeePercentage === 'number' && payload.pixFeePercentage > 0
          ? Math.min(100, Math.max(0, Math.round(payload.pixFeePercentage)))
          : 0;
      const pixFeeAmount =
        typeof payload.pixFeeAmount === 'number' && payload.pixFeeAmount > 0
          ? Number(Math.min(totalPrice, Math.max(0, payload.pixFeeAmount)).toFixed(2))
          : 0;
      const pixPaymentStatus: PixPaymentStatus =
        pixFeeAmount > 0
          ? payload.pixPaymentStatus || 'awaiting_verification'
          : 'not_required';
      const pixReceiptKey = (payload.pixReceiptKey || '').trim().slice(0, 260);
      const pixReceiptFileName = pixReceiptKey
        ? (payload.pixReceiptFileName || '').trim().slice(0, 180)
        : '';
      const pixReceiptMimeType = pixReceiptKey
        ? (payload.pixReceiptMimeType || '').trim().slice(0, 80)
        : '';

      const resolvedStatus: AppointmentStatus =
        payload.status ||
        (pixFeeAmount > 0 || settings.requireAdminConfirmation ? 'pending' : 'confirmed');

      const newApt: Appointment = {
        id,
        userId: isAdminUnlocked && firebaseUser ? firebaseUser.uid : 'guest',
        clientName: payload.clientName.trim().slice(0, 100),
        clientPhone: payload.clientPhone.trim().slice(0, 30),
        phoneHash,
        cancelToken,
        forSomeoneElse: payload.forSomeoneElse,
        guestName: payload.forSomeoneElse ? payload.guestName?.trim().slice(0, 100) || '' : '',
        guestPhone: payload.forSomeoneElse ? payload.guestPhone?.trim().slice(0, 30) || '' : '',
        professionalId: pro.id,
        professionalName: pro.name.slice(0, 80),
        serviceIds: selectedServices.map((s) => s.id).slice(0, 10),
        serviceNames: selectedServices.map((s) => s.name.slice(0, 100)).slice(0, 10),
        totalPrice,
        totalDurationMinutes,
        date: payload.date,
        startTime: payload.startTime,
        notes: payload.notes?.trim().slice(0, 400) || '',
        status: resolvedStatus,
        pixFeePercentage,
        pixFeeAmount,
        pixPaymentStatus,
        pixReceiptKey,
        pixReceiptFileName,
        pixReceiptMimeType,
        confirmedAt: '',
        confirmedBy: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const newSlot: BusySlot = {
        id,
        date: newApt.date,
        startTime: newApt.startTime,
        durationMinutes: newApt.totalDurationMinutes,
        professionalId: newApt.professionalId,
        kind: 'appointment',
        ownerId: newApt.userId,
        appointmentId: id,
        updatedAt: nowIso,
      };

      const lookupCard: ClientLookupBooking = {
        appointmentId: id,
        phoneHash,
        cancelToken,
        clientName: newApt.clientName,
        clientPhone: newApt.clientPhone,
        professionalId: newApt.professionalId,
        professionalName: newApt.professionalName,
        serviceNames: newApt.serviceNames,
        totalPrice: newApt.totalPrice,
        totalDurationMinutes: newApt.totalDurationMinutes,
        date: newApt.date,
        startTime: newApt.startTime,
        notes: newApt.notes,
        status: newApt.status,
        pixFeePercentage: newApt.pixFeePercentage,
        pixFeeAmount: newApt.pixFeeAmount,
        pixPaymentStatus: newApt.pixPaymentStatus,
        hasPixReceipt: Boolean(pixReceiptKey),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Update local state immediately for snappy UX
      setAppointments((prev) => [newApt, ...prev]);
      setBusySlots((prev) => [...prev, newSlot]);
      if (payload.saveToDevice !== false) {
        setDeviceBookings((prev) => [lookupCard, ...prev]);
      }

      // Auto-sync client directory locally (and in Firestore when admin creates manual booking)
      setClients((prev) => {
        const cleanDigits = normalizePhoneDigits(newApt.clientPhone);
        const exists = prev.some(
          (c) =>
            normalizePhoneDigits(c.phone) === cleanDigits ||
            c.name.toLowerCase() === newApt.clientName.toLowerCase()
        );
        if (exists) return prev;
        return [
          {
            id: generateSafeId('cli'),
            name: newApt.clientName,
            phone: newApt.clientPhone,
            notes: '',
            loyaltyPoints: 0,
            totalVisits: 1,
            totalSpent: newApt.totalPrice,
            lastVisitDate: newApt.date,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...prev,
        ];
      });

      // Atomic Firestore write (works for both unauthenticated guests and authenticated admins)
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'appointments', id), {
          userId: newApt.userId,
          clientName: newApt.clientName,
          clientPhone: newApt.clientPhone,
          phoneHash: newApt.phoneHash,
          cancelToken: newApt.cancelToken,
          cancelProof: '',
          forSomeoneElse: newApt.forSomeoneElse,
          guestName: newApt.guestName || '',
          guestPhone: newApt.guestPhone || '',
          professionalId: newApt.professionalId,
          professionalName: newApt.professionalName,
          serviceIds: newApt.serviceIds,
          serviceNames: newApt.serviceNames,
          totalPrice: newApt.totalPrice,
          totalDurationMinutes: newApt.totalDurationMinutes,
          date: newApt.date,
          startTime: newApt.startTime,
          notes: newApt.notes || '',
          status: newApt.status,
          pixFeePercentage,
          pixFeeAmount,
          pixPaymentStatus,
          pixReceiptKey,
          pixReceiptFileName,
          pixReceiptMimeType,
          confirmedAt: '',
          confirmedBy: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'busySlots', id), {
          date: newSlot.date,
          startTime: newSlot.startTime,
          durationMinutes: newSlot.durationMinutes,
          professionalId: newSlot.professionalId,
          kind: 'appointment',
          ownerId: newApt.userId,
          appointmentId: id,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'phoneLookups', phoneHash, 'bookings', id), {
          appointmentId: id,
          phoneHash,
          cancelToken,
          professionalId: newApt.professionalId,
          professionalName: newApt.professionalName,
          serviceNames: newApt.serviceNames,
          totalPrice: newApt.totalPrice,
          totalDurationMinutes: newApt.totalDurationMinutes,
          date: newApt.date,
          startTime: newApt.startTime,
          status: newApt.status,
          pixFeePercentage,
          pixFeeAmount,
          pixPaymentStatus,
          hasPixReceipt: Boolean(pixReceiptKey),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const commitPromise = batch.commit();
        if (isAdminUnlocked) {
          await commitPromise;
        } else {
          await Promise.race([
            commitPromise,
            new Promise<void>((resolve) => {
              window.setTimeout(resolve, 4000);
            }),
          ]);
        }
      } catch (err) {
        if (isAdminUnlocked) {
          handleFirestoreError(err, OperationType.CREATE, `appointments/${id}`);
        } else {
          // If Firestore catalog hasn't been seeded by admin yet, local booking still works seamlessly
          console.warn('Cloud booking sync deferred:', err);
        }
      }

      showToast(
        newApt.status === 'pending'
          ? `Solicitação enviada! Aguardando confirmação do salão para ${newApt.startTime}.`
          : `Horário agendado com ${pro.name} às ${newApt.startTime}.`
      );
      return newApt;
    },
    [
      firebaseUser,
      isAdminUnlocked,
      professionals,
      services,
      settings.requireAdminConfirmation,
      showToast,
    ]
  );

  const lookupBookingsByPhone = useCallback(
    async (phone: string): Promise<ClientLookupBooking[]> => {
      const digits = normalizePhoneDigits(phone);
      if (digits.length < 8) return [];
      const phoneHash = await hashPhoneDigits(phone);

      const merged = new Map<string, ClientLookupBooking>();

      // 1. Check local device bookings matching phone digits or hash
      for (const item of deviceBookings) {
        const itemDigits = item.clientPhone ? normalizePhoneDigits(item.clientPhone) : '';
        if (item.phoneHash === phoneHash || (itemDigits && itemDigits === digits)) {
          merged.set(item.appointmentId, item);
        }
      }

      // 2. Check local appointments (same device / preview) matching phone digits
      for (const apt of appointments) {
        if (normalizePhoneDigits(apt.clientPhone) === digits || apt.phoneHash === phoneHash) {
          if (!merged.has(apt.id)) {
            merged.set(apt.id, {
              appointmentId: apt.id,
              phoneHash: apt.phoneHash || phoneHash,
              cancelToken: apt.cancelToken,
              clientName: apt.clientName,
              clientPhone: apt.clientPhone,
              professionalId: apt.professionalId,
              professionalName: apt.professionalName,
              serviceNames: apt.serviceNames,
              totalPrice: apt.totalPrice,
              totalDurationMinutes: apt.totalDurationMinutes,
              date: apt.date,
              startTime: apt.startTime,
              notes: apt.notes,
              status: apt.status,
              pixFeePercentage: apt.pixFeePercentage,
              pixFeeAmount: apt.pixFeeAmount,
              pixPaymentStatus: apt.pixPaymentStatus,
              hasPixReceipt: Boolean(apt.pixReceiptKey),
              createdAt: apt.createdAt,
              updatedAt: apt.updatedAt,
            });
          }
        }
      }

      // 3. Query non-PII cloud index by exact SHA-256 phoneHash (aligned with Firestore list rule)
      try {
        const lookupQuery = query(
          collection(db, 'phoneLookups', phoneHash, 'bookings'),
          where('phoneHash', '==', phoneHash)
        );
        const snap = await getDocs(lookupQuery);
        for (const d of snap.docs) {
          const data = d.data();
          merged.set(d.id, {
            appointmentId: String(data.appointmentId || d.id),
            phoneHash,
            cancelToken: String(data.cancelToken || ''),
            professionalId: String(data.professionalId || ''),
            professionalName: String(data.professionalName || ''),
            serviceNames: Array.isArray(data.serviceNames) ? data.serviceNames.map(String) : [],
            totalPrice: Number(data.totalPrice || 0),
            totalDurationMinutes: Number(data.totalDurationMinutes || 30),
            date: String(data.date || ''),
            startTime: String(data.startTime || ''),
            status: (data.status as AppointmentStatus) || 'confirmed',
            pixFeePercentage:
              typeof data.pixFeePercentage === 'number' ? data.pixFeePercentage : 0,
            pixFeeAmount: typeof data.pixFeeAmount === 'number' ? data.pixFeeAmount : 0,
            pixPaymentStatus: normalizePixPaymentStatus(data.pixPaymentStatus),
            hasPixReceipt: Boolean(data.hasPixReceipt),
            createdAt: toIsoString(data.createdAt),
            updatedAt: toIsoString(data.updatedAt),
          });
        }
      } catch {
        // Offline or empty cloud lookup falls back smoothly to local matches
      }

      return Array.from(merged.values()).sort((a, b) =>
        `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`)
      );
    },
    [appointments, deviceBookings]
  );

  const cancelClientBooking = useCallback(
    async (booking: ClientLookupBooking) => {
      const nowIso = new Date().toISOString();
      setDeviceBookings((prev) =>
        prev.map((b) =>
          b.appointmentId === booking.appointmentId
            ? { ...b, status: 'cancelled', updatedAt: nowIso }
            : b
        )
      );
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === booking.appointmentId ? { ...a, status: 'cancelled', updatedAt: nowIso } : a
        )
      );
      setBusySlots((prev) =>
        prev.filter((b) => b.id !== booking.appointmentId && b.appointmentId !== booking.appointmentId)
      );

      if (booking.cancelToken && booking.phoneHash) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'appointments', booking.appointmentId), {
            status: 'cancelled',
            cancelProof: booking.cancelToken,
            updatedAt: serverTimestamp(),
          });
          batch.update(doc(db, 'phoneLookups', booking.phoneHash, 'bookings', booking.appointmentId), {
            status: 'cancelled',
            updatedAt: serverTimestamp(),
          });
          batch.delete(doc(db, 'busySlots', booking.appointmentId));
          await batch.commit();
        } catch (err) {
          console.warn('Cloud cancel sync warning:', err);
        }
      }

      showToast('Agendamento cancelado e horário liberado.');
    },
    [showToast]
  );

  const rescheduleClientBooking = useCallback(
    async (booking: ClientLookupBooking, nextDate: string, nextStartTime: string) => {
      const nowIso = new Date().toISOString();
      setDeviceBookings((prev) =>
        prev.map((b) =>
          b.appointmentId === booking.appointmentId
            ? { ...b, date: nextDate, startTime: nextStartTime, updatedAt: nowIso }
            : b
        )
      );
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === booking.appointmentId
            ? { ...a, date: nextDate, startTime: nextStartTime, updatedAt: nowIso }
            : a
        )
      );
      setBusySlots((prev) =>
        prev.map((b) =>
          b.id === booking.appointmentId || b.appointmentId === booking.appointmentId
            ? { ...b, date: nextDate, startTime: nextStartTime, updatedAt: nowIso }
            : b
        )
      );

      if (booking.cancelToken && booking.phoneHash) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'appointments', booking.appointmentId), {
            date: nextDate,
            startTime: nextStartTime,
            cancelProof: booking.cancelToken,
            updatedAt: serverTimestamp(),
          });
          batch.update(doc(db, 'phoneLookups', booking.phoneHash, 'bookings', booking.appointmentId), {
            date: nextDate,
            startTime: nextStartTime,
            updatedAt: serverTimestamp(),
          });
          batch.update(doc(db, 'busySlots', booking.appointmentId), {
            date: nextDate,
            startTime: nextStartTime,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (err) {
          console.warn('Cloud reschedule sync warning:', err);
        }
      }

      showToast(`Horário remarcado para ${nextStartTime}.`);
    },
    [showToast]
  );

  const updateAppointmentStatus = useCallback(
    async (appointmentId: string, status: AppointmentStatus) => {
      const target = appointments.find((a) => a.id === appointmentId);
      if (!target) return;
      const nowIso = new Date().toISOString();
      const adminLabel = (
        firebaseUser?.email ||
        firebaseUser?.displayName ||
        'Administrador'
      ).slice(0, 120);

      let nextPixStatus: PixPaymentStatus | undefined = target.pixPaymentStatus;
      if (status === 'confirmed' && ((target.pixFeeAmount || 0) > 0 || target.pixPaymentStatus === 'awaiting_verification')) {
        nextPixStatus = 'paid';
      } else if (status === 'cancelled' && target.pixPaymentStatus === 'awaiting_verification') {
        nextPixStatus = 'rejected';
      }

      const nextConfirmedAt = status === 'confirmed' ? nowIso : target.confirmedAt;
      const nextConfirmedBy = status === 'confirmed' ? adminLabel : target.confirmedBy;

      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId
            ? {
                ...a,
                status,
                pixPaymentStatus: nextPixStatus ?? a.pixPaymentStatus,
                confirmedAt: nextConfirmedAt,
                confirmedBy: nextConfirmedBy,
                updatedAt: nowIso,
              }
            : a
        )
      );
      setDeviceBookings((prev) =>
        prev.map((b) =>
          b.appointmentId === appointmentId
            ? {
                ...b,
                status,
                pixPaymentStatus: nextPixStatus ?? b.pixPaymentStatus,
                updatedAt: nowIso,
              }
            : b
        )
      );
      if (status === 'cancelled') {
        setBusySlots((prev) =>
          prev.filter((b) => b.id !== appointmentId && b.appointmentId !== appointmentId)
        );
      }

      if (isAdminUnlocked) {
        try {
          const batch = writeBatch(db);
          const aptUpdate: Record<string, unknown> = {
            status,
            updatedAt: serverTimestamp(),
          };
          const lookupUpdate: Record<string, unknown> = {
            status,
            updatedAt: serverTimestamp(),
          };
          if (nextPixStatus) {
            aptUpdate.pixPaymentStatus = nextPixStatus;
            lookupUpdate.pixPaymentStatus = nextPixStatus;
          }
          if (status === 'confirmed') {
            aptUpdate.confirmedAt = nowIso;
            aptUpdate.confirmedBy = adminLabel;
          }

          batch.update(doc(db, 'appointments', appointmentId), aptUpdate);
          if (target.phoneHash) {
            batch.update(
              doc(db, 'phoneLookups', target.phoneHash, 'bookings', appointmentId),
              lookupUpdate
            );
          }
          if (status === 'cancelled') {
            batch.delete(doc(db, 'busySlots', appointmentId));
          }
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `appointments/${appointmentId}`);
        }
      } else if (status === 'completed' && target.status !== 'completed') {
        setClients((prev) =>
          prev.map((c) =>
            normalizePhoneDigits(c.phone) === normalizePhoneDigits(target.clientPhone) ||
            c.name.toLowerCase() === target.clientName.toLowerCase()
              ? {
                  ...c,
                  loyaltyPoints: c.loyaltyPoints + 1,
                  totalVisits: c.totalVisits + 1,
                  totalSpent: c.totalSpent + target.totalPrice,
                  lastVisitDate: target.date,
                  updatedAt: nowIso,
                }
              : c
          )
        );
      }

      const labels: Record<AppointmentStatus, string> = {
        confirmed:
          nextPixStatus === 'paid'
            ? 'Pagamento PIX aprovado e agendamento confirmado.'
            : 'Agendamento confirmado.',
        pending: 'Status alterado para pendente.',
        completed: 'Atendimento marcado como concluído.',
        cancelled: 'Agendamento recusado/cancelado e horário liberado.',
      };
      showToast(labels[status]);
    },
    [appointments, firebaseUser, isAdminUnlocked, showToast]
  );

  const rescheduleAppointment = useCallback(
    async (
      appointmentId: string,
      nextDate: string,
      nextStartTime: string,
      nextProfessionalId?: string
    ) => {
      const target = appointments.find((a) => a.id === appointmentId);
      if (!target) return;
      const pro = nextProfessionalId
        ? professionals.find((p) => p.id === nextProfessionalId) || {
            id: target.professionalId,
            name: target.professionalName,
          }
        : { id: target.professionalId, name: target.professionalName };
      const nowIso = new Date().toISOString();

      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId
            ? {
                ...a,
                date: nextDate,
                startTime: nextStartTime,
                professionalId: pro.id,
                professionalName: pro.name,
                updatedAt: nowIso,
              }
            : a
        )
      );
      setDeviceBookings((prev) =>
        prev.map((b) =>
          b.appointmentId === appointmentId
            ? {
                ...b,
                date: nextDate,
                startTime: nextStartTime,
                professionalId: pro.id,
                professionalName: pro.name,
                updatedAt: nowIso,
              }
            : b
        )
      );
      setBusySlots((prev) =>
        prev.map((b) =>
          b.id === appointmentId || b.appointmentId === appointmentId
            ? { ...b, date: nextDate, startTime: nextStartTime, professionalId: pro.id, updatedAt: nowIso }
            : b
        )
      );

      if (isAdminUnlocked) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'appointments', appointmentId), {
            date: nextDate,
            startTime: nextStartTime,
            professionalId: pro.id,
            professionalName: pro.name,
            updatedAt: serverTimestamp(),
          });
          if (target.phoneHash) {
            batch.update(doc(db, 'phoneLookups', target.phoneHash, 'bookings', appointmentId), {
              date: nextDate,
              startTime: nextStartTime,
              professionalId: pro.id,
              professionalName: pro.name,
              updatedAt: serverTimestamp(),
            });
          }
          batch.update(doc(db, 'busySlots', appointmentId), {
            date: nextDate,
            startTime: nextStartTime,
            professionalId: pro.id,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `appointments/${appointmentId}`);
        }
      }

      showToast(`Horário remarcado para ${nextStartTime}.`);
    },
    [appointments, isAdminUnlocked, professionals, showToast]
  );

  const deleteAppointment = useCallback(
    async (appointmentId: string) => {
      const target = appointments.find((a) => a.id === appointmentId);
      setAppointments((prev) => prev.filter((a) => a.id !== appointmentId));
      setDeviceBookings((prev) => prev.filter((b) => b.appointmentId !== appointmentId));
      setBusySlots((prev) =>
        prev.filter((b) => b.id !== appointmentId && b.appointmentId !== appointmentId)
      );

      if (isAdminUnlocked) {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'appointments', appointmentId));
          batch.delete(doc(db, 'busySlots', appointmentId));
          if (target?.phoneHash) {
            batch.delete(doc(db, 'phoneLookups', target.phoneHash, 'bookings', appointmentId));
          }
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `appointments/${appointmentId}`);
        }
        if (target?.pixReceiptKey) {
          await cleanupR2ObjectByKey(target.pixReceiptKey);
        }
      }
      showToast('Agendamento removido.');
    },
    [appointments, cleanupR2ObjectByKey, isAdminUnlocked, showToast]
  );

  const toggleSlotBlock = useCallback(
    async (
      dateISO: string,
      startTime: string,
      professionalId: string,
      durationMinutes?: number,
      reason = 'Bloqueio administrativo'
    ) => {
      const existingBlock = busySlots.find(
        (b) =>
          b.kind === 'blocked' &&
          b.date === dateISO &&
          b.startTime === startTime &&
          b.professionalId === professionalId
      );
      const nowIso = new Date().toISOString();

      if (existingBlock) {
        setBusySlots((prev) => prev.filter((b) => b.id !== existingBlock.id));
        if (isAdminUnlocked) {
          try {
            await deleteDoc(doc(db, 'busySlots', existingBlock.id));
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, `busySlots/${existingBlock.id}`);
          }
        }
        showToast(`Horário ${startTime} liberado.`);
      } else {
        const blockId = `blk-${dateISO}-${startTime.replace(':', '')}-${professionalId}`;
        const slotDur = durationMinutes || settings.slotIntervalMinutes || 30;
        const ownerId = firebaseUser?.uid || 'admin';
        const newBlock: BusySlot = {
          id: blockId,
          date: dateISO,
          startTime,
          durationMinutes: slotDur,
          professionalId,
          kind: 'blocked',
          ownerId,
          reason: reason.slice(0, 120),
          updatedAt: nowIso,
        };

        setBusySlots((prev) => [...prev, newBlock]);
        if (isAdminUnlocked) {
          try {
            await setDoc(doc(db, 'busySlots', blockId), {
              date: newBlock.date,
              startTime: newBlock.startTime,
              durationMinutes: newBlock.durationMinutes,
              professionalId: newBlock.professionalId,
              kind: 'blocked',
              ownerId,
              reason: newBlock.reason,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `busySlots/${blockId}`);
          }
        }
        showToast(`Horário ${startTime} bloqueado.`);
      }
    },
    [busySlots, firebaseUser, isAdminUnlocked, settings.slotIntervalMinutes, showToast]
  );

  const saveSettings = useCallback(
    async (nextSettings: BusinessSettings) => {
      const prevSettings = settings;
      const prevLogoKey = (settings.headerLogoKey || '').trim();
      const prevBannerKey = (settings.heroBannerKey || '').trim();
      const prevAdminAvatarKey = (settings.adminAvatarKey || '').trim();

      const nowIso = new Date().toISOString();
      const safeLogoUrl = isValidHeaderLogoUrl(nextSettings.headerLogoUrl)
        ? nextSettings.headerLogoUrl
        : '';
      const safeLogoKey = safeLogoUrl ? (nextSettings.headerLogoKey || '').trim().slice(0, 260) : '';
      const safeLogoFileName = safeLogoUrl
        ? (nextSettings.headerLogoFileName || '').trim().slice(0, 180)
        : '';
      const safeLogoMimeType = safeLogoUrl
        ? (nextSettings.headerLogoMimeType || '').trim().slice(0, 60)
        : '';
      const safeLogoSize = safeLogoUrl
        ? Math.max(0, Math.round(Number(nextSettings.headerLogoSize || 0)))
        : 0;
      const safeLogoMode = normalizeHeaderLogoMode(nextSettings.headerLogoMode);
      const safeWatermarkOpacity = clampWatermarkOpacity(nextSettings.headerWatermarkOpacity);

      const safeHeroBannerUrl = isValidR2ProxyUrl(nextSettings.heroBannerUrl, 'banners')
        ? nextSettings.heroBannerUrl
        : '';
      const safeHeroBannerKey = safeHeroBannerUrl
        ? (nextSettings.heroBannerKey || '').trim().slice(0, 260)
        : '';
      const safeHeroBannerSubtitle = (nextSettings.heroBannerSubtitle || '').trim().slice(0, 160);

      const safeAdminAvatarUrl = isValidR2ProxyUrl(nextSettings.adminAvatarUrl, 'profiles')
        ? nextSettings.adminAvatarUrl
        : '';
      const safeAdminAvatarKey = safeAdminAvatarUrl
        ? (nextSettings.adminAvatarKey || '').trim().slice(0, 260)
        : '';

      const safeRequireAdminConfirmation = Boolean(nextSettings.requireAdminConfirmation);
      const safePixFeeEnabled = Boolean(nextSettings.pixFeeEnabled);
      const safePixFeePercentage = clampPixFeePercentage(nextSettings.pixFeePercentage);
      const safePixKeyType = normalizePixKeyType(nextSettings.pixKeyType);
      const safePixKey = (nextSettings.pixKey || '').trim().slice(0, 140);
      const safePixBankName = (nextSettings.pixBankName || '').trim().slice(0, 80);
      const safePixHolderName = (nextSettings.pixHolderName || '').trim().slice(0, 80);
      const safePixCity = (nextSettings.pixCity || 'Sao Paulo').trim().slice(0, 40) || 'Sao Paulo';
      const safePixProofMode = normalizePixProofMode(nextSettings.pixProofMode);
      const safePixWhatsappPhone = (nextSettings.pixWhatsappPhone || '').trim().slice(0, 30);

      const safeIntervalRaw = Math.round(Number(nextSettings.slotIntervalMinutes || 30));
      const safeSlotIntervalMinutes = Number.isFinite(safeIntervalRaw)
        ? Math.min(120, Math.max(10, safeIntervalRaw))
        : 30;
      const safeWeeklySchedule = sanitizeWeeklySchedule(nextSettings.weeklySchedule);
      const safeClosedDates = sanitizeClosedDates(nextSettings.closedDates);

      const sanitized: BusinessSettings = {
        ...nextSettings,
        businessName: nextSettings.businessName.trim().slice(0, 80) || 'Esmalteria&beleza',
        phone: nextSettings.phone.trim().slice(0, 30),
        address: nextSettings.address.trim().slice(0, 200),
        slotIntervalMinutes: safeSlotIntervalMinutes,
        weeklySchedule: safeWeeklySchedule,
        closedDates: safeClosedDates,
        headerLogoKey: safeLogoKey,
        headerLogoUrl: safeLogoUrl,
        headerLogoFileName: safeLogoFileName,
        headerLogoMimeType: safeLogoMimeType,
        headerLogoSize: safeLogoSize,
        headerLogoMode: safeLogoMode,
        headerWatermarkOpacity: safeWatermarkOpacity,
        heroBannerKey: safeHeroBannerKey,
        heroBannerUrl: safeHeroBannerUrl,
        heroBannerSubtitle: safeHeroBannerSubtitle,
        adminAvatarKey: safeAdminAvatarKey,
        adminAvatarUrl: safeAdminAvatarUrl,
        requireAdminConfirmation: safeRequireAdminConfirmation,
        pixFeeEnabled: safePixFeeEnabled,
        pixFeePercentage: safePixFeePercentage,
        pixKeyType: safePixKeyType,
        pixKey: safePixKey,
        pixBankName: safePixBankName,
        pixHolderName: safePixHolderName,
        pixCity: safePixCity,
        pixProofMode: safePixProofMode,
        pixWhatsappPhone: safePixWhatsappPhone,
        updatedAt: nowIso,
      };
      setSettings(sanitized);

      if (isAdminUnlocked) {
        try {
          await setDoc(doc(db, 'settings', 'main'), {
            businessName: sanitized.businessName,
            phone: sanitized.phone,
            address: sanitized.address,
            slotIntervalMinutes: sanitized.slotIntervalMinutes,
            weeklySchedule: sanitized.weeklySchedule,
            closedDates: sanitized.closedDates,
            headerLogoKey: sanitized.headerLogoKey || '',
            headerLogoUrl: sanitized.headerLogoUrl || '',
            headerLogoFileName: sanitized.headerLogoFileName || '',
            headerLogoMimeType: sanitized.headerLogoMimeType || '',
            headerLogoSize: sanitized.headerLogoSize || 0,
            headerLogoMode: sanitized.headerLogoMode || 'logo',
            headerWatermarkOpacity: sanitized.headerWatermarkOpacity ?? 14,
            heroBannerKey: sanitized.heroBannerKey || '',
            heroBannerUrl: sanitized.heroBannerUrl || '',
            heroBannerSubtitle: sanitized.heroBannerSubtitle || '',
            adminAvatarKey: sanitized.adminAvatarKey || '',
            adminAvatarUrl: sanitized.adminAvatarUrl || '',
            requireAdminConfirmation: safeRequireAdminConfirmation,
            pixFeeEnabled: safePixFeeEnabled,
            pixFeePercentage: safePixFeePercentage,
            pixKeyType: safePixKeyType,
            pixKey: safePixKey,
            pixBankName: safePixBankName,
            pixHolderName: safePixHolderName,
            pixCity: safePixCity,
            pixProofMode: safePixProofMode,
            pixWhatsappPhone: safePixWhatsappPhone,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          setSettings(prevSettings);
          handleFirestoreError(err, OperationType.WRITE, 'settings/main');
        }

        // Automatically delete replaced or removed R2 files after Firestore write succeeds
        if (prevLogoKey && prevLogoKey !== safeLogoKey) {
          await cleanupR2ObjectByKey(prevLogoKey);
        }
        if (prevBannerKey && prevBannerKey !== safeHeroBannerKey) {
          await cleanupR2ObjectByKey(prevBannerKey);
        }
        if (prevAdminAvatarKey && prevAdminAvatarKey !== safeAdminAvatarKey) {
          await cleanupR2ObjectByKey(prevAdminAvatarKey);
        }
      }
      showToast('Configurações salvas com sucesso.');
    },
    [cleanupR2ObjectByKey, isAdminUnlocked, settings, showToast]
  );

  const toggleDayClosed = useCallback(
    async (dateISO: string) => {
      const isClosed = settings.closedDates.includes(dateISO);
      const closedDates = isClosed
        ? settings.closedDates.filter((d) => d !== dateISO)
        : [...settings.closedDates, dateISO];
      await saveSettings({ ...settings, closedDates });
    },
    [saveSettings, settings]
  );

  const saveClient = useCallback(
    async (
      clientData: Omit<ClientRecord, 'id' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<ClientRecord> => {
      const id = existingId || generateSafeId('cli');
      const nowIso = new Date().toISOString();
      const existing = existingId ? clients.find((c) => c.id === existingId) : undefined;
      const record: ClientRecord = {
        id,
        name: clientData.name.trim().slice(0, 100),
        phone: clientData.phone.trim().slice(0, 30),
        email: clientData.email?.trim().slice(0, 120) || '',
        notes: clientData.notes?.trim().slice(0, 400) || '',
        loyaltyPoints: Math.max(0, Math.round(clientData.loyaltyPoints || 0)),
        totalVisits: Math.max(0, Math.round(clientData.totalVisits || 0)),
        totalSpent: Math.max(0, Number(clientData.totalSpent || 0)),
        lastVisitDate: clientData.lastVisitDate || existing?.lastVisitDate || '',
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      setClients((prev) =>
        existingId ? prev.map((c) => (c.id === id ? record : c)) : [record, ...prev]
      );

      if (isAdminUnlocked) {
        try {
          if (existingId) {
            await updateDoc(doc(db, 'clients', id), {
              name: record.name,
              phone: record.phone,
              email: record.email || '',
              notes: record.notes || '',
              loyaltyPoints: record.loyaltyPoints,
              totalVisits: record.totalVisits,
              totalSpent: record.totalSpent,
              lastVisitDate: record.lastVisitDate || '',
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'clients', id), {
              name: record.name,
              phone: record.phone,
              email: record.email || '',
              notes: record.notes || '',
              loyaltyPoints: record.loyaltyPoints,
              totalVisits: record.totalVisits,
              totalSpent: record.totalSpent,
              lastVisitDate: record.lastVisitDate || '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            existingId ? OperationType.UPDATE : OperationType.CREATE,
            `clients/${id}`
          );
        }
      }

      showToast(existingId ? 'Dados do cliente atualizados.' : 'Cliente cadastrado.');
      return record;
    },
    [clients, isAdminUnlocked, showToast]
  );

  const deleteClient = useCallback(
    async (clientId: string) => {
      setClients((prev) => prev.filter((c) => c.id !== clientId));
      if (isAdminUnlocked) {
        try {
          await deleteDoc(doc(db, 'clients', clientId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `clients/${clientId}`);
        }
      }
      showToast('Cliente removido.');
    },
    [isAdminUnlocked, showToast]
  );

  const saveService = useCallback(
    async (
      serviceData: Omit<ServiceItem, 'id' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ) => {
      const id = existingId || generateSafeId('srv');
      const nowIso = new Date().toISOString();
      const existing = existingId ? services.find((s) => s.id === existingId) : undefined;
      const oldImageKey = (existing?.imageKey || '').trim();
      const nextImageKey = (serviceData.imageKey || '').trim().slice(0, 260);
      const item: ServiceItem = {
        id,
        name: serviceData.name.trim().slice(0, 100),
        category: serviceData.category.trim().slice(0, 60),
        price: Math.max(0, Number(serviceData.price || 0)),
        durationMinutes: Math.max(5, Math.round(serviceData.durationMinutes || 30)),
        imageUrl: serviceData.imageUrl?.trim().slice(0, 500) || '',
        imageKey: nextImageKey,
        description: serviceData.description?.trim().slice(0, 300) || '',
        active: Boolean(serviceData.active),
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      setServices((prev) =>
        existingId ? prev.map((s) => (s.id === id ? item : s)) : [...prev, item]
      );

      if (isAdminUnlocked) {
        try {
          if (existingId) {
            await updateDoc(doc(db, 'services', id), {
              name: item.name,
              category: item.category,
              price: item.price,
              durationMinutes: item.durationMinutes,
              imageUrl: item.imageUrl || '',
              imageKey: item.imageKey || '',
              description: item.description || '',
              active: item.active,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'services', id), {
              name: item.name,
              category: item.category,
              price: item.price,
              durationMinutes: item.durationMinutes,
              imageUrl: item.imageUrl || '',
              imageKey: item.imageKey || '',
              description: item.description || '',
              active: item.active,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            existingId ? OperationType.UPDATE : OperationType.CREATE,
            `services/${id}`
          );
        }

        if (oldImageKey && oldImageKey !== nextImageKey) {
          await cleanupR2ObjectByKey(oldImageKey);
        }
      }

      showToast(existingId ? 'Serviço atualizado.' : 'Novo serviço adicionado.');
    },
    [cleanupR2ObjectByKey, isAdminUnlocked, services, showToast]
  );

  const deleteService = useCallback(
    async (serviceId: string) => {
      const target = services.find((s) => s.id === serviceId);
      setServices((prev) => prev.filter((s) => s.id !== serviceId));
      if (isAdminUnlocked) {
        try {
          await deleteDoc(doc(db, 'services', serviceId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `services/${serviceId}`);
        }
        if (target?.imageKey) {
          await cleanupR2ObjectByKey(target.imageKey);
        }
      }
      showToast('Serviço removido.');
    },
    [cleanupR2ObjectByKey, isAdminUnlocked, services, showToast]
  );

  const saveProfessional = useCallback(
    async (
      proData: Omit<Professional, 'id' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ) => {
      const id = existingId || generateSafeId('pro');
      const nowIso = new Date().toISOString();
      const existing = existingId ? professionals.find((p) => p.id === existingId) : undefined;
      const oldAvatarKey = (existing?.avatarKey || '').trim();
      const safeAvatarUrl = isValidR2ProxyUrl(proData.avatarUrl, 'profiles')
        ? proData.avatarUrl
        : '';
      const nextAvatarKey = safeAvatarUrl ? (proData.avatarKey || '').trim().slice(0, 260) : '';

      const item: Professional = {
        id,
        name: proData.name.trim().slice(0, 80),
        specialty: proData.specialty.trim().slice(0, 100),
        avatarInitials: proData.avatarInitials.trim().slice(0, 4).toUpperCase(),
        avatarUrl: safeAvatarUrl || '',
        avatarKey: nextAvatarKey,
        active: Boolean(proData.active),
        workDays: proData.workDays.slice(0, 7),
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      setProfessionals((prev) =>
        existingId ? prev.map((p) => (p.id === id ? item : p)) : [...prev, item]
      );

      if (isAdminUnlocked) {
        try {
          if (existingId) {
            await updateDoc(doc(db, 'professionals', id), {
              name: item.name,
              specialty: item.specialty,
              avatarInitials: item.avatarInitials,
              avatarUrl: item.avatarUrl || '',
              avatarKey: item.avatarKey || '',
              active: item.active,
              workDays: item.workDays,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'professionals', id), {
              name: item.name,
              specialty: item.specialty,
              avatarInitials: item.avatarInitials,
              avatarUrl: item.avatarUrl || '',
              avatarKey: item.avatarKey || '',
              active: item.active,
              workDays: item.workDays,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            existingId ? OperationType.UPDATE : OperationType.CREATE,
            `professionals/${id}`
          );
        }

        if (oldAvatarKey && oldAvatarKey !== nextAvatarKey) {
          await cleanupR2ObjectByKey(oldAvatarKey);
        }
      }

      showToast(existingId ? 'Profissional atualizado.' : 'Profissional adicionado.');
    },
    [cleanupR2ObjectByKey, isAdminUnlocked, professionals, showToast]
  );

  const deleteProfessional = useCallback(
    async (professionalId: string) => {
      const target = professionals.find((p) => p.id === professionalId);
      setProfessionals((prev) => prev.filter((p) => p.id !== professionalId));
      if (isAdminUnlocked) {
        try {
          await deleteDoc(doc(db, 'professionals', professionalId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `professionals/${professionalId}`);
        }
        if (target?.avatarKey) {
          await cleanupR2ObjectByKey(target.avatarKey);
        }
      }
      showToast('Profissional removido.');
    },
    [cleanupR2ObjectByKey, isAdminUnlocked, professionals, showToast]
  );

  const value = useMemo<BookingContextValue>(
    () => ({
      authReady,
      adminCheckingActivation,
      firebaseUser,
      isAdminUser,
      isAdminUnlocked,
      cloudSynced,
      services,
      professionals,
      settings,
      clients,
      appointments,
      busySlots,
      mediaAssets,
      galleryItems,
      deviceBookings,
      toastMessage,
      clearToast,
      showToast,
      signInAdminGoogle,
      verifyAdminPin,
      lockAdminSession,
      uploadMediaAsset,
      deleteMediaAsset,
      cleanupR2ObjectByKey,
      addGalleryItem,
      replaceGalleryItemPhoto,
      deleteGalleryItem,
      createAppointment,
      lookupBookingsByPhone,
      cancelClientBooking,
      rescheduleClientBooking,
      updateAppointmentStatus,
      rescheduleAppointment,
      deleteAppointment,
      toggleSlotBlock,
      toggleDayClosed,
      saveClient,
      deleteClient,
      saveService,
      deleteService,
      saveProfessional,
      deleteProfessional,
      saveSettings,
    }),
    [
      authReady,
      adminCheckingActivation,
      firebaseUser,
      isAdminUser,
      isAdminUnlocked,
      cloudSynced,
      services,
      professionals,
      settings,
      clients,
      appointments,
      busySlots,
      mediaAssets,
      galleryItems,
      deviceBookings,
      toastMessage,
      clearToast,
      showToast,
      signInAdminGoogle,
      verifyAdminPin,
      lockAdminSession,
      uploadMediaAsset,
      deleteMediaAsset,
      cleanupR2ObjectByKey,
      addGalleryItem,
      replaceGalleryItemPhoto,
      deleteGalleryItem,
      createAppointment,
      lookupBookingsByPhone,
      cancelClientBooking,
      rescheduleClientBooking,
      updateAppointmentStatus,
      rescheduleAppointment,
      deleteAppointment,
      toggleSlotBlock,
      toggleDayClosed,
      saveClient,
      deleteClient,
      saveService,
      deleteService,
      saveProfessional,
      deleteProfessional,
      saveSettings,
    ]
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    throw new Error('useBooking deve ser usado dentro de BookingProvider.');
  }
  return ctx;
}
