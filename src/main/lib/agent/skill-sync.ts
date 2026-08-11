import type { ChatRepository } from '@/ipc/chat/repository'
import type { SkillDefinition } from '@/ipc/chat/constants'
import { refreshImportedFolderSkills } from '@/main/lib/agent/skill-installer'

export async function synchronizeLocalFolderSkills(
  repository: ChatRepository
): Promise<SkillDefinition[]> {
  const result = await refreshImportedFolderSkills(repository.querySkills())
  for (const skill of result.skills) repository.updateSkill(skill)
  for (const error of result.errors) console.warn(`[skills] local folder sync failed: ${error}`)
  return repository.querySkills()
}
