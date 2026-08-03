/// <reference types="vite/client" />

declare module '*.yaml' {
  const messages: Record<string, string>
  export default messages
}

declare module '*.yml' {
  const messages: Record<string, string>
  export default messages
}
