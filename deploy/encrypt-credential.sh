#!/usr/bin/env bash
set -euo pipefail

# Encrypts a plaintext env file into the systemd-encrypted credential that the
# BeatMyVendor app, email, and maintenance services load. Run as root. The
# plaintext is shredded on success so no cleartext secret is left on disk.
#
# Usage: sudo deploy/encrypt-credential.sh /path/to/plaintext.env

PLAINTEXT="${1:?Usage: encrypt-credential.sh /path/to/plaintext.env}"
TARGET=/etc/credstore.encrypted/beatmyvendor.env

[[ $EUID -eq 0 ]] || { echo "Run this with sudo." >&2; exit 1; }
[[ -r "$PLAINTEXT" ]] || { echo "Cannot read plaintext env file: $PLAINTEXT" >&2; exit 1; }

install -d -m 0700 /etc/credstore.encrypted
# --name must match LoadCredentialEncrypted=beatmyvendor.env in the unit files.
systemd-creds encrypt --name=beatmyvendor.env "$PLAINTEXT" "$TARGET"
chmod 0600 "$TARGET"
shred -u "$PLAINTEXT"

echo "Wrote $TARGET and shredded $PLAINTEXT."
echo "Next: sudo deploy/install-root.sh"
