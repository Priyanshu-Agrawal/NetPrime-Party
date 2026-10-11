import PluginSandbox from "@/components/plugins/PluginSandbox";
import { nativeFetchAvailable } from "@/modules/bearoom-fetch";
import { sandboxBridge, syncRepos } from "@/services/plugins";
import { useSandboxDemand } from "@/services/plugins/demand";
import { useFeatureFlags, usePluginRepos } from "@/src/store/features/providers/hooks";
import React, { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Headless (spec §5.4): while /config's `pluginHost` flag is on, keeps the plugin sandbox mounted and the installed
 * repos in step with /config.pluginRepos — the device's cached copy when offline, so nothing downloads until a
 * download can work. A dev screen can hold the sandbox open with the flag off (no installs then).
 */
export default function PluginBootstrap() {
  const { pluginHost } = useFeatureFlags();
  const repos = usePluginRepos();
  const demand = useSandboxDemand();
  const supported = Platform.OS !== "web" && nativeFetchAvailable;

  useEffect(() => {
    if (supported && pluginHost) void syncRepos(repos);
  }, [supported, pluginHost, repos]);

  return supported && (pluginHost || demand > 0) ? <PluginSandbox bridge={sandboxBridge} /> : null;
}
