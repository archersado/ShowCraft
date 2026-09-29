/**
 * Release source ingestion: validating and parsing CLI `--source` inputs.
 * Pure functions over injected file facts — the CLI performs actual
 * filesystem/network access and passes results in, keeping core I/O-free.
 */

export type LocalSourceRef = {
  kind: "local";
  /** Absolute or CLI-relative path as provided by the user. */
  path: string;
};

export type GitHubSourceRef = {
  kind: "github";
  url: string;
  owner: string;
  repo: string;
  /** Branch, tag or commit ref encoded in the URL, when present. */
  ref?: string;
  filePath: string;
};

export type ReleaseSourceRef = LocalSourceRef | GitHubSourceRef;

export class ReleaseSourceError extends Error {
  constructor(
    readonly reason: "missing" | "directory" | "not_markdown" | "secret_file" | "invalid_url",
    message: string,
  ) {
    super(message);
    this.name = "ReleaseSourceError";
  }
}

/** Files that must never be read as release notes. */
const SECRET_FILE_PATTERN =
  /(^|\/)\.(?:env|env\.[^/]*|npmrc|netrc|git-credentials|aws\/credentials)(?:$|\/)|(^|\/)(?:git-credentials|credentials)(?:$|\/)|(^|\/)\.secrets?(?:$|\/)|\.pem$|\.key$/i;

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/** Parse a raw --source argument into a typed reference, or reject it. */
export function parseReleaseSourceRef(raw: string): ReleaseSourceRef {
  if (/^https:\/\//i.test(raw)) {
    return parseGitHubUrl(raw);
  }
  if (/^http:\/\//i.test(raw) || /^file:\/\//i.test(raw)) {
    throw new ReleaseSourceError("invalid_url", `Only https GitHub URLs are supported: ${raw}`);
  }
  return { kind: "local", path: raw };
}

function parseGitHubUrl(raw: string): GitHubSourceRef {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ReleaseSourceError("invalid_url", `Malformed URL: ${raw}`);
  }
  if (!GITHUB_HOSTS.has(url.hostname)) {
    throw new ReleaseSourceError(
      "invalid_url",
      `Only github.com URLs are supported, got ${url.hostname}`,
    );
  }
  // https://github.com/<owner>/<repo>/blob/<ref>/<path...> or /raw/<ref>/<path...>
  const segments = url.pathname.split("/").filter(Boolean);
  const owner = segments[0];
  const repo = segments[1];
  const pathKind = segments[2];
  const ref = segments[3];
  if (!owner || !repo || (pathKind !== "blob" && pathKind !== "raw") || !ref) {
    throw new ReleaseSourceError(
      "invalid_url",
      "Expected https://github.com/<owner>/<repo>/blob/<ref>/<path>.md",
    );
  }
  const filePath = segments.slice(4).join("/");
  if (!isMarkdownPath(filePath)) {
    throw new ReleaseSourceError("not_markdown", `GitHub source must be a Markdown file: ${filePath}`);
  }
  return { kind: "github", url: raw, owner, repo, ref, filePath };
}

/** Guard the file facts of a local source before its content may be read. */
export function validateLocalSource(
  ref: LocalSourceRef,
  facts: { exists: boolean; isDirectory: boolean },
): void {
  // Secret paths are refused by name alone — before existence probing — so
  // `.env`-style files are never read regardless of their state on disk.
  if (isSecretPath(ref.path)) {
    throw new ReleaseSourceError(
      "secret_file",
      `Refusing to read potential secret file: ${ref.path}`,
    );
  }
  if (!facts.exists) {
    throw new ReleaseSourceError("missing", `Release source does not exist: ${ref.path}`);
  }
  if (facts.isDirectory) {
    throw new ReleaseSourceError("directory", `Release source is a directory: ${ref.path}`);
  }
  if (!isMarkdownPath(ref.path)) {
    throw new ReleaseSourceError(
      "not_markdown",
      `Release source must be a Markdown (.md) file: ${ref.path}`,
    );
  }
}

export function isSecretPath(path: string): boolean {
  return SECRET_FILE_PATTERN.test(path);
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// ---------------------------------------------------------------------------
// Markdown parsing: version heading + `## ` sections
// ---------------------------------------------------------------------------

export type ReleaseSection = {
  /** Section heading text without the leading `## `. */
  title: string;
  /** 1-based line numbers of the section heading within the document. */
  startLine: number;
  endLine: number;
  /** Bullet lines belonging to this section, verbatim. */
  bullets: string[];
};

export type ParsedReleaseDocument = {
  /** Version extracted from the first level-1 heading, e.g. "v0.3.3". */
  version?: string;
  /** Document title without the version suffix, when a version was found. */
  title?: string;
  sections: ReleaseSection[];
};

const VERSION_IN_HEADING = /\b(v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/;

/** Extract version and `## ` sections from release-notes Markdown text. */
export function parseReleaseDocument(text: string): ParsedReleaseDocument {
  const lines = text.split(/\r?\n/);

  let version: string | undefined;
  let title: string | undefined;
  const sections: ReleaseSection[] = [];

  let current: ReleaseSection | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const headingText = heading[2]!.trim();
      if (level === 1 && version === undefined) {
        const match = VERSION_IN_HEADING.exec(headingText);
        if (match) {
          version = match[1];
          title = headingText.replace(match[0], "").trim() || undefined;
        }
      }
      if (level === 2) {
        current = { title: headingText, startLine: index + 1, endLine: index + 1, bullets: [] };
        sections.push(current);
        continue;
      }
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (current && bullet) {
      current.bullets.push(bullet[1]!.trim());
    }
    if (current) {
      current.endLine = index + 1;
    }
  }

  return { version, title, sections };
}
