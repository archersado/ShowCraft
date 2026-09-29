import { describe, expect, it } from "vitest";

import {
  isSecretPath,
  parseReleaseDocument,
  parseReleaseSourceRef,
  ReleaseSourceError,
  validateLocalSource,
  type LocalSourceRef,
} from "./releaseSource.js";

const localRef = (path: string): LocalSourceRef => ({ kind: "local", path });

describe("parseReleaseSourceRef", () => {
  it("treats plain paths as local sources", () => {
    expect(parseReleaseSourceRef("docs/changelog.md")).toEqual({
      kind: "local",
      path: "docs/changelog.md",
    });
    expect(parseReleaseSourceRef("/absolute/path.md")).toEqual(localRef("/absolute/path.md"));
  });

  it("parses a well-formed GitHub blob URL", () => {
    const ref = parseReleaseSourceRef(
      "https://github.com/anthropics/startupos/blob/desktop-v0.3.3/docs/changes/releases/v0.3.3/changelog.md",
    );
    expect(ref).toEqual({
      kind: "github",
      url: "https://github.com/anthropics/startupos/blob/desktop-v0.3.3/docs/changes/releases/v0.3.3/changelog.md",
      owner: "anthropics",
      repo: "startupos",
      ref: "desktop-v0.3.3",
      filePath: "docs/changes/releases/v0.3.3/changelog.md",
    });
  });

  it("accepts raw URLs and www host", () => {
    const www = parseReleaseSourceRef("https://www.github.com/o/r/raw/main/CHANGELOG.md");
    expect(www).toMatchObject({ kind: "github", owner: "o", repo: "r", ref: "main", filePath: "CHANGELOG.md" });
  });

  it("rejects non-https, non-github or malformed URLs", () => {
    expect(() => parseReleaseSourceRef("http://github.com/o/r/blob/main/x.md")).toThrow(ReleaseSourceError);
    expect(() => parseReleaseSourceRef("file:///etc/hosts")).toThrow(ReleaseSourceError);
    expect(() => parseReleaseSourceRef("https://gitlab.com/o/r/blob/main/x.md")).toThrow(ReleaseSourceError);
    expect(() => parseReleaseSourceRef("https://github.com/o/r")).toThrow(ReleaseSourceError);
    expect(() => parseReleaseSourceRef("https://github.com/o/r/tree/main/docs")).toThrow(ReleaseSourceError);
    expect(() => parseReleaseSourceRef("https://github.com/o/r/blob/main/notes.txt")).toThrow(
      ReleaseSourceError,
    );
  });
});

describe("validateLocalSource", () => {
  it("accepts an existing markdown file", () => {
    expect(() =>
      validateLocalSource(localRef("docs/notes.md"), { exists: true, isDirectory: false }),
    ).not.toThrow();
  });

  it("rejects missing paths", () => {
    expect(() => validateLocalSource(localRef("/no/such/file.md"), { exists: false, isDirectory: false })).toThrow(
      /does not exist/,
    );
  });

  it("rejects directories", () => {
    expect(() => validateLocalSource(localRef("/some/dir"), { exists: true, isDirectory: true })).toThrow(
      /is a directory/,
    );
  });

  it("rejects non-markdown files", () => {
    expect(() => validateLocalSource(localRef("notes.txt"), { exists: true, isDirectory: false })).toThrow(
      /must be a Markdown/,
    );
  });

  it("rejects secret files before reading them", () => {
    for (const path of [
      ".env",
      "config/.env.local",
      ".npmrc",
      "server.pem",
      "host.key",
      "creds/git-credentials",
      "home/.aws/credentials",
      ".secrets/api.keys",
    ]) {
      // Secrets are refused even when the file does not exist on disk —
      // the name alone is enough to decline.
      expect(() =>
        validateLocalSource(localRef(path), { exists: false, isDirectory: false }),
      ).toThrow(/secret/i);
      expect(() =>
        validateLocalSource(localRef(path), { exists: true, isDirectory: false }),
      ).toThrow(/secret/i);
    }
  });

  it("classifies secret detection via isSecretPath", () => {
    expect(isSecretPath(".env")).toBe(true);
    expect(isSecretPath("a/.env.production")).toBe(true);
    expect(isSecretPath(".npmrc")).toBe(true);
    expect(isSecretPath("certs/server.pem")).toBe(true);
    expect(isSecretPath("keys/host.KEY")).toBe(true);
    expect(isSecretPath("docs/environment.md")).toBe(false);
    expect(isSecretPath("keys.md")).toBe(false);
  });

  it("checks secret-file rule before the markdown extension rule", () => {
    // A secret file that is not markdown must report the secret reason.
    try {
      validateLocalSource(localRef(".env"), { exists: false, isDirectory: false });
      expect.unreachable(".env should have been rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ReleaseSourceError);
      expect((error as ReleaseSourceError).reason).toBe("secret_file");
    }
  });
});

describe("parseReleaseDocument", () => {
  const document = parseReleaseDocument(`# OriginOS CE v0.3.3

发布日期：2026-09-25

## 感知与 IM 路由

- 为同一发送者、连接和会话增加有界 sticky 路由，连续对话沿用已选角色。
- 将"请用户选择角色或能力"作为独立智能决策候选。

## 企业微信办公能力

- 企业微信日程等办公能力按当前感知源连接绑定授权。

## 验证

- Core 感知与 Jev、Desktop Plugin Host、Web 感知中心专项测试通过。
`);

  it("extracts the version and title from the level-1 heading", () => {
    expect(document.version).toBe("v0.3.3");
    expect(document.title).toBe("OriginOS CE");
  });

  it("extracts sections with line numbers and bullets", () => {
    expect(document.sections.map((section) => section.title)).toEqual([
      "感知与 IM 路由",
      "企业微信办公能力",
      "验证",
    ]);
    expect(document.sections[0]?.startLine).toBe(5);
    expect(document.sections[0]?.bullets).toHaveLength(2);
    expect(document.sections[2]?.bullets).toEqual([
      "Core 感知与 Jev、Desktop Plugin Host、Web 感知中心专项测试通过。",
    ]);
  });

  it("keeps section end lines within the section span", () => {
    const first = document.sections[0]!;
    const second = document.sections[1]!;
    expect(first.endLine).toBeLessThan(second.startLine);
  });

  it("handles documents without a version heading or sections", () => {
    expect(parseReleaseDocument("no headings here\njust text")).toEqual({
      version: undefined,
      title: undefined,
      sections: [],
    });
    expect(parseReleaseDocument("# Just a title\n\nno version marker").version).toBeUndefined();
  });

  it("matches semver with prerelease suffixes", () => {
    expect(parseReleaseDocument("# App v1.2.3-beta.1 notes").version).toBe("v1.2.3-beta.1");
    expect(parseReleaseDocument("# App 2.0.0 release").version).toBe("2.0.0");
  });
});
