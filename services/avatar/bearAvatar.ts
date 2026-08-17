/**
 * BeaRoom Bear Avatar Generator & Renderer
 *
 * Lightweight, high-performance, deterministic SVG compiler for BeaRoom bear avatars.
 * Supports gender-aware randomized generation, custom preset overrides, and data-URI generation
 * for seamless Expo Image and React Native SVG rendering.
 */
import definitionJson from "@/BeaRoom-Bear-Avatar.json";

export type GenderPreference = "masculine" | "feminine" | "neutral";

export interface BearAvatarOptions {
  body?: string;
  ears?: string;
  head?: string;
  muzzle?: string;
  eyes?: string;
  brows?: string;
  mouth?: string;
  presentation?: string;
  blush?: string;
  hair?: string;
  outfit?: string;
  accessory?: string;
  partyBadge?: string;
  furColor?: string;
  outfitColor?: string;
  accessoryColor?: string;
  flip?: "none" | "horizontal";
  scale?: number;
  backgroundColor?: string;
}

export interface BearAvatarConfig {
  seed: string;
  gender: GenderPreference;
  options?: BearAvatarOptions;
}

export interface OptionItem {
  id: string;
  label: string;
  icon?: string;
  color?: string;
}

export interface BearVibePreset {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  gender?: GenderPreference;
  options: BearAvatarOptions;
}

// ---------------------------------------------------------------------------
// Signature BeaRoom Watch-Party Presets ("Vibes")
// ---------------------------------------------------------------------------

export const BEAR_VIBES: BearVibePreset[] = [
  {
    id: "cinephile",
    name: "The Cinephile",
    tagline: "Frames, film reels & cinema tickets",
    icon: "videocam",
    options: {
      head: "soft",
      ears: "round",
      eyes: "curious",
      brows: "confident",
      mouth: "smallSmile",
      outfit: "directorJacket",
      accessory: "roundGlasses",
      partyBadge: "ticket",
      hair: "sideTuft",
      furColor: "#6B4327",
    },
  },
  {
    id: "cozyStreamer",
    name: "Cozy Streamer",
    tagline: "Hoodie, beanie & ambient warmth",
    icon: "cafe",
    options: {
      head: "round",
      ears: "floppy",
      eyes: "happy",
      brows: "soft",
      mouth: "wideSmile",
      outfit: "cozyHoodie",
      accessory: "beanie",
      partyBadge: "paw",
      blush: "soft",
      hair: "fluffy",
      furColor: "#D6A05B",
    },
  },
  {
    id: "audiophile",
    name: "Beat Master",
    tagline: "Studio headphones & varsity energy",
    icon: "headset",
    options: {
      head: "wide",
      ears: "pointed",
      eyes: "excited",
      brows: "raised",
      mouth: "openLaugh",
      outfit: "varsity",
      accessory: "headphones",
      partyBadge: "star",
      hair: "fringe",
      furColor: "#4A2E1B",
    },
  },
  {
    id: "nightOwl",
    name: "Night Owl",
    tagline: "Late night marathons & cozy mugs",
    icon: "moon",
    options: {
      head: "round",
      ears: "small",
      eyes: "sleepy",
      brows: "soft",
      mouth: "tinyO",
      outfit: "sweater",
      accessory: "cozyMug",
      partyBadge: "play",
      hair: "tinyTuft",
      furColor: "#96613A",
    },
  },
  {
    id: "hostStar",
    name: "Party Host",
    tagline: "Starry eyes & gold host badge",
    icon: "star",
    options: {
      head: "soft",
      ears: "round",
      eyes: "starry",
      brows: "confident",
      mouth: "wideSmile",
      outfit: "movieNightHoodie",
      accessory: "cinemaPin",
      partyBadge: "star",
      blush: "cinemaGlow",
      hair: "fluffy",
      furColor: "#F7F4EE",
    },
  },
  {
    id: "snackMaster",
    name: "Popcorn Fiend",
    tagline: "Movie snacks on repeat",
    icon: "pizza",
    options: {
      head: "wide",
      ears: "round",
      eyes: "laughing",
      brows: "curious",
      mouth: "tongue",
      outfit: "retroPopcornShirt",
      accessory: "popcornPin",
      partyBadge: "ticket",
      hair: "sideTuft",
      furColor: "#B97A3D",
    },
  },
];

// ---------------------------------------------------------------------------
// PRNG Utilities
// ---------------------------------------------------------------------------

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return hash >>> 0;
}

function createRng(seed: string) {
  let s = hashString(seed) || 1;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  const idx = Math.floor(rng() * arr.length);
  return arr[idx];
}

// ---------------------------------------------------------------------------
// Available Categories & Options Metadata (for Customizer UI)
// ---------------------------------------------------------------------------

export const FUR_COLORS: OptionItem[] = [
  { id: "#6B4327", label: "Cocoa", color: "#6B4327" },
  { id: "#4A2E1B", label: "Dark Chocolate", color: "#4A2E1B" },
  { id: "#7D5030", label: "Warm Brown", color: "#7D5030" },
  { id: "#96613A", label: "Honey Brown", color: "#96613A" },
  { id: "#B97A3D", label: "Golden Caramel", color: "#B97A3D" },
  { id: "#C58A4A", label: "Caramel", color: "#C58A4A" },
  { id: "#D6A05B", label: "Honey", color: "#D6A05B" },
  { id: "#E3BB82", label: "Biscuit", color: "#E3BB82" },
  { id: "#E8D0AA", label: "Cream", color: "#E8D0AA" },
  { id: "#F1E3CA", label: "Soft Cream", color: "#F1E3CA" },
  { id: "#F7F4EE", label: "Polar", color: "#F7F4EE" },
  { id: "#B85D3A", label: "Cinnamon", color: "#B85D3A" },
];

export const EYE_OPTIONS: OptionItem[] = [
  { id: "neutral", label: "Neutral", icon: "ellipse-outline" },
  { id: "happy", label: "Happy", icon: "happy-outline" },
  { id: "excited", label: "Excited", icon: "sparkles-outline" },
  { id: "starry", label: "Starry", icon: "star-outline" },
  { id: "sleepy", label: "Sleepy", icon: "moon-outline" },
  { id: "wink", label: "Wink", icon: "eye-outline" },
  { id: "curious", label: "Curious", icon: "help-circle-outline" },
  { id: "mischievous", label: "Mischief", icon: "flame-outline" },
  { id: "surprised", label: "Surprised", icon: "alert-circle-outline" },
  { id: "laughing", label: "Laughing", icon: "heart-outline" },
];

export const MOUTH_OPTIONS: OptionItem[] = [
  { id: "smallSmile", label: "Small Smile" },
  { id: "wideSmile", label: "Wide Smile" },
  { id: "neutral", label: "Neutral" },
  { id: "openLaugh", label: "Open Laugh" },
  { id: "tinyO", label: "Tiny O" },
  { id: "tongue", label: "Tongue Out" },
];

export const BROW_OPTIONS: OptionItem[] = [
  { id: "soft", label: "Soft" },
  { id: "raised", label: "Raised" },
  { id: "confident", label: "Confident" },
  { id: "curious", label: "Curious" },
  { id: "none", label: "None" },
];

export const HAIR_OPTIONS: OptionItem[] = [
  { id: "fluffy", label: "Fluffy Top" },
  { id: "fringe", label: "Tuft Fringe" },
  { id: "sideTuft", label: "Side Tuft" },
  { id: "tinyTuft", label: "Tiny Tuft" },
  { id: "none", label: "Clean / None" },
];

export const OUTFIT_OPTIONS: OptionItem[] = [
  { id: "cozyHoodie", label: "Cozy Hoodie", icon: "shirt-outline" },
  { id: "directorJacket", label: "Director Jacket", icon: "videocam-outline" },
  { id: "cinemaTee", label: "Cinema Tee", icon: "film-outline" },
  { id: "varsity", label: "Varsity Jacket", icon: "trophy-outline" },
  { id: "movieNightHoodie", label: "Movie Night Hoodie", icon: "tv-outline" },
  { id: "retroPopcornShirt", label: "Popcorn Shirt", icon: "fast-food-outline" },
  { id: "sweater", label: "Knit Sweater", icon: "cafe-outline" },
  { id: "oversizedSweatshirt", label: "Oversized Sweatshirt", icon: "heart-outline" },
  { id: "streamingSweater", label: "Stream Sweater", icon: "play-circle-outline" },
  { id: "tshirt", label: "Pack Tee", icon: "people-outline" },
  { id: "pajamas", label: "Watch Pajamas", icon: "bed-outline" },
  { id: "casualJacket", label: "Casual Jacket", icon: "browsers-outline" },
  { id: "none", label: "No Outfit", icon: "close-circle-outline" },
];

export const ACCESSORY_OPTIONS: OptionItem[] = [
  { id: "headphones", label: "Studio Headphones", icon: "headset-outline" },
  { id: "roundGlasses", label: "Cinephile Glasses", icon: "glasses-outline" },
  { id: "wirelessEarbuds", label: "Earbuds", icon: "ear-outline" },
  { id: "beanie", label: "Beanie", icon: "snow-outline" },
  { id: "cap", label: "Director Cap", icon: "baseball-outline" },
  { id: "scarf", label: "Cinema Scarf", icon: "ribbon-outline" },
  { id: "cinemaPin", label: "Movie Pin", icon: "ticket-outline" },
  { id: "popcornPin", label: "Popcorn Pin", icon: "pizza-outline" },
  { id: "filmStripPin", label: "Film Strip Pin", icon: "film-outline" },
  { id: "cozyMug", label: "Cozy Mug", icon: "cafe-outline" },
  { id: "earring", label: "Gold Hoop", icon: "disc-outline" },
  { id: "bow", label: "Cinema Bow", icon: "gift-outline" },
  { id: "none", label: "None", icon: "close-circle-outline" },
];

export const BADGE_OPTIONS: OptionItem[] = [
  { id: "paw", label: "Gold Paw", icon: "paw" },
  { id: "star", label: "Host Star", icon: "star" },
  { id: "play", label: "Play Badge", icon: "play" },
  { id: "ticket", label: "VIP Ticket", icon: "ticket" },
  { id: "none", label: "None", icon: "close" },
];

// ---------------------------------------------------------------------------
// Gender-Aware Random Generator
// ---------------------------------------------------------------------------

export function generateRandomBearConfig(
  gender: GenderPreference = "neutral",
  seed?: string
): BearAvatarConfig {
  const actualSeed = seed || `bear_${gender}_${Math.random().toString(36).slice(2, 9)}`;
  const rng = createRng(actualSeed);

  // Fur
  const furColor = pick(rng, FUR_COLORS).id;

  // Presentation variant
  let presentation = "neutral";
  if (gender === "masculine") presentation = rng() > 0.3 ? "masculine" : "neutral";
  else if (gender === "feminine") presentation = rng() > 0.3 ? "feminine" : "neutral";
  else presentation = rng() > 0.5 ? "androgynous" : "neutral";

  // Eyes & Mouth combinations
  const eyes = pick(rng, ["happy", "neutral", "excited", "starry", "sleepy", "wink", "curious", "laughing", "mischievous"]);
  const mouth = pick(rng, ["smallSmile", "wideSmile", "neutral", "openLaugh", "tinyO", "tongue"]);
  const brows = pick(rng, ["soft", "raised", "confident", "curious", "none"]);

  // Hair
  const hair = rng() > 0.25 ? pick(rng, ["fluffy", "fringe", "sideTuft", "tinyTuft"]) : "none";

  // Outfit biased by gender for variety without stereotype
  let outfit = "cozyHoodie";
  if (gender === "masculine") {
    outfit = pick(rng, ["varsity", "directorJacket", "movieNightHoodie", "casualJacket", "cozyHoodie", "cinemaTee", "sweater", "tshirt"]);
  } else if (gender === "feminine") {
    outfit = pick(rng, ["cozyHoodie", "sweater", "streamingSweater", "oversizedSweatshirt", "pajamas", "retroPopcornShirt", "cinemaTee", "tshirt"]);
  } else {
    outfit = pick(rng, ["cozyHoodie", "directorJacket", "sweater", "cinemaTee", "oversizedSweatshirt", "movieNightHoodie", "tshirt"]);
  }

  // Accessories
  let accessory = "none";
  if (rng() > 0.2) {
    if (gender === "masculine") {
      accessory = pick(rng, ["headphones", "roundGlasses", "cap", "wirelessEarbuds", "beanie", "cinemaPin", "filmStripPin", "cozyMug", "scarf"]);
    } else if (gender === "feminine") {
      accessory = pick(rng, ["roundGlasses", "headphones", "bow", "earring", "scarf", "popcornPin", "beanie", "cozyMug", "wirelessEarbuds"]);
    } else {
      accessory = pick(rng, ["roundGlasses", "headphones", "wirelessEarbuds", "beanie", "scarf", "cinemaPin", "popcornPin", "cozyMug"]);
    }
  }

  // Badge
  const partyBadge = rng() > 0.6 ? pick(rng, ["paw", "star", "play", "ticket"]) : "none";

  // Blush
  const blush = gender === "feminine" ? (rng() > 0.2 ? "soft" : "warm") : (rng() > 0.5 ? "cinemaGlow" : "none");

  return {
    seed: actualSeed,
    gender,
    options: {
      body: "classic",
      ears: pick(rng, ["round", "small", "floppy", "pointed"]),
      head: pick(rng, ["round", "soft", "wide"]),
      muzzle: pick(rng, ["round", "wide", "small"]),
      eyes,
      brows,
      mouth,
      presentation,
      blush,
      hair,
      outfit,
      accessory,
      partyBadge,
      furColor,
    },
  };
}

// ---------------------------------------------------------------------------
// SVG Rendering Engine
// ---------------------------------------------------------------------------

function renderSvgAttributes(attrs: Record<string, any>, resolvedColors: Record<string, string>): string {
  if (!attrs) return "";
  return Object.entries(attrs)
    .map(([key, val]) => {
      let resolvedVal = val;
      if (val && typeof val === "object" && val.type === "color") {
        resolvedVal = resolvedColors[val.name] || "#FFFFFF";
      }
      return `${key}="${resolvedVal}"`;
    })
    .join(" ");
}

function renderElementTree(el: any, resolvedColors: Record<string, string>): string {
  if (!el) return "";
  if (el.type === "text") {
    return String(el.value || "");
  }
  if (el.type === "element") {
    const attrStr = renderSvgAttributes(el.attributes, resolvedColors);
    const childrenStr = Array.isArray(el.children)
      ? el.children.map((c: any) => renderElementTree(c, resolvedColors)).join("")
      : "";
    if (childrenStr) {
      return `<${el.name} ${attrStr}>${childrenStr}</${el.name}>`;
    }
    return `<${el.name} ${attrStr} />`;
  }
  return "";
}

/**
 * Generates an SVG string representation of a BeaRoom Bear avatar given a configuration.
 */
export function generateBearSvg(config: BearAvatarConfig): string {
  const rng = createRng(config.seed || "bear");
  const options = config.options || {};
  const def = definitionJson as any;

  // Resolve Colors
  const furColor = options.furColor || pick(rng, def.colors.fur.values) || "#6B4327";
  const resolvedColors: Record<string, string> = {
    fur: furColor,
    furLight: pick(rng, def.colors.furLight.values) || "#D6A974",
    muzzle:
      pick(
        rng,
        def.colors.muzzle.values.filter((c: string) => c !== furColor)
      ) || "#E3BE94",
    earInner: pick(rng, def.colors.earInner.values) || "#B27455",
    hair: pick(rng, def.colors.hair.values) || "#352822",
    features: pick(rng, def.colors.features.values) || "#241B18",
    mouth: pick(rng, def.colors.mouth.values) || "#4D2821",
    blush: pick(rng, def.colors.blush.values) || "#D76A63",
    brand: pick(rng, def.colors.brand.values) || "#F5A623",
    accessory: options.accessoryColor || pick(rng, def.colors.accessory.values) || "#F5A623",
    accessoryDark: pick(rng, def.colors.accessoryDark.values) || "#35261D",
    accessoryLight: pick(rng, def.colors.accessoryLight.values) || "#FFE0A3",
    outfit: options.outfitColor || pick(rng, def.colors.outfit.values) || "#2B2521",
    outfitAccent: pick(rng, def.colors.outfitAccent.values) || "#F5A623",
  };

  // Render Canvas Components in Order
  const componentOrder = def.canvas.elements;
  let bodyMarkup = "";

  for (const item of componentOrder) {
    const compName = item.name;
    const compDef = def.components[compName];
    if (!compDef) continue;

    // Check custom selection or auto resolve
    const rawVal = options[compName as keyof BearAvatarOptions];
    let selectedVariant: string | undefined = typeof rawVal === "string" ? rawVal : undefined;

    if (!selectedVariant || selectedVariant === "auto") {
      if (compDef.probability !== undefined && rng() * 100 > compDef.probability) {
        selectedVariant = "none";
      } else {
        const variantKeys = Object.keys(compDef.variants).filter((k) => k !== "none");
        selectedVariant = variantKeys.length > 0 ? pick(rng, variantKeys) : "none";
      }
    }

    if (selectedVariant === "none" || !selectedVariant) continue;

    const variantDef = compDef.variants[selectedVariant];
    if (variantDef && Array.isArray(variantDef.elements)) {
      for (const el of variantDef.elements) {
        bodyMarkup += renderElementTree(el, resolvedColors);
      }
    }
  }

  let contentMarkup = bodyMarkup;
  if (options.flip === "horizontal") {
    contentMarkup = `<g transform="translate(${def.canvas.width}, 0) scale(-1, 1)">${contentMarkup}</g>`;
  }

  let bgMarkup = "";
  if (options.backgroundColor) {
    bgMarkup = `<rect width="${def.canvas.width}" height="${def.canvas.height}" fill="${options.backgroundColor}" />`;
  }

  const rootAttrs = renderSvgAttributes(def.attributes, resolvedColors);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${def.canvas.width} ${def.canvas.height}" width="${def.canvas.width}" height="${def.canvas.height}" ${rootAttrs}>${bgMarkup}${contentMarkup}</svg>`;
}

/** Pure JavaScript Base64 encoder for universal React Native (Android + iOS) support */
function toBase64(str: string): string {
  if (typeof globalThis.btoa === "function") {
    try {
      return globalThis.btoa(unescape(encodeURIComponent(str)));
    } catch {
      // fallback
    }
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  const utf8Str = unescape(encodeURIComponent(str));
  for (let i = 0; i < utf8Str.length; i += 3) {
    const enc1 = utf8Str.charCodeAt(i);
    const enc2 = isNaN(utf8Str.charCodeAt(i + 1)) ? 0 : utf8Str.charCodeAt(i + 1);
    const enc3 = isNaN(utf8Str.charCodeAt(i + 2)) ? 0 : utf8Str.charCodeAt(i + 2);
    const hasEnc2 = !isNaN(utf8Str.charCodeAt(i + 1));
    const hasEnc3 = !isNaN(utf8Str.charCodeAt(i + 2));

    const b1 = enc1 >> 2;
    const b2 = ((enc1 & 3) << 4) | (enc2 >> 4);
    const b3 = ((enc2 & 15) << 2) | (enc3 >> 6);
    const b4 = enc3 & 63;

    output +=
      chars.charAt(b1) +
      chars.charAt(b2) +
      (hasEnc2 ? chars.charAt(b3) : "=") +
      (hasEnc3 ? chars.charAt(b4) : "=");
  }
  return output;
}

/**
 * Generates an SVG Data URI ready for use in Image component sources.
 * Encoded as Base64 for 100% reliable rendering on Android (Glide) and iOS.
 */
export function generateBearDataUri(config: BearAvatarConfig): string {
  const svg = generateBearSvg(config);
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}
