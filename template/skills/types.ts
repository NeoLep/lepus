export interface SkillContext {
  input: string;
  callTool: (name: string, args?: unknown) => Promise<unknown>;
  log: (message: string) => void;
}

export interface SkillRunResult {
  handled: boolean;
  response: string;
}

export interface SkillMatchContext {
  input: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  scope?: "public" | "private";
  toolNames?: string[];
  triggers?: string[];
  priority?: number;
  match?: (context: SkillMatchContext) => boolean;
  run?: (
    context: SkillContext,
  ) => Promise<SkillRunResult | null> | SkillRunResult | null;
}

export interface SkillResolution {
  skills: Skill[];
  cleanedInput: string;
  triggerMode: "explicit" | "rule" | "keyword" | "none";
  requestedSkills: string[];
  unknownSkills: string[];
}
