export const AGENT_CAPABILITIES = [
  'utilities',
  'web_search',
  'workspace_read',
  'workspace_write',
  'skills',
  'skill_scripts',
  'browser_public',
  'browser_private',
  'clipboard',
  'downloads'
] as const

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number]

export const DEFAULT_INTERACTIVE_CAPABILITIES: AgentCapability[] = [...AGENT_CAPABILITIES]
export const DEFAULT_UNATTENDED_CAPABILITIES: AgentCapability[] = [
  'utilities',
  'web_search',
  'skills'
]

export const CAPABILITY_TOOL_NAMES: Record<AgentCapability, readonly string[]> = {
  utilities: ['get_current_time', 'calculate', 'generate_uuid'],
  web_search: ['search_web'],
  workspace_read: ['inspect_file', 'search_files', 'search_text', 'read_file', 'list_directory'],
  workspace_write: [
    'write_file',
    'apply_patch',
    'create_directory',
    'copy_file',
    'move_file',
    'delete_path'
  ],
  skills: ['read_skill_file'],
  skill_scripts: ['read_skill_file', 'run_skill_script'],
  browser_public: [
    'browser_status',
    'browser_open',
    'browser_tabs',
    'browser_snapshot',
    'browser_click',
    'browser_type',
    'browser_select',
    'browser_scroll',
    'browser_back',
    'browser_forward',
    'browser_close'
  ],
  browser_private: [
    'browser_status',
    'browser_open_private',
    'browser_tabs',
    'browser_snapshot',
    'browser_click',
    'browser_type',
    'browser_select',
    'browser_scroll',
    'browser_back',
    'browser_forward',
    'browser_close'
  ],
  clipboard: ['clipboard_read_text'],
  downloads: ['download_file']
}

export function normalizeCapabilities(
  value: unknown,
  fallback: AgentCapability[] = []
): AgentCapability[] {
  if (!Array.isArray(value)) return [...fallback]
  const valid = new Set<string>(AGENT_CAPABILITIES)
  return [
    ...new Set(
      value
        .map((item) => (item === 'browser' ? 'browser_public' : item))
        .filter((item): item is AgentCapability => typeof item === 'string' && valid.has(item))
    )
  ]
}

export function capabilityToolNames(capabilities: AgentCapability[]): Set<string> {
  return new Set(capabilities.flatMap((capability) => [...CAPABILITY_TOOL_NAMES[capability]]))
}
