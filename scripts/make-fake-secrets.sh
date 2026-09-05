#!/usr/bin/env bash
# Regenerate the FAKE wallet credentials in fake-secrets/.
#
# You should not normally need to run this — the generated files are COMMITTED
# to this public repo on purpose. They are self-signed throwaways for a demo
# environment: they secure nothing, they are trusted by nothing, and Apple and
# Google will both reject anything signed with them. Never point a real
# deployment at this directory.
#
# Why the files exist at all: the backend only checks that the wallet settings
# are NON-EMPTY STRINGS before it advertises `apple_pass_available` /
# `google_pass_available` to the frontend — it never stats the paths. So the
# "Add to Apple Wallet" / "Add to Google Wallet" buttons render with paths that
# point at nothing. But *clicking* one makes the signer open the file, and a
# missing file turns a nice demo moment into a 500. These files make the click
# produce an actual (worthless) pass instead.
#
# Requires: openssl, python3.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p fake-secrets
cd fake-secrets

# `npm install` runs this automatically, so it must be quiet and idempotent:
# do nothing when the files are already there. Pass --force to rebuild them.
if [ "${1:-}" != "--force" ] &&
	[ -f pass.pem ] && [ -f pass-key.pem ] && [ -f wwdr.pem ] && [ -f google-wallet-sa.json ]; then
	exit 0
fi

echo "==> Apple Wallet: self-signed pass certificate + key"
openssl req -x509 -newkey rsa:2048 -nodes \
	-keyout pass-key.pem -out pass.pem -days 3650 \
	-subj "/CN=Pass Type ID: pass.io.letsrevel.demo/OU=DEMOTEAM01/O=Revel Demo (FAKE)/C=AT" \
	2>/dev/null

echo "==> Apple Wallet: stand-in 'WWDR' intermediate (self-signed, NOT Apple's)"
openssl req -x509 -newkey rsa:2048 -nodes \
	-keyout wwdr-key.pem -out wwdr.pem -days 3650 \
	-subj "/CN=Apple WWDR Stand-In (FAKE - NOT ISSUED BY APPLE)/O=Revel Demo/C=AT" \
	2>/dev/null
rm -f wwdr-key.pem

echo "==> Google Wallet: service-account-shaped JSON with a throwaway RSA key"
openssl genrsa -out google-wallet-sa-key.pem 2048 2>/dev/null
openssl pkcs8 -topk8 -nocrypt -in google-wallet-sa-key.pem -out google-wallet-sa-key.pk8 2>/dev/null
python3 - <<'PY'
import json, pathlib
key = pathlib.Path('google-wallet-sa-key.pk8').read_text()
pathlib.Path('google-wallet-sa.json').write_text(json.dumps({
    "type": "service_account",
    "project_id": "revel-demo-video",
    "private_key_id": "0000000000000000000000000000000000000000",
    "private_key": key,
    "client_email": "revel-demo-wallet@revel-demo-video.iam.gserviceaccount.com",
    "client_id": "473859204837291046582",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/revel-demo-wallet%40revel-demo-video.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com",
    "_comment": "FAKE. Self-generated throwaway for the Revel demo-video environment. Grants access to nothing.",
}, indent=2) + "\n")
PY
rm -f google-wallet-sa-key.pem google-wallet-sa-key.pk8

# World-readable on purpose. These protect nothing, and the container runs as
# a non-root user that must be able to read the bind-mounted files.
chmod 644 pass.pem pass-key.pem wwdr.pem google-wallet-sa.json

echo
echo "Wrote fake-secrets/: pass.pem pass-key.pem wwdr.pem google-wallet-sa.json"
echo "These are FAKE. Never use them anywhere real."
