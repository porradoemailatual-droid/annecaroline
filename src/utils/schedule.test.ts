import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateServicesSummary,
  computeAdminDaySlots,
  computeAdminStats,
  computeAvailableSlots,
  formatPhoneMaskBR,
  hashPhoneDigits,
  normalizePhoneDigits,
  rangesOverlap,
  timeToMinutes,
  minutesToTime,
  validateBookingInput,
  validateClientInput,
  validateServiceInput,
} from './schedule';
import type { Appointment, BusinessSettings, BusySlot, Professional, ServiceItem } from '../types/booking';

const mockSettings: BusinessSettings = {
  businessName: 'Esmalteria&beleza',
  phone: '(19) 99100-2040',
  address: 'Rua das Flores, 240',
  slotIntervalMinutes: 30,
  closedDates: ['2026-12-25'],
  updatedAt: '2026-11-24T12:00:00Z',
  weeklySchedule: {
    '0': { open: false, start: '09:00', end: '18:00' },
    '1': { open: true, start: '09:00', end: '19:00', breakStart: '12:00', breakEnd: '13:00' },
    '2': { open: true, start: '09:00', end: '19:00', breakStart: '12:00', breakEnd: '13:00' },
    '3': { open: true, start: '09:00', end: '19:00', breakStart: '12:00', breakEnd: '13:00' },
    '4': { open: true, start: '09:00', end: '19:00' },
    '5': { open: true, start: '09:00', end: '19:00' },
    '6': { open: true, start: '09:00', end: '17:00' },
  },
};

const mockPro: Professional = {
  id: 'pro-anne',
  name: 'Anne C.',
  specialty: 'Cabelo & Unhas',
  avatarInitials: 'AC',
  active: true,
  workDays: [1, 2, 3, 4, 5, 6],
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
};

const mockServices: ServiceItem[] = [
  {
    id: 'srv-1',
    name: 'Corte feminino',
    category: 'Cabelo',
    price: 90,
    durationMinutes: 60,
    active: true,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'srv-2',
    name: 'Esmaltação em Gel',
    category: 'Unhas',
    price: 75,
    durationMinutes: 45,
    active: true,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
];

const TEST_HASH = 'a'.repeat(64);

test('time conversion and overlap helpers work accurately', () => {
  assert.equal(timeToMinutes('10:30'), 630);
  assert.equal(minutesToTime(630), '10:30');
  assert.equal(rangesOverlap(600, 60, 630, 30), true);
  assert.equal(rangesOverlap(600, 60, 660, 30), false);
});

test('phone normalization, formatting, and SHA-256 hashing are consistent', async () => {
  assert.equal(normalizePhoneDigits('(19) 99124-3310'), '19991243310');
  assert.equal(formatPhoneMaskBR('19991243310'), '(19) 99124-3310');
  const h1 = await hashPhoneDigits('(19) 99124-3310');
  const h2 = await hashPhoneDigits('19991243310');
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});

test('computeAvailableSlots excludes closed days, Sunday, lunch break, bookings, and admin blocks', () => {
  const sundaySlots = computeAvailableSlots({
    dateISO: '2026-11-29',
    professional: mockPro,
    serviceDurationMinutes: 60,
    settings: mockSettings,
    busySlots: [],
    appointments: [],
  });
  assert.deepEqual(sundaySlots, []);

  const holidaySlots = computeAvailableSlots({
    dateISO: '2026-12-25',
    professional: mockPro,
    serviceDurationMinutes: 60,
    settings: mockSettings,
    busySlots: [],
    appointments: [],
  });
  assert.deepEqual(holidaySlots, []);

  const existingApts: Appointment[] = [
    {
      id: 'apt-1',
      userId: 'guest',
      clientName: 'Carla Lima',
      clientPhone: '(19) 99999-1111',
      phoneHash: TEST_HASH,
      cancelToken: 'tok-test-carla-001',
      forSomeoneElse: false,
      professionalId: 'pro-anne',
      professionalName: 'Anne C.',
      serviceIds: ['srv-1'],
      serviceNames: ['Corte feminino'],
      totalPrice: 90,
      totalDurationMinutes: 60,
      date: '2026-11-25',
      startTime: '10:00',
      status: 'confirmed',
      createdAt: '2026-11-24T10:00:00Z',
      updatedAt: '2026-11-24T10:00:00Z',
    },
  ];
  const blocks: BusySlot[] = [
    {
      id: 'blk-1',
      date: '2026-11-25',
      startTime: '14:00',
      durationMinutes: 30,
      professionalId: 'pro-anne',
      kind: 'blocked',
      ownerId: 'admin',
      updatedAt: '2026-11-24T10:00:00Z',
    },
  ];

  const wedSlots = computeAvailableSlots({
    dateISO: '2026-11-25',
    professional: mockPro,
    serviceDurationMinutes: 60,
    settings: mockSettings,
    busySlots: blocks,
    appointments: existingApts,
  });

  assert.equal(wedSlots.includes('09:00'), true);
  assert.equal(wedSlots.includes('09:30'), false);
  assert.equal(wedSlots.includes('10:00'), false);
  assert.equal(wedSlots.includes('10:30'), false);
  assert.equal(wedSlots.includes('11:00'), true);
  assert.equal(wedSlots.includes('11:30'), false);
  assert.equal(wedSlots.includes('13:30'), false);
  assert.equal(wedSlots.includes('14:00'), false);
  assert.equal(wedSlots.includes('14:30'), true);
  assert.equal(wedSlots.includes('18:00'), true);
  assert.equal(wedSlots.includes('18:30'), false);
});

test('computeAdminDaySlots classifies available, booked, and blocked slots', () => {
  const apts: Appointment[] = [
    {
      id: 'apt-2',
      userId: 'guest',
      clientName: 'Juliana Paz',
      clientPhone: '(19) 98888-2222',
      phoneHash: TEST_HASH,
      cancelToken: 'tok-test-juliana-002',
      forSomeoneElse: false,
      professionalId: 'pro-anne',
      professionalName: 'Anne C.',
      serviceIds: ['srv-1'],
      serviceNames: ['Corte feminino'],
      totalPrice: 90,
      totalDurationMinutes: 60,
      date: '2026-11-26',
      startTime: '10:30',
      status: 'confirmed',
      createdAt: '2026-11-24T10:00:00Z',
      updatedAt: '2026-11-24T10:00:00Z',
    },
  ];
  const blocks: BusySlot[] = [
    {
      id: 'blk-2',
      date: '2026-11-26',
      startTime: '15:00',
      durationMinutes: 30,
      professionalId: 'pro-anne',
      kind: 'blocked',
      ownerId: 'admin',
      updatedAt: '2026-11-24T10:00:00Z',
    },
  ];

  const daySlots = computeAdminDaySlots({
    dateISO: '2026-11-26',
    professional: mockPro,
    settings: mockSettings,
    busySlots: blocks,
    appointments: apts,
  });

  assert.equal(daySlots.find((s) => s.time === '10:30')?.status, 'booked');
  assert.equal(daySlots.find((s) => s.time === '11:00')?.status, 'booked');
  assert.equal(daySlots.find((s) => s.time === '11:30')?.status, 'available');
  assert.equal(daySlots.find((s) => s.time === '15:00')?.status, 'blocked');
});

test('services summary and admin KPI calculations are accurate', () => {
  const summary = calculateServicesSummary(mockServices, ['srv-1', 'srv-2']);
  assert.equal(summary.totalPrice, 165);
  assert.equal(summary.totalDurationMinutes, 105);

  const stats = computeAdminStats(
    [
      {
        id: 'a1',
        userId: 'guest',
        clientName: 'Ana',
        clientPhone: '(19) 99999-0000',
        phoneHash: TEST_HASH,
        cancelToken: 'tok-test-ana-003',
        forSomeoneElse: false,
        professionalId: 'pro-anne',
        professionalName: 'Anne C.',
        serviceIds: ['srv-1'],
        serviceNames: ['Corte feminino'],
        totalPrice: 90,
        totalDurationMinutes: 60,
        date: '2026-11-26',
        startTime: '10:00',
        status: 'confirmed',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'a2',
        userId: 'guest',
        clientName: 'Bea',
        clientPhone: '(19) 99999-1111',
        phoneHash: TEST_HASH,
        cancelToken: 'tok-test-bea-004',
        forSomeoneElse: false,
        professionalId: 'pro-anne',
        professionalName: 'Anne C.',
        serviceIds: ['srv-2'],
        serviceNames: ['Esmaltação em Gel'],
        totalPrice: 75,
        totalDurationMinutes: 45,
        date: '2026-11-26',
        startTime: '11:00',
        status: 'cancelled',
        createdAt: '',
        updatedAt: '',
      },
    ],
    '2026-11-26'
  );
  assert.equal(stats.totalDay, 1);
  assert.equal(stats.confirmedDay, 1);
  assert.equal(stats.expectedRevenueDay, 90);
});

test('guest booking validation requires only name and phone (no email or login)', () => {
  assert.equal(
    validateBookingInput({
      selectedServiceIds: [],
      professionalId: 'pro-anne',
      date: '2026-11-26',
      startTime: '10:30',
      clientName: 'Mariana Costa',
      clientPhone: '(19) 99124-3310',
      forSomeoneElse: false,
    }).valid,
    false
  );
  assert.equal(
    validateBookingInput({
      selectedServiceIds: ['srv-1'],
      professionalId: 'pro-anne',
      date: '2026-11-26',
      startTime: '10:30',
      clientName: 'Mariana Costa',
      clientPhone: '(19) 99124-3310',
      forSomeoneElse: false,
    }).valid,
    true
  );
  assert.equal(
    validateServiceInput({ name: 'A', category: 'Cabelo', price: 90, durationMinutes: 60 }).valid,
    false
  );
  assert.equal(
    validateClientInput({ name: 'Mariana Costa', phone: '123' }).valid,
    false
  );
});
