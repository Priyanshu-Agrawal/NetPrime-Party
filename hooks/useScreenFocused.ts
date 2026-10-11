import { NavigationContext } from "@react-navigation/native";
import { useContext, useEffect, useState } from "react";

/**
 * Is this component's screen the one on screen? Tabs stay mounted behind everything
 * (lazy: false) and stacks keep covered screens alive, so anything that animates or
 * polls on its own must stop when its screen is covered. Outside a navigator it
 * counts as on screen. Unlike useIsFocused it is safe to call anywhere.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}
