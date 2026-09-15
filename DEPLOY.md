# Deploy — SteelWorks Intelligence

SteelWorks Intelligence is the business brand. `https://steelworksintelligence.com/` is the canonical public domain and the free GitHub Pages hosting surface tied to the existing therealmacsteel GitHub account.

Public layer: `steelworksintelligence.com`.

Free-first rule: do not buy domains, paid hosting, paid DNS, paid deploy tooling, or paid analytics. All visible copy, metadata, schema, `llms.txt`, and offers must present SteelWorks Intelligence as the operating brand while using `https://steelworksintelligence.com/` as the live public URL.

## GitHub Pages Setup (Free, < 10 minutes)

### Step 1 — Create GitHub Repository

1. Go to github.com and sign in
2. Create new repository named: `steelworksintelligence.com`
   - **Important:** name must match `<yourusername>.github.io` exactly
   - Set visibility: Public
   - Do NOT initialize with README

### Step 2 — Push Website Files

Run from terminal:

```bash
cd ~/openclaw/website
git init
git add .
git commit -m "Initial website build — The Real SteelWorks Intelligence Systems"
git branch -M main
git remote add origin https://github.com/therealmacsteel/steelworksintelligence.com.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages

1. Go to repo → Settings → Pages
2. Source: Deploy from branch
3. Branch: `main` / `/ (root)`
4. Save

Canonical public site goes live at: `https://steelworksintelligence.com` within 2-5 minutes.

---

## Custom Domain Setup — Optional Future Domain

Only use this section if Mac explicitly confirms a separate domain is owned and should become the public URL. Do not infer a domain from the SteelWorks brand name.

### Step 4 — Add Domain in GitHub

1. Repo → Settings → Pages → Custom domain
2. Enter the approved owned domain
3. Save (GitHub will create a CNAME file automatically)

### Step 5 — DNS Records (at your domain registrar)

Add these DNS records:

| Type  | Name | Value                      |
| ----- | ---- | -------------------------- |
| A     | @    | 185.199.108.153            |
| A     | @    | 185.199.109.153            |
| A     | @    | 185.199.110.153            |
| A     | @    | 185.199.111.153            |
| CNAME | www  | steelworksintelligence.com |

DNS propagation: 5-30 minutes (sometimes up to 24h)

### Step 6 — Enable HTTPS

1. GitHub Pages → Settings → Pages
2. Check "Enforce HTTPS" (available after DNS propagates)

---

## Estimated Time Live

| Step               | Time                |
| ------------------ | ------------------- |
| GitHub setup       | 2 min               |
| Push files         | 1 min               |
| GitHub Pages build | 2-5 min             |
| DNS propagation    | 5-30 min            |
| HTTPS cert         | 15-30 min after DNS |
| **Total**          | **~30 min**         |

---

## Update Website

After any changes:

```bash
cd ~/openclaw/website
git add .
git commit -m "Update: <description>"
git push
```

GitHub Pages auto-deploys on every push (< 2 min).

---

## Brand Assets

Before pushing, add actual images to `assets/brand/`:

- `profile-photo.png` — profile photo (square, 800x800px recommended)
- `banner.png` — banner image (1500x500px recommended for Twitter/YouTube)

These are referenced by the website for OG images and the about page.

---

## ConvertKit Integration

Replace the placeholder email forms:

1. Create ConvertKit account at convertkit.com
2. Create a form
3. Get embed code
4. Replace `<button onclick="alert('...">` in index.html, content.html, and contact.html with ConvertKit embed

---

## Google Analytics (GA4)

Add before `</head>` in all HTML files:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", "G-XXXXXXXXXX");
</script>
```

Replace `G-XXXXXXXXXX` with your GA4 measurement ID.
