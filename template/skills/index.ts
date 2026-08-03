import { SkillManager } from "./manager.ts";
import { LegalSkill } from "./skills/legal.ts";
import { PrivateDownloaderSkill } from "./skills/private_download.ts";
import { ResearchSkill } from "./skills/research.ts";

export * from "./types.ts";
export { SkillManager } from "./manager.ts";
export { LegalSkill } from "./skills/legal.ts";
export { ResearchSkill } from "./skills/research.ts";
export { PrivateDownloaderSkill } from "./skills/private_download.ts";

export const skillManager = new SkillManager([
  LegalSkill,
  ResearchSkill,
  PrivateDownloaderSkill,
]);
