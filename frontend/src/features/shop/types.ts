import type { Language, Product } from "@/lib/api";

export interface ChatMessage {
  id: number;
  from: "user" | "aide";
  text: string;
  products: Product[];
  /** The language the message is in; Play uses a voice for it. */
  language: Language;
}
