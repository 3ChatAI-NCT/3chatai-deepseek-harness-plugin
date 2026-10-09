#!/usr/bin/env bash
set -euo pipefail
version=8.24.3
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_x64; checksum=9991e0b2903da4c8f6122b5c3186448b927a5da4deef1fe45271c3793f4ee29c ;;
  Darwin-arm64) platform=darwin_arm64; checksum=b90f13bb8c90ab72083d9b0c842e39dafb82c0e5c3f872f407366b7a58909013 ;;
  *) echo "Unsupported scanner platform" >&2; exit 1 ;;
esac
scanner_dir=$(mktemp -d)
trap 'rm -rf "$scanner_dir"' EXIT
curl --fail --silent --show-error --location "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_${platform}.tar.gz" -o "$scanner_dir/scanner.tgz"
actual=$(shasum -a 256 "$scanner_dir/scanner.tgz" | awk '{print $1}')
[[ "$actual" == "$checksum" ]] || { echo 'Scanner checksum mismatch' >&2; exit 1; }
tar -xzf "$scanner_dir/scanner.tgz" -C "$scanner_dir" gitleaks
# Confirm the scanner catches a synthetic credential before trusting its result.
mkdir -p "$scanner_dir/probe"
printf 'token = "gh%s_%s"\n' p "$(openssl rand -hex 18)" > "$scanner_dir/probe/fixture.txt"
set +e
"$scanner_dir/gitleaks" dir "$scanner_dir/probe" --redact --no-banner >/dev/null 2>&1
probe_status=$?
set -e
[[ "$probe_status" == 1 ]] || { echo 'Scanner self-check failed' >&2; exit 1; }
"$scanner_dir/gitleaks" git . --redact --no-banner --log-opts=--all
# Scan exactly the tracked source, including changes not yet committed.
while IFS= read -r -d '' file; do
  mkdir -p "$scanner_dir/source/$(dirname "$file")"
  cp "$file" "$scanner_dir/source/$file"
done < <(git ls-files -z)
"$scanner_dir/gitleaks" dir "$scanner_dir/source" --redact --no-banner
