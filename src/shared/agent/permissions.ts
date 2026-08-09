import type { PermissionMode, PermissionSettings } from '@/ipc/chat/constants'

export const PERMISSION_MODES: PermissionMode[] = [
  'request_approval',
  'auto_approve',
  'full_access'
]

export const DEFAULT_PERMISSION_SETTINGS: PermissionSettings = {
  workspacePath: '',
  mode: 'request_approval',
  trustedBrowserOrigins: []
}

export function isPermissionMode(value: string): value is PermissionMode {
  return PERMISSION_MODES.includes(value as PermissionMode)
}
