# wsda-homepage release: snapshot, package, preview

Cloudflare Pages project `wsda-homepage` (Direct Upload, production = wsdalearning.ai). There is no Git integration:
whatever folder is uploaded **replaces the whole site**, so the package must contain every production file.

## 1. Snapshot production (read-only, on your Mac)

```bash
bash deploy-tools/snapshot-production.sh
```
Creates `wsda-snapshot-wsdalearning.ai-<time>.zip`: the exact bytes the live site serves for every page and the
files they reference, plus status, redirect target, headers and SHA-256 per URL, and `flags.txt` (GTM IDs found,
and any markup Cloudflare injects, which must be 0). Attach the zip in the chat.

Not recoverable from the live site: `_redirects` (and `_headers` if production has one), because Pages never serves
them. `_redirects` comes from the repository and is verified by the redirect results in `report.tsv`.

## 2. Compare and build

```bash
python3 deploy-tools/build_package.py --compare wsda-deploy <snapshot>/site      # repo vs live, file by file
cp wsda-deploy/_redirects <snapshot>/site/                                    # after its redirects match
python3 deploy-tools/build_package.py --base <snapshot>/site --overlay wsda-deploy --out wsda-pages-package
```
The build copies every production file unchanged and adds only `software-coach.html`, `software-coach/`,
`assets/software-coach/` and the noindex `_headers` rules. It writes `wsda-pages-package-MANIFEST.tsv`
(unchanged / new + SHA-256) and refuses (`NOT READY`) if a production file would change or go missing, a redirect
would catch `/software-coach`, a page lacks the production GTM container, injected markup is present, a file is
over 25 MiB, or any gate is open: downloads open, a download address other than `https://download.wsdalearning.ai/mac/latest`, the updates list open, a Software Coach page without noindex, or a legal page that is not the generated version or carries an unconfirmed fact.

## 3. Preview (never production)

Dashboard: Workers & Pages > `wsda-homepage` > Create deployment > **Preview** > branch `software-coach-preview` >
drag in the `wsda-pages-package` folder (or its zip). Or:
```bash
npx wrangler pages deploy wsda-pages-package --project-name wsda-homepage --branch software-coach-preview
```
Preview address: `https://software-coach-preview.wsda-homepage.pages.dev` (Cloudflare adds `X-Robots-Tag: noindex`).

## 4. Verify the preview against production

```bash
bash deploy-tools/snapshot-production.sh https://software-coach-preview.wsda-homepage.pages.dev
python3 deploy-tools/build_package.py --compare <production snapshot>/site <preview snapshot>/site
```
Every existing file must be `identical`; redirect results in both `report.tsv` files must match; `/software-coach`
and its legal pages must return 200 on the preview.

## 5. Production (only with Walter's approval, after the v0.2.7 acceptance test)

Upload the **same** `wsda-pages-package` folder with **Production** selected. Undo: Deployments > previous production
deployment > Rollback to this deployment.

Untouched by all of this: the v0.2.7 Workers (`wsda-access*`, `wsda-download`), R2, D1, DNS, Resend and Klaviyo.
