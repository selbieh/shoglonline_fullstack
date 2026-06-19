/** Conversation shape returned by GET /me/conversations + GET /conversations/{id}/messages. */
export type ConvContext = { label: string; title: string; href: string } | null;

export type Conversation = {
  id: number;
  context_type: string;
  status: string;
  read_only: boolean;
  other: { id: number; name: string; email: string; avatar: string };
  unread: number;
  context: ConvContext;
  last_message_snippet: string;
  last_message_at: string | null;
};
