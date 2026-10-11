import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * One HTTP exchange for the plugin host (spec §5.4): no redirect followed (the JS layer walks them hop by hop and
 * re-checks each), no shared cookie store, public addresses only — the native side checks every resolved address.
 */
export interface NativeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
  responseType: "text" | "base64";
}

export interface NativeCookie {
  name: string;
  value: string;
  /** Lower-case, no leading dot. */
  domain: string;
  path: string;
  hostOnly: boolean;
  secure: boolean;
  /** Epoch ms; 0 = session cookie. */
  expiresAt: number;
}

export interface NativeResponse {
  status: number;
  url: string;
  /** Lower-cased names; repeated headers joined with ", ". Set-Cookie arrives parsed in `cookies`. */
  headers: Record<string, string>;
  cookies: NativeCookie[];
  body: string;
  encoding: "text" | "base64";
  truncated: boolean;
  /** Hex SHA-256 of the body bytes read. */
  sha256: string;
}

export type NativeFetchErrorCode = "ERR_BLOCKED_ADDRESS" | "ERR_TIMEOUT" | "ERR_NETWORK" | "ERR_BAD_REQUEST";

const CODES: readonly NativeFetchErrorCode[] = ["ERR_BLOCKED_ADDRESS", "ERR_TIMEOUT", "ERR_NETWORK", "ERR_BAD_REQUEST"];

export class NativeFetchError extends Error {
  code: NativeFetchErrorCode;
  constructor(code: NativeFetchErrorCode, message: string) {
    super(message);
    this.name = "NativeFetchError";
    this.code = code;
  }
}

interface NativeBearoomFetch {
  fetchOnce(req: NativeRequest): Promise<NativeResponse>;
}

const native = requireOptionalNativeModule<NativeBearoomFetch>("BearoomFetch");

/** True when this binary carries the module (the plugin host runs only then). */
export const nativeFetchAvailable = !!native;

export async function fetchOnce(req: NativeRequest): Promise<NativeResponse> {
  if (!native) throw new NativeFetchError("ERR_NETWORK", "BearoomFetch is not in this build");
  try {
    return await native.fetchOnce(req);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    const known = CODES.find((c) => c === code);
    throw new NativeFetchError(known ?? "ERR_NETWORK", (e as Error)?.message ?? "fetch failed");
  }
}
