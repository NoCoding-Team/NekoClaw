export const isTauriDesktop: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
