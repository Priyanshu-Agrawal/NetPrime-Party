/**
 * Responsive layout hook for Web, Tablet, and Mobile viewports.
 *
 * Pure: derived only from useWindowDimensions() — NO accelerometer/sensor. Under our
 * real OS rotation, width/height flip in fullscreen, so `isLandscapeMobile` is reliable.
 *
 * Breakpoints:
 * - Mobile: min dimension < 600
 * - Tablet: 600 – 1023
 * - Desktop / TV: >= 1024
 */
import { useWindowDimensions } from "react-native";
import { ms } from "@/theme/bearoom";

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);
  const isLandscape = width > height;

  // A phone held horizontally: landscape AND a small min dimension (< 600).
  const isLandscapeMobile = isLandscape && minDim < 600;

  // Real tablets / desktops have min dimension >= 600 (e.g. iPad mini 744x1133).
  const isTablet = minDim >= 600 && maxDim < 1024;
  const isDesktop = maxDim >= 1024 && minDim >= 600;
  const isWide = isDesktop || isTablet;
  const isMobile = !isWide;

  const maxContentWidth = 1440;
  const contentPadding = isDesktop ? ms(40) : isTablet ? ms(28) : ms(16);

  return {
    width,
    height,
    isLandscape,
    isLandscapeMobile,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    maxContentWidth,
    contentPadding,
  };
}

export default useResponsive;
