// Public invitation link selected by E.Lab.
export const PROFILE_CANONICAL_URL = 'https://elab.boutique/meu-perfil';
export const PROFILE_FORM_URL = 'https://abre.ai/meuperfilelab';

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
