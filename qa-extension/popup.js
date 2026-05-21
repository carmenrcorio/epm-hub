// popup.js — runs in the extension popup

let lastResults = null;

// Show current tab URL on load
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab) {
    const el = document.getElementById('page-url');
    if (el) el.textContent = tab.url.replace(/^https?:\/\//, '').substring(0, 45);
  }
});

async function runQA() {
  const btn = document.getElementById('runBtn');
  btn.disabled = true;
  btn.textContent = '…Running';
  document.getElementById('content').innerHTML =
    '<div class="loading"><div class="spin"></div>Auditing the hub…</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found.');

    // KEY FIX: world: 'MAIN' lets us access page-level globals (FEATURES, INDUSTRIES etc.)
    // Without this, the script runs in an isolated world and can't see the hub's JS objects
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: qaFunction
    });

    const data = results[0]?.result;
    if (!data) throw new Error('No result returned. Make sure you are on the EPM Hub page.');
    if (data.fatal) throw new Error(data.fatal);

    lastResults = data;
    renderResults(data);

  } catch (err) {
    const msg = err.message || String(err);
    document.getElementById('content').innerHTML = `
      <div class="empty">
        <strong style="color:#EF4444">Could not run QA</strong><br/><br/>
        ${msg}<br/><br/>
        <strong>Checklist:</strong><br/>
        • Are you on the EPM Hub tab? (not this popup)<br/>
        • Has the page fully loaded?<br/>
        • Try refreshing the hub and running again
        <div class="debug">Error detail: ${msg}</div>
      </div>`;
  }

  btn.disabled = false;
  btn.textContent = '▶ Run QA';
}

// This function is serialised and injected into the page's MAIN world
// It can access window.FEATURES, window.INDUSTRIES etc. directly
function qaFunction() {
  try {
    if (!window.FEATURES || !window.INDUSTRIES || !window.DEPARTMENTS) {
      return { fatal: 'Hub globals not found. Make sure you are on the EPM Hub page and it has finished loading.' };
    }

    const r = {
      timestamp: new Date().toISOString(),
      url: location.href,
      errors: [],
      warnings: [],
      suggestions: [],
      tabs: [],
      feature_bible: {},
      industry_intel: {},
      departments: {},
      customer_builder: {},
      build_a_doc: {},
      compete: {}
    };

    // ── TABS ──────────────────────────────────────────────
    ['features','industry','departments','customer-builder','bad','compete'].forEach(id => {
      const el = document.getElementById('tab-' + id);
      r.tabs.push({
        id,
        label: { features:'Feature Bible', industry:'Industry Intel', departments:'Departments',
          'customer-builder':'Customer Builder', bad:'Build a Doc', compete:'Compete' }[id],
        present: !!el,
        clickable: el ? !el.classList.contains('soon') : false
      });
    });
    const missingTabs = r.tabs.filter(t => !t.present).map(t => t.label);
    if (missingTabs.length) r.errors.push('Missing tabs: ' + missingTabs.join(', '));

    // ── FEATURE BIBLE ─────────────────────────────────────
    const features = window.FEATURES || [];
    r.feature_bible = {
      total: features.length,
      admin_count: features.filter(f => f.s === 'admin').length,
      enduser_count: features.filter(f => f.s === 'enduser').length,
      developer_count: features.filter(f => f.s === 'developer').length,
      unique_features: features.filter(f => f.badge === 'unique').map(f => f.n),
      new_features: features.filter(f => f.badge === 'new').map(f => f.n),
      missing_prob: features.filter(f => !f.prob || f.prob.length < 20).map(f => f.n),
      xref_coverage: Object.keys(window.XREF || {}).length + ' / ' + features.length
    };
    if (r.feature_bible.missing_prob.length)
      r.warnings.push('Thin problem statements: ' + r.feature_bible.missing_prob.join(', '));

    // ── INDUSTRY INTEL ────────────────────────────────────
    const industries = window.INDUSTRIES || {};
    const indIds = Object.keys(industries);
    const customInds = indIds.filter(id => industries[id]._custom);
    const techStackCoverage = Object.keys(window.TECH_STACKS || {});
    const indIssues = [];
    indIds.forEach(id => {
      const I = industries[id];
      if (!I.pains || I.pains.length < 3) indIssues.push(I.name + ': < 3 pain points');
      if (!I.solutions || I.solutions.length < 3) indIssues.push(I.name + ': < 3 solutions');
    });
    r.industry_intel = {
      total: indIds.length,
      built_in: indIds.length - customInds.length,
      custom: customInds.length,
      custom_names: customInds.map(id => industries[id].name),
      tech_stack_coverage: techStackCoverage.length + ' / ' + indIds.length,
      missing_tech_stacks: indIds.filter(id => !techStackCoverage.includes(id)).map(id => industries[id].name),
      issues: indIssues.slice(0, 5)
    };
    if (indIssues.length) r.warnings.push(indIssues[0]);

    // ── DEPARTMENTS ───────────────────────────────────────
    const depts = window.DEPARTMENTS || {};
    const deptIds = Object.keys(depts);
    const customDepts = deptIds.filter(id => depts[id]._custom);
    const deptIssues = [];
    deptIds.forEach(id => {
      const D = depts[id];
      if (!D.pains || D.pains.length < 3) deptIssues.push(D.name + ': < 3 pain points');
      if (!D.csm_insight || D.csm_insight.length < 30) deptIssues.push(D.name + ': thin CSM insight');
    });
    r.departments = {
      total: deptIds.length,
      built_in: deptIds.length - customDepts.length,
      custom: customDepts.length,
      custom_names: customDepts.map(id => depts[id].name),
      list: deptIds.map(id => ({ name: depts[id].name, emoji: depts[id].emoji, custom: !!depts[id]._custom })),
      issues: deptIssues.slice(0, 5)
    };

    // ── CUSTOMER BUILDER ──────────────────────────────────
    // Switch to CB tab briefly to check DOM, then check what's visible
    const cbForm = document.querySelector('.cb-form');
    r.customer_builder = {
      form_present: !!cbForm,
      has_custom_btns: document.querySelectorAll('.cb-add-custom-btn').length > 0,
      has_pain_tags: !!document.getElementById('pain-tags'),
      has_stack_tags: !!document.getElementById('stack-tags'),
      has_chips: !!document.getElementById('chips-compliance'),
      generate_btn: !!document.getElementById('cb-gen-btn')
    };

    // ── BUILD A DOC ───────────────────────────────────────
    const bad = window.BAD || {};
    r.build_a_doc = {
      projects: (bad.projects || []).length,
      widgets: (bad.projects || []).reduce((a, p) => a + p.widgets.length, 0),
      add_to_bad_buttons: document.querySelectorAll('.add-bad-btn').length,
      has_drag: typeof window.badStartDrag === 'function',
      has_pdf: typeof window.badExportPDF === 'function'
    };

    // ── COMPETE ───────────────────────────────────────────
    const comps = window.COMPETITORS || {};
    r.compete = {
      total: Object.keys(comps).length,
      list: Object.entries(comps).map(([id, C]) => ({
        name: C.name,
        win_themes: (C.win_themes || []).length,
        objections: (C.objections || []).length,
        has_battle_card: !!C.battle_card,
        has_incidents: (C.incidents || []).some(i => !i.date.includes('No '))
      }))
    };

    // ── SAVED CUSTOMS ─────────────────────────────────────
    try {
      const saved = JSON.parse(localStorage.getItem('1p_epm_hub_custom_v1') || '{}');
      r.saved_customs = {
        industries: (saved.industries || []).map(i => i.name),
        departments: (saved.departments || []).map(d => d.name)
      };
    } catch(e) { r.saved_customs = {}; }

    // ── SUGGESTIONS ───────────────────────────────────────
    if (r.industry_intel.missing_tech_stacks.length > 0)
      r.suggestions.push('Add tech stacks for: ' + r.industry_intel.missing_tech_stacks.slice(0, 4).join(', '));
    if (r.build_a_doc.add_to_bad_buttons < 5)
      r.suggestions.push('Add more 📌 "Add to Build a Doc" buttons — only ' + r.build_a_doc.add_to_bad_buttons + ' visible on current tab');
    if (r.feature_bible.total < 35)
      r.suggestions.push('Feature Bible has ' + r.feature_bible.total + ' features — check for recently launched features to add');
    if (r.departments.custom === 0 && r.industry_intel.custom === 0)
      r.suggestions.push('No custom industries or departments saved yet — encourage team to add account-specific verticals via Customer Builder');
    if (r.compete.total < 7)
      r.suggestions.push('Consider adding more competitors: Passwordstate, Delinea, ManageEngine PAM');
    r.suggestions.push('Run Customer Builder with a real account — note which fields feel slow or confusing');
    r.suggestions.push('Ask the team: which tab do you use most? Make that the default landing view');
    r.suggestions.push('Build a Doc could use pre-built templates — e.g. "Financial Services One-Pager", "Security QBR"');
    r.suggestions.push('Consider a Favourites/Pinned system so each CSM can pin their most-used features');

    return r;

  } catch(e) {
    return { fatal: 'QA script error: ' + e.message };
  }
}

// ── RENDER ────────────────────────────────────────────────────

function renderResults(r) {
  const errCount = (r.errors || []).length;
  const warnCount = (r.warnings || []).length;
  const score = Math.max(0, 100 - errCount * 20 - warnCount * 5);
  const scoreColor = score >= 85 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
  const scoreLabel = score >= 85 ? 'Looking good' : score >= 60 ? 'Needs attention' : 'Issues found';

  let html = `<div class="score-bar">
    <div class="score-ring" style="border-color:${scoreColor};color:${scoreColor}">${score}</div>
    <div class="score-details">
      <div class="score-name">${scoreLabel}</div>
      <div class="score-sub">${errCount} error${errCount !== 1 ? 's' : ''} · ${warnCount} warning${warnCount !== 1 ? 's' : ''} · ${(r.suggestions || []).length} suggestions</div>
    </div>
  </div>`;

  if (errCount) html += mkSection('🚨', 'Errors', errCount + ' found', 'err', true,
    r.errors.map(e => `<div class="issue-row err">${e}</div>`).join(''));

  if (warnCount) html += mkSection('⚠️', 'Warnings', warnCount + ' found', 'warn', !errCount,
    r.warnings.map(w => `<div class="issue-row">${w}</div>`).join(''));

  // Tabs
  const tabs = r.tabs || [];
  html += mkSection('🗂', 'Tabs', tabs.filter(t=>t.clickable).length + '/'+tabs.length+' live', 'info', false,
    `<div class="tabs-grid">${tabs.map(t=>`
      <div class="tab-item ${t.present && t.clickable ? 'ok' : 'soon'}">
        <div class="tab-name">${t.label}</div>
        <div class="tab-status">${t.clickable ? '✓ live' : '–'}</div>
      </div>`).join('')}</div>`);

  // Feature Bible
  const fb = r.feature_bible;
  html += mkSection('📖', 'Feature Bible', fb.total + ' features', 'info', false,
    `<div class="stat-grid">
      <div class="stat"><div class="stat-n" style="color:#3A9EFF">${fb.admin_count}</div><div class="stat-l">Admin</div></div>
      <div class="stat"><div class="stat-n" style="color:#40DEDA">${fb.enduser_count}</div><div class="stat-l">End-User</div></div>
      <div class="stat"><div class="stat-n" style="color:#C09FFF">${fb.developer_count}</div><div class="stat-l">Developer</div></div>
      <div class="stat"><div class="stat-n">${fb.total}</div><div class="stat-l">Total</div></div>
    </div>
    <div class="row"><span class="row-label">Unique to 1P</span><span class="row-val">${(fb.unique_features||[]).map(f=>`<span class="tag new">${f}</span>`).join('')||'—'}</span></div>
    <div class="row"><span class="row-label">New features</span><span class="row-val">${(fb.new_features||[]).map(f=>`<span class="tag new">${f}</span>`).join('')||'—'}</span></div>
    <div class="row"><span class="row-label">XRef coverage</span><span class="row-val ok">${fb.xref_coverage}</span></div>`);

  // Industry Intel
  const ii = r.industry_intel;
  html += mkSection('🏢', 'Industry Intel', ii.total + ' industries', 'info', false,
    `<div class="stat-grid">
      <div class="stat"><div class="stat-n">${ii.built_in}</div><div class="stat-l">Built-in</div></div>
      <div class="stat"><div class="stat-n" style="color:#A78BFA">${ii.custom}</div><div class="stat-l">Custom ✦</div></div>
    </div>
    ${ii.custom_names?.length ? `<div class="row"><span class="row-label">Custom</span><span class="row-val">${ii.custom_names.map(n=>`<span class="tag custom">${n}</span>`).join('')}</span></div>` : ''}
    <div class="row"><span class="row-label">Tech stacks</span><span class="row-val ${ii.missing_tech_stacks?.length?'warn':'ok'}">${ii.tech_stack_coverage}</span></div>
    ${ii.missing_tech_stacks?.length ? `<div class="row"><span class="row-label">Missing stacks</span><span class="row-val warn">${ii.missing_tech_stacks.slice(0,5).join(', ')}</span></div>` : ''}
    ${(ii.issues||[]).map(i=>`<div class="issue-row">${i}</div>`).join('')}`);

  // Departments
  const dp = r.departments;
  html += mkSection('🏛️', 'Departments', dp.total + ' departments', 'info', false,
    `<div class="stat-grid">
      <div class="stat"><div class="stat-n">${dp.built_in}</div><div class="stat-l">Built-in</div></div>
      <div class="stat"><div class="stat-n" style="color:#A78BFA">${dp.custom}</div><div class="stat-l">Custom ✦</div></div>
    </div>
    ${dp.custom_names?.length ? `<div class="row"><span class="row-label">Custom</span><span class="row-val">${dp.custom_names.map(n=>`<span class="tag custom">${n}</span>`).join('')}</span></div>` : ''}
    <div class="row"><span class="row-label">Full list</span><span class="row-val">${(dp.list||[]).map(d=>`<span class="tag ${d.custom?'custom':''}">${d.emoji} ${d.name}</span>`).join('')}</span></div>`);

  // Customer Builder
  const cb = r.customer_builder;
  html += mkSection('✨', 'Customer Builder', cb.form_present ? 'Form loaded' : 'Not rendered yet', cb.form_present?'ok':'warn', false,
    `<div class="row"><span class="row-label">Form</span><span class="row-val ${cb.form_present?'ok':'warn'}">${cb.form_present?'✓ Present':'Open the tab first, then re-run'}</span></div>
    <div class="row"><span class="row-label">Custom ✦ buttons</span><span class="row-val ${cb.has_custom_btns?'ok':'warn'}">${cb.has_custom_btns?'✓ Present':'⚠ Not found'}</span></div>
    <div class="row"><span class="row-label">Tag inputs</span><span class="row-val ${cb.has_pain_tags?'ok':'warn'}">${cb.has_pain_tags?'✓ Pain + stack tags':'⚠ Missing'}</span></div>
    <div class="row"><span class="row-label">Compliance chips</span><span class="row-val ${cb.has_chips?'ok':'warn'}">${cb.has_chips?'✓ Present':'⚠ Missing'}</span></div>`);

  // Build a Doc
  const bad = r.build_a_doc;
  html += mkSection('📄', 'Build a Doc', `${bad.projects} projects, ${bad.widgets} widgets`, 'info', false,
    `<div class="row"><span class="row-label">📌 buttons</span><span class="row-val ${bad.add_to_bad_buttons>4?'ok':'warn'}">${bad.add_to_bad_buttons} on current page</span></div>
    <div class="row"><span class="row-label">Drag</span><span class="row-val ${bad.has_drag?'ok':'err'}">${bad.has_drag?'✓':'✗ missing'}</span></div>
    <div class="row"><span class="row-label">PDF export</span><span class="row-val ${bad.has_pdf?'ok':'err'}">${bad.has_pdf?'✓':'✗ missing'}</span></div>`);

  // Compete
  const cp = r.compete;
  html += mkSection('⚔️', 'Compete', cp.total + ' profiles', 'info', false,
    (cp.list||[]).map(c=>`<div class="row">
      <span class="row-label">${c.name}</span>
      <span class="row-val">
        ${c.has_incidents?'<span class="tag err">Incidents</span>':'<span class="tag new">Clean</span>'}
        <span class="tag">${c.win_themes} wins</span>
        <span class="tag">${c.objections} obj</span>
        ${c.has_battle_card?'<span class="tag new">Battle card ✓</span>':''}
      </span>
    </div>`).join(''));

  // Saved customs
  const sc = r.saved_customs || {};
  if ((sc.industries||[]).length || (sc.departments||[]).length) {
    html += mkSection('✦', 'Saved Customs', (sc.industries||[]).length + ' ind, ' + (sc.departments||[]).length + ' dept', 'info', false,
      `${(sc.industries||[]).length ? `<div class="row"><span class="row-label">Industries</span><span class="row-val">${sc.industries.map(n=>`<span class="tag custom">${n}</span>`).join('')}</span></div>` : ''}
      ${(sc.departments||[]).length ? `<div class="row"><span class="row-label">Departments</span><span class="row-val">${sc.departments.map(n=>`<span class="tag custom">${n}</span>`).join('')}</span></div>` : ''}`);
  }

  // Suggestions
  if ((r.suggestions||[]).length) {
    html += mkSection('💡', 'Improvement Ideas', r.suggestions.length + ' suggestions', 'info', true,
      r.suggestions.map(s => `<div class="suggestion-row">${s}</div>`).join(''));
  }

  html += `<div style="padding:10px 14px;border-top:1px solid #1A3050">
    <div class="ts">Audited ${new Date(r.timestamp).toLocaleTimeString()} · ${r.url.replace(/^https?:\/\//,'').substring(0,40)}</div>
    <button class="copy-btn" onclick="copyReport()">📋 Copy Report</button>
  </div>`;

  document.getElementById('content').innerHTML = html;
  document.querySelectorAll('.section-hdr').forEach(h => {
    h.addEventListener('click', () => {
      h.nextElementSibling.classList.toggle('open');
      h.querySelector('.section-chevron').classList.toggle('open');
    });
  });
}

function mkSection(ico, title, badge, type, open, body) {
  return `<div class="section">
    <div class="section-hdr">
      <span class="section-ico">${ico}</span>
      <span class="section-title">${title}</span>
      <span class="section-badge badge-${type}">${badge}</span>
      <span class="section-chevron ${open?'open'}">▶</span>
    </div>
    <div class="section-body ${open?'open'}">${body}</div>
  </div>`;
}

function copyReport() {
  if (!lastResults) return;
  const r = lastResults;
  const lines = [
    '1P EPM HUB QA REPORT',
    'Audited: ' + new Date(r.timestamp).toLocaleString(),
    'URL: ' + r.url, '',
    'ERRORS: ' + ((r.errors||[]).join(' | ') || 'None'),
    'WARNINGS: ' + ((r.warnings||[]).join(' | ') || 'None'), '',
    'Feature Bible: ' + r.feature_bible?.total + ' features',
    'Industry Intel: ' + r.industry_intel?.total + ' industries (' + r.industry_intel?.custom + ' custom)',
    'Departments: ' + r.departments?.total + ' (' + r.departments?.custom + ' custom)',
    'Build a Doc: ' + r.build_a_doc?.projects + ' projects, ' + r.build_a_doc?.widgets + ' widgets',
    'Compete: ' + r.compete?.total + ' profiles', '',
    'SUGGESTIONS:',
    ...(r.suggestions||[]).map(s => '→ ' + s)
  ];
  navigator.clipboard.writeText(lines.join('\n'));
  const btn = document.querySelector('.copy-btn');
  if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = '📋 Copy Report', 2000); }
}
