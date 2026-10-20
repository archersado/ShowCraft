#!/bin/zsh

set -u
set -o pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_ROOT=${SCRIPT_DIR:h:h}
WEBSITE_REPO=/Users/archersado/workspace/website
SAMPLE_SOURCE=/Users/archersado/workspace/auto_quotation/.materials/Y2005-15变焦座+生产用图.pdf
BASE_URL=http://127.0.0.1:4321/
MEDIA_FILE=recording-website-quote-match.mov
DURATION_SECONDS=90
OUTPUT_PREFIX="$PROJECT_ROOT/runs/website-demo"
DRY_RUN=0

usage() {
  print -u2 'Usage: scripts/website-demo/capture.sh [--duration SECONDS] [--output PATH_PREFIX] [--dry-run]'
}

fail() {
  local message=${1[1,2048]}
  print -u2 -- "[showcraft:website-demo] ERROR: $message"
  exit 1
}

while (( $# > 0 )); do
  case "$1" in
    --duration)
      (( $# >= 2 )) || fail "--duration requires a value"
      DURATION_SECONDS=$2
      shift 2
      ;;
    --output)
      (( $# >= 2 )) || fail "--output requires a value"
      OUTPUT_PREFIX=$2
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage
      fail "unknown argument: $1"
      ;;
  esac
done

[[ "$DURATION_SECONDS" == <-> ]] || fail "duration must be an integer"
(( DURATION_SECONDS >= 60 )) || fail "duration must be at least 60 seconds"
[[ -d "$WEBSITE_REPO/.git" ]] || fail "website repository not found: $WEBSITE_REPO"
[[ -f "$SAMPLE_SOURCE" ]] || fail "sample drawing not found: $SAMPLE_SOURCE"
command -v curl >/dev/null || fail "curl is required"
command -v ego-browser >/dev/null || fail "ego-browser is required"
command -v lsof >/dev/null || fail "lsof is required"

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/showcraft-website-demo.XXXXXX") || fail "could not create temporary directory"
SERVER_PID=""
RUN_DIR=""
WEBSITE_STATUS_BEFORE="$WORK_DIR/website-status-before.txt"
WEBSITE_STATUS_AFTER="$WORK_DIR/website-status-after.txt"
git -C "$WEBSITE_REPO" status --porcelain > "$WEBSITE_STATUS_BEFORE" || fail "could not read website git status"

cleanup() {
  local exit_code=$?
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  git -C "$WEBSITE_REPO" status --porcelain > "$WEBSITE_STATUS_AFTER" 2>/dev/null || true
  if [[ -f "$WEBSITE_STATUS_AFTER" ]] && ! cmp -s "$WEBSITE_STATUS_BEFORE" "$WEBSITE_STATUS_AFTER"; then
    print -u2 -- '[showcraft:website-demo] ERROR: website worktree changed during capture'
    exit_code=1
  fi
  rm -rf -- "$WORK_DIR"
  return $exit_code
}
trap cleanup EXIT

HOME_PAGE="$WORK_DIR/home.html"
PAGE_STATUS=$(curl -sS -o "$HOME_PAGE" -w '%{http_code}' --max-time 10 "$BASE_URL" 2>/dev/null || true)
SERVER_SOURCE=reused

if [[ "$PAGE_STATUS" != 200 ]]; then
  if lsof -nP -iTCP:4321 -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port 4321 is occupied but did not return a usable DeepMatch page (HTTP ${PAGE_STATUS:-unreachable})"
  fi
  [[ -x "$WEBSITE_REPO/node_modules/.bin/next" ]] || fail "DeepMatch dev server cannot start: local next binary is missing"
  (
    cd "$WEBSITE_REPO" || exit 1
    exec ./node_modules/.bin/next dev --port 4321
  ) > "$WORK_DIR/dev-server.log" 2>&1 &
  SERVER_PID=$!
  SERVER_SOURCE=spawned

  PAGE_STATUS=""
  for _ in {1..60}; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      DEV_LOG=$(tail -c 2048 "$WORK_DIR/dev-server.log" 2>/dev/null || true)
      fail "DeepMatch dev server exited during startup: $DEV_LOG"
    fi
    PAGE_STATUS=$(curl -sS -o "$HOME_PAGE" -w '%{http_code}' --max-time 5 "$BASE_URL" 2>/dev/null || true)
    [[ "$PAGE_STATUS" == 200 ]] && break
    sleep 1
  done
  [[ "$PAGE_STATUS" == 200 ]] || fail "DeepMatch dev server did not become ready on port 4321"
fi

grep -q '上传图纸，匹配对应产品供应商' "$HOME_PAGE" || fail "port 4321 is not serving the expected DeepMatch homepage"
grep -q 'quote-drawing-upload' "$HOME_PAGE" || fail "DeepMatch homepage has no #quote-drawing-upload control"

SAMPLE_COPY="$WORK_DIR/sample-drawing.pdf"
cp -p "$SAMPLE_SOURCE" "$SAMPLE_COPY" || fail "could not copy the sample drawing"
SAMPLE_SHA=$(shasum -a 256 "$SAMPLE_COPY" | awk '{print $1}')

if (( ! DRY_RUN )); then
  [[ -x /usr/sbin/screencapture ]] || fail "screencapture is unavailable"
  TCC_PROBE="$WORK_DIR/tcc-probe.png"
  /usr/sbin/screencapture -x "$TCC_PROBE" >/dev/null 2>&1 || fail "screen recording permission probe failed"
  [[ -s "$TCC_PROBE" ]] || fail "screen recording permission probe produced no image"
fi

RUN_ID=$(date -u '+%Y%m%dT%H%M%SZ')-$$
if [[ "$OUTPUT_PREFIX" != /* ]]; then
  OUTPUT_PREFIX="$PROJECT_ROOT/$OUTPUT_PREFIX"
fi
RUN_DIR="${OUTPUT_PREFIX}-${RUN_ID}"
mkdir -p "${RUN_DIR:h}" || fail "could not create output parent"

if (( DRY_RUN )); then
  FLOW_DIR="$WORK_DIR/dry-run"
else
  FLOW_DIR="$RUN_DIR"
  mkdir "$RUN_DIR" || fail "could not create run directory: $RUN_DIR"
fi
mkdir -p "$FLOW_DIR"

PAGE_RESULT="$FLOW_DIR/page-flow-result.json"
SCREENSHOT="$FLOW_DIR/matched-state.png"
TASK_SPACE="showcraft-website-demo-${RUN_ID}"
POST_RESULT_HOLD_MS=0
if (( ! DRY_RUN )); then
  POST_RESULT_HOLD_MS=5000
fi
FLOW_INPUT=$(node -e 'console.log(JSON.stringify({baseUrl:process.argv[1],samplePath:process.argv[2],screenshotPath:process.argv[3],resultPath:process.argv[4],taskSpaceName:process.argv[5],postResultHoldMs:Number(process.argv[6])}))' "$BASE_URL" "$SAMPLE_COPY" "$SCREENSHOT" "$PAGE_RESULT" "$TASK_SPACE" "$POST_RESULT_HOLD_MS")
PAGE_FLOW_URL=$(node -e 'console.log(require("node:url").pathToFileURL(process.argv[1]).href)' "$SCRIPT_DIR/page-flow.mjs")
BOOTSTRAP="globalThis.__SHOWCRAFT_WEBSITE_DEMO_INPUT__=${FLOW_INPUT};await import(${(qqq)PAGE_FLOW_URL})"

RECORDING_PID=""
RECORDING_LOG="$WORK_DIR/screencapture.log"
RECORDING_PATH="$FLOW_DIR/$MEDIA_FILE"
if (( ! DRY_RUN )); then
  /usr/sbin/screencapture -v -V "$DURATION_SECONDS" -D 1 "$RECORDING_PATH" > "$RECORDING_LOG" 2>&1 &
  RECORDING_PID=$!
  sleep 1
  if ! kill -0 "$RECORDING_PID" 2>/dev/null; then
    wait "$RECORDING_PID" 2>/dev/null || true
    print -u2 -- '[showcraft:website-demo] screencapture exited before the page flow started'
  fi
fi

FLOW_STARTED_MS=$(python3 -c 'import time; print(round(time.time() * 1000))')
ego-browser nodejs -e "$BOOTSTRAP"
FLOW_EXIT=$?
FLOW_ENDED_MS=$(python3 -c 'import time; print(round(time.time() * 1000))')
FLOW_ELAPSED_MS=$(( FLOW_ENDED_MS - FLOW_STARTED_MS ))

if (( DRY_RUN )); then
  (( FLOW_EXIT == 0 )) || fail "dry-run page flow failed; see $PAGE_RESULT"
  [[ -s "$SCREENSHOT" ]] || fail "dry-run did not produce a matched-state screenshot"
  print -- "[showcraft:website-demo] DRY-RUN-OK pageFlowMs=$FLOW_ELAPSED_MS server=$SERVER_SOURCE"
  exit 0
fi

RECORDING_EXIT=1
if [[ -n "$RECORDING_PID" ]]; then
  wait "$RECORDING_PID"
  RECORDING_EXIT=$?
fi

RECORDING_STATE=invalid
THUMBNAIL_MS=0
RECORDING_DURATION=unknown
if (( RECORDING_EXIT == 0 )) && [[ -s "$RECORDING_PATH" ]]; then
  FTYP=$(python3 -c 'import sys; print(open(sys.argv[1], "rb").read(12)[4:12].decode("ascii", "replace"))' "$RECORDING_PATH")
  if [[ "$FTYP" == 'ftypqt  ' ]]; then
    RECORDING_DURATION=$(python3 -c 'import struct,sys; data=open(sys.argv[1], "rb").read(); offset=data.find(b"mvhd"); assert offset >= 0, "mvhd atom missing"; version=data[offset+4]; timescale_offset=offset+(24 if version else 16); duration_offset=offset+(28 if version else 20); timescale=struct.unpack(">I", data[timescale_offset:timescale_offset+4])[0]; duration_size=8 if version else 4; duration=struct.unpack(">Q" if version else ">I", data[duration_offset:duration_offset+duration_size])[0]; print(f"{duration/timescale:.3f}")' "$RECORDING_PATH" 2>/dev/null || print unknown)
    THUMB_DIR="$WORK_DIR/thumbnail"
    mkdir "$THUMB_DIR"
    THUMB_STARTED_MS=$(python3 -c 'import time; print(round(time.time() * 1000))')
    qlmanage -t -s 640 -o "$THUMB_DIR" "$RECORDING_PATH" >/dev/null 2>&1
    THUMB_EXIT=$?
    THUMB_ENDED_MS=$(python3 -c 'import time; print(round(time.time() * 1000))')
    THUMBNAIL_MS=$(( THUMB_ENDED_MS - THUMB_STARTED_MS ))
    if (( THUMB_EXIT == 0 )) && find "$THUMB_DIR" -type f -size +0c | grep -q .; then
      RECORDING_STATE=valid
    fi
  fi
fi

if [[ "$RECORDING_STATE" == valid ]] && ! python3 -c 'import sys; duration=float(sys.argv[1]); flow_ms=int(sys.argv[2]); raise SystemExit(0 if duration * 1000 >= flow_ms else 1)' "$RECORDING_DURATION" "$FLOW_ELAPSED_MS" 2>/dev/null; then
  RECORDING_STATE=invalid
fi

if [[ "$RECORDING_STATE" == invalid ]] && [[ -e "$RECORDING_PATH" ]]; then
  mv "$RECORDING_PATH" "$RECORDING_PATH.failed"
fi

if [[ ! -s "$PAGE_RESULT" ]]; then
  PAGE_RESULT="$WORK_DIR/page-flow-result.json"
  print '{"pageStatus":0,"matchedResultPresent":false,"elapsedMs":0,"diagnostics":"page flow produced no result"}' > "$PAGE_RESULT"
fi

pnpm --dir "$PROJECT_ROOT" exec tsx "$SCRIPT_DIR/assemble-actions.mjs" \
  --result "$PAGE_RESULT" \
  --output "$RUN_DIR/actions.json" \
  --recording-state "$RECORDING_STATE" \
  --media-file "$MEDIA_FILE" || fail "actions.json validation failed"

PAGE_STATUS_RESULT=$(node -e 'const r=require(process.argv[1]); console.log(r.pageStatus ?? 0)' "$PAGE_RESULT")
MATCHED_RESULT=$(node -e 'const r=require(process.argv[1]); console.log(r.matchedResultPresent === true)' "$PAGE_RESULT")
PAGE_DIAGNOSTICS=$(node -e 'const r=require(process.argv[1]); console.log(String(r.diagnostics ?? "").slice(0,2048))' "$PAGE_RESULT")
POST_RESULT_HOLD_MS=$(node -e 'const r=require(process.argv[1]); console.log(r.postResultHoldMs ?? 0)' "$PAGE_RESULT")
RECORDING_BYTES=0
[[ -s "$RECORDING_PATH" ]] && RECORDING_BYTES=$(stat -f '%z' "$RECORDING_PATH")

cat > "$RUN_DIR/capture-notes.md" <<EOF
# Website Demo Capture Notes

- pageStatus: $PAGE_STATUS_RESULT
- matchedResultPresent: $MATCHED_RESULT
- url: $BASE_URL
- sampleSha256Prefix: ${SAMPLE_SHA[1,16]}
- devServerSource: $SERVER_SOURCE
- egoTaskSpace: $TASK_SPACE
- recordingCommand: /usr/sbin/screencapture -v -V $DURATION_SECONDS -D 1
- recordingState: $RECORDING_STATE
- recordingDurationSeconds: $RECORDING_DURATION
- recordingBytes: $RECORDING_BYTES
- pageFlowElapsedMs: $FLOW_ELAPSED_MS
- postResultHoldMs: $POST_RESULT_HOLD_MS
- thumbnailExtractionMs: $THUMBNAIL_MS
- diagnostics: ${PAGE_DIAGNOSTICS:-none}
EOF

rm -f "$RUN_DIR/page-flow-result.json"

if [[ "$RECORDING_STATE" == valid ]] && (( FLOW_EXIT == 0 )) && [[ "$MATCHED_RESULT" == true ]] && [[ -s "$SCREENSHOT" ]]; then
  print -- "[showcraft:website-demo] RECORDING-OK run=$RUN_DIR"
  exit 0
fi

print -u2 -- "[showcraft:website-demo] CAPTURE-FAILED run=$RUN_DIR recording=$RECORDING_STATE matched=$MATCHED_RESULT"
exit 1
