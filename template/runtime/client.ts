import OpenAI, { ClientOptions } from "openai";
import { ChatMessages } from "./agent.ts";

export default class Client {
  llm: OpenAI;

  constructor(conf: ClientOptions) {
    this.llm = new OpenAI(conf);
  }

  chat(messages: ChatMessages[]) {
    return this.llm?.chat.completions.create({
      model: "deepseek-v4-flash",
      messages,
    });
  }

  getChatMessage(res: OpenAI.Chat.Completions.ChatCompletion) {
    return res.choices[0].message.content
  }
}
