/**
 * Renders one server-driven Home feed section by `type`. `HomeView` maps
 * `feed.sections` (from `normalizeManifest`) to this switch instead of a
 * fixed, hardcoded rail list — see docs/plans (Discovery D1).
 */
import type { FeedSection as Section } from "@/types/feed";
import { MediaRail } from "@/components/home/MediaRail";
import { ContinueWatching } from "@/components/home/ContinueWatching";
import { BecauseYouWatchedRail } from "@/components/home/BecauseYouWatchedRail";
import { FranchisesRail } from "@/components/home/FranchisesRail";
import { GenreChipsRow } from "@/components/home/GenreChipsRow";
import { RegionPopularRail } from "@/components/home/RegionPopularRail";
import { openSeeAll } from "@/src/navigation/actions";
import React from "react";

export function FeedSection({ section }: { section: Section }) {
  switch (section.type) {
    case "continueWatching":
      return <ContinueWatching />;
    case "becauseYouWatched":
      return <BecauseYouWatchedRail />;
    case "tmdbRail":
      return (
        <MediaRail
          title={section.title ?? ""}
          path={section.path}
          kind={section.kind}
          icon={section.icon as any}
          onSeeAll={section.seeAll ? () => openSeeAll(section.title ?? "", section.path, section.kind) : undefined}
        />
      );
    case "franchises":
      return (
        <FranchisesRail
          ids={section.collectionIds}
          title={section.title}
          dynamic={section.dynamic}
        />
      );
    case "regionPopular":
      return <RegionPopularRail />;
    case "genreRow":
      return <GenreChipsRow title={section.title} kind={section.kind} />;
    // editorialRow (P5): not yet rendered.
    default:
      return null; // forward-compat
  }
}

export default FeedSection;
