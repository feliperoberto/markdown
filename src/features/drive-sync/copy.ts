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

  configuredStatus: '✅ Configurado',
  notConfiguredStatus: '⚠️ Não configurado',

  clientIdEmptyWarning: 'Client ID não pode estar vazio',
  clientIdSavedToast: '✅ Configuração salva',
  clientIdClearedToast: 'Configuração restaurada',

  helpText:
    'Para sincronizar com o Drive, crie um projeto no Google Cloud Console, ative a Drive API e gere credenciais OAuth.',

  connectButtonLabel: 'Conectar com Google',
  connectButtonDescription: 'Autorizar acesso ao Drive',

  disconnectButtonLabel: 'Desconectar',
  disconnectButtonDescription: 'Remove acesso desta sessão',

  syncCompleteToast: '☁️ Sincronizado',

  /** Ctrl+S/Cmd+S (`useSaveShortcut`) with Drive not connected/configured yet — explains why the modal just opened instead of syncing. */
  syncNeedsConnectionToast: 'Conecte o Google Drive para sincronizar',
  /** Header cloud-icon button `title` — the shortcut has no other in-app affordance pointing at it. */
  syncShortcutHint: 'Sincronização com Google Drive (Ctrl+S / Cmd+S)',

  notConnectedStatus: 'Conecte sua conta Google para sincronizar seus projetos.',
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
