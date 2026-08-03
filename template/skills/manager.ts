import { OpenAI } from "openai/client.mjs";
import { BaseToolNames } from "../tools/index.ts";
import { Skill, SkillResolution } from "./types.ts";

export class SkillManager {
  constructor(
    private skills: Skill[],
    private baseToolNames: string[] = BaseToolNames,
  ) {}

  list() {
    return [...this.skills];
  }

  find(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    return this.skills.find((skill) =>
      skill.id.toLowerCase() === normalized ||
      skill.name.toLowerCase() === normalized
    );
  }

  resolveIdentifiers(identifiers: string[]) {
    const skills: Skill[] = [];
    const unknownSkills: string[] = [];

    for (const identifier of identifiers) {
      const skill = this.find(identifier);
      if (skill) {
        skills.push(skill);
      } else {
        unknownSkills.push(identifier);
      }
    }

    return {
      skills,
      unknownSkills,
    };
  }

  private getPublicSkills() {
    return this.skills.filter((skill) => (skill.scope ?? "public") === "public");
  }

  private resolveByRule(userInput: string) {
    return this.getPublicSkills().filter((skill) => skill.match?.({
      input: userInput,
    }));
  }

  private resolveByKeyword(userInput: string) {
    return this.getPublicSkills().filter((skill) =>
      skill.triggers?.some((t) => userInput.includes(t))
    );
  }

  private parseExplicitSkillTrigger(userInput: string) {
    const trimmed = userInput.trim();
    if (!trimmed.startsWith("/skill ")) {
      return null;
    }

    const withoutPrefix = trimmed.slice("/skill ".length).trim();
    if (!withoutPrefix) {
      return {
        requestedSkills: [],
        cleanedInput: "",
      };
    }

    const firstWhitespaceIndex = withoutPrefix.search(/\s/);
    const skillPart = firstWhitespaceIndex === -1
      ? withoutPrefix
      : withoutPrefix.slice(0, firstWhitespaceIndex);
    const cleanedInput = firstWhitespaceIndex === -1
      ? ""
      : withoutPrefix.slice(firstWhitespaceIndex).trim();

    return {
      requestedSkills: skillPart.split(",").map((item) => item.trim()).filter(
        Boolean,
      ),
      cleanedInput,
    };
  }

  resolve(userInput: string): SkillResolution {
    const explicitTrigger = this.parseExplicitSkillTrigger(userInput);
    if (explicitTrigger) {
      const { skills, unknownSkills } = this.resolveIdentifiers(
        explicitTrigger.requestedSkills,
      );

      return {
        skills,
        cleanedInput: explicitTrigger.cleanedInput,
        triggerMode: "explicit",
        requestedSkills: explicitTrigger.requestedSkills,
        unknownSkills,
      };
    }

    const ruleSkills = this.resolveByRule(userInput);
    if (ruleSkills.length > 0) {
      return {
        skills: ruleSkills,
        cleanedInput: userInput,
        triggerMode: "rule",
        requestedSkills: [],
        unknownSkills: [],
      };
    }

    const skills = this.resolveByKeyword(userInput);
    return {
      skills,
      cleanedInput: userInput,
      triggerMode: skills.length > 0 ? "keyword" : "none",
      requestedSkills: [],
      unknownSkills: [],
    };
  }

  buildSystemMessages(
    skills: Skill[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return skills.map((skill) => ({
      role: "system" as const,
      content: skill.instructions,
    }));
  }

  getAllowedToolNames(skills: Skill[]) {
    const names = new Set<string>();
    this.baseToolNames.forEach((name) => names.add(name));
    for (const skill of skills) {
      skill.toolNames?.forEach((name) => names.add(name));
    }
    return [...names];
  }
}
