export function normalizeAuthorityMessage(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/(?<=\p{Script=Latin})\p{Diacritic}+/gu, '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .toLowerCase()
    .trim();
}

export function hasQuotedOrConditionalAuthority(value: string): boolean {
  const message = normalizeAuthorityMessage(value);
  return [
    /\b(?:quoting|quoted|i am quoting|i'm quoting|reported speech|citando|entre comillas)\b/u,
    /\b(?:if|provided that|assuming|only if|solo si|siempre que)\b/u,
  ].some((pattern) => pattern.test(message));
}

export function hasSuggestedOperationVeto(value: string, verbs: readonly string[]): boolean {
  const message = normalizeAuthorityMessage(value);
  const action = verbs.map((verb) => verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const directVeto = new RegExp(
    `\\b(?:dont|don't|do not|never|wait to|hold off(?: on)?|pause|not yet|no quiero que|no|nunca|espera para|todavia no|aun no)\\b[^.!?]{0,24}\\b(?:${action})\\b`,
    'u',
  );
  const laterDenial = new RegExp(
    `\\b(?:${action})\\b[^.!?]{0,80}[.!?]?["']?\\s*(?:but|pero)\\s+(?:(?:dont|don't|do not)\\s+(?:${action}|do\\s+(?:it|that))|no\\s+(?:${action}|(?:lo\\s+)?hagas?|hagas?\\s+eso))\\b`,
    'u',
  );
  const authorizationVeto = /\b(?:dont|don't|do not|never|no)\s+(?:authorize|approve|permit|autorizo|apruebo|permito)\b[^.!?]{0,80}\b(?:change|edit|replacement|suggestion|proposal|framing|presentation|action|cambio|edicion|reemplazo|sugerencia|propuesta|encuadre|presentacion|accion|it|that|this|eso|esto)\b/u;
  return hasQuotedOrConditionalAuthority(message)
    || directVeto.test(message)
    || laterDenial.test(message)
    || authorizationVeto.test(message);
}

export function exactFirstProjectFramingReply(input: {
  framingText: string;
  acceptanceQuestion: string;
}): string {
  return `${input.framingText}\n\n${input.acceptanceQuestion}`;
}

export function isExactFirstProjectFramingDelivery(
  assistantText: string,
  framing: { framingText: string; acceptanceQuestion: string },
): boolean {
  if (assistantText !== exactFirstProjectFramingReply(framing)) return false;
  return !framing.acceptanceQuestion.includes('\n')
    && framing.acceptanceQuestion.length <= 240
    && /^[^?\uFF1F]*[?\uFF1F]$/u.test(framing.acceptanceQuestion.replace(/^\u00BF/u, ''));
}

export function isExactPersistedAcceptance(value: string, acceptancePhrase: string): boolean {
  const message = normalizeAuthorityMessage(value);
  if (!message || hasQuotedOrConditionalAuthority(message) || /[?\uFF1F\u00BF]/u.test(message)) return false;
  if (/\b(?:no|not|never|dont|don't|do not|without|wait|hold off|not yet|no quiero|nunca|jamas|ni)\b/u.test(message)) return false;
  return message === normalizeAuthorityMessage(acceptancePhrase);
}
