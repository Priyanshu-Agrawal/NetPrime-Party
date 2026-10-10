const fs = require("fs");
const path = require("path");
const { addPlaybackToMainApplication } = require("./bearoom-playback/withBearoomPlayback");
const { addXcodeFixesToPodfile } = require("./with-fmt-xcode-fix");

const fixture = (sdk, file) => fs.readFileSync(path.join(__dirname, "__fixtures__", sdk, file), "utf8");
const PKG = "com.scriptingbear.bearoom";

describe.each(["sdk53", "sdk57"])("bearoom-playback on the %s template", (sdk) => {
  const out = addPlaybackToMainApplication(fixture(sdk, "MainApplication.kt"), PKG);
  it("imports the playback package", () => {
    expect(out).toContain(`import ${PKG}.playback.BearoomPlaybackPackage`);
  });
  it("registers the package exactly once, inside the package list", () => {
    expect(out.match(/BearoomPlaybackPackage\(\)/g)).toHaveLength(1);
    const reg = out.indexOf("BearoomPlaybackPackage()");
    expect(reg).toBeGreaterThan(out.indexOf("PackageList(this).packages"));
  });
  it("is idempotent", () => {
    expect(addPlaybackToMainApplication(out, PKG)).toBe(out);
  });
});

describe.each(["sdk53", "sdk57"])("xcode fixes on the %s Podfile", (sdk) => {
  const out = addXcodeFixesToPodfile(fixture(sdk, "Podfile"));
  it("adds the fmt fix and the deployment-target floor inside post_install", () => {
    const post = out.indexOf("post_install do |installer|");
    expect(post).toBeGreaterThan(-1);
    expect(out.indexOf("Bearoom Xcode 26 fmt workaround")).toBeGreaterThan(post);
    expect(out).toMatch(/Gem::Version\.new\('1[56]\.\d'\)/);
  });
  it("is idempotent", () => {
    expect(addXcodeFixesToPodfile(out)).toBe(out);
  });
});

it("fails loudly on an unknown template instead of skipping", () => {
  expect(() => addPlaybackToMainApplication("class MainApplication {}", PKG)).toThrow(/anchor not found/);
  expect(() => addXcodeFixesToPodfile("target 'x' do\nend")).toThrow(/anchor not found/);
});
