/**
 * User-facing microcopy for the update-available banner (ADR-0003). Follows
 * docs/copy-guide.md §4/§5: the action button names the specific verb
 * ("Atualizar"), never a generic "OK"; ARIA labels are infinitive verb +
 * object; no exclamation marks, no consumer-app "🎉 Nova versão!" tone.
 *
 * The body copy names the one real consequence of updating — Drive
 * disconnects because its access token is memory-only
 * (docs/data-and-privacy.md) — rather than a vague "the app will restart",
 * per the copy guide's "diz exatamente qual é o problema" principle.
 */
export const pwaUpdateCopy = {
  bannerTitle: 'Nova versão disponível',
  bannerBody:
    'Atualizar recarrega o app. Seus arquivos continuam salvos aqui; a conexão com o Google Drive precisa ser refeita.',

  updateButtonLabel: 'Atualizar',
  updateButtonAriaLabel: 'Atualizar o aplicativo',

  dismissButtonLabel: 'Agora não',
  dismissButtonAriaLabel: 'Adiar a atualização',
} as const
