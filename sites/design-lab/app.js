(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const grid = $('capture-grid');
  const dialog = $('image-dialog');
  const categories = { body: 'BODY STYLE', finish: 'PAINT FINISH', module: 'CAR MODULE', garage: 'GARAGE', detail: 'DESIGN DETAIL' };
  const state = { items: [], visible: [], category: 'all', search: '', lighting: 'all', scope: 'palettes', combo: 'all', body: 'all', finish: 'all', limit: 24, active: -1, opener: null };
  const inScope = item => state.scope === 'all' || (state.scope === 'current' ? item.geometryOnly : state.scope === 'latest' ? item.lane === 'Native CI capture' : state.scope === 'palettes' ? item.lane === 'Current PR combinations' : !item.geometryOnly);
  const finishes = item => [...new Set([item.design?.finish, ...['nose','pod','cover','wing'].map(zone => item.design?.[zone+'Finish']), ...String(item.finish || '').split(' / ').map(value => value.split(' ')[0])].filter(value => value && /^[a-z]+$/.test(value) && !['factory','inherit'].includes(value)))];
  const categoryLabel = category => categories[category] || categories.module;
  const conceptNames = {rift: 'Auralis', keel: 'Cevora', delta: 'Vantrel', serpent: 'Orynth'};
  // Keep canonical deploy names intact; historical records retain their own authored titles.
  const renameConceptText = value => value;
  const sourceLabel = item => item.lane === 'Native CI capture' ? 'PR #3231 · native CI capture' : item.lane === 'Current PR combinations' ? 'PR #3172 · mixed finishes' : item.geometryOnly ? 'Deploy mesh · CPU preview' : item.status === 'archive' ? 'Historical capture · not current deploy' : item.lane === 'Current PR combinations' ? 'PR #3172 · mixed finishes' : item.lane === 'Finish inspection' ? 'Finish study · native garage' : item.lane === 'Reference fidelity' ? 'Refined mesh · native garage' : item.lane === 'Full meshes' ? 'Full mesh · native garage' : item.lane === 'Garage reference' ? 'Native garage concept' : item.lane === 'Angle concepts' ? 'Four-angle concept' : item.lane === 'Reference camera' ? 'Reference-aligned study' : item.lane === 'Reference shaping' ? 'Reference-shaped geometry' : item.lane === 'Round 2' ? 'New geometry preview' : 'Merged draft preview';
  const lightingLabel = value => value === 'not-recorded' ? 'Not recorded' : String(value).replace(/[-_]+/g, ' ').replace(/^./, letter => letter.toUpperCase());
  const safeSource = value => {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, window.location.href);
      return url.origin === window.location.origin && /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function showItem(item, opener) {
    state.active = state.visible.indexOf(item);
    if (state.active < 0) state.active = state.items.indexOf(item);
    state.opener = opener;
    renderDialog(item);
    dialog.showModal();
  }
  function renderDialog(item) {
    $('dialog-title').textContent = renameConceptText(item.title);
    $('dialog-meta').textContent = [categoryLabel(item.category), item.lane, `${lightingLabel(item.lighting)} light`, sourceLabel(item)].filter(Boolean).join(' / ');
    $('dialog-image').src = item.src;
    $('dialog-image').alt = renameConceptText(item.title);
    $('dialog-description').textContent = (renameConceptText(item.description) || '') + (item.completeTriangles && !item.geometryOnly ? ` Complete car: ${item.completeTriangles.toLocaleString()} triangles, including active flaps (${item.triangles.toLocaleString()} in the static body build).` : '');
    $('dialog-original').href = item.src;
    $('dialog-receipt').textContent = JSON.stringify({sourceRevision:item.sourceRevision || 'not recorded',backend:item.backend || 'not recorded',frame:item.frame || item.camera || item.cameraPreset || 'not recorded',design:item.design || {},readiness:item.readiness,sha256:item.sha256,completeTriangles:item.completeTriangles},null,2);
    $('dialog-zones').replaceChildren();
    for (const [zone,label] of [['nose','Body / nose'],['pod','Sidepods'],['cover','Engine cover'],['wing','Wings']]) {
      const color=item.design?.[zone],finish=item.design?.[zone+'Finish'] || item.design?.finish;
      if (!color && !finish) continue;
      const row=element('div','zone-recipe');
      if (/^#[a-f\d]{6}$/i.test(color || '')) { const swatch=element('span','zone-color');swatch.style.backgroundColor=color;swatch.setAttribute('aria-hidden','true');row.append(swatch); }
      row.append(element('span','',label),element('strong','',[color,finish].filter(Boolean).join(' · ')));$('dialog-zones').append(row);
    }
    const list = state.visible.includes(item) ? state.visible : state.items;
    state.active = list.indexOf(item);
    state.dialogList = list;
    $('dialog-counter').textContent = `${String(state.active + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
    $('dialog-prev').disabled = state.active <= 0;
    $('dialog-next').disabled = state.active >= list.length - 1;
  }
  function stepDialog(direction) {
    const item = state.dialogList?.[state.active + direction];
    if (item) renderDialog(item);
  }
  function render() {
    const scoped=state.items.filter(inScope);
    for(const [id,field,label,values] of [
      ['body-filter','body','All bodies',scoped.map(i=>i.body)],
      ['combo-filter','combo','All palettes',scoped.map(i=>i.combo)],
      ['finish-filter','finish','All finishes',scoped.filter(i=>!i.geometryOnly).flatMap(finishes)],
      ['lighting-filter','lighting','All lighting',scoped.map(i=>i.lighting)]
    ]) {
      const options=[...new Set(values.filter(Boolean))].sort();
      if(state[field]!=='all'&&!options.includes(state[field]))state[field]='all';
      const select=$(id);select.replaceChildren(element('option','',label));select.firstElementChild.value='all';
      for(const value of options){const option=element('option','',lightingLabel(value));option.value=value;select.append(option);}select.value=state[field];
    }
    ['all', ...Object.keys(categories)].forEach(category => $('count-' + category).textContent = state.items.filter(item => inScope(item) && (category === 'all' || item.category === category)).length);
    const query = state.search.trim().toLowerCase();
    state.visible = state.items.filter(item =>
      inScope(item) &&
      (state.finish === 'all' || finishes(item).includes(state.finish)) &&
      (state.combo === 'all' || item.combo === state.combo) &&
      (state.body === 'all' || item.body === state.body) &&
      (state.category === 'all' || item.category === state.category) &&
      (state.lighting === 'all' || item.lighting === state.lighting) &&
      (!query || [item.title, renameConceptText(item.title), item.description, renameConceptText(item.description), item.finish, item.module, item.partId, item.body, item.geometryOnly ? null : conceptNames[item.body], item.lane, item.lighting].filter(Boolean).join(' ').toLowerCase().includes(query))
    );
    grid.replaceChildren();
    state.visible.slice(0,state.limit).forEach((item, index) => {
      const card = element('article', 'capture-card');
      const imageButton = element('button', 'capture-image');
      imageButton.type = 'button';
      imageButton.setAttribute('aria-label', `Enlarge ${renameConceptText(item.title)}`);
      const image = element('img');
      image.src = item.src;
      image.alt = renameConceptText(item.title);
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => imageButton.classList.add('missing'), { once: true });
      const missing = element('span', 'image-missing', 'Image unavailable');
      const number = element('span', 'card-index', String(index + 1).padStart(2, '0'));
      number.setAttribute('aria-hidden', 'true');
      const arrow = element('span', 'card-enlarge', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      imageButton.append(image, missing, number, arrow);
      imageButton.addEventListener('click', () => showItem(item, imageButton));
      const head = element('div', 'card-head');
      head.append(element('h3', '', renameConceptText(item.title)), element('span', 'card-category', categoryLabel(item.category)));
      const context = element('div', 'card-context');
      if (item.lane) context.append(element('span', 'context-tag', `Lane ${item.lane}`));
      context.append(element('span', 'context-tag lighting-tag', `Light · ${lightingLabel(item.lighting)}`));
      const footer = element('div', 'card-footer');
      footer.append(element('span', `source-dot ${item.status === 'archive' ? 'archive' : ''}`), element('span', '', sourceLabel(item)), element('span', 'material', item.finish || item.module || 'Apex 26'));
      card.append(imageButton, head, context);
      if (item.description) card.append(element('p', 'card-description', renameConceptText(item.description)));
      card.append(footer);
      grid.append(card);
    });
    $('empty-state').hidden = state.visible.length > 0;
    $('results-summary').textContent = `Showing ${Math.min(state.limit,state.visible.length)} of ${state.visible.length} visuals${state.search ? ` matching “${state.search}”` : ''}`;
    $('load-more').hidden = state.visible.length <= state.limit;
    document.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed',String(state.combo === button.dataset.palette)));
    document.querySelectorAll('.filter-tab').forEach(button => {
      const active = button.dataset.filter === state.category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled=button.dataset.filter!=='all'&&!scoped.some(item=>item.category===button.dataset.filter);
    });
  }
  function formatDate(raw) {
    if (!raw) return 'Not recorded';
    const date = new Date(raw);
    return Number.isNaN(date.valueOf()) ? String(raw) : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' }).format(date) + ' PT';
  }
  async function load() {
    $('load-error').hidden = true;
    $('empty-state').hidden = true;
    grid.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('captures.json');
      if (!response.ok) throw new Error('Capture record unavailable');
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('Invalid capture record');
      state.items = data.items.flatMap((raw, index) => {
        const src = safeSource(raw.src);
        if (!src || !raw.title) return [];
        return [{ ...raw, src, id: raw.id || `capture-${index}`, status: raw.status === 'archive' ? 'archive' : 'current',
          category: Object.hasOwn(categories, raw.category) ? raw.category : 'module',
          lane: typeof raw.lane === 'string' ? raw.lane.trim() : '',
          lighting: typeof raw.lighting === 'string' && raw.lighting.trim() ? raw.lighting.trim() : 'not-recorded' }];
      });
      const source = data.source || {};
      $('source-revision').textContent = source.revision ? String(source.revision).slice(0, 12) : 'Not recorded';
      $('source-revision').title = source.revision || '';
      $('source-date').textContent = formatDate(source.capturedAt);
      $('source-backend').textContent = '373 native screenshots / 117 CPU previews';
      $('source-note').textContent = 'Native screenshots retain their individual branch revisions. The geometry catalog is pinned to deploy snapshot '+String(source.revision || '').slice(0,12)+'. The four latest captures are from tools PR #3231. These sources are separate; appearance and triangle counts belong to the recorded recipe.';
      ['all', ...Object.keys(categories)].forEach(category => $('count-' + category).textContent = state.items.filter(item => (state.scope === 'all' || item.status === 'current') && (category === 'all' || item.category === category)).length);
      const branches = Array.isArray(source.branches) ? source.branches.filter(branch => branch && typeof branch.branch === 'string' && typeof branch.sha === 'string') : [];
      $('branch-details').hidden = !branches.length;
      $('branch-summary').textContent = `Included branch heads (${branches.length})`;
      $('branch-list').replaceChildren();
      for (const branch of branches) {
        const row = element('li');
        const sha = element('code', 'branch-sha', branch.sha.slice(0, 12));
        sha.title = branch.sha;
        row.append(element('span', 'branch-name', branch.branch), sha);
        $('branch-list').append(row);
      }
      const featuredId = 'combo-auralis-garnet-gold-front';
      const hero = state.items.find(item => item.id === featuredId) || state.items.find(item => item.id === 'car-hero') || state.items.find(item => item.category === 'finish' && item.status === 'current') || state.items.find(item => item.status === 'current') || state.items[0];
      if (hero) {
        const image = $('hero-image');
        image.src = hero.src;
        image.alt = hero.title;
        image.hidden = false;
        $('hero-placeholder').hidden = true;
        $('hero-title').textContent = hero.title;
        $('hero-description').textContent = hero.description || 'A closer look at the Apex 26 car collection.';
        $('hero-status').textContent = sourceLabel(hero).toUpperCase();
        $('hero-status').className = `status-pill ${hero.status}`;
        $('hero-open').disabled = false;
        $('hero-open').onclick = () => showItem(hero, $('hero-open'));
      }
      render();
    } catch {
      grid.replaceChildren();
      $('load-error').hidden = false;
      $('results-summary').textContent = 'Capture collection unavailable';
    } finally {
      grid.setAttribute('aria-busy', 'false');
    }
  }
  function refresh() { state.limit=24;render(); }
  function reset(scope='palettes') {
    Object.assign(state,{category:'all',search:'',lighting:'all',scope,combo:'all',body:'all',finish:'all'});
    for(const [id,value] of [['search',''],['lighting-filter','all'],['review-scope',scope],['combo-filter','all'],['body-filter','all'],['finish-filter','all']]) $(id).value=value;
    refresh();
  }
  document.querySelectorAll('.filter-tab').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.filter; refresh(); }));
  $('search').addEventListener('input', event => { state.search = event.target.value; refresh(); });
  $('lighting-filter').addEventListener('change', event => { state.lighting = event.target.value; refresh(); });
  $('review-scope').addEventListener('change', event => reset(event.target.value));
  for (const [id, field] of [['combo-filter', 'combo'], ['body-filter', 'body'], ['finish-filter','finish']]) $(id).addEventListener('change', event => { state[field] = event.target.value; refresh(); });
  $('reset-filters').addEventListener('click', () => reset());
  $('clear-filters').addEventListener('click', () => reset());
  $('load-more').addEventListener('click', () => {
    const nextIndex=state.limit;state.limit+=24;render();
    grid.children[nextIndex]?.querySelector('button')?.focus();
  });
  $('retry-load').addEventListener('click', load);
  $('show-new-shapes').addEventListener('click', () => reset());
  document.addEventListener('click', event => {
    const palette=event.target.closest?.('[data-palette]'),scope=event.target.closest?.('[data-gallery-scope]');
    if(palette){reset();state.combo=palette.dataset.palette;$('combo-filter').value=state.combo;refresh();return;}
    if(scope){reset(scope.dataset.galleryScope);return;}
    const link = event.target.closest?.('[data-review-body], [data-review-part]');
    if (!link) return;
    event.preventDefault();reset('current');
    state.body = link.dataset.reviewBody || 'all'; state.search = link.dataset.reviewPart || '';
    $('review-scope').value = 'current'; $('combo-filter').value = 'all'; $('lighting-filter').value = 'all'; $('body-filter').value = state.body; $('search').value = state.search;
    render(); window.location.hash = 'library';
  });
  $('dialog-close').addEventListener('click', () => dialog.close());
  $('dialog-prev').addEventListener('click', () => stepDialog(-1));
  $('dialog-next').addEventListener('click', () => stepDialog(1));
  dialog.addEventListener('close', () => state.opener?.focus());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  document.addEventListener('keydown', event => {
    if (dialog.open) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); stepDialog(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); stepDialog(1); }
    } else if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault(); $('search').focus();
    }
  });
  load();
})();
