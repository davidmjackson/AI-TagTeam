export interface CodexReply {
  threadId: string;
  text: string;
}

export interface CodexRunner {
  start(prompt: string): Promise<CodexReply>;
  resume(threadId: string, prompt: string): Promise<CodexReply>;
}
