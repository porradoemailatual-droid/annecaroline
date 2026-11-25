import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPixWhatsappHref,
  calculatePixFee,
  computeCrc16Ccitt,
  formatPixKeyForBrCode,
  generatePixBrCodePayload,
  sanitizeEmvAscii,
  validatePixConfig,
} from './pix';

describe('PIX EMVCo BR Code & Fee Engine', () => {
  it('computes standard CRC16-CCITT (0x1021 / 0xFFFF) accurately', () => {
    // Standard CRC-16/CCITT-FALSE check value for "123456789" is 0x29B1
    assert.equal(computeCrc16Ccitt('123456789'), '29B1');
  });

  it('calculates PIX fee and remaining balance with exact cent rounding', () => {
    assert.deepEqual(calculatePixFee(90, 30), { feeAmount: 27, remainingAmount: 63 });
    assert.deepEqual(calculatePixFee(75, 15), { feeAmount: 11.25, remainingAmount: 63.75 });
    assert.deepEqual(calculatePixFee(125.5, 100), { feeAmount: 125.5, remainingAmount: 0 });
    assert.deepEqual(calculatePixFee(99.99, 33), { feeAmount: 33, remainingAmount: 66.99 });
  });

  it('normalizes all 5 PIX key types according to Banco Central spec', () => {
    assert.equal(formatPixKeyForBrCode('123.456.789-01', 'cpf'), '12345678901');
    assert.equal(formatPixKeyForBrCode('12.345.678/0001-99', 'cnpj'), '12345678000199');
    assert.equal(formatPixKeyForBrCode('(19) 99100-2040', 'phone'), '+5519991002040');
    assert.equal(formatPixKeyForBrCode('+55 19 99100-2040', 'phone'), '+5519991002040');
    assert.equal(formatPixKeyForBrCode('  Financeiro@Salao.COM ', 'email'), 'financeiro@salao.com');
    assert.equal(
      formatPixKeyForBrCode(' 123e4567-e89b-12d3-a456-426614174000 ', 'random'),
      '123e4567-e89b-12d3-a456-426614174000'
    );
  });

  it('generates a valid EMVCo BR Code payload with valid CRC16 and exact fee amount', () => {
    const payload = generatePixBrCodePayload({
      pixKey: '(19) 99100-2040',
      pixKeyType: 'phone',
      merchantName: 'Esmalteria & Beleza São José',
      merchantCity: 'Campinas / SP',
      amount: 27.5,
      txid: 'AGEND12345',
    });

    assert.ok(payload.startsWith('000201'));
    assert.ok(payload.includes('0014br.gov.bcb.pix'));
    assert.ok(payload.includes('0114+5519991002040'));
    assert.ok(payload.includes('52040000'));
    assert.ok(payload.includes('5303986'));
    assert.ok(payload.includes('540527.50'));
    assert.ok(payload.includes('5802BR'));
    assert.ok(payload.includes('62140510AGEND12345'));

    // Verify trailing CRC tag 63 matches recomputed CRC16-CCITT
    const withoutCrc = payload.slice(0, -4);
    const crc = payload.slice(-4);
    assert.ok(withoutCrc.endsWith('6304'));
    assert.equal(crc, computeCrc16Ccitt(withoutCrc));
  });

  it('strips accents and respects EMVCo max field lengths for merchant name and city', () => {
    const cleanName = sanitizeEmvAscii('Estúdio Ágatha & Cabeleireiros Especialistas', 25, 'SALAO');
    assert.ok(cleanName.length <= 25);
    assert.equal(/[^\x20-\x7E]/.test(cleanName), false);

    const payload = generatePixBrCodePayload({
      pixKey: 'teste@salao.com.br',
      pixKeyType: 'email',
      merchantName: 'Estúdio Ágatha & Cabeleireiros Especialistas',
      merchantCity: 'São José dos Campos',
      amount: 45,
    });
    assert.equal(/[^\x20-\x7E]/.test(payload), false);
    assert.equal(payload.slice(-4), computeCrc16Ccitt(payload.slice(0, -4)));
  });

  it('validates PIX configuration rules accurately', () => {
    assert.equal(validatePixConfig({ pixFeeEnabled: false }).valid, true);

    assert.equal(
      validatePixConfig({
        pixFeeEnabled: true,
        pixFeePercentage: 0,
        pixKeyType: 'cpf',
        pixKey: '12345678901',
        pixBankName: 'Nubank',
      }).valid,
      false
    );

    assert.equal(
      validatePixConfig({
        pixFeeEnabled: true,
        pixFeePercentage: 30,
        pixKeyType: 'cpf',
        pixKey: '123.456.789-01',
        pixBankName: 'Nubank',
      }).valid,
      true
    );

    assert.equal(
      validatePixConfig({
        pixFeeEnabled: true,
        pixFeePercentage: 30,
        pixKeyType: 'email',
        pixKey: 'invalido',
        pixBankName: 'Itau',
      }).valid,
      false
    );

    assert.equal(
      validatePixConfig({
        pixFeeEnabled: true,
        pixFeePercentage: 30,
        pixKeyType: 'phone',
        pixKey: '(19) 99100-2040',
        pixBankName: '',
      }).valid,
      false
    );
  });

  it('builds a safe wa.me link with encoded PIX booking summary', () => {
    const href = buildPixWhatsappHref({
      phone: '(19) 99100-2040',
      businessName: 'Esmalteria&beleza',
      clientName: 'Carla Lima',
      serviceNames: ['Corte feminino'],
      professionalName: 'Anne C.',
      dateBR: '26/11/2026',
      startTime: '14:00',
      totalPrice: 90,
      feeAmount: 27,
      feePercentage: 30,
    });

    assert.ok(href);
    assert.ok(href.startsWith('https://wa.me/5519991002040?text='));
    assert.ok(decodeURIComponent(href).includes('Carla Lima'));
    assert.ok(decodeURIComponent(href).includes('Taxa PIX (30%)'));
  });
});
