#!/usr/bin/env bash
set -euo pipefail

build_log="$(mktemp)"
trap 'rm -f "$build_log"' EXIT

for attempt in 1 2 3; do
  set +e
  yarn electron:build 2>&1 | tee "$build_log"
  build_status=${PIPESTATUS[0]}
  set -e

  if [[ "$build_status" -eq 0 ]]; then
    exit 0
  fi

  # macOS may briefly keep the staged DMG busy after customization. Retry
  # only this known hdiutil failure; compiler and other packaging errors fail.
  if [[ "${RUNNER_OS:-}" != macOS || "$attempt" -eq 3 ]] ||
    ! grep -qE 'hdiutil:.*Resource busy' "$build_log"; then
    exit "$build_status"
  fi

  echo "Retrying macOS DMG build after hdiutil Resource busy (${attempt}/3)."
  sleep 10
done
