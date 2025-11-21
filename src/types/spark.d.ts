declare global {
  interface SparkKV {
    get<T>(key: string): Promise<T | null | undefined>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    keys(prefix?: string): Promise<string[]>;
  }

  interface SparkRuntime {
    kv: SparkKV;
    user(): Promise<{ id: string | number; email?: string; isOwner?: boolean } | null>;
    llmPrompt?: (strings: TemplateStringsArray, ...values: any[]) => string;
    llm?: (prompt: string) => Promise<string>;
  }

  interface Window {
    spark: SparkRuntime;
  }

  var spark: SparkRuntime;
  // Also ensure globalThis typing
  interface Global {
    spark: SparkRuntime;
  }
}

export {};
