import { Router, type IRouter } from "express";
import { runChat, type ChatMessage } from "../services/chatbot";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/chat
 * Body: { messages: [{role: "user"|"assistant", content: string}] }
 * Returns: { response: string }
 */
router.post("/chat", async (req, res) => {
  const { messages } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  const sanitized: ChatMessage[] = messages
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12); // Keep last 12 messages for context window management

  if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== "user") {
    res.status(400).json({ error: "last message must be from user" });
    return;
  }

  try {
    const response = await runChat(sanitized);
    res.json({ response });
  } catch (err) {
    logger.error({ err }, "chat.route_error");
    res.status(500).json({ error: "Chat agent failed" });
  }
});

export default router;
