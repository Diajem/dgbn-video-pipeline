'use strict';
const state = {stock: {}, meta: null, projects: [], project: null, commons: {}, check: null, render: null, poll: null};
const $ = s => document.querySelector(s);
// Append that accepts arrays and skips null/false (native append() would print them as text).
const put = (parent, ...items) => parent.append(...items.flat().filter(x => x != null && x !== false));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const select = (options, value, onchange, attrs, names = {}) => {
  const el = h('select', {onchange: e => onchange(e.target.value), ...attrs}, options.map(o => h('option', {value: o}, names[o] || o)));
  el.value = value;
  return el;
};
const brandName = id => state.meta.brandInfo?.[id]?.name || id;
const brandSelect = (value, onchange) => select(state.meta.brands, value, onchange, {}, Object.fromEntries(state.meta.brands.map(b => [b, brandName(b)])));
const EDITION_NAMES = {MORNING: 'Morning edition', EVENING: 'Evening edition'};
const editionSelect = (value, onchange) => select(state.meta.editions || ['MORNING', 'EVENING'], value || 'MORNING', onchange, {}, EDITION_NAMES);

let toastTimer;
function toast(message, isError) {
  const t = $('#toast');
  t.textContent = message;
  t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, isError ? 9000 : 3500);
}

async function api(method, path, body, raw) {
  const opts = {method, headers: {'X-Studio': '1'}};
  if (raw) { opts.body = raw.body; opts.headers['Content-Type'] = raw.type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || (data.blockers && data.blockers.join('\n')) || 'Request failed (' + res.status + ')'); err.data = data; throw err; }
  return data;
}
const guard = fn => async (...args) => { try { await fn(...args); } catch (e) { toast(e.message, true); if (e.data?.blockers) { state.check = e.data; renderExport(); } } };

async function loadProjects() { state.projects = await api('GET', '/api/projects'); renderSide(); }
async function openProject(id) {
  state.project = await api('GET', '/api/projects/' + id);
  state.check = null; state.render = null; clearInterval(state.poll);
  renderSide(); renderMain();
  const r = await api('GET', `/api/projects/${id}/render`);
  if (r.status !== 'idle') { state.render = r; renderExport(); if (r.status === 'running') startPolling(); }
}
function setProject(p) { state.project = p; renderMain(); loadProjects(); }

// ---------- sidebar ----------
function renderSide() {
  const side = $('#side');
  side.replaceChildren();
  const f = {title: '', brand: 'DGBN', edition: new Date().getHours() < 14 ? 'MORNING' : 'EVENING', storyType: 'present', url: ''};
  put(side, 
    h('h2', {}, 'New video'),
    h('label', {}, 'Title'), h('input', {oninput: e => f.title = e.target.value, placeholder: 'e.g. Kingston flood response'}),
    h('label', {}, 'Brand'), brandSelect(f.brand, v => f.brand = v),
    h('label', {}, 'Edition'), editionSelect(f.edition, v => f.edition = v),
    h('label', {}, 'Story type'), select(state.meta.storyTypes, f.storyType, v => f.storyType = v),
    h('div', {class: 'muted'}, 'present = current event (real or licensed pictures first; an AI image only when Commons, stock and cards have nothing suitable) · data = statistics/population (generated maps and visuals are fine); past = history/culture · football · graphic'),
    h('div', {class: 'row', style: 'margin-top:10px'},
      h('button', {class: 'primary', onclick: guard(async () => { setProject(await api('POST', '/api/projects', f)); })}, 'Start from script / uploads')),
    h('h3', {}, 'Or import an article URL'),
    h('input', {oninput: e => f.url = e.target.value, placeholder: 'https://...'}),
    h('div', {class: 'notice'}, 'The article text is kept as source material only. Write your own script. Images found on the page start with rights unknown.'),
    h('button', {onclick: guard(async () => { toast('Importing...'); setProject(await api('POST', '/api/import-url', f)); toast('Imported'); })}, 'Import URL'),
    h('h3', {}, 'Projects'),
    state.projects.length ? state.projects.map(p => h('button', {class: 'proj' + (state.project?.id === p.id ? ' active' : ''), onclick: guard(() => openProject(p.id))},
      p.title, h('div', {class: 'muted'}, `${brandName(p.brand)} · ${EDITION_NAMES[p.edition] || 'Morning edition'} · ${p.scenes} scenes`))) : h('div', {class: 'muted'}, 'None yet.'),
  );
}

// ---------- main ----------
const fieldSave = key => guard(async e => {
  const p = await api('PUT', '/api/projects/' + state.project.id, {[key]: e.target.value});
  state.project = p;
  loadProjects();
});

function renderMain() {
  const p = state.project;
  const main = $('#main');
  main.replaceChildren();
  if (!p) { put(main, h('p', {class: 'muted'}, 'Create a project or pick one on the left.')); return; }

  const scriptBox = h('textarea', {value: p.script, onchange: fieldSave('script')});
  put(main, 
    h('h2', {}, p.title),
    h('div', {class: 'box'},
      h('div', {class: 'row'},
        h('div', {class: 'grow'}, h('label', {}, 'Title'), h('input', {value: p.title, onchange: fieldSave('title')})),
        h('div', {}, h('label', {}, 'Brand'), brandSelect(p.brand, guard(async v => { state.project = await api('PUT', '/api/projects/' + p.id, {brand: v}); renderMain(); }))),
        h('div', {}, h('label', {}, 'Edition'), editionSelect(p.edition, guard(async v => { state.project = await api('PUT', '/api/projects/' + p.id, {edition: v}); renderMain(); }))),
        h('div', {}, h('label', {}, 'Story type'), select(state.meta.storyTypes, p.storyType, guard(async v => { state.project = await api('PUT', '/api/projects/' + p.id, {storyType: v}); renderMain(); }))),
        h('div', {}, h('label', {title: 'short = Shorts/Reels: no on-screen credits, unresolved rights only warn. long = credits card at the end. website = strict rules.'}, 'Format'), select(state.meta.formats || ['short', 'long', 'website'], p.format || 'short', guard(async v => { state.project = await api('PUT', '/api/projects/' + p.id, {format: v}); renderMain(); })))),
      h('label', {class: 'row', style: 'gap:6px;margin-top:8px'}, h('input', {type: 'checkbox', style: 'width:auto', checked: p.bookends !== false,
        onchange: guard(async e => { state.project = await api('PUT', '/api/projects/' + p.id, {bookends: e.target.checked}); renderMain(); })}),
        'Add this brand and edition’s intro and outro clips'),
      h('label', {}, 'Headline (shown on screen)'), h('input', {value: p.headline, onchange: fieldSave('headline')}),
      h('label', {}, 'Script (your own words, British English)'), scriptBox,
      h('div', {class: 'row', style: 'margin-top:8px'},
        h('button', {class: 'primary', onclick: guard(async () => { await api('PUT', '/api/projects/' + p.id, {script: scriptBox.value}); setProject(await api('POST', `/api/projects/${p.id}/split`)); })}, 'Split into scenes'),
        p.productionMode === 'REAL_CAMERA' ? h('button', {onclick: guard(async () => setProject(await api('POST', `/api/projects/${p.id}/split`, {noScript: true})))}, 'Use recording without script') : null,
        h('span', {class: 'muted'}, 'Re-splitting keeps assets by scene position.'))),
    p.sourceText ? h('details', {class: 'box'}, h('summary', {}, 'Source material' + (p.sourceUrl ? ' – ' + p.sourceUrl : '')),
      h('textarea', {value: p.sourceText, onchange: fieldSave('sourceText')})) : null,
    p.candidates?.length ? candidatesBox(p) : null,
    h('h3', {}, 'Storyboard'),
    brandClipsBox(),
    stockKeysBox(),
    gptKeyBox(),
    p.scenes.length ? p.scenes.map((s, i) => sceneCard(p, s, i)) : h('div', {class: 'muted'}, p.productionMode === 'REAL_CAMERA' ? 'Split a script or use the recording without a script.' : 'Write the script, then split it into scenes.'),
    productionBox(p),
    (p.productionMode || 'FACELESS') === 'FACELESS' ? narrationBox(p) : null,
    h('div', {id: 'exportBox'}),
  );
  renderExport();
}

function candidatesBox(p) {
  let target = p.scenes[0]?.id;
  return h('details', {class: 'box'}, h('summary', {}, `Images found on the source page (${p.candidates.length}) – rights unknown`),
    h('div', {class: 'notice'}, 'These belong to the publisher. Using them needs permission or a licence. Attach one, then set its rights and note.'),
    p.scenes.length ? h('div', {class: 'row'}, h('span', {class: 'muted'}, 'Add to scene:'),
      h('select', {onchange: e => target = e.target.value}, p.scenes.map((s, i) => h('option', {value: s.id}, 'Scene ' + (i + 1))))) : h('div', {class: 'muted'}, 'Split the script first.'),
    h('div', {class: 'results'}, p.candidates.map(c => h('div', {class: 'result'}, h('img', {src: c.url, loading: 'lazy', referrerpolicy: 'no-referrer'}),
      h('button', {class: 'small', onclick: guard(async () => { if (!target) throw new Error('Split the script into scenes first'); setProject(await api('POST', `/api/projects/${p.id}/scenes/${target}/assets`, {type: 'url', url: c.url})); toast('Attached – set its rights next'); })}, 'Use')))));
}

function sceneCard(p, scene, i) {
  const cs = state.commons[scene.id] || {q: '', results: null};
  state.commons[scene.id] = cs;
  const fileInput = h('input', {type: 'file', accept: '.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov', style: 'max-width:240px'});
  let origin = 'own';
  let urlValue = '';
  return h('div', {class: 'box scene'},
    h('div', {class: 'muted'}, 'Scene ' + (i + 1)),
    h('div', {class: 'text'}, scene.text),
    p.productionMode && p.productionMode !== 'FACELESS' ? h('div', {}, h('label', {}, 'Scene layout'),
      select(['presenter', 'broll', 'pip'], scene.layout || 'presenter', guard(async layout => setProject(await api('PUT', `/api/projects/${p.id}/scenes/${scene.id}/layout`, {layout}))))) : null,
    h('div', {class: 'assets'}, scene.assets.length ? scene.assets.map(a => assetCard(p, scene, a)) : h('div', {class: 'blocker'}, 'No asset yet.')),
    h('div', {class: 'row'},
      h('input', {class: 'grow', placeholder: 'Search Wikimedia Commons…', value: cs.q, oninput: e => cs.q = e.target.value,
        onkeydown: e => { if (e.key === 'Enter') e.target.nextSibling.click(); }}),
      h('button', {onclick: guard(async () => { cs.results = await api('GET', '/api/commons?q=' + encodeURIComponent(cs.q)); renderMain(); })}, 'Search Commons')),
    cs.results ? h('div', {},
      h('div', {class: 'row'}, h('div', {class: 'notice grow'}, 'A Commons licence covers the photo, not necessarily a person’s likeness or logos in it. Keep the credit line.'),
        h('button', {class: 'small', onclick: () => { cs.results = null; renderMain(); }}, 'Close results')),
      h('div', {class: 'results'}, cs.results.length ? cs.results.map(r => h('div', {class: 'result'},
        h('img', {src: r.thumbUrl, loading: 'lazy'}),
        h('div', {}, r.title.slice(0, 60)),
        h('div', {}, h('span', {class: 'badge b-' + r.rights}, r.rights === 'cleared' ? 'usable with credit' : 'needs permission'), ' ', r.licence || 'licence unknown'),
        h('button', {class: 'small', onclick: guard(async () => { setProject(await api('POST', `/api/projects/${p.id}/scenes/${scene.id}/assets`, {type: 'commons', url: r.thumbUrl, pageUrl: r.pageUrl, credit: r.credit, licence: r.licence, title: r.title})); toast('Added'); })}, 'Use'))) : h('div', {class: 'muted'}, 'No usable images found.'))) : null,
    stockRow(p, scene),
    gptRow(p, scene),
    h('div', {class: 'row', style: 'margin-top:8px'},
      fileInput,
      select(['own', 'ai', 'other'], origin, v => origin = v, {title: 'own = your material · ai = AI-generated · other = from someone else (rights unknown)'}),
      h('button', {onclick: guard(async () => {
        const file = fileInput.files[0];
        if (!file) throw new Error('Choose a file first');
        toast('Uploading…');
        setProject(await api('POST', `/api/projects/${p.id}/scenes/${scene.id}/upload?origin=${origin}&name=${encodeURIComponent(file.name)}`, undefined, {body: file, type: file.type}));
        toast('Uploaded');
      })}, 'Upload')),
    h('div', {class: 'row', style: 'margin-top:8px'},
      h('input', {class: 'grow', placeholder: 'Or paste an image URL (rights start as unknown)', oninput: e => urlValue = e.target.value}),
      h('button', {onclick: guard(async () => { setProject(await api('POST', `/api/projects/${p.id}/scenes/${scene.id}/assets`, {type: 'url', url: urlValue})); toast('Attached – set its rights next'); })}, 'Add from URL')));
}

function assetCard(p, scene, a) {
  const base = `/api/projects/${p.id}/scenes/${scene.id}/assets/${a.id}`;
  const update = body => guard(async () => { setProject(await api('PUT', base, body)); })();
  const media = a.kind === 'video'
    ? h('video', {src: `/files/${p.id}/${a.file}`, controls: true, preload: 'metadata', muted: true})
    : h('img', {src: `/files/${p.id}/${a.file}`, loading: 'lazy'});
  return h('div', {class: 'asset'}, media,
    h('div', {class: 'row', style: 'margin:6px 0'}, h('span', {class: 'badge b-' + a.rights}, a.rights), h('span', {class: 'muted'}, a.origin + (a.notes ? ' · ' + a.notes.slice(0, 40) : ''))),
    h('label', {}, 'On-screen label'), select(state.meta.labels, a.label, v => update({label: v})),
    h('label', {}, 'Rights status'), select(state.meta.rights, a.rights, v => update({rights: v})),
    h('label', {title: 'auto: photos fill the screen, landscape clips sit on a blurred background. fit: show the whole picture on a blurred background. fill: crop to fill.'}, 'Picture fit'), select(['auto', 'fit', 'fill'], a.fit || 'auto', v => update({fit: v})),
    a.kind === 'video' ? null : playerCardFields(a, update),
    h('label', {}, 'Credit line'), h('input', {value: a.credit, onchange: e => update({credit: e.target.value})}),
    h('label', {}, 'Rights note (where permission comes from)'), h('input', {value: a.rightsNote, onchange: e => update({rightsNote: e.target.value})}),
    /^https?:\/\//i.test(a.sourceUrl || '') ? h('div', {class: 'muted'}, h('a', {href: a.sourceUrl, target: '_blank', rel: 'noreferrer', style: 'color:var(--gold)'}, 'source page')) : null,
    h('div', {style: 'margin-top:6px'}, h('button', {class: 'small', onclick: guard(async () => { if (confirm('Remove this asset?')) setProject(await api('DELETE', base)); })}, 'Remove')));
}

function narrationBox(p) {
  const fileInput = h('input', {type: 'file', accept: '.wav,.mp3,.m4a,.aac,.ogg', style: 'max-width:260px'});
  return h('div', {class: 'box'}, h('h3', {style: 'margin-top:0'}, 'Narration'),
    h('div', {class: 'notice'}, 'Upload your approved narration for a final video. The built-in Windows voice is for draft renders only and cannot be approved.'),
    h('div', {class: 'row'}, fileInput,
      h('button', {onclick: guard(async () => {
        const f = fileInput.files[0];
        if (!f) throw new Error('Choose an audio file first');
        toast('Uploading…');
        setProject(await api('POST', `/api/projects/${p.id}/audio?name=${encodeURIComponent(f.name)}`, undefined, {body: f, type: f.type}));
      })}, 'Upload narration'),
      h('button', {onclick: guard(async () => { toast('Generating draft voice…'); setProject(await api('POST', `/api/projects/${p.id}/audio/draft-voice`)); toast('Draft voice ready'); })}, 'Draft voice (Windows)')),
    pocketVoiceBox(p),
    googleVoiceBox(p),
    p.audio ? h('div', {style: 'margin-top:8px'},
      h('div', {class: 'muted'}, `${p.audio.name} · source: ${p.audio.origin} · status: ${p.audio.status}`),
      h('audio', {controls: true, src: `/files/${p.id}/${p.audio.file}`, style: 'width:100%;margin:6px 0'}),
      h('div', {class: 'row'}, h('span', {class: 'muted'}, 'Status:'), select(['DRAFT', 'APPROVED'], p.audio.status, guard(async v => { setProject(await api('PUT', `/api/projects/${p.id}/audio`, {status: v})); })))) : h('div', {class: 'blocker'}, 'No narration yet.'));
}

function pocketVoiceBox(p) {
  const box = h('div', {class: 'notice', style: 'margin-top:10px'}, 'Checking local narration voices…');
  const draw = info => {
    box.replaceChildren();
    const current = p.narratorId || info.defaultVoice;
    const labels = Object.fromEntries(info.voices.map(v => [v.id, v.label + (v.ready ? '' : ' — setup needed')]));
    const choice = select(info.voices.map(v => v.id), current, guard(async id => {
      setProject(await api('PUT', `/api/projects/${p.id}`, {narratorId: id}));
    }), {'aria-label': 'Narrator voice'}, labels);
    const selected = info.voices.find(v => v.id === current);
    const styleId = p.narrationStyle || 'natural';
    const styles = info.styles || [{id: 'natural', label: 'Story / natural', ready: true}];
    const styleChoice = select(styles.map(s => s.id), styleId, guard(async id => {
      setProject(await api('PUT', `/api/projects/${p.id}`, {narrationStyle: id}));
    }), {'aria-label': 'Narration style'}, Object.fromEntries(styles.map(s => [s.id, s.label])));
    const styleReady = styles.find(s => s.id === styleId)?.ready;
    const button = h('button', {disabled: !selected?.ready || !styleReady, onclick: guard(async () => {
      button.disabled = true;
      try {
        toast('Generating narration with ' + (selected?.label || current) + '…');
        setProject(await api('POST', `/api/projects/${p.id}/audio/pocket-voice`, {voice: choice.value, style: styleChoice.value}));
        toast('Narration ready to listen and review');
      } finally { button.disabled = false; }
    })}, 'Generate local narration');
    put(box, h('h4', {style: 'margin:0 0 8px'}, 'Narrator'), h('div', {class: 'row'}, choice, styleChoice, button),
      h('p', {class: 'muted'}, 'Choose a voice and sound for this production. With avatar intro/outro clips, put only the bulletin body in the script. Listen before approving.'));
    if (selected?.ready && !styleReady) put(box, h('p', {class: 'blocker'}, 'The news sound needs FFmpeg installed on this computer.'));
    if (!selected?.ready) put(box, h('p', {class: 'blocker'}, info.error || 'This voice needs the one-time Pocket TTS setup on this computer. See docs/narration-voices.md.'));
  };
  api('GET', '/api/voice/pocket').then(draw).catch(error => { box.textContent = 'Local narration unavailable: ' + error.message; });
  return box;
}

// ---------- export / render ----------
function renderExport() {
  const box = $('#exportBox');
  if (!box || !state.project) return;
  const p = state.project, r = state.render, c = state.check;
  box.replaceChildren(h('div', {class: 'box'}, h('h3', {style: 'margin-top:0'}, 'Check and render'),
    h('div', {class: 'row'},
      h('button', {onclick: guard(async () => { state.check = await api('POST', `/api/projects/${p.id}/check`, {draft: true}); state.check.mode = 'draft'; renderExport(); })}, 'Check draft'),
      h('button', {onclick: guard(async () => { state.check = await api('POST', `/api/projects/${p.id}/check`, {draft: false}); state.check.mode = 'final'; renderExport(); })}, 'Check final'),
      h('button', {disabled: r?.status === 'running', onclick: guard(async () => { await startRender(true); })}, 'Render draft'),
      h('button', {class: 'primary', disabled: r?.status === 'running', onclick: guard(async () => { await startRender(false); })}, 'Render final')),
    h('div', {class: 'muted', style: 'margin-top:6px'}, 'Draft renders accept unresolved rights and the draft voice, and carry a “not for publication” banner. Final renders do not.'),
    h('div', {class: 'row', style: 'margin-top:8px'}, h('button', {class: 'small', onclick: guard(async () => { const t = (await api('GET', `/api/projects/${p.id}/sources`)).text; try { await navigator.clipboard.writeText(t); toast('Description text copied'); } catch { prompt('Copy this text for the video description:', t); } })}, 'Copy description text (AI note + credits)')),
    c ? h('div', {style: 'margin-top:10px'},
      c.mode ? h('div', {class: 'muted'}, 'Result of the ' + c.mode + ' check:') : null,
      c.blockers?.length ? h('div', {}, h('strong', {class: 'blocker'}, 'Blockers'), h('ul', {}, c.blockers.map(b => h('li', {class: 'blocker'}, b)))) : h('div', {style: 'color:var(--green)'}, c.mode ? 'No blockers.' : null),
      c.warnings?.length ? h('div', {}, h('strong', {class: 'warning'}, 'Warnings'), h('ul', {}, c.warnings.map(w => h('li', {class: 'warning'}, w)))) : null) : null,
    r ? h('div', {style: 'margin-top:10px'},
      h('div', {}, `Render (${r.mode}): `, h('strong', {}, r.status)),
      r.status === 'running' ? h('div', {class: 'muted'}, 'Rendering… the first render on a machine can take several minutes.') : null,
      r.status === 'failed' ? h('pre', {class: 'muted', style: 'white-space:pre-wrap'}, r.log) : null,
      r.status === 'done' && r.output ? h('div', {}, h('video', {src: '/renders/' + r.output, controls: true, style: 'max-width:320px;width:100%;margin-top:8px;border-radius:8px'}),
        h('div', {class: 'muted'}, 'Saved in the project’s renders folder: ' + r.output)) : null) : null));
}

async function startRender(draft) {
  state.check = null;
  state.render = await api('POST', `/api/projects/${state.project.id}/render`, {draft});
  renderExport();
  startPolling();
}
function startPolling() {
  clearInterval(state.poll);
  state.poll = setInterval(guard(async () => {
    if (!state.project) return;
    state.render = await api('GET', `/api/projects/${state.project.id}/render`);
    renderExport();
    if (state.render.status !== 'running') clearInterval(state.poll);
  }), 3000);
}

(async function init() {
  try {
    state.meta = await api('GET', '/api/health');
    // Keep all capability metadata returned by the server.
    await loadProjects();
  } catch (e) { toast(e.message, true); }
})();

function googleVoiceBox(p) {
  const box = h('div', {style: 'margin-top:10px', class: 'muted'}, 'Checking Google voice…');
  const draw = info => {
    box.textContent = '';
    box.className = '';
    if (!info.configured) {
      const key = h('input', {type: 'password', placeholder: 'Paste your Google API key', autocomplete: 'off', style: 'min-width:280px'});
      box.append(h('div', {class: 'notice'}, 'Google voice is not set up yet. Paste the API key once; it is saved only on this computer.'),
        h('div', {class: 'row'}, key, h('button', {onclick: guard(async () => {
          await api('PUT', '/api/voice/google', {apiKey: key.value}); key.value = '';
          toast('Google key saved'); draw(await api('GET', '/api/voice/google'));
        })}, 'Save key')));
      return;
    }
    const voice = select(info.voices.map(v => v.id), info.voices[0].id, () => {});
    const names = Object.fromEntries(info.voices.map(v => [v.id, v.label]));
    [...voice.options].forEach(o => { o.textContent = names[o.value] || o.value; });
    box.append(h('div', {class: 'row'}, h('span', {class: 'muted'}, 'Google voice:'), voice,
      h('button', {onclick: guard(async () => { toast('Generating Google voice… this can take a minute'); setProject(await api('POST', `/api/projects/${p.id}/audio/google-voice`, {voice: voice.value})); toast('Google voice ready'); })}, 'Generate with Google voice'),
      h('button', {class: 'small', onclick: guard(async () => { if (confirm('Remove the saved Google key from this computer?')) { await api('DELETE', '/api/voice/google'); draw(await api('GET', '/api/voice/google')); } })}, 'Remove key')));
  };
  api('GET', '/api/voice/google').then(draw).catch(e => { box.textContent = 'Google voice unavailable: ' + e.message; });
  return box;
}


// ---- Wan motion clips (Alibaba) ----
function wanKeyBox() {
  const box = h('details', {class: 'box'}, h('summary', {}, 'Wan motion clips (Alibaba) – key'));
  const body = h('div', {class: 'muted'}, 'Checking…');
  box.append(body);
  const draw = info => {
    body.textContent = '';
    body.className = '';
    const ws = h('input', {placeholder: 'Workspace ID (starts ws-)', autocomplete: 'off', value: info.workspaceId || '', style: 'min-width:260px;width:auto;flex:1'});
    const region = h('select', {}, ...info.regions.map(r => h('option', {value: r, selected: r === info.region}, r)));
    if (info.keySaved) {
      body.append(h('div', {class: 'row'}, h('span', {}, 'Wan key: saved'),
        h('button', {class: 'small', onclick: guard(async () => { toast('Checking…'); const r = await api('POST', '/api/wan/check'); toast(r.message); })}, 'Check connection (free)'),
        h('button', {class: 'small', onclick: guard(async () => { if (confirm('Remove the saved Wan key from this computer?')) draw(await api('DELETE', '/api/wan')); })}, 'Remove key')));
      body.append(h('div', {class: 'row'}, h('span', {}, 'Workspace:'), ws, region,
        h('button', {class: 'small', onclick: guard(async () => { draw(await api('PUT', '/api/wan', {workspaceId: ws.value, region: region.value})); toast('Saved'); })}, 'Save')));
    } else {
      const key = h('input', {type: 'password', placeholder: 'Paste your Alibaba API key (starts sk-)', autocomplete: 'off', style: 'min-width:280px;width:auto;flex:1'});
      body.append(h('div', {class: 'row'}, h('span', {}, 'Key:'), key),
        h('div', {class: 'row'}, h('span', {}, 'Workspace:'), ws, region),
        h('div', {class: 'row'}, h('button', {onclick: guard(async () => { draw(await api('PUT', '/api/wan', {apiKey: key.value, workspaceId: ws.value, region: region.value})); key.value = ''; toast('Wan key saved'); })}, 'Save key')));
    }
    body.append(h('div', {class: 'muted'}, 'Saved only on this computer. “Check connection” asks Alibaba whether the key works and generates nothing, so it costs nothing.'));
  };
  api('GET', '/api/wan').then(info => { draw(info); box.open = !info.keySaved; }).catch(e => { body.textContent = 'Wan settings unavailable: ' + e.message; });
  return box;
}

// ---- Stock photos and clips (Pexels, Pixabay) ----
function stockKeysBox() {
  const box = h('details', {class: 'box'}, h('summary', {}, 'Stock sources (Pexels, Pixabay) – keys'));
  const body = h('div', {class: 'muted'}, 'Checking…');
  box.append(body);
  const draw = info => {
    body.textContent = '';
    body.className = '';
    Object.entries(info.providers).forEach(([id, name]) => {
      if (info.configured[id]) {
        body.append(h('div', {class: 'row'}, h('span', {}, name + ': key saved'),
          h('button', {class: 'small', onclick: guard(async () => { if (confirm(`Remove the saved ${name} key from this computer?`)) { draw(await api('DELETE', '/api/stock/' + id)); } })}, 'Remove key')));
      } else {
        const key = h('input', {type: 'password', placeholder: `Paste your ${name} API key`, autocomplete: 'off', style: 'min-width:280px;width:auto;flex:1'});
        body.append(h('div', {class: 'row'}, h('span', {}, name + ':'), key,
          h('button', {onclick: guard(async () => { await api('PUT', '/api/stock/' + id, {apiKey: key.value}); key.value = ''; toast(name + ' key saved'); draw(await api('GET', '/api/stock')); })}, 'Save key')));
      }
    });
    body.append(h('div', {class: 'muted'}, 'Keys are saved only on this computer. Stock pictures are labelled ILLUSTRATIVE so they are not mistaken for footage of the story.'));
  };
  api('GET', '/api/stock').then(info => { draw(info); box.open = !Object.values(info.configured).some(Boolean); box.addEventListener('toggle', () => {}); }).catch(e => { body.textContent = 'Stock sources unavailable: ' + e.message; });
  return box;
}

function stockRow(p, scene) {
  const st = state.stock[scene.id] || (state.stock[scene.id] = {q: '', provider: 'pexels', kind: 'photo', results: null});
  const provider = select(['pexels', 'pixabay'], st.provider, v => st.provider = v, {style: 'width:auto'});
  [...provider.options].forEach(o => { o.textContent = o.value === 'pexels' ? 'Pexels' : 'Pixabay'; });
  const kind = select(['photo', 'video'], st.kind, v => st.kind = v, {style: 'width:auto'});
  [...kind.options].forEach(o => { o.textContent = o.value === 'photo' ? 'Photos' : 'Video clips'; });
  const run = guard(async () => {
    st.results = await api('GET', `/api/stock/search?provider=${st.provider}&kind=${st.kind}&q=${encodeURIComponent(st.q)}`);
    renderMain();
  });
  return h('div', {},
    h('div', {class: 'row', style: 'margin-top:8px'},
      h('input', {class: 'grow', placeholder: 'Search stock photos or clips (B-roll)…', value: st.q, oninput: e => st.q = e.target.value, onkeydown: e => { if (e.key === 'Enter') run(); }}),
      provider, kind, h('button', {onclick: run}, 'Search stock')),
    st.results ? h('div', {},
      h('div', {class: 'row'}, h('div', {class: 'notice grow'}, 'Generic stock, free to use. It is labelled ILLUSTRATIVE, so use it for B-roll, not as a picture of the actual event or person.'),
        h('button', {class: 'small', onclick: () => { st.results = null; renderMain(); }}, 'Close results')),
      h('div', {class: 'results'}, st.results.length ? st.results.map(r => h('div', {class: 'result'},
        h('img', {src: r.thumbUrl, loading: 'lazy', referrerpolicy: 'no-referrer'}),
        h('div', {}, (r.title || '').slice(0, 50) + (r.duration ? ` · ${r.duration}s` : '')),
        h('div', {class: 'muted'}, r.credit),
        h('button', {class: 'small', onclick: guard(async () => {
          toast(r.kind === 'video' ? 'Downloading clip…' : 'Adding…');
          setProject(await api('POST', `/api/projects/${p.id}/scenes/${scene.id}/stock`, {provider: r.provider, kind: r.kind, fileUrl: r.fileUrl, pageUrl: r.pageUrl, credit: r.credit, title: r.title}));
          toast('Added');
        })}, 'Use'))) : h('div', {class: 'muted'}, 'Nothing found. Try simpler words.'))) : null);
}

// ---- Player card: shows this picture as a framed card with name, role, status and one line of data ----
function playerCardFields(a, update) {
  const c = {name: '', role: '', status: '', line: '', ...(a.card || {})};
  const save = () => update({card: {name: c.name, role: c.role, status: c.status, line: c.line}});
  const status = h('select', {onchange: e => { c.status = e.target.value; save(); }}, ['', 'OUT', 'DOUBT', 'AVAILABLE', 'PREDICTED'].map(o => h('option', {value: o}, o || 'no status')));
  status.value = c.status;
  return h('details', {style: 'margin-top:6px'}, h('summary', {}, 'Player card' + (c.name ? ': ' + c.name : '') + ' (optional)'),
    h('label', {}, 'Name'), h('input', {value: c.name, placeholder: 'e.g. Declan Rice', onchange: e => { c.name = e.target.value; save(); }}),
    h('label', {}, 'Role / number'), h('input', {value: c.role, placeholder: 'e.g. Midfielder · 41', onchange: e => { c.role = e.target.value; save(); }}),
    h('label', {}, 'Status chip'), status,
    h('label', {}, 'One line of data'), h('input', {value: c.line, placeholder: 'e.g. Minor hamstring concern', onchange: e => { c.line = e.target.value; save(); }}));
}

function productionBox(p) {
  const mode = p.productionMode || 'FACELESS';
  const names = {FACELESS: 'Faceless', PRESENTER: 'Presenter / avatar recording', REAL_CAMERA: 'Real camera recording'};
  const choice = select(Object.keys(names), mode, guard(async productionMode => setProject(await api('PUT', '/api/projects/' + p.id, {productionMode}))));
  [...choice.options].forEach(o => o.textContent = names[o.value]);
  const input = h('input', {type: 'file', accept: '.mp4,.webm,.mov'});
  const shapes = {PORTRAIT: '9:16 vertical (Shorts, Reels, TikTok)', LANDSCAPE: '16:9 horizontal (YouTube, documentary)'};
  const shape = select(Object.keys(shapes), p.orientation || 'PORTRAIT', guard(async orientation => setProject(await api('PUT', '/api/projects/' + p.id, {orientation}))));
  [...shape.options].forEach(o => o.textContent = shapes[o.value]);
  return h('div', {class: 'box'}, h('h3', {}, 'Production mode'), choice,
    h('label', {}, 'Output shape'), shape,
    mode !== 'FACELESS' ? h('div', {},
      h('p', {class: 'muted'}, mode === 'REAL_CAMERA' && !p.script?.trim() ? 'Upload one continuous camera recording with audio. No script or generated captions are needed; the recording plays full screen.' : 'Upload one continuous recording of this script, with spoken audio. Set each scene to presenter, B-roll, or picture-in-picture. The recording continues underneath all visuals.'),
      input, h('button', {onclick: guard(async () => {
        const f = input.files[0]; if (!f) throw new Error('Choose a presenter video');
        toast('Uploading presenter…');
        setProject(await api('POST', `/api/projects/${p.id}/presenter?name=${encodeURIComponent(f.name)}`, undefined, {body: f, type: f.type}));
      })}, 'Upload presenter'),
      p.presenter ? h('div', {},
        h('video', {controls: true, src: `/files/${p.id}/${p.presenter.file}`, style: 'max-width:320px;width:100%'}),
        h('label', {}, 'Recording review'),
        select(['DRAFT', 'APPROVED'], p.presenter.status, guard(async status => setProject(await api('PUT', `/api/projects/${p.id}/presenter`, {status})))),
        transcribeControls(p)) : null) : null);
}

// Speech-to-text on this computer: times every spoken word, and writes the script if there is none yet.
function transcribeControls(p) {
  const t = p.presenter.transcript;
  const note = h('div', {class: 'muted', id: 'transcribeNote', style: 'margin-top:6px'},
    t ? `Transcript ready: ${t.words.length} words timed to the speech. Captions and scene changes follow the recording.` : 'No transcript yet. Without one, captions and scenes use estimated timing and a script is needed.');
  const button = h('button', {id: 'transcribeBtn', onclick: guard(async () => {
    await api('POST', `/api/projects/${p.id}/transcribe`, {});
    pollTranscribe(p.id);
  })}, t ? 'Transcribe again' : 'Transcribe recording');
  return h('div', {style: 'margin-top:10px'}, button, note);
}
function pollTranscribe(id) {
  clearInterval(state.tpoll);
  const tick = guard(async () => {
    const s = await api('GET', `/api/projects/${id}/transcribe`);
    const note = $('#transcribeNote'), button = $('#transcribeBtn');
    if (button) button.disabled = s.status === 'running';
    if (s.status === 'running') { if (note) note.textContent = 'Working: ' + s.step + '. This can take a few minutes the first time.'; return; }
    clearInterval(state.tpoll);
    if (s.status === 'failed') { if (note) note.textContent = 'Transcription failed: ' + s.error; toast(s.error || 'Transcription failed', true); return; }
    if (s.status === 'done' && state.project?.id === id) { setProject(await api('GET', '/api/projects/' + id)); toast('Transcript ready'); }
  });
  state.tpoll = setInterval(tick, 2500);
  tick();
}

// ---- Brand intro and outro clips: uploaded once per brand and edition, added to every render ----
function brandClipsBox() {
  const box = h('details', {class: 'box'}, h('summary', {}, 'Brand intro and outro clips'));
  const body = h('div', {class: 'muted'}, 'Checking…');
  box.append(body);
  const draw = clips => {
    body.textContent = '';
    body.className = '';
    body.append(h('div', {class: 'muted'}, 'Upload each clip once (for example the avatar intro, 10–15 seconds, and a 5-second outro). Every video for that brand and edition then starts and ends with it. Clips keep their own sound. Up to 30 seconds each.'));
    for (const brand of state.meta.brands) for (const edition of state.meta.editions || ['MORNING', 'EVENING']) {
      const row = h('div', {class: 'row', style: 'margin-top:8px;align-items:flex-start'}, h('strong', {style: 'min-width:230px'}, `${brandName(brand)} · ${EDITION_NAMES[edition]}`));
      for (const slot of ['intro', 'outro']) {
        const clip = clips.find(c => c.brand === brand && c.edition === edition && c.slot === slot);
        const input = h('input', {type: 'file', accept: '.mp4,.webm,.mov', style: 'max-width:200px'});
        const base = `/api/brand-clips/${brand}/${edition}/${slot}`;
        row.append(h('div', {style: 'min-width:220px'}, h('div', {class: 'muted'}, slot === 'intro' ? 'Intro' : 'Outro'),
          clip ? h('video', {src: '/brand-clips/' + clip.file + '?v=' + encodeURIComponent(clip.updatedAt), controls: true, preload: 'metadata', style: 'width:200px;border-radius:6px'}) : h('div', {class: 'muted'}, 'None yet'),
          h('div', {class: 'row'}, input, h('button', {class: 'small', onclick: guard(async () => {
            const f = input.files[0];
            if (!f) throw new Error('Choose a clip first');
            toast('Uploading…');
            const r = await api('POST', `${base}?name=${encodeURIComponent(f.name)}`, undefined, {body: f, type: f.type});
            toast(`${slot === 'intro' ? 'Intro' : 'Outro'} saved (${Math.round(r.info.durationSec)}s${r.info.hasAudio ? '' : ', no sound'})`);
            draw(r.clips);
          })}, clip ? 'Replace' : 'Upload'),
          clip ? h('button', {class: 'small', onclick: guard(async () => { if (confirm('Remove this clip?')) draw((await api('DELETE', base)).clips); })}, 'Remove') : null)));
      }
      body.append(row);
    }
  };
  api('GET', '/api/brand-clips').then(r => draw(r.clips)).catch(e => { body.textContent = 'Brand clips unavailable: ' + e.message; });
  return box;
}

// ---- GPT Image (OpenAI): last-resort pictures, always labelled AI-generated ----
function gptKeyBox() {
  const box = h('details', {class: 'box'}, h('summary', {}, 'AI images (OpenAI GPT Image) – key'));
  const body = h('div', {class: 'muted'}, 'Checking…');
  box.append(body);
  const draw = info => {
    body.textContent = '';
    body.className = '';
    const model = h('input', {value: info.model, autocomplete: 'off', style: 'width:auto;min-width:160px'});
    if (info.keySaved) {
      body.append(h('div', {class: 'row'}, h('span', {}, 'OpenAI key: saved'),
        h('button', {class: 'small', onclick: guard(async () => { toast('Checking…'); toast((await api('POST', '/api/gpt-image/check')).message); })}, 'Check connection (free)'),
        h('button', {class: 'small', onclick: guard(async () => { if (confirm('Remove the saved OpenAI key from this computer?')) draw(await api('DELETE', '/api/gpt-image')); })}, 'Remove key')));
    } else {
      const key = h('input', {type: 'password', placeholder: 'Paste your OpenAI API key (starts sk-)', autocomplete: 'off', style: 'min-width:280px;width:auto;flex:1'});
      body.append(h('div', {class: 'row'}, h('span', {}, 'Key:'), key,
        h('button', {onclick: guard(async () => { draw(await api('PUT', '/api/gpt-image', {apiKey: key.value})); key.value = ''; toast('OpenAI key saved'); })}, 'Save key')));
    }
    body.append(h('div', {class: 'row'}, h('span', {}, 'Model:'), model,
      h('button', {class: 'small', onclick: guard(async () => { draw(await api('PUT', '/api/gpt-image', {model: model.value})); toast('Model saved'); })}, 'Save model')),
      h('div', {class: 'muted'}, 'Saved only on this computer. “Check connection” asks OpenAI whether the key and model work and generates nothing, so it costs nothing. Each generated picture is charged by OpenAI.'));
  };
  api('GET', '/api/gpt-image').then(info => { draw(info); box.open = !info.keySaved; }).catch(e => { body.textContent = 'AI image settings unavailable: ' + e.message; });
  return box;
}

function gptRow(p, scene) {
  let prompt = '', quality = 'medium';
  const button = h('button', {}, 'Generate AI image');
  button.addEventListener('click', guard(async () => {
    if (prompt.trim().length < 5) throw new Error('Describe the picture first');
    button.disabled = true;
    toast('Generating the AI image… this can take up to a minute');
    try { setProject(await api('POST', `/api/projects/${p.id}/scenes/${scene.id}/gpt-image`, {prompt, quality})); toast('AI image added'); }
    finally { button.disabled = false; }
  }));
  return h('div', {},
    h('div', {class: 'row', style: 'margin-top:8px'},
      h('input', {class: 'grow', placeholder: 'Last resort: describe an AI image (when Commons, stock and cards have nothing suitable)…', oninput: e => prompt = e.target.value}),
      select(['low', 'medium', 'high'], quality, v => quality = v, {style: 'width:auto', title: 'Higher quality costs more per picture'}, {low: 'Low quality', medium: 'Medium quality', high: 'High quality'}),
      button),
    p.storyType === 'present' || p.storyType === 'football' ? h('div', {class: 'muted'}, 'Shown on screen as AI-GENERATED ILLUSTRATION. Describe a scene or symbol, not a real person; the Studio also tells the generator not to draw identifiable people, logos or writing.') : null);
}
