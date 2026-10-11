/**
 * PartySession — owns the watch-party's LIFETIME, above the navigator.
 *
 * The problem it solves: PartyClient used to be constructed inside PartyScreen,
 * so navigating away unmounted the screen, destroyed the client and called
 * party_leave — the room died the moment you went to look at something else.
 * A floating tray and a browsable queue are impossible while that is true.
 * So the session moves up: App mounts this provider around RootNavigator, and
 * PartyScreen becomes a *view* of a session it no longer owns.
 *
 * RE-RENDER MODEL (the reason this is three contexts and not one):
 *   - The host re-broadcasts the whole snapshot every ~2s as its lease heartbeat.
 *     With the session at the root, naively holding that snapshot in provider
 *     state would re-render the entire app twice a second.
 *   - `children` is a stable element, so provider state changes do NOT re-render
 *     the navigator subtree — only components that read a context do.
 *   - Snapshots therefore bypass context entirely: usePartySnapshot() reads
 *     PartyClient through useSyncExternalStoreWithSelector, so a component that
 *     selects `queue.length` re-renders only when that number changes.
 *   - Session (lifecycle + actions) and Chat are separate contexts so a chat
 *     message doesn't re-render the tray, and vice versa.
 *
 * See docs/plans/watch-together-multi-source-queue.md and 0008_party_queue.sql.
 */
import type { PlayerEvent, PlayerHandle } from "@/components/player/HijackPlayer";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import { PartyClient, type RoomSnapshot } from "./PartyClient";
import { PartySyncEngine, type PlayerControl } from "./PartySyncEngine";
import { usePartyChat, type ChatMessage, type FloatingReaction } from "./usePartyChat";
import {
  effectivePositionMs,
  type PartyMedia,
  type Permissions,
  type QueueItemInput,
  type RoomConfig,
} from "./protocol";

/** What it takes to be in a room. Held by the provider, not by any screen. */
export interface PartySessionRequest {
  code: string;
  role: "host" | "guest";
  displayName: string;
  /** Host only: what the room starts on. Ignored for guests. */
  media?: PartyMedia;
  password?: string;
}

export interface PartyActions {
  onPlayerEvent: (e: PlayerEvent) => void;
  /** Host: change WHAT the room plays (also used to switch provider on failure). */
  setMedia: (m: PartyMedia) => Promise<void>;
  play: () => void;
  pause: () => void;
  seekBy: (deltaSec: number) => void;
  seekTo: (sec: number) => void;
  setRate: (rate: number) => void;
  transferHost: (userId: string) => Promise<void>;
  claimHost: () => void;
  setConfig: (patch: Partial<RoomConfig>, password?: string) => Promise<void>;
  setPermissions: (userId: string, patch: Partial<Permissions>) => Promise<void>;
  approveMember: (userId: string) => Promise<void>;
  kick: (userId: string) => Promise<void>;
  grabControl: () => Promise<void>;
  jumpToLive: () => void;
  resync: () => void;
  // queue
  queueAdd: (items: QueueItemInput[], position?: "end" | "next") => Promise<void>;
  queueRemove: (itemIds: string[]) => Promise<void>;
  queueMove: (itemId: string, toIndex: number) => Promise<void>;
  queueSetCurrent: (itemId: string) => Promise<void>;
  queueAdvance: (
    fromItemId: string | null,
    reason?: "ended" | "failed" | "skipped",
  ) => Promise<void>;
  queueClear: (scope?: "done" | "all") => Promise<void>;
}

export interface PartySessionValue extends PartyActions {
  /** Non-null whenever a room is live, on ANY screen. */
  request: PartySessionRequest | null;
  client: PartyClient | null;
  /** PartyScreen attaches its player here; null whenever the screen is unmounted. */
  playerRef: RefObject<PlayerHandle | null>;
  userId: string;
  connectedCount: number;
  detached: boolean;
  kicked: boolean;
  error: string | null;
  /** Is the browsing tray expanded? Owned here so the tab bar can raise it. */
  trayOpen: boolean;
  setTrayOpen: (v: boolean) => void;
  open: (req: PartySessionRequest) => void;
  /** Re-attempt with a password (or just force a fresh client). */
  retry: (password?: string) => void;
  /** Leave the room for real — party_leave + teardown. */
  leave: () => void;
}

export interface PartyChatValue {
  messages: ChatMessage[];
  reactions: FloatingReaction[];
  sendChat: (text: string) => void;
  sendGif: (gif: { url: string; width?: number; height?: number }, sticker?: boolean) => void;
  sendReaction: (emoji: string) => void;
  ready: boolean;
}

const NOOP_ASYNC = async () => {};
const NATIVE_ROOM_CAPS = { fractionalRate: true, partySync: true };
const IDLE: PartySessionValue = {
  request: null,
  client: null,
  playerRef: { current: null },
  userId: "",
  connectedCount: 0,
  detached: false,
  kicked: false,
  error: null,
  trayOpen: false,
  setTrayOpen: () => {},
  open: () => {},
  retry: () => {},
  leave: () => {},
  onPlayerEvent: () => {},
  setMedia: NOOP_ASYNC,
  play: () => {},
  pause: () => {},
  seekBy: () => {},
  seekTo: () => {},
  setRate: () => {},
  transferHost: NOOP_ASYNC,
  claimHost: () => {},
  setConfig: NOOP_ASYNC,
  setPermissions: NOOP_ASYNC,
  approveMember: NOOP_ASYNC,
  kick: NOOP_ASYNC,
  grabControl: NOOP_ASYNC,
  jumpToLive: () => {},
  resync: () => {},
  queueAdd: NOOP_ASYNC,
  queueRemove: NOOP_ASYNC,
  queueMove: NOOP_ASYNC,
  queueSetCurrent: NOOP_ASYNC,
  queueAdvance: NOOP_ASYNC,
  queueClear: NOOP_ASYNC,
};

const IDLE_CHAT: PartyChatValue = {
  messages: [],
  reactions: [],
  sendChat: () => {},
  sendGif: () => {},
  sendReaction: () => {},
  ready: false,
};

const SessionCtx = createContext<PartySessionValue>(IDLE);
const ChatCtx = createContext<PartyChatValue>(IDLE_CHAT);
/** The live client, published separately so usePartySnapshot never re-renders on session state. */
const ClientCtx = createContext<PartyClient | null>(null);

export function usePartySession(): PartySessionValue {
  return useContext(SessionCtx);
}
export function usePartyChatSession(): PartyChatValue {
  return useContext(ChatCtx);
}

const EMPTY_SUB = () => () => {};
const NULL_SNAP = () => null;

/**
 * Read the room snapshot through a selector. Backed by useSyncExternalStore over
 * PartyClient, so heartbeats that don't change the selected value cost nothing —
 * which is what makes it safe to read the room from a tray mounted app-wide.
 *
 * `isEqual` defaults to Object.is; pass a shallow comparator when selecting an
 * object or array you rebuild each call.
 */
export function usePartySnapshot<T>(
  selector: (s: RoomSnapshot | null) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const client = useContext(ClientCtx);
  const subscribe = useMemo(
    () => (client ? (cb: () => void) => client.onSnapshot(cb) : EMPTY_SUB),
    [client],
  );
  const getSnapshot = useMemo(
    () => (client ? () => client.snapshot : NULL_SNAP),
    [client],
  );
  return useSyncExternalStoreWithSelector(subscribe, getSnapshot, getSnapshot, selector, isEqual);
}

/** Are we the host right now? Derived from the snapshot, so it follows handoff. */
export function useIsPartyHost(): boolean {
  const { userId } = usePartySession();
  return usePartySnapshot((s) => !!s && !!userId && s.lease.hostId === userId);
}

/** True whenever a room is live — cheap enough for an app-wide tray to poll. */
export function useHasPartySession(): boolean {
  return !!usePartySession().request;
}

export function PartySessionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PartySessionRequest | null>(null);
  // Bumped to force a fresh PartyClient even when the request is unchanged
  // (password re-attempt). Not read in the memo body — it is a trigger.
  const [nonce, setNonce] = useState(0);

  const open = useCallback((req: PartySessionRequest) => {
    setRequest(req);
    setNonce((n) => n + 1);
  }, []);
  const retry = useCallback((password?: string) => {
    setRequest((r) => (r ? { ...r, password } : r));
    setNonce((n) => n + 1);
  }, []);
  const leave = useCallback(() => {
    setRequest(null);
  }, []);

  return (
    <PartySessionInner request={request} nonce={nonce} open={open} retry={retry} leave={leave}>
      {children}
    </PartySessionInner>
  );
}

function PartySessionInner({
  request,
  nonce,
  open,
  retry,
  leave,
  children,
}: {
  request: PartySessionRequest | null;
  nonce: number;
  open: (req: PartySessionRequest) => void;
  retry: (password?: string) => void;
  leave: () => void;
  children: ReactNode;
}) {
  const playerRef = useRef<PlayerHandle | null>(null);
  const [connectedCount, setConnectedCount] = useState(1);
  const [detached, setDetached] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only used to re-publish the context once userId lands (it arrives async in start()).
  const [userId, setUserId] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);

  // Media is fixed for the room's life; keeping it OUT of the deps below is
  // deliberate — a new object identity each render would otherwise rebuild the
  // client, i.e. party_leave + rejoin on every render.
  const mediaRef = useRef(request?.media);
  mediaRef.current = request?.media;

  const client = useMemo(
    () =>
      request
        ? new PartyClient({
            code: request.code,
            role: request.role,
            displayName: request.displayName,
            media: mediaRef.current,
            password: request.password,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request?.code, request?.role, request?.displayName, request?.password, nonce],
  );

  const engine = useMemo(() => {
    if (!client) return null;
    const player: PlayerControl = {
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      seek: (s) => playerRef.current?.seek(s),
      setRate: (r) => playerRef.current?.setRate(r),
      // Only the native room player opts into the §6.4 buffering protocol; WebView rooms keep today's behaviour.
      capabilities: () => (playerRef.current?.engine === "native" ? NATIVE_ROOM_CAPS : undefined),
    };
    return new PartySyncEngine(client, player, {
      onDetach: setDetached,
      // Host's player stalled > 3 s while the room played: pause the room; resume when it recovers.
      onHostStall: (stalled) => void (stalled ? client.pause() : client.play()),
    });
  }, [client]);

  useEffect(() => {
    if (!client || !engine) return;
    if (__DEV__) {
      console.log("[party] session EFFECT RUN — new client for", request?.code);
      (globalThis as any).__PARTY__ = { client, engine, request };
    }
    let cancelled = false;
    setError(null);
    setKicked(false);
    setDetached(false);
    setUserId("");
    client.onConnectedCount((n) => {
      if (!cancelled) setConnectedCount(n);
    });
    const unsub = client.onSnapshot((s) => {
      if (cancelled) return;
      engine.setAnchor(s.playback);
      // userId is assigned at the top of start(), well before it resolves — the
      // first snapshot (from the create/join RPC) is the earliest we can observe
      // it, and publishing it here rather than in .then() keeps chat identity and
      // the isHost check from lagging a whole subscribe behind.
      if (client.userId) setUserId((prev) => (prev === client.userId ? prev : client.userId));
    });
    client.onKicked(() => {
      if (!cancelled) setKicked(true);
    });
    client
      .start()
      .then(() => {
        if (!cancelled) setUserId(client.userId);
      })
      .catch((e) => {
        const msg = e?.message ?? String(e);
        console.warn("[party] start failed:", msg);
        if (!cancelled) setError(msg);
      });
    return () => {
      if (__DEV__) console.log("[party] session EFFECT CLEANUP — destroying client");
      cancelled = true;
      unsub();
      void client.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, engine]);

  const chatRaw = usePartyChat({
    code: request?.code ?? "",
    userId,
    name: request?.displayName ?? "",
  });
  const chat = useMemo<PartyChatValue>(
    () => (request ? chatRaw : IDLE_CHAT),
    [request, chatRaw],
  );

  const value = useMemo<PartySessionValue>(() => {
    if (!client || !engine) return { ...IDLE, playerRef, open, retry, leave, trayOpen, setTrayOpen };
    return {
      request,
      client,
      playerRef,
      userId,
      connectedCount,
      detached,
      kicked,
      error,
      trayOpen,
      setTrayOpen,
      open,
      retry,
      leave,
      onPlayerEvent: (e) => {
        engine.onPlayerEvent(e);
        if (e.event === "tick") client.renewLeaseIfDue();
      },
      setMedia: (m) => client.setMedia(m),
      play: () => void client.play(),
      pause: () => void client.pause(),
      seekBy: (deltaSec) => {
        const s = client.snapshot;
        if (!s) return;
        const curSec = effectivePositionMs(s.playback, client.now()) / 1000;
        void client.seek(Math.max(0, curSec + deltaSec) * 1000);
      },
      seekTo: (sec) => void client.seek(Math.max(0, sec) * 1000),
      setRate: (rate) => void client.setRate(rate),
      transferHost: (uid) => client.transferHost(uid),
      claimHost: () => void client.claimHost(),
      setConfig: (patch, pw) => client.setConfig(patch, pw),
      setPermissions: (uid, patch) => client.setPermissions(uid, patch),
      approveMember: (uid) => client.approveMember(uid),
      kick: (uid) => client.kick(uid),
      grabControl: () => client.grabControl(),
      jumpToLive: () => engine.jumpToLive(),
      resync: () => engine.resync(),
      queueAdd: (items, position) => client.queueAdd(items, position),
      queueRemove: (ids) => client.queueRemove(ids),
      queueMove: (id, to) => client.queueMove(id, to),
      queueSetCurrent: (id) => client.queueSetCurrent(id),
      queueAdvance: (from, reason) => client.queueAdvance(from, reason),
      queueClear: (scope) => client.queueClear(scope),
    };
  }, [client, engine, request, userId, connectedCount, detached, kicked, error, trayOpen, open, retry, leave]);

  return (
    <ClientCtx.Provider value={client}>
      <SessionCtx.Provider value={value}>
        <ChatCtx.Provider value={chat}>{children}</ChatCtx.Provider>
      </SessionCtx.Provider>
    </ClientCtx.Provider>
  );
}
