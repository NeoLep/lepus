import { Skill } from "../types.ts";

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function isLegalIntent(input: string) {
  const text = input.trim();
  if (!text) {
    return false;
  }
  const domainPatterns = [/法律/, /合同/, /法规/, /仲裁/, /起诉/, /法条/, /违约/];
  const actionPatterns = [/风险/, /流程/, /有效/, /怎么办/, /怎么处理/, /分析/, /责任/];
  return hasAny(text, domainPatterns) &&
    (hasAny(text, actionPatterns) || text.length <= 20);
}

export const LegalSkill: Skill = {
  id: "legal",
  name: "法律助手",
  description: "处理法律分析、法规解读、合同风险识别",
  scope: "public",
  instructions: `
你是一名审慎的法律助手。
处理问题时遵循以下流程：
1. 先识别司法辖区和问题类型
2. 区分事实、推断、建议
3. 不确定时明确说明不确定
4. 不要编造法条、案例或生效日期
  `,
  toolNames: ["http_request", "write_file"],
  triggers: ["法律", "合同", "法规", "起诉", "仲裁"],
  match: ({ input }) => isLegalIntent(input),
};
