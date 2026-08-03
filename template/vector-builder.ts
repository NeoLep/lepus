import { InferenceClient } from "@huggingface/inference";
import { loadEnv } from "../utils/index.ts";
import type { ParagraphsChunk } from "./runtime/knowledge.ts";

const env = await loadEnv();

export interface Chunk {
  id: string;
  title: string;
  content: string;
}
const chunkBuilders: Record<string, (content: string) => Chunk[]> = {
  md: function splitMarkdown(md: string): Chunk[] {
    const sections = md.split(/^## /gm).filter(Boolean);
    return sections.map((section, index) => {
      const lines = section.trim().split("\n");
      const title = lines[0]
        .replace(/\r/g, "")
        .replace(/\n/g, "")
        .trim();
      return {
        id: `chunk-${index}`,
        title,
        content: section.trim(),
      };
    });
  },
};

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export default class VectorEmbdBuilder {
  client: InferenceClient;
  constructor() {
    if (!env["HF_TOKEN"]) throw new Error("HF_TOKEN is required");
    this.client = new InferenceClient(env["HF_TOKEN"]);
  }
  async embedFile(filePath: string) {
    const fileName = filePath.split("/").at(-1);
    const fileType = fileName?.split(".").at(-1);
    if (!fileType) {
      throw new Error("fileType is required");
    }
    const fileContent = await Deno.readTextFile(filePath);
    if (!(fileType in chunkBuilders)) {
      throw new Error(`fileType ${fileType} is not supported`);
    }
    const chunkBuilder = chunkBuilders[fileType];
    const chunks = chunkBuilder(fileContent);
    const paragraphs: ParagraphsChunk[] = [];
    console.log(`Start Embedding: ${fileName}`);

    for (const chunk of chunks) {
      const embedding = await this.client.featureExtraction({
        provider: "hf-inference",
        model: "BAAI/bge-m3",
        inputs: chunk.content,
      });
      paragraphs.push({
        ...chunk,
        embedding,
      });
    }
    return paragraphs;
  }
  async embedText(text: string) {
    return await this.client.featureExtraction({
      provider: "hf-inference",
      model: "BAAI/bge-m3",
      inputs: text,
    });
  }
}
