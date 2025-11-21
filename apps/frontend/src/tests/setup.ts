import '@testing-library/jest-dom';
import { vi } from 'vitest';

global.spark = {
  llmPrompt: (strings: TemplateStringsArray, ...values: any[]) => {
    return strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
  },
  llm: vi.fn(async (prompt: string) => 'mock llm response'),
  user: vi.fn(async () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    login: 'testuser',
    avatarUrl: '',
    isOwner: false,
  })),
  kv: {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    keys: vi.fn(async () => []),
  },
};
