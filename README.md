# 1Password EPM Hub

Internal CSM enablement tool for the 1Password Enterprise Password Management team.

## What's inside

| Tab | Description |
|-----|-------------|
| 📖 Feature Bible | All 34 EPM features with full detail, use cases, and cross-references |
| 🏢 Industry Intel | 18 industries with pain points, tech stacks, real breaches, and discovery questions |
| 🏛️ Departments | 14 departments with credential inventories, vault structures, and CSM insights |
| ✨ Customer Builder | AI-powered account profile and strategy generator |
| 📄 Build a Doc | Drag-and-drop canvas to assemble custom customer-facing documents, export to PDF |
| ⚔️ Compete | Battle cards for LastPass, Bitwarden, Keeper, Dashlane, CyberArk, HashiCorp Vault |

## Stack

- **Frontend:** Single-file HTML/CSS/JS — no framework, no build step
- **API:** Vercel serverless function (`/api/chat`) proxies Anthropic API calls
- **AI:** Claude Sonnet via Anthropic API powers the Customer Builder
- **Persistence:** localStorage for custom industries/departments saved by the user

## Local development

```bash
# Install Vercel CLI
npm install -g vercel

# Run locally (hot reload)
vercel dev
```

Visit `http://localhost:3000`

## Deploy to Vercel

```bash
vercel deploy --prod
```

After deploying, add your Anthropic API key in Vercel project settings:
- **Settings → Environment Variables**
- Key: `ANTHROPIC_API_KEY`
- Value: `sk-ant-...`
- Environments: Production, Preview, Development

Then redeploy: `vercel deploy --prod`

## QA Browser Extension

The `qa-extension/` folder contains a Chrome extension for auditing the hub:
1. Go to `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked → select `qa-extension/`
4. Open the hub, click the extension icon, click **▶ Run QA**

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key for the Customer Builder |

## Confidential

For internal CSM use only. Do not share externally.
