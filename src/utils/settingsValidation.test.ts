import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedData } from '../data/seedData';
import type { BusinessSettings } from '../types/booking';
import {
  formatSettingsSaveError,
  getChangedSubTabs,
  sanitizeClosedDates,
  sanitizeWeeklySchedule,
  validateSettingsDraft,
} from './settingsValidation';

const SEED_SETTINGS = createSeedData().settings;

function cloneSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return {
    ...SEED_SETTINGS,
    weeklySchedule: JSON.parse(JSON.stringify(SEED_SETTINGS.weeklySchedule)),
    closedDates: [...SEED_SETTINGS.closedDates],
    ...overrides,
  };
}

test('sanitizeWeeklySchedule removes undefined break fields so Firestore never rejects writes', () => {
  const dirtySchedule: BusinessSettings['weeklySchedule'] = {
    ...SEED_SETTINGS.weeklySchedule,
    '1': {
      open: true,
      start: '09:00',
      end: '18:00',
      breakStart: undefined,
      breakEnd: undefined,
    },
    '2': {
      open: true,
      start: '09:00',
      end: '18:00',
      breakStart: '12:00',
      breakEnd: '13:00',
    },
  };

  const sanitized = sanitizeWeeklySchedule(dirtySchedule);
  assert.equal('breakStart' in sanitized['1'], false);
  assert.equal('breakEnd' in sanitized['1'], false);
  assert.equal(sanitized['2'].breakStart, '12:00');
  assert.equal(sanitized['2'].breakEnd, '13:00');
  assert.equal(Object.keys(sanitized).length, 7);
});

test('validateSettingsDraft routes errors to the exact sub-tab that needs attention', () => {
  const badPix = cloneSettings({
    pixFeeEnabled: true,
    pixFeePercentage: 30,
    pixKeyType: 'cpf',
    pixKey: '123',
    pixBankName: 'Nubank',
  });
  const resPix = validateSettingsDraft(badPix);
  assert.equal(resPix.valid, false);
  if (!resPix.valid) {
    assert.equal(resPix.tab, 'pix');
  }

  const badSchedule = cloneSettings({
    weeklySchedule: {
      ...SEED_SETTINGS.weeklySchedule,
      '1': { open: true, start: '19:00', end: '09:00' },
    },
  });
  const resSchedule = validateSettingsDraft(badSchedule);
  assert.equal(resSchedule.valid, false);
  if (!resSchedule.valid) {
    assert.equal(resSchedule.tab, 'schedule');
  }

  const badGeneral = cloneSettings({ businessName: 'A' });
  const resGeneral = validateSettingsDraft(badGeneral);
  assert.equal(resGeneral.valid, false);
  if (!resGeneral.valid) {
    assert.equal(resGeneral.tab, 'general');
  }
});

test('getChangedSubTabs accurately detects edits per sub-tab and clears when reverted', () => {
  const base = cloneSettings();
  assert.deepEqual(getChangedSubTabs(base, base), []);

  const edited = cloneSettings({
    pixFeeEnabled: true,
    pixBankName: 'Itaú',
    address: 'Rua Nova, 123',
  });
  assert.deepEqual(getChangedSubTabs(edited, base), ['pix', 'general']);

  const reverted = cloneSettings({
    pixFeeEnabled: base.pixFeeEnabled,
    pixBankName: base.pixBankName,
    address: base.address,
  });
  assert.deepEqual(getChangedSubTabs(reverted, base), []);
});

test('sanitizeClosedDates deduplicates, filters malformed dates, and sorts chronologically', () => {
  assert.deepEqual(
    sanitizeClosedDates(['2026-12-25', 'invalid', '2026-01-01', '2026-12-25']),
    ['2026-01-01', '2026-12-25']
  );
});

test('formatSettingsSaveError returns clear user-facing Portuguese messages', () => {
  assert.match(
    formatSettingsSaveError(new Error('Missing or insufficient permissions.')),
    /permissão/i
  );
  assert.match(
    formatSettingsSaveError(new Error('Failed to get document because the client is offline.')),
    /conexão/i
  );
});
