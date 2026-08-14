/**
 * usePartyChat — an ephemeral, free chat + reactions layer for the watch party,
 * carried over its OWN Supabase Realtime broadcast channel (`party-chat:<code>`),
 * completely separate from the sync-critical PartyClient channel so it can never
 * destabilize playback authority. Messages/reactions are NOT persisted (this is
 * the "later phase" chat, kept intentionally lightweight): they live only for the
 * session. Persisted history / GIFs / moderation come later.
 */
import { ensurePartyAuth, supabase } from "@/services/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
  mine: boolean;
  /** "gif" messages carry gifUrl + dimensions instead of text. */
  kind?: "text" | "gif";
  gifUrl?: string;
  gifW?: number;
  gifH?: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
}

let _seq = 0;
const uid = () => `${Date.now().toString(36)}-${(_seq++).toString(36)}`;

export function usePartyChat(opts: {
  code: string;
  userId: string;
  name: string;
}): {
  messages: ChatMessage[];
  reactions: FloatingReaction[];
  sendChat: (text: string) => void;
  sendGif: (gif: { url: string; width?: number; height?: number }) => void;
  sendReaction: (emoji: string) => void;
  ready: boolean;
} {
  const { code, userId, name } = opts;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [ready, setReady] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const popReaction = useCallback((emoji: string) => {
    const id = uid();
    setReactions((r) => [...r, { id, emoji }]);
    // reactions self-expire after the float animation (~3s)
    setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 3000);
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    void ensurePartyAuth().finally(() => {
      if (cancelled) return;
      const channel = supabase.channel(`party-chat:${code}`, {
        config: { broadcast: { self: false } },
      });
      channel.on("broadcast", { event: "chat" }, ({ payload }) => {
        const p = payload as Omit<ChatMessage, "mine">;
        setMessages((m) =>
          m.some((x) => x.id === p.id)
            ? m
            : [...m, { ...p, mine: p.userId === userId }].slice(-200),
        );
      });
      channel.on("broadcast", { event: "reaction" }, ({ payload }) => {
        popReaction((payload as { emoji: string }).emoji);
      });
      channel.subscribe((status) => {
        if (!cancelled && status === "SUBSCRIBED") setReady(true);
      });
      channelRef.current = channel;
    });

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [code, userId, popReaction]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const msg = { id: uid(), userId, name, text: trimmed, ts: Date.now() };
      // optimistic local echo (channel is self:false)
      setMessages((m) => [...m, { ...msg, mine: true }].slice(-200));
      void channelRef.current?.send({ type: "broadcast", event: "chat", payload: msg });
    },
    [userId, name],
  );

  const sendGif = useCallback(
    (gif: { url: string; width?: number; height?: number }) => {
      if (!gif?.url) return;
      const msg = {
        id: uid(),
        userId,
        name,
        text: "",
        ts: Date.now(),
        kind: "gif" as const,
        gifUrl: gif.url,
        gifW: gif.width,
        gifH: gif.height,
      };
      setMessages((m) => [...m, { ...msg, mine: true }].slice(-200));
      void channelRef.current?.send({ type: "broadcast", event: "chat", payload: msg });
    },
    [userId, name],
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      popReaction(emoji); // show my own immediately
      void channelRef.current?.send({ type: "broadcast", event: "reaction", payload: { emoji } });
    },
    [popReaction],
  );

  return { messages, reactions, sendChat, sendGif, sendReaction, ready };
}
