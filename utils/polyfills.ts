/**
 * Runtime polyfills required by `@movie-web/providers` (the stream extractor)
 * under Hermes / React Native. MUST be imported before any code that imports
 * the providers package. See utils/streamResolver.ts.
 *
 * Confirmed against @movie-web/providers v2.4.13 source:
 *  - URL / URLSearchParams  → react-native-url-polyfill
 *  - atob / btoa            → base-64
 *  - crypto.getRandomValues → react-native-get-random-values (crypto-js PRNG)
 * Not needed: TextEncoder, Node crypto/WebCrypto, Buffer, any DOM shim.
 */
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { decode, encode } from "base-64";

if (typeof global.btoa === "undefined") {
  global.btoa = encode;
}
if (typeof global.atob === "undefined") {
  global.atob = decode;
}
