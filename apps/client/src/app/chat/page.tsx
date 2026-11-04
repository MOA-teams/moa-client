import type { Metadata } from "next";
import { CustomerChat } from "@/components/chat/customer-chat";

export const metadata: Metadata = { title: "고객센터 채팅" };

export default function ChatPage() {
  return <CustomerChat />;
}
