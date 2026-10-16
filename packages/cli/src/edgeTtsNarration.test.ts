import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createMockReleaseSource, createMockScenePlanner, NarrationError } from "@showcraft/core";

import {
  createEdgeTtsNarration,
  createEdgeTtsWebSocket,
  DEFAULT_NARRATION_VOICE,
  type WebSocketFactory,
  type WebSocketLike,
} from "./edgeTtsNarration.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

class FakeSocket extends EventTarget {
  readonly sent: string[] = [];
  readyState = WebSocket.CONNECTING;
  onSend?: (value: string) => void;

  send(value: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    const text = String(value);
    this.sent.push(text);
    this.onSend?.(text);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  fail(): void {
    this.dispatchEvent(new Event("error"));
  }

  closed(code: number, reason = ""): void {
    this.dispatchEvent(new CloseEvent("close", { code, reason }));
  }
}

function textFrame(path: string, body = ""): string {
  return `Path:${path}\r\n\r\n${body}`;
}

function metadataFrame(): string {
  return textFrame(
    "audio.metadata",
    JSON.stringify({
      Metadata: [
        { Type: "WordBoundary", Data: { Offset: 1_000_000, Duration: 1_750_000, text: { Text: "这&amp;" } } },
        { Type: "WordBoundary", Data: { Offset: 3_000_000, Duration: 2_000_000, text: { Text: "是" } } },
      ],
    }),
  );
}

function validMp3(): Uint8Array {
  const bytes = new Uint8Array(3_000);
  bytes.set([0xff, 0xf3, 0x84, 0xc0]);
  return bytes;
}

function binaryAudio(bytes = validMp3()): Uint8Array {
  const headers = new TextEncoder().encode("Path:audio\r\nContent-Type:audio/mpeg");
  const frame = new Uint8Array(2 + headers.byteLength + bytes.byteLength);
  new DataView(frame.buffer).setUint16(0, headers.byteLength, false);
  frame.set(headers, 2);
  frame.set(bytes, 2 + headers.byteLength);
  return frame;
}

function factoryFor(
  drive: (socket: FakeSocket) => void,
  capture?: (url: string, socket: FakeSocket) => void,
): WebSocketFactory {
  return (url) => {
    const socket = new FakeSocket();
    capture?.(url, socket);
    queueMicrotask(() => drive(socket));
    return socket as unknown as WebSocketLike;
  };
}

async function fixture(connect: WebSocketFactory) {
  const runDirectory = await mkdtemp(join(tmpdir(), "showcraft-tts-"));
  temporaryPaths.push(runDirectory);
  const release = createMockReleaseSource()();
  const scenePlan = createMockScenePlanner()(release);
  const narration = createEdgeTtsNarration({ runDirectory, connect, timeoutMs: 1_000 });
  return { runDirectory, narration, release, scenePlan };
}

function successfulDriver(socket: FakeSocket): void {
  socket.onSend = (value) => {
    if (!value.includes("Path:ssml")) return;
    queueMicrotask(() => {
      socket.message(textFrame("turn.start"));
      socket.message(metadataFrame());
      socket.message(new Blob([binaryAudio()]));
      socket.message(textFrame("turn.end"));
    });
  };
  socket.open();
}

describe("createEdgeTtsNarration", () => {
  it("writes MP3 audio and returns word-level subtitle timing", async () => {
    const { narration, release, scenePlan, runDirectory } = await fixture(factoryFor(successfulDriver));
    const artifact = await narration(release, scenePlan);

    expect(artifact.voice).toBe(DEFAULT_NARRATION_VOICE);
    expect(artifact.scenes[0]).toMatchObject({
      audioFile: "narration-scene-mock-feature.mp3",
      audioDurationMs: 500,
      cues: [
        { text: "这&", startMs: 100, endMs: 275 },
        { text: "是", startMs: 300, endMs: 500 },
      ],
    });
    await expect(readFile(join(runDirectory, artifact.scenes[0]!.audioFile))).resolves.toHaveLength(3_000);
  });

  it("uses no-dash uppercase request IDs and passes through a custom voice", async () => {
    let socket: FakeSocket | undefined;
    let url = "";
    const { runDirectory, release, scenePlan } = await fixture(
      factoryFor(successfulDriver, (receivedUrl, receivedSocket) => {
        url = receivedUrl;
        socket = receivedSocket;
      }),
    );
    const narration = createEdgeTtsNarration({
      runDirectory,
      voice: "en-US-EmmaMultilingualNeural",
      connect: factoryFor(successfulDriver, (receivedUrl, receivedSocket) => {
        url = receivedUrl;
        socket = receivedSocket;
      }),
    });
    scenePlan.scenes[0]!.narration = "A & <B>";
    const artifact = await narration(release, scenePlan);

    expect(url).toMatch(/ConnectionId=[A-F0-9]{32}/);
    expect(socket!.sent.find((frame) => frame.includes("Path:ssml"))).toMatch(/X-RequestId:[A-F0-9]{32}/);
    const sent = socket!.sent.join("\n");
    expect(sent).toContain('"wordBoundaryEnabled":"true"');
    expect(sent).toContain('"outputFormat":"audio-24khz-48kbitrate-mono-mp3"');
    expect(sent).toContain("xml:lang='en-US'");
    expect(sent).toContain("<prosody pitch='+0Hz' rate='+0%' volume='+0%'>A &amp; &lt;B&gt;</prosody>");
    expect(sent).toContain("en-US-EmmaMultilingualNeural");
    expect(artifact.voice).toBe("en-US-EmmaMultilingualNeural");
  });

  it("reports a handshake error before open", async () => {
    const { narration, release, scenePlan } = await fixture(factoryFor((socket) => socket.fail()));
    await expect(narration(release, scenePlan)).rejects.toMatchObject({ phase: "handshake" });
  });

  it("diagnoses a rejected handshake and stale DRM hint", async () => {
    const { narration, release, scenePlan } = await fixture(factoryFor((socket) => {
      socket.open();
      socket.closed(1006);
    }));
    await expect(narration(release, scenePlan)).rejects.toMatchObject({
      phase: "handshake",
      diagnostics: expect.stringContaining("DRM constants"),
    });
  });

  it("fails when turn.end has no audio", async () => {
    const { narration, release, scenePlan } = await fixture(factoryFor((socket) => {
      socket.onSend = (value) => value.includes("Path:ssml") && queueMicrotask(() => socket.message(textFrame("turn.end")));
      socket.open();
    }));
    await expect(narration(release, scenePlan)).rejects.toThrow("synthesis produced no audio");
  });

  it("quarantines damaged audio instead of returning a successful reference", async () => {
    const { narration, release, scenePlan, runDirectory } = await fixture(factoryFor((socket) => {
      socket.onSend = (value) => value.includes("Path:ssml") && queueMicrotask(() => {
        socket.message(metadataFrame());
        socket.message(binaryAudio(new Uint8Array([1, 2, 3, 4])));
        socket.message(textFrame("turn.end"));
      });
      socket.open();
    }));
    await expect(narration(release, scenePlan)).rejects.toThrow("damaged audio");
    expect(await readdir(runDirectory)).toContain("narration-scene-mock-feature.mp3.failed");
  });

  it("fails when audio has no WordBoundary metadata", async () => {
    const { narration, release, scenePlan } = await fixture(factoryFor((socket) => {
      socket.onSend = (value) => value.includes("Path:ssml") && queueMicrotask(() => {
        socket.message(binaryAudio());
        socket.message(textFrame("turn.end"));
      });
      socket.open();
    }));
    await expect(narration(release, scenePlan)).rejects.toThrow("no word boundary metadata");
  });

  it("surfaces bounded response.error diagnostics", async () => {
    const { narration, release, scenePlan } = await fixture(factoryFor((socket) => {
      socket.onSend = (value) => value.includes("Path:ssml") && queueMicrotask(() => socket.message(textFrame("response.error", "x".repeat(3_000))));
      socket.open();
    }));
    try {
      await narration(release, scenePlan);
      throw new Error("expected narration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NarrationError);
      expect((error as NarrationError).diagnostics).toHaveLength(2_048);
      expect((error as Error).message.length).toBeLessThanOrEqual(2_048);
    }
  });

  it("synthesizes every scene into an ordered, distinct audio artifact", async () => {
    const runDirectory = await mkdtemp(join(tmpdir(), "showcraft-tts-multi-"));
    temporaryPaths.push(runDirectory);
    const release = {
      version: "v1",
      source: "test://release",
      features: [
        { id: "one", title: "一", narration: "第一段" },
        { id: "two", title: "二", narration: "第二段" },
      ],
    };
    const scenePlan = createMockScenePlanner()(release);
    let connections = 0;
    const narration = createEdgeTtsNarration({
      runDirectory,
      connect: factoryFor((socket) => {
        connections += 1;
        successfulDriver(socket);
      }),
    });

    const artifact = await narration(release, scenePlan);
    expect(connections).toBe(2);
    expect(artifact.scenes.map((scene) => scene.sceneId)).toEqual(["scene-one", "scene-two"]);
    expect(artifact.scenes.map((scene) => scene.audioFile)).toEqual([
      "narration-scene-one.mp3",
      "narration-scene-two.mp3",
    ]);
    await expect(readdir(runDirectory)).resolves.toEqual([
      "narration-scene-one.mp3",
      "narration-scene-two.mp3",
    ]);
  });
});

describe("createEdgeTtsWebSocket", () => {
  it("passes the required Edge handshake headers to Node's native constructor", () => {
    let receivedUrl = "";
    let receivedOptions: unknown;
    const socket = new FakeSocket();
    createEdgeTtsWebSocket("wss://example.test/?Sec-MS-GEC=token", (url, options) => {
      receivedUrl = url;
      receivedOptions = options;
      return socket as unknown as WebSocketLike;
    });

    expect(receivedUrl).toContain("Sec-MS-GEC=token");
    expect(receivedOptions).toMatchObject({
      headers: {
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": expect.stringContaining("Edg/143.0.0.0"),
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: expect.stringMatching(/^muid=[A-F0-9]{32};$/),
      },
    });
  });
});
