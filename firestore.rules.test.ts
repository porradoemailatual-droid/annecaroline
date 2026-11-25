import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8'));

test('firestore.rules starts with default-deny catch-all and covers every blueprint collection', () => {
  assert.match(rulesContent, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);

  const expectedCollections = [
    'services',
    'professionals',
    'settings',
    'busySlots',
    'appointments',
    'phoneLookups',
    'clients',
    'admins',
    'mediaAssets',
    'galleryItems',
  ];
  for (const col of expectedCollections) {
    assert.ok(
      rulesContent.includes(`match /${col}/`),
      `Missing match block for collection /${col}`
    );
  }
  assert.equal(Object.keys(blueprint.firestore).length, expectedCollections.length);
});

test('Dirty Dozen security invariants and loginless guest PII isolation are enforced in firestore.rules', () => {
  // 1 & 2. Strict key checks (hasAll + hasOnly) and shadow field protection
  assert.match(rulesContent, /data\.keys\(\)\.hasAll/);
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly/);

  // 3. Verified email enforcement for bootstrapped admin (prevents email spoofing)
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);

  // 3b. Statically provable list rules for public catalog collections
  assert.match(rulesContent, /match \/services\/\{serviceId\}[\s\S]*allow list: if resource\.data\.active in \[true, false\]/);
  assert.match(rulesContent, /match \/professionals\/\{professionalId\}[\s\S]*allow list: if resource\.data\.active in \[true, false\]/);
  assert.match(rulesContent, /match \/busySlots\/\{slotId\}[\s\S]*allow list: if resource\.data\.kind in \['appointment', 'blocked'\]/);

  // 4 & 5. Strict PII isolation on appointments and clients (admin-only reads)
  assert.match(rulesContent, /match \/appointments\/\{appointmentId\}[\s\S]*allow get: if isVerified\(\) && isValidId\(appointmentId\) && isAdmin\(\)/);
  assert.match(rulesContent, /match \/appointments\/\{appointmentId\}[\s\S]*allow list: if isAdmin\(\)/);
  assert.match(rulesContent, /match \/clients\/\{clientId\}[\s\S]*allow get: if isVerified\(\) && isValidId\(clientId\) && isAdmin\(\)/);
  assert.match(rulesContent, /match \/clients\/\{clientId\}[\s\S]*allow list: if isAdmin\(\)/);

  // 6. Parent phoneLookups unenumerable + exact SHA-256 phoneHash required
  assert.match(rulesContent, /match \/phoneLookups\/\{phoneHash\}\s*\{\s*allow read, write: if false;/);
  assert.match(rulesContent, /function isValidPhoneHash\(hash\)/);

  // 7. Admin self-escalation blocked without server-verified PIN activationProof hash
  assert.match(rulesContent, /function isValidActivationProof\(proof\)/);
  assert.match(rulesContent, /hashing\.sha256\(proof\.toUtf8\(\)\)\.toHexString\(\)\.lower\(\)/);
  assert.match(rulesContent, /match \/admins\/\{adminUid\}[\s\S]*allow create: if isVerified\(\)[\s\S]*isOwner\(adminUid\)[\s\S]*isValidAdminRecord\(incoming\(\), adminUid\)/);

  // 7b. Metadata-only R2 storage rules (no binary blobs in Firestore; strict key & proxy URL patterns)
  assert.match(rulesContent, /function isValidR2ObjectKey\(key\)/);
  assert.match(rulesContent, /match \/mediaAssets\/\{assetId\}[\s\S]*allow list: if isAdmin\(\)/);
  assert.match(rulesContent, /match \/galleryItems\/\{itemId\}[\s\S]*allow list: if resource\.data\.active in \[true, false\]/);
  assert.match(rulesContent, /headerLogoUrl\.matches/);
  assert.match(rulesContent, /heroBannerUrl\.matches/);
  assert.match(rulesContent, /adminAvatarUrl\.matches/);

  // 8 & 9. Status shortcutting, cancelToken proof & terminal state lock
  assert.match(rulesContent, /incoming\(\)\.status in \['pending', 'confirmed'\]/);
  assert.match(rulesContent, /incoming\(\)\.cancelProof == existing\(\)\.cancelToken/);
  assert.match(rulesContent, /!\(existing\(\)\.status in \['completed', 'cancelled'\]\)/);

  // 10. Path ID hardening
  assert.match(rulesContent, /function isValidId\(id\)/);

  // 11 & 12. Strict server timestamp & atomicity existsAfter / getAfter
  assert.match(rulesContent, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesContent, /existsAfter\(\/databases\/\$\(database\)\/documents\/busySlots\/\$\(appointmentId\)\)/);
  assert.match(rulesContent, /existsAfter\(\/databases\/\$\(database\)\/documents\/phoneLookups\/\$\(incoming\(\)\.phoneHash\)\/bookings\/\$\(appointmentId\)\)/);

  // 13. PIX pre-booking fee & private receipt key hardening
  assert.match(rulesContent, /function isValidPixReceiptKey\(key\)/);
  assert.match(rulesContent, /private\/receipts\//);
  assert.match(rulesContent, /incoming\(\)\.pixPaymentStatus in \['not_required', 'awaiting_verification'\]/);
  assert.match(rulesContent, /requireAdminConfirmation/);
  assert.match(rulesContent, /pixFeePercentage/);
});
