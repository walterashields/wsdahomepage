#!/usr/bin/env python3
"""Build and verify the wsda-homepage Cloudflare Pages package.

  python3 build_package.py --base <production files dir> --overlay <wsda-deploy dir with Software Coach> --out <dir>
  python3 build_package.py --compare <dir A> <dir B>        # file-by-file comparison, e.g. repo vs live snapshot

The package = every production file, unchanged, plus the Software Coach files only:
  software-coach.html, software-coach/**, assets/software-coach/**, and the noindex _headers rules.
The build fails if any production file would change or disappear, or if a launch gate is open.
"""
import argparse, hashlib, os, re, shutil, sys

OVERLAY_PREFIXES = ("software-coach.html", "software-coach/", "assets/software-coach/")
LIVE_GTM = "GTM-W9KRWMZ8"
APPROVED_DOWNLOAD = "https://download.wsdalearning.ai/mac/latest"
LEGAL_PAGES = ("software-coach/terms.html", "software-coach/privacy.html", "software-coach/ai-data.html")
MAX_BYTES = 25 * 1024 * 1024
INJECTED = ("__cf_email__", "/cdn-cgi/l/email-protection", "cloudflareinsights", "rocket-loader")


def files(root):
    out = {}
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f)
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            if rel.startswith(".") or "/." in rel or rel.endswith(".DS_Store"):
                continue
            out[rel] = p
    return out


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def text(p):
    with open(p, "rb") as fh:
        return fh.read().decode("utf-8", "replace")


def summary(p):
    t = re.sub(r"data:[^\"')]+", "DATA", text(p))
    title = re.search(r"<title>(.*?)</title>", t, re.S)
    return {
        "title": title.group(1).strip() if title else "",
        "gtm": sorted(set(re.findall(r"GTM-[A-Z0-9]+", t))),
        "words": len(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S)).split()),
    }


def compare(a, b):
    fa, fb = files(a), files(b)
    rows = []
    for rel in sorted(set(fa) | set(fb)):
        if rel not in fa:
            rows.append((rel, "only in B", ""))
        elif rel not in fb:
            rows.append((rel, "only in A", ""))
        elif sha(fa[rel]) == sha(fb[rel]):
            rows.append((rel, "identical", sha(fa[rel])[:16]))
        else:
            note = ""
            if rel.endswith(".html"):
                sa, sb = summary(fa[rel]), summary(fb[rel])
                bits = []
                if sa["gtm"] != sb["gtm"]:
                    bits.append(f"GTM {sa['gtm']} -> {sb['gtm']}")
                if sa["title"] != sb["title"]:
                    bits.append("title differs")
                bits.append(f"words {sa['words']} -> {sb['words']}")
                note = "; ".join(bits)
            rows.append((rel, "DIFFERENT", note))
    w = max(len(r[0]) for r in rows)
    for r in rows:
        print(f"{r[0]:<{w}}  {r[1]:<10}  {r[2]}")
    return rows


def build(base, overlay, out):
    problems, notes = [], []
    fb, fo = files(base), files(overlay)
    over = {k: v for k, v in fo.items() if k.startswith(OVERLAY_PREFIXES)}
    if not over:
        problems.append("overlay has no Software Coach files")
    for rel in over:
        if rel in fb:
            problems.append(f"overlay would replace production file {rel}")
    for rel, p in fb.items():
        if rel.endswith(".html") and any(k in text(p) for k in INJECTED):
            problems.append(f"{rel}: contains Cloudflare-injected markup; restore the original file first")

    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    manifest = []
    for rel, p in sorted(fb.items()):
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(p, dst)
    for rel, p in sorted(over.items()):
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(p, dst)

    # _headers: keep any production rules, append the Software Coach noindex rules once.
    sc_rules = text(os.path.join(overlay, "_headers")) if os.path.exists(os.path.join(overlay, "_headers")) else ""
    hdr_out = os.path.join(out, "_headers")
    base_hdr = text(fb["_headers"]) if "_headers" in fb else ""
    if sc_rules:
        merged = base_hdr.rstrip("\n") + ("\n\n" if base_hdr.strip() else "") + sc_rules.strip("\n") + "\n"
        with open(hdr_out, "w") as fh:
            fh.write(merged)
        notes.append("_headers: " + ("production rules kept, Software Coach rules appended" if base_hdr.strip() else "new file, Software Coach noindex rules only"))

    fp = files(out)
    for rel, p in sorted(fp.items()):
        status = "unchanged" if rel in fb and sha(p) == sha(fb[rel]) else ("changed" if rel in fb else "new")
        if status == "changed" and rel != "_headers":
            problems.append(f"production file changed: {rel}")
        if os.path.getsize(p) > MAX_BYTES:
            problems.append(f"{rel} is over 25 MiB")
        manifest.append((rel, status, os.path.getsize(p), sha(p)))
    for rel in fb:
        if rel not in fp:
            problems.append(f"production file missing: {rel}")

    # Redirect rules must not catch the new paths.
    if "_redirects" in fp:
        for line in text(fp["_redirects"]).splitlines():
            src = line.split()[0] if line.strip() and not line.startswith("#") else ""
            if src and (src.startswith("/software-coach") or src in ("/*", "/:splat")):
                problems.append(f"_redirects rule would catch /software-coach: {line}")

    # Launch gates and indexing on the Software Coach pages.
    sc = text(fp["software-coach.html"]) if "software-coach.html" in fp else ""
    tag = lambda name: re.search(rf"<[^>]*\bid=\"{name}\"[^>]*>", sc, re.S)
    dl, form = tag("mac-download"), tag("beta-form")
    checks = {
        "downloads closed (data-downloads-open=false)": bool(dl) and 'data-downloads-open="false"' in dl.group(0),
        # Launch integration: the address may be set in advance, but only to the approved download Worker URL;
        # the button stays inert while data-downloads-open is "false" (checked above).
        f"download address empty or exactly {APPROVED_DOWNLOAD}": bool(dl) and re.search(r'data-download-url="([^"]*)"', dl.group(0)) is not None
            and re.search(r'data-download-url="([^"]*)"', dl.group(0)).group(1) in ("", APPROVED_DOWNLOAD),
        "updates list closed (data-signups-open=false)": bool(form) and 'data-signups-open="false"' in form.group(0),
        "no account sign-up link on the page": not re.search(r"href=\"[^\"]*(signup|sign-up|register|/account)[^\"]*\"", sc, re.I),
        "software-coach.html noindex": 'name="robots" content="noindex' in sc,
        f"software-coach.html uses {LIVE_GTM}": LIVE_GTM in sc and "GTM-XXXXXXX" not in sc,
    }
    for rel in fp:
        if rel.startswith("software-coach/") and rel.endswith(".html"):
            t = text(fp[rel])
            # The legal pages are generated from docs/legal (wsda-tutor-next) by build-pages.mjs: until launch they keep
            # noindex, and none may carry an unconfirmed fact. Any other page under software-coach/ must say draft.
            if rel in LEGAL_PAGES:
                checks[f"{rel} noindex + generated + no unconfirmed fact"] = ('name="robots" content="noindex' in t
                    and "docs/legal/build-pages.mjs" in t and "[to be confirmed" not in t and "draft-banner" not in t)
            else:
                checks[f"{rel} noindex + marked draft"] = 'name="robots" content="noindex' in t and "draft" in t.lower()
    for k, ok in checks.items():
        if not ok:
            problems.append("gate/check failed: " + k)

    gtm = {rel: summary(p)["gtm"] for rel, p in fp.items() if rel.endswith(".html") and not rel.startswith("software-coach/")}
    odd = {r: g for r, g in gtm.items() if g != [LIVE_GTM]}
    if odd:
        problems.append("pages without the production GTM container only: " + ", ".join(f"{r} {g}" for r, g in sorted(odd.items())))

    with open(os.path.join(out, "..", os.path.basename(out) + "-MANIFEST.tsv"), "w") as fh:
        fh.write("path\tstatus\tbytes\tsha256\n")
        for r in manifest:
            fh.write("\t".join(map(str, r)) + "\n")
    print(f"Package: {out}  ({len(manifest)} files)")
    for r in manifest:
        print(f"  {r[1]:<9}  {r[0]}")
    for k, ok in checks.items():
        print(f"  [{'ok' if ok else 'FAIL'}] {k}")
    for n in notes:
        print("  note:", n)
    if problems:
        print("\nNOT READY:")
        for p in problems:
            print("  -", p)
        return 1
    print("\nREADY for a Preview deployment.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--overlay")
    ap.add_argument("--out")
    ap.add_argument("--compare", nargs=2)
    a = ap.parse_args()
    if a.compare:
        compare(*a.compare)
        sys.exit(0)
    sys.exit(build(a.base, a.overlay, a.out))
