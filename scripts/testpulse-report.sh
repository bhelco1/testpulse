#!/usr/bin/env bash
# Canonical testpulse reporter. Each reporting repo copies this file verbatim into its own
# scripts/ directory; do not edit a copy, edit this one. It is specified in docs/spec.md,
# Appendix A, and its contract is proven by scripts/testpulse-report.test.ts.
# Usage: testpulse-report.sh <job> <module> <platform> <format> <results-glob> [coverage-format coverage-file]
set -uo pipefail

if [ -z "${TESTPULSE_TOKEN:-}" ] || [ -z "${TESTPULSE_URL:-}" ]; then
  echo "::notice::testpulse not configured (fork PR or missing secret); skipping"
  exit 0
fi

# Every variable below is expanded with a default so that a missing one cannot abort the job
# under `set -u`. The values that identify a run are then checked explicitly: a half-built meta
# would only be refused by the endpoint, so it is worth less than a warning naming what is gone.
branch="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}"
require_env() {
  if [ -z "$2" ]; then
    echo "::warning::testpulse: missing $1; skipping"
    exit 0
  fi
}
require_env GITHUB_RUN_ID "${GITHUB_RUN_ID:-}"
require_env GITHUB_SHA "${GITHUB_SHA:-}"
require_env GITHUB_EVENT_NAME "${GITHUB_EVENT_NAME:-}"
require_env "GITHUB_HEAD_REF or GITHUB_REF_NAME" "$branch"

# The arguments get the same treatment: a typo in a workflow is a skip and a usage line, never
# an unbound-variable abort that reddens a build whose tests all passed.
job="${1:-}"; module="${2:-}"; platform="${3:-}"; format="${4:-}"; glob="${5:-}"
cov_format="${6:-}"; cov_file="${7:-}"
if [ -z "$job" ] || [ -z "$module" ] || [ -z "$platform" ] || [ -z "$format" ] || [ -z "$glob" ]; then
  echo "::warning::testpulse: usage: testpulse-report.sh <job> <module> <platform> <format> <results-glob> [coverage-format coverage-file]; skipping"
  exit 0
fi

# The meta is assembled by hand because jq is not on every runner, so a backslash or a double
# quote in a branch or module name has to be escaped here or the endpoint gets invalid JSON.
json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

# run_attempt is the one bare number in the document, where escaping cannot help: anything but
# a positive integer would make the whole meta unparseable, so it falls back to the first try.
run_attempt="${GITHUB_RUN_ATTEMPT:-1}"
case "$run_attempt" in
  '' | *[!0-9]* | 0*) run_attempt=1 ;;
esac

# run_url is optional (section 6.2), and a half-built one fails its URL check and takes the
# whole report down with it, so the key is left out entirely unless both halves are there.
run_url_field=""
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-}"
  run_url_field=" \"run_url\":\"$(json_escape "$run_url")\","
fi

meta=$(cat <<JSON
{"ci_run_id":"$(json_escape "${GITHUB_RUN_ID:-}")","run_attempt":${run_attempt},
 "job":"$(json_escape "$job")","module":"$(json_escape "$module")","platform":"$(json_escape "$platform")",
 "commit_sha":"$(json_escape "${GITHUB_SHA:-}")","branch":"$(json_escape "$branch")",
 "event":"$(json_escape "${GITHUB_EVENT_NAME:-}")",
${run_url_field}
 "path_prefix":"$(json_escape "${GITHUB_WORKSPACE:-}/")"}
JSON
)

args=(-F "meta=${meta};type=application/json")
shopt -s nullglob
# globstar arrived in bash 4; the stock macOS bash is 3.2, where the glob still expands, only
# without `**`. The redirect keeps that from printing a warning no reporting repo can act on.
shopt -s globstar 2>/dev/null
# $glob is unquoted on purpose: the shell expands it here. Paths with spaces are not supported.
for f in $glob; do args+=(-F "${format}=@${f}"); done
if [ -n "$cov_file" ] && [ -f "$cov_file" ]; then args+=(-F "${cov_format}=@${cov_file}"); fi

# A response file per call, because one runner can report two modules at once. The template is
# spelled out so this works on the BSD mktemp of the macOS runners as well as on GNU.
out=$(mktemp "${TMPDIR:-/tmp}/testpulse.XXXXXX")
trap 'rm -f "$out"' EXIT

# curl writes 000 itself when it never got a response, so the default is only for curl failing
# to run at all. Adding `|| echo 000` here instead would concatenate the two into 000000.
code=$(curl -sS -o "$out" -w '%{http_code}' --max-time 30 --retry 2 \
  -H "Authorization: Bearer ${TESTPULSE_TOKEN}" "${args[@]}" \
  "${TESTPULSE_URL}/api/v1/reports")
code=${code:-000}

if [ "$code" != "200" ] && [ "$code" != "201" ]; then
  echo "::warning::testpulse report failed (HTTP ${code}): $(head -c 500 "$out" 2>/dev/null)"
fi
exit 0
