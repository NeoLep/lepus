import { loadApi } from './preload'

declare global {
  interface Window {
    api: ReturnType<typeof loadApi>
  }
}
