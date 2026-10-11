import fs from "fs";
import path from "path";

const root = path.join(__dirname, "../../..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

// The tab bar, peek bar and headers blur the focused screen's GlassBackdrop; a screen without one gets crafted
// glass. These screens float glass over scrolling content, so they must provide one.
const SCREENS = [
  "src/features/home/HomeView.tsx",
  "src/screens/MovieDetailsScreen.tsx",
  "src/screens/TvDetailsScreen.tsx",
  "src/screens/PersonDetailsScreen.tsx",
  "src/features/profile/ProfileView.tsx",
  "src/features/onboarding/OnboardingView.tsx",
  "src/features/search/SearchView.tsx",
];

describe("screens with floating glass", () => {
  it.each(SCREENS)("%s wraps its content in a GlassBackdrop and uses no Frost", (f) => {
    const src = read(f);
    expect(src).toContain("<GlassBackdrop");
    expect(src).not.toMatch(/<Frost\b/);
  });

  it("the party tray uses Glass: the peek bar blurs the screen, the sheet (a Modal) never does", () => {
    const src = read("components/party/PartyTray.tsx");
    expect(src).not.toMatch(/<Frost\b/);
    expect(src).toMatch(/<Glass material="bar" visible=\{shown\}/);
    expect(src).toMatch(/<Glass material="sheet" backdrop="none"/);
  });
});
