export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  custom_instructions: string | null;
  preferred_model: string;
  theme: 'light' | 'dark' | 'system';
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string | null;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageContentType = 'text' | 'image' | 'file' | 'artifact';

export interface MessageContent {
  type: MessageContentType;
  text?: string;
  url?: string;
  mime_type?: string;
  file_name?: string;
  artifact?: Artifact;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: MessageContent[];
  model: string | null;
  created_at: string;
  parent_id: string | null;
  branch_index: number;
}

export type ArtifactType = 'code' | 'html' | 'markdown' | 'text';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
  version: number;
}

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  category: string;
  importance: number;
  created_at: string;
  updated_at: string;
  source_conversation_id: string | null;
}

export interface ChatStreamRequest {
  conversationId: string;
  messages: { role: MessageRole; content: string }[];
  model: string;
  systemPrompt?: string;
  files?: UploadedFile[];
  memoryEnabled?: boolean;
}

export interface UploadedFile {
  name: string;
  type: string;
  data: string;
}

export type ClaudeModel =
  | 'claude-sonnet-5'
  | 'claude-opus-5-5'
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6';

export const CLAUDE_MODELS: { id: ClaudeModel; name: string; description: string }[] = [
  { id: 'claude-haiku-4-5', name: 'Haiku', description: 'Fast & efficient' },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4', description: 'Azure deployment' },
  { id: 'claude-sonnet-5', name: 'Sonnet 5', description: 'Balanced power' },
  { id: 'claude-opus-5-5', name: 'Opus', description: 'Most capable' },
];
