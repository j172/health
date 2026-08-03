#!/usr/bin/env bash
# Writes $SSH_PRIVATE_KEY to a private (chmod 600) temp file and registers a
# cleanup trap for it, setting $KEY_FILE for the caller to pass to `ssh -i`/
# `scp -i`. Meant to be sourced (not executed) once per shell that needs an
# SSH key file — deploy-ftps.yml sources this identically in three separate
# steps (each step is its own shell, so the staging can't just happen once).
stage_ssh_key() {
  KEY_FILE="$(mktemp)"
  printf '%s\n' "$SSH_PRIVATE_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  trap 'rm -f "$KEY_FILE"' EXIT
}
