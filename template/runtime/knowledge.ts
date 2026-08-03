// deno-lint-ignore-file no-explicit-any
import OpenAI from "openai";
import { toMessages } from "./agent.ts";
import { FeatureExtractionOutput } from "@huggingface/inference";
import VectorEmbdBuilder, {
  Chunk,
  cosineSimilarity,
} from "../vector-builder.ts";
import { existFile, getFileHash } from "../../utils/index.ts";

export type ParagraphsChunk = Chunk & { embedding: FeatureExtractionOutput };
interface RAGFile {
  hash: string;
  generateAt: string;
  sourceFileAt: string;
  fileName: {
    name: string;
    embedding: FeatureExtractionOutput;
  };
  paragraphs: ParagraphsChunk[];
}

export default class Knowledge {
  static DOC_CONFIDENCE = {
    FILE_NAME: 0.5,
    PARAGRAPH: 0.6,
  };
  vectorBuilder: VectorEmbdBuilder | null = null;
  docs: RAGFile[] = [];

  constructor() {}

  async buildMemory(
    input?: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const docMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [];
    if (this.docs.length <= 0 || !input || input.trim() === "") return docMessages;

    try {
      if (input) {
        const usedDocs = await this.queryEmbeddingFromDocs(input);
        const needInsertPrompts: string[] = [];
        if (usedDocs.length > 0) {
          usedDocs.forEach((doc) => {
            const prompt =
              `目前已知的文档信息:\n 文档名称: ${doc.fileName.name}\n 文档内容: ${
                doc.paragraphs.map((item) => item.content).join("\n")
              }`;
            needInsertPrompts.push(prompt);
          });
        }
        docMessages.push(
          ...toMessages(needInsertPrompts.map((prompt) => ["user", prompt])),
        );
      }
    } catch (err) {
      console.error(`build knowledge memory error: ${err}`);
    }
    return docMessages;
  }
  async queryEmbeddingFromDocs(input: string, allFile = false) {
    if (!this.vectorBuilder) {
      this.vectorBuilder = new VectorEmbdBuilder();
    }
    try {
      const queryEmbedding = await this.vectorBuilder.embedText(input);
      const usedDocs = this.docs
        .filter((doc) => {
          return allFile || cosineSimilarity(
                queryEmbedding as any,
                doc.fileName.embedding as any,
              ) >= Knowledge.DOC_CONFIDENCE.FILE_NAME;
        })
        .map((doc) => ({
          ...doc,
          paragraphs: doc.paragraphs
            .map((p) => ({
              ...p,
              embedding: "[array]",
              score: cosineSimilarity(
                queryEmbedding as any,
                p.embedding as any,
              ),
            }))
            .filter((item) => item.score > Knowledge.DOC_CONFIDENCE.PARAGRAPH)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3),
        }));
      return usedDocs;
    } catch (err) {
      console.error(`queryEmbeddingFromDocs error: ${err}`);
      return [];
    }
  }
  async load(path: string) {
    const hash = await getFileHash(path);
    const fileName = path.split("/").at(-1);
    const targetFile = `cache/${fileName}.json`;
    const isExist = await existFile(targetFile);

    let rag: RAGFile | null = null;
    if (isExist) {
      const fileContent = await Deno.readTextFile(targetFile);
      try {
        const memoryRag: RAGFile = JSON.parse(fileContent);
        if (hash === memoryRag.hash) {
          rag = memoryRag;
        }
      } catch (err) {
        console.error(err);
      }
    }
    if (!rag) {
      if (!this.vectorBuilder) {
        this.vectorBuilder = new VectorEmbdBuilder();
      }
      console.log("=== Start embed file ===");
      const fileNameEmbed = await this.vectorBuilder.embedText(fileName!);
      const paragraphs = await this.vectorBuilder.embedFile(path);
      rag = {
        hash,
        generateAt: new Date().toISOString(),
        sourceFileAt: path,
        fileName: {
          name: fileName!,
          embedding: fileNameEmbed,
        },
        paragraphs,
      };
      await Deno.writeTextFile(targetFile, JSON.stringify(rag, null, 2));
      console.log(`Build file to: ${targetFile}`);
    } else {
      console.log(`Load file from: ${targetFile}`);
    }
    this.docs.push(rag);
  }
}
