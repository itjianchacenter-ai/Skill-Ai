# Jiancha Tea AI Skills Library

A bundle of 500+ Claude skills organised into 20 business categories. Each skill is a folder containing a `SKILL.md` file. See `AI Flow - คู่มือเริ่มต้น.txt` for installation instructions in Thai.

## Website

The library is published at **https://order.jianchatea.com** via GitHub Pages. Every push to `main` runs `.github/workflows/pages.yml`, which builds the site with `scripts/build_site.py` and deploys it.

Build locally:

```bash
pip install markdown
python scripts/build_site.py      # writes _site/
python -m http.server -d _site 8000
```

## Custom domain setup (one-time)

1. **GitHub → Settings → Pages**: set *Source* to **GitHub Actions**.
2. In the same page, enter `order.jianchatea.com` as the *Custom domain* and save. Tick *Enforce HTTPS* once the certificate is issued.
3. **Cloudflare DNS** for `jianchatea.com`: replace the existing `order` record with a `CNAME` pointing to `itjianchacenter-ai.github.io`. Set the record to *DNS only* (grey cloud) until GitHub issues the certificate. If you keep the Cloudflare proxy on afterwards, set SSL/TLS mode to **Full**.
