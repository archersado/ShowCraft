import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  NarrationError,
  type NarrationArtifact,
  type NarrationPort,
  type SubtitleCue,
} from "@showcraft/core";

import {
  CHROMIUM_FULL_VERSION,
  EDGE_TTS_TRUSTED_TOKEN,
  generateSecMsGecV2,
} from "./edgeTtsDrm.js";

export const DEFAULT_NARRATION_VOICE = "zh-CN-XiaoxiaoNeural";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;

export type WebSocketLike = Pick<
  WebSocket,
  "addEventListener" | "close" | "send" | "readyState"
>;

export type WebSocketFactory = (url: string) => WebSocketLike;
export type NativeWebSocketFactory = (url: string, options: unknown) => WebSocketLike;

export type EdgeTtsNarrationOptions = {
  runDirectory: string;
  voice?: string;
  connect?: WebSocketFactory;
  timeoutMs?: number;
};

type SynthesisResult = { audio: Uint8Array; cues: SubtitleCue[] };

export function createEdgeTtsNarration(options: EdgeTtsNarrationOptions): NarrationPort {
  const voice = options.voice ?? DEFAULT_NARRATION_VOICE;
  const connect = options.connect ?? defaultConnect;
  const timeoutMs = options.timeoutMs ?? 60_000;

  return async (release, scenePlan): Promise<NarrationArtifact> => {
    const scenes = [];
    for (const scene of scenePlan.scenes) {
      const result = await synthesize(scene.narration, voice, connect, timeoutMs);
      const audioFile = `narration-${scene.id}.mp3`;
      const audioPath = join(options.runDirectory, audioFile);

      if (!isMp3(result.audio)) {
        const failedPath = `${audioPath}.failed`;
        try {
          await writeFile(failedPath, result.audio);
        } catch (error) {
          throw narrationFailure("synthesize", describeError(error, Date.now()), "failed to quarantine damaged audio");
        }
        throw narrationFailure(
          "synthesize",
          `invalid MP3 sync word; quarantined as ${audioFile}.failed`,
          "synthesis produced damaged audio",
        );
      }
      try {
        await writeFile(audioPath, result.audio);
      } catch (error) {
        throw narrationFailure("synthesize", describeError(error, Date.now()), "failed to write narration audio");
      }
      scenes.push({
        sceneId: scene.id,
        featureId: scene.featureId,
        audioFile,
        audioDurationMs: Math.round(result.audio.byteLength / 6),
        voice,
        cues: result.cues,
      });
    }
    return { releaseVersion: release.version, voice, scenes };
  };
}

async function synthesize(
  text: string,
  voice: string,
  connect: WebSocketFactory,
  timeoutMs: number,
): Promise<SynthesisResult> {
  const startedAt = Date.now();
  const connectionId = requestId();
  const url =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
    `?TrustedClientToken=${EDGE_TTS_TRUSTED_TOKEN}` +
    `&ConnectionId=${connectionId}` +
    `&Sec-MS-GEC=${generateSecMsGecV2()}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  let socket: WebSocketLike;
  try {
    socket = connect(url);
  } catch (error) {
    throw narrationFailure("handshake", describeError(error, startedAt), "Edge TTS connection failed");
  }

  return await new Promise<SynthesisResult>((resolve, reject) => {
    const audioChunks: Uint8Array[] = [];
    const cues: SubtitleCue[] = [];
    let messageQueue = Promise.resolve();
    let opened = false;
    let receivedMessage = false;
    let settled = false;

    const fail = (error: NarrationError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tryClose(socket);
      reject(error);
    };
    const finish = (): void => {
      if (settled) return;
      if (audioChunks.length === 0) {
        fail(narrationFailure("synthesize", elapsed(startedAt), "synthesis produced no audio"));
        return;
      }
      if (cues.length === 0) {
        fail(narrationFailure("synthesize", elapsed(startedAt), "no word boundary metadata"));
        return;
      }
      settled = true;
      clearTimeout(timer);
      tryClose(socket);
      resolve({ audio: concatenate(audioChunks), cues });
    };

    const timer = setTimeout(() => {
      fail(
        narrationFailure(
          opened ? "synthesize" : "handshake",
          `timeout after ${elapsed(startedAt)}`,
          opened ? "Edge TTS synthesis timed out" : "Edge TTS handshake timed out",
        ),
      );
    }, timeoutMs);

    socket.addEventListener("open", () => {
      opened = true;
      try {
        socket.send(speechConfigFrame());
        socket.send(ssmlFrame(text, voice));
      } catch (error) {
        fail(narrationFailure("synthesize", describeError(error, startedAt), "failed to send synthesis request"));
      }
    });
    socket.addEventListener("error", () => {
      // Native WebSocket emits close immediately after error; defer so its
      // code/reason can produce the more useful diagnostic when available.
      setTimeout(() => {
        fail(
          narrationFailure(
            opened ? "synthesize" : "handshake",
            elapsed(startedAt),
            opened ? "Edge TTS WebSocket error" : "Edge TTS handshake error",
          ),
        );
      }, 0);
    });
    socket.addEventListener("close", (event) => {
      const closeEvent = event as CloseEvent;
      void messageQueue.then(() => {
        if (settled) return;
        const handshakeRejected = !opened || (!receivedMessage && closeEvent.code === 1006);
        const hint = handshakeRejected
          ? "; verify DRM constants against the current edge-tts release"
          : "";
        fail(
          narrationFailure(
            handshakeRejected ? "handshake" : "synthesize",
            `close code=${closeEvent.code} reason=${closeEvent.reason || "(none)"}${hint}; ${elapsed(startedAt)}`,
            handshakeRejected ? "Edge TTS handshake rejected" : "Edge TTS connection closed before turn.end",
          ),
        );
      });
    });
    socket.addEventListener("message", (event) => {
      receivedMessage = true;
      messageQueue = messageQueue.then(() =>
        handleMessage((event as MessageEvent).data, audioChunks, cues, finish, fail, startedAt),
      );
    });
  });
}

async function handleMessage(
  data: unknown,
  audioChunks: Uint8Array[],
  cues: SubtitleCue[],
  finish: () => void,
  fail: (error: NarrationError) => void,
  startedAt: number,
): Promise<void> {
  try {
    if (typeof data === "string") {
      const { path, body } = parseTextFrame(data);
      if (path === "audio.metadata") {
        parseMetadata(body, cues);
      } else if (path === "turn.end") {
        finish();
      } else if (path === "response.error") {
        fail(narrationFailure("synthesize", bounded(body), "Edge TTS service returned response.error"));
      } else if (path !== "response" && path !== "turn.start") {
        fail(narrationFailure("synthesize", `unexpected path ${path}`, "unexpected Edge TTS response"));
      }
      return;
    }
    const bytes = await binaryBytes(data);
    const { path, payload } = parseBinaryFrame(bytes);
    if (path !== "audio") {
      throw new Error(`unexpected binary path ${path}`);
    }
    if (payload.byteLength > 0) audioChunks.push(payload);
  } catch (error) {
    fail(narrationFailure("synthesize", describeError(error, startedAt), "invalid Edge TTS response"));
  }
}

function speechConfigFrame(): string {
  return (
    `X-Timestamp:${dateString()}\r\n` +
    "Content-Type:application/json; charset=utf-8\r\n" +
    "Path:speech.config\r\n\r\n" +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: "false",
              wordBoundaryEnabled: "true",
            },
            outputFormat: OUTPUT_FORMAT,
          },
        },
      },
    }) +
    "\r\n"
  );
}

function ssmlFrame(text: string, voice: string): string {
  const id = requestId();
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${languageForVoice(voice)}'>` +
    `<voice name='${escapeXml(voice)}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>` +
    `${escapeXml(text)}</prosody></voice></speak>`;
  return (
    `X-RequestId:${id}\r\n` +
    "Content-Type:application/ssml+xml\r\n" +
    `X-Timestamp:${dateString()}Z\r\n` +
    "Path:ssml\r\n\r\n" +
    ssml
  );
}

function requestId(): string {
  return randomUUID().replaceAll("-", "").toUpperCase();
}

function parseTextFrame(frame: string): { path: string; body: string } {
  const separator = frame.indexOf("\r\n\r\n");
  const headerText = separator >= 0 ? frame.slice(0, separator) : frame;
  const body = separator >= 0 ? frame.slice(separator + 4) : "";
  const headers = new Map(
    headerText.split("\r\n").flatMap((line) => {
      const colon = line.indexOf(":");
      return colon > 0 ? [[line.slice(0, colon).toLowerCase(), line.slice(colon + 1)]] : [];
    }),
  );
  return { path: headers.get("path") ?? "", body };
}

function parseBinaryFrame(bytes: Uint8Array): { path: string; payload: Uint8Array } {
  if (bytes.byteLength < 2) throw new Error("binary frame is missing header length");
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0, false);
  if (headerLength > bytes.byteLength - 2) throw new Error("binary header length exceeds frame length");
  const headers = new TextDecoder().decode(bytes.subarray(2, 2 + headerLength));
  const parsed = parseTextFrame(`${headers}\r\n\r\n`);
  return { path: parsed.path, payload: bytes.slice(2 + headerLength) };
}

function parseMetadata(body: string, cues: SubtitleCue[]): void {
  const decoded = JSON.parse(body) as {
    Metadata?: Array<{
      Type?: string;
      Data?: { Offset?: number; Duration?: number; text?: { Text?: string } };
    }>;
  };
  for (const metadata of decoded.Metadata ?? []) {
    if (metadata.Type !== "WordBoundary") continue;
    const offset = metadata.Data?.Offset;
    const duration = metadata.Data?.Duration;
    const text = metadata.Data?.text?.Text;
    if (typeof offset !== "number" || typeof duration !== "number" || typeof text !== "string") {
      throw new Error("malformed WordBoundary metadata");
    }
    cues.push({
      text: unescapeXml(text),
      startMs: Math.floor(offset / 10_000),
      endMs: Math.floor((offset + duration) / 10_000),
    });
  }
}

async function binaryBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error("unsupported binary WebSocket payload");
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || (bytes[1]! & 0xe0) !== 0xe0) return false;
  const version = (bytes[1]! >> 3) & 0x03;
  const layer = (bytes[1]! >> 1) & 0x03;
  const bitrateIndex = (bytes[2]! >> 4) & 0x0f;
  const sampleRateIndex = (bytes[2]! >> 2) & 0x03;
  return version !== 0x01 && layer !== 0 && bitrateIndex !== 0 && bitrateIndex !== 0x0f && sampleRateIndex !== 0x03;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;")
    .replaceAll('"', "&quot;");
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function languageForVoice(voice: string): string {
  return /^[a-z]{2,3}-[A-Z]{2}(?:-|$)/.exec(voice)?.[0].replace(/-$/, "") ?? "zh-CN";
}

function dateString(): string {
  const date = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, "0")} ${date.getUTCFullYear()} ${date.toISOString().slice(11, 19)} GMT+0000 (Coordinated Universal Time)`;
}

function defaultConnect(url: string): WebSocketLike {
  return createEdgeTtsWebSocket(url);
}

export function createEdgeTtsWebSocket(
  url: string,
  create: NativeWebSocketFactory = (target, options) =>
    new WebSocket(target, options as unknown as string[]),
): WebSocketLike {
  const muid = randomUUID().replaceAll("-", "").toUpperCase();
  const major = CHROMIUM_FULL_VERSION.split(".", 1)[0];
  const options = {
    headers: {
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: `muid=${muid};`,
    },
  };
  // Node 24 extends the browser-compatible constructor with WebSocketInit
  // (including request headers); the current DOM lib does not expose it yet.
  return create(url, options);
}

function narrationFailure(
  phase: "handshake" | "synthesize",
  diagnostics: string,
  message: string,
): NarrationError {
  const safeDiagnostics = bounded(diagnostics);
  const phasePrefixLength = `[${phase}] `.length;
  return new NarrationError(
    phase,
    safeDiagnostics,
    bounded(`${message}: ${safeDiagnostics}`).slice(0, 2048 - phasePrefixLength),
  );
}

function bounded(value: string): string {
  return value.slice(0, 2048);
}

function elapsed(startedAt: number): string {
  return `elapsed=${Date.now() - startedAt}ms`;
}

function describeError(error: unknown, startedAt: number): string {
  return `${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}; ${elapsed(startedAt)}`;
}

function tryClose(socket: WebSocketLike): void {
  try {
    socket.close();
  } catch {
    // Closing after a failed handshake is best effort only.
  }
}

// Retained for compatibility with quarantine workflows that rename already-written media.
export async function quarantineNarrationFile(path: string): Promise<string> {
  const failedPath = `${path}.failed`;
  await rename(path, failedPath);
  return failedPath;
}
