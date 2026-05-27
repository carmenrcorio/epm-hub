# 1Password EPM Hub — Engineering Standards

## Architecture

- **Single file**: Everything lives in `index.html`. Never split into multiple files.
- **Size**: ~590KB. This is expected.
- **Deploy**: `cp index.html` into the repo, `git push`. Vercel auto-deploys.
- **API**: `/api/chat` is the Claude serverless function (lives in `api/chat.js` on Vercel).

## Patching Rules

### 1. Always start from the LIVE deployed version
```
# Fetch live site via Vercel MCP tool, not from local cache
Vercel:web_fetch_vercel_url → https://epm-hub.vercel.app
```
Never patch a stale local copy. Always fetch fresh.

### 2. Extract HTML with emoji preservation
```python
html = inner['text']
html = html.encode('utf-16', 'surrogatepass').decode('utf-16')
```
The `surrogatepass` step is mandatory. Without it, emoji characters (🛡🌍⚔️📌✨🗑⬇️✏️) become `??` or `�`.

### 3. Syntax check BEFORE presenting
```bash
python3 -c "
with open('index.html') as f: c = f.read()
start = c.index('<script>') + 8
end = c.rindex('</script>')
with open('/tmp/check.js','w') as f: f.write(c[start:end])
" && node --check /tmp/check.js
```
If this fails, do not present the file.

### 4. JSDOM regression test BEFORE presenting
Every tab must be tested. Every feature that has ever been built must be verified. Use this checklist:

```javascript
// MANDATORY TEST CHECKLIST — run ALL of these
// Features tab
'EPM sub-tabs present (3 buttons)'
'EPM tile grid renders'
'SaaS Manager tile grid renders'
'Device Trust tile grid renders'
'SaaS Manager feature detail renders with back button'
'Device Trust feature detail renders with back button'
'EPM feature detail renders with filter bar'

// Intel tab
'Industries/Departments toggle bar present'
'Toggle persists when switching modes'
'18 industries listed'
'14 departments listed'
'Industry detail renders (Financial Services)'
'Department detail renders (IT & Security)'

// Compete tab  
'Competitive Positioning Guide landing page renders'
'DO/DONT sections present'
'Displacement Framework present'
'Discovery Questions present'
'Competitor logos (Clearbit) in sidebar'
'Competitor detail renders when clicked'

// Build tab
'Customer Builder / Build a Doc toggle visible'
'Customer Builder form renders'
'Governance panels container (cb-gov-panels) present'
'Build a Doc canvas renders'
'Portrait/Landscape toggle present'
'Rulers present'

// Platform tab
'Product tiles (EPM → SaaS Manager → DT → XAM) render'
'Playbook Generator section present'
'Industry dropdown present'
'Product checkboxes present'
'Win/Nurture/Grow/Retain buttons present'

// Roadmap tab
'Roadmap cards render'
```

### 5. Emoji verification BEFORE presenting
```python
for e in ['🛡','🌍','⚔️','📌','✨','🗑','⬇️','✏️']:
    assert c.count(e) > 0, f"Missing emoji: {e}"
assert c.count('??') == 0, "Broken emoji: ?? found"
```

### 6. Never duplicate function definitions
The #1 cause of bugs in this project has been duplicate function definitions. When a function is defined twice, the second silently overwrites the first. Check:
```bash
# Find any duplicated function names
grep -o 'function [a-zA-Z_]*(' index.html | sort | uniq -d
```
If any duplicates appear, one must be removed.

## Known Gotchas

### Sidebar `innerHTML = ''` wipes toggle bars
Multiple sidebar builders (`buildFeatureSidebar`, `buildIndustrySidebar`, `buildDeptSidebar`) start with `sb.innerHTML = ''`. This destroys any toggle bar that was prepended to the sidebar. The fix is to embed the toggle bar creation INTO the sidebar builder function itself, so it's rebuilt every time.

**Affected functions and their toggle bars:**
| Function | Toggle bar it must include |
|---|---|
| `buildFeatureSidebar()` | `buildFeatProductBar()` — EPM / SaaS Manager / Device Trust |
| `buildIndustrySidebar()` | `buildIntelModeBar()` — Industries / Departments |
| `buildDeptSidebar()` | `buildIntelModeBar()` — Industries / Departments |

### `customLoad()` must return `departments: []` (array, not object)
A previous bug had a duplicate `customLoad()` returning `departments: {}`. This crashed `customInit()` and silently killed all code defined after it.

### Emoji encoding in Vercel fetch
The Vercel MCP `web_fetch_vercel_url` tool returns JSON with escaped Unicode. The extraction must use `surrogatepass` encoding or emojis break globally.

### `/api/chat` not `/api/claude`
The Customer Builder already uses `/api/chat`. All Claude API calls must use the same endpoint.

## CSS Color Variables
```css
--t1: #F0F6FF   /* Brightest — headings, active text */
--t2: #C8DFFA   /* Body text — must be clearly readable */
--t3: #8CB8DD   /* Secondary text — labels, descriptions */
--t4: #5A8BB0   /* Muted — placeholders, inactive */
```
If text is hard to read, the variable assignment is wrong. Never go darker than these values.

## File Structure (inside the single index.html)

```
<style>          — All CSS (~590 lines)
<body>           — Minimal HTML skeleton (sidebar + detail)
<script>         — All JavaScript (~4100 lines)
  ├── Utility functions (filterBarHTML, tileHTML, showTiles)
  ├── FEATURES (34 EPM features)
  ├── Feature render functions
  ├── INDUSTRIES (18 industries)
  ├── Industry/Dept render functions
  ├── DEPARTMENTS (14 departments)
  ├── COMPETITORS (6 EPM competitors)
  ├── Competitor render functions
  ├── Customer Builder (showCustomerBuilder, cbGenerate, etc.)
  ├── Build a Doc (BAD object, showBAD, etc.)
  ├── Custom industry/dept CRUD
  ├── COMP_DOMAINS + compLogo (Clearbit logos)
  ├── DEFAULT_ROADMAP + roadmap functions
  ├── TRELICA_FEATURES (14 SaaS Manager features)
  ├── DEVICE_TRUST_FEATURES (12 Device Trust features)
  ├── SAAS_MANAGER_COMPETITORS (5)
  ├── DEVICE_TRUST_COMPETITORS (5)
  ├── GOVERNANCE_INTEL
  ├── State vars + showFeaturesHub/showIntelHub/showCompeteUnified
  ├── showBuild/showRoadmap/showPlatformView
  ├── generatePlatPlaybook (Claude API)
  ├── renderTrelicaFeature / renderDTFeature
  ├── renderSaaSCompetitor / renderDTCompetitor
  ├── Product activation system
  ├── customInit() + switchTab('features') + showTiles('all')
  └── </script>
```

## Deploy Checklist
Before every `git push`:
- [ ] `node --check` passes
- [ ] JSDOM regression test passes ALL items above
- [ ] No `??` in file
- [ ] All emojis present
- [ ] No duplicate function definitions
- [ ] `wc -c index.html` is ~590KB (major deviation = something broke)
- [ ] Hard refresh (`Cmd+Shift+R`) after deploy to clear cache
