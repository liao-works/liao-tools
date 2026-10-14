import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHsCode, validateTaxHsCode, validateAltaHsCode } from '../src/lib/hs-code.ts';

test('normalization only removes permitted separators', () => {
  assert.equal(normalizeHsCode('  0101-210 000 '), '0101210000');
  assert.equal(normalizeHsCode('12x3 456'), '12x3456');
  assert.equal(normalizeHsCode(' 12\t34\n56 '), '123456');
});

test('tax exact accepts ten digits and normalizes before invoking backend', () => {
  assert.deepEqual(validateTaxHsCode('0101-210 000', false), { ok: true, code: '0101210000' });
  assert.equal(validateTaxHsCode('010121000', false).ok, false);
  assert.equal(validateTaxHsCode('12345678901', false).ok, false);
  assert.equal(validateTaxHsCode('AA01210000', false).ok, false);
});

test('tax fuzzy only accepts 4–10 digits', () => {
  assert.deepEqual(validateTaxHsCode(' 0101 ', true), { ok: true, code: '0101' });
  assert.equal(validateTaxHsCode('123', true).ok, false);
  assert.equal(validateTaxHsCode('12345678901', true).ok, false);
});

test('Alta 4/6/8 matching respects minimum digits', () => {
  assert.deepEqual(validateAltaHsCode('8504-40', 6), { ok: true, code: '850440' });
  assert.equal(validateAltaHsCode('8504', 6).ok, false);
  assert.equal(validateAltaHsCode('850440', 8).ok, false);
  assert.equal(validateAltaHsCode('8504', 4).ok, true);
  assert.equal(validateAltaHsCode('8504', undefined).ok, true);
});

test('rejects ambiguous HS input without silently stripping invalid characters', () => {
  for (const raw of ['ABC1234567', '123.456.7890', '12/34567890', '  ', '８５０４４０']) {
    assert.equal(validateTaxHsCode(raw, false).ok, false, raw);
    assert.equal(validateAltaHsCode(raw, 4).ok, false, raw);
  }
});
