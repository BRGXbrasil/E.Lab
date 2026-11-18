// The canonical domain could not be verified on 2026-11-18. The public GitHub
// form returned 200 and its actual question form, so invitations use it until
// the canonical domain can be verified. No runtime network call is necessary.
export const PROFILE_CANONICAL_URL = 'https://elab.boutique/meu-perfil';
export const PROFILE_FORM_URL = 'https://brgxbrasil.github.io/E.Lab/meu-perfil/';

export function validatedProfileFormUrl(value = PROFILE_FORM_URL) {
 if (![PROFILE_FORM_URL, PROFILE_CANONICAL_URL].includes(value)) {
  throw new Error('Link do formulário Meu Perfil inválido.');
 }
 return value;
}

export function profileInvitation(value = PROFILE_FORM_URL) {
 const url = validatedProfileFormUrl(value);
 return {
  url,
  message: `Olá! Para preparar seu atendimento com carinho, preencha antes da sua visita e conte um pouco sobre você e suas preferências no Meu Perfil da e.lab. Responda só o que se sentir à vontade para compartilhar: ${url}`
 };
}
