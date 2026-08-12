export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export type UpdateState = {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  releaseName?: string
  releaseNotes?: string
  releaseDate?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  error?: string
}

export const UPDATE_CHANNELS = {
  STATE_QUERY: 'update:state-query',
  CHECK: 'update:check',
  DOWNLOAD: 'update:download',
  INSTALL: 'update:install',
  STATE_CHANGED: 'update:state-changed'
} as const
