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
   * differently from a typical "secret" credential.
   */
  clientIdSecurityNote:
    'Este é um Client ID OAuth público, não uma chave secreta — é seguro mantê-lo salvo neste navegador.',

  configuredStatus: '✅ Configurado',
  notConfiguredStatus: '⚠️ Não configurado',

  helpText:
    'Para sincronizar com o Drive, crie um projeto no Google Cloud Console, ative a Drive API e gere credenciais OAuth.',

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
} as const
