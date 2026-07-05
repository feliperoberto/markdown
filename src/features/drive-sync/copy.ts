/**
 * User-facing microcopy for the Drive sync configuration UI.
 *
 * These strings were drafted directly by the engineer implementing this
 * extraction (issue #21) — there was no separate designer pass in this
 * round. Flag for a future copy/design review, same as other UI text in
 * this app.
 */
export const driveSyncCopy = {
  clientIdLabel: 'Client ID',
  clientIdPlaceholder: 'xxxxxxx.apps.googleusercontent.com',

  /**
   * Clarifies, right next to the input, that this value behaves
   * differently from a typical "secret" credential. Strengthened (issue
   * #30, product-owner pass) to explicitly say "não é uma senha" — the
   * word "senha" (password) is the mental model most likely to make a user
   * hesitate to paste this value, so naming it directly and ruling it out
   * is clearer than only contrasting with "chave secreta".
   */
  clientIdSecurityNote:
    'Este Client ID é uma informação pública do OAuth — não é uma senha nem uma chave secreta. ' +
    'É seguro colá-lo aqui e mantê-lo salvo neste navegador; ele sozinho não dá acesso à sua conta ' +
    'ou aos seus arquivos do Drive.',

  configuredStatus: '✅ Configurado',
  notConfiguredStatus: '⚠️ Não configurado',

  helpText:
    'Para sincronizar com o Drive, crie um projeto no Google Cloud Console, ative a Drive API e gere credenciais OAuth.',

  /**
   * Data-disclosure moment (issue #30, product-owner pass): explains, in
   * plain language, exactly what leaves the device when Drive sync is
   * enabled and why the backup file won't show up where a user might
   * instinctively look for it (their regular Drive file list). This is
   * shown once, up front, before the user clicks "Conectar com Google" —
   * not buried after the fact.
   */
  dataDisclosure:
    'Ao conectar, seus projetos são enviados para uma pasta privada do app dentro do seu Google Drive ' +
    '("appDataFolder"), acessível apenas por este aplicativo. Ela não aparece na listagem normal do seu ' +
    'Drive nem é visível para outros apps — não são criados arquivos soltos no seu Drive pessoal. ' +
    'Nenhum outro dado da sua conta Google é acessado ou enviado.',

  connectButtonLabel: 'Conectar com Google',
  connectButtonDescription: 'Autorizar acesso ao Drive',

  disconnectButtonLabel: 'Desconectar',
  disconnectButtonDescription: 'Remove acesso desta sessão',

  syncButtonLabel: 'Sincronizar Agora',
  syncButtonDescription: 'Força sincronização imediata',

  exportButtonLabel: 'Salvar no Drive',
  exportButtonDescription: 'Exporta todos os projetos como JSON',

  importButtonLabel: 'Restaurar do Drive',
  importButtonDescription: 'Importa e mescla projetos salvos',

  notConnectedStatus: 'Conecte sua conta Google para salvar e restaurar projetos.',
  neverSyncedStatus: '⚠️ Nunca sincronizado',

  /**
   * Shown instead of a raw network/fetch error when a sync attempt is
   * skipped because the browser is offline (issue #24). The broader
   * offline-UX indicator (connection banner, etc.) is issue #25's scope —
   * this is only the sync-failure-path message.
   */
  offlineWillRetrySync:
    'Sem conexão — seus dados continuam salvos localmente e a sincronização será retomada automaticamente ao reconectar.',

  /**
   * Offline indicator (issue #25). Kept deliberately calm/reassuring —
   * the goal is "local editing still works", never an alarming error.
   */
  offlineBadgeLabel: 'Offline',
  offlineBadgeTitle: 'Você está offline — a edição local continua funcionando normalmente.',
  offlineStatus:
    'Você está offline. A edição local continua funcionando — a sincronização com o Drive será retomada automaticamente quando a conexão voltar.',
  offlineSyncSkippedToast:
    'Sem conexão — a sincronização será retomada quando você ficar online novamente.',
} as const
