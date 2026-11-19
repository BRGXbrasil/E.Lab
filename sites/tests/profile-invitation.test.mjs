import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_FORM_URL, PROFILE_CANONICAL_URL, profileInvitation, validatedProfileFormUrl } from '../src/profile-invitation.js';

test('invitation uses the selected public profile link and preserves canonical target', () => {
 assert.equal(PROFILE_FORM_URL, 'https://abre.ai/meuperfilelab');
 assert.equal(PROFILE_CANONICAL_URL, 'https://elab.boutique/meu-perfil');
 const invitation = profileInvitation();
 assert.equal(invitation.url, PROFILE_FORM_URL);
 assert.match(invitation.message, /e\.lab/);
 assert.ok(invitation.message.includes(PROFILE_FORM_URL));
 assert.match(invitation.message, /preferências/);
});

test('only known public form URLs are accepted in invitation text', () => {
 assert.equal(validatedProfileFormUrl(PROFILE_CANONICAL_URL), PROFILE_CANONICAL_URL);
 assert.equal(profileInvitation(PROFILE_CANONICAL_URL).url, PROFILE_CANONICAL_URL);
 for (const url of ['javascript:alert(1)', 'http://elab.boutique/meu-perfil', 'https://elab.boutique.evil.test/meu-perfil', '/meu-perfil/', 'https://elab.boutique/meu-perfil?token=secret', 'https://example.org/']) {
  assert.throws(() => validatedProfileFormUrl(url), /formulário/);
 }
});
