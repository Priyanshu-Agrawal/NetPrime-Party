import PluginSandbox from "@/components/plugins/PluginSandbox";
import { nativeFetchAvailable } from "@/modules/bearoom-fetch";
import { sandboxBridge, syncRepos } from "@/services/plugins";
import { useSandboxDemand } from "@/services/plugins/demand";
import { useFeatureFlags, usePluginRepos } from "@/src/store/features/providers/hooks";
import React, { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Headless (spec §5.4): while /config's `pluginHost` flag is on, keeps the installed repos in step with
 * /config.pluginRepos — the device's cached copy when offline, so nothing downloads until a download can work. The
 * sandbox mounts only while something holds it (a resolve keeps it 2 minutes; the Plugin Lab while it is open): its
 * WebView renderer costs ≈118 MB.
 */
export default function PluginBootstrap() {
  const { pluginHost } = useFeatureFlags();
  const repos = usePluginRepos();
  const demand = useSandboxDemand();
  const supported = Platform.OS !== "web" && nativeFetchAvailable;

  useEffect(() => {
    if (supported && pluginHost) void syncRepos(repos);
  }, [supported, pluginHost, repos]);

  return supported && demand > 0 ? <PluginSandbox bridge={sandboxBridge} /> : null;
}
