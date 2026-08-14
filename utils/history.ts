import RNFS from "react-native-fs";
import { createMMKV } from "react-native-mmkv";

const storage = createMMKV();
const HISTORY_KEY = "watchHistory";
const HISTORY_FILE = `${RNFS.DocumentDirectoryPath}/watchHistory.json`;

export interface HistoryItem {
  id: string;
  title: string;
  type: string;
  season?: string;
  episode?: string;
  poster_path?: string;
  positionSec?: number;
  durationSec?: number;
  updatedAt?: number;
}

interface HistoryKeyArgs {
  id: string;
  type?: string;
  season?: string;
  episode?: string;
}

/**
 * Composite identity for a history entry. A movie is keyed by id; a TV episode is
 * keyed by id+season+episode so each episode resumes independently (the old code
 * deduped on id alone, collapsing a whole show into one entry).
 */
export function historyKey(i: HistoryKeyArgs): string {
  if (i.type === "tv") {
    return `tv:${i.id}:${i.season ?? ""}:${i.episode ?? ""}`;
  }
  return `${i.type ?? "movie"}:${i.id}`;
}

export async function getWatchHistory(): Promise<any[]> {
    try {
        const content = storage.getString(HISTORY_KEY);
        if (content) {
            return JSON.parse(content);
        }

        // Fallback/migration from old file-based storage
        const exists = await RNFS.exists(HISTORY_FILE);
        if (exists) {
            const oldContent = await RNFS.readFile(HISTORY_FILE, "utf8");
            const parsed = JSON.parse(oldContent || "[]");
            storage.set(HISTORY_KEY, JSON.stringify(parsed));
            // Optional: delete old file after migration
            await RNFS.unlink(HISTORY_FILE).catch(() => {});
            return parsed;
        }

        return [];
    } catch (e) {
        return [];
    }
}

export async function addToWatchHistory(item: any): Promise<void> {
    try {
        const list = await getWatchHistory();
        // avoid duplicates by composite key (per-episode for TV)
        const key = item.id ? historyKey(item) : JSON.stringify(item);
        const filtered = list.filter(
            (i) => (i.id ? historyKey(i) : JSON.stringify(i)) !== key,
        );
        filtered.unshift(item);
        storage.set(HISTORY_KEY, JSON.stringify(filtered.slice(0, 200)));
    } catch (e) {
        // ignore
    }
}

/**
 * Persist playback position for resume. Throttle callers to ~every 5s. If the
 * position is within the last 5s of the runtime we treat the title as finished
 * and clear the saved position so it restarts next time.
 */
export async function updatePlaybackPosition(
    keyArgs: HistoryKeyArgs,
    positionSec: number,
    durationSec: number,
): Promise<void> {
    try {
        const list = await getWatchHistory();
        const key = historyKey(keyArgs);
        const idx = list.findIndex((i) => i.id && historyKey(i) === key);
        if (idx === -1) return;

        const finished = durationSec > 0 && positionSec >= durationSec - 5;
        list[idx] = {
            ...list[idx],
            positionSec: finished ? 0 : positionSec,
            durationSec: durationSec || list[idx].durationSec,
            updatedAt: Date.now(),
        };
        storage.set(HISTORY_KEY, JSON.stringify(list.slice(0, 200)));
    } catch (e) {
        // ignore
    }
}

export async function getPlaybackPosition(
    keyArgs: HistoryKeyArgs,
): Promise<{ positionSec: number; durationSec: number } | null> {
    try {
        const list = await getWatchHistory();
        const key = historyKey(keyArgs);
        const item = list.find((i) => i.id && historyKey(i) === key);
        if (item && typeof item.positionSec === "number") {
            return {
                positionSec: item.positionSec,
                durationSec: item.durationSec ?? 0,
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function clearWatchHistory(): Promise<void> {
    try {
        storage.remove(HISTORY_KEY);
        const exists = await RNFS.exists(HISTORY_FILE);
        if (exists) await RNFS.unlink(HISTORY_FILE);
    } catch (e) {
        // ignore
    }
}

export async function clearAppCache(): Promise<void> {
    try {
        // remove watch history
        await clearWatchHistory();
        // attempt remove cache dir contents
        const cacheDir = RNFS.CachesDirectoryPath;
        const items = await RNFS.readDir(cacheDir);
        await Promise.all(items.map((it) => RNFS.unlink(it.path).catch(() => { })));
    } catch (e) {
        // ignore
    }
}
