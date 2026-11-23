// SPDX-License-Identifier: MIT
// Token Radar's local dashboard. It reads the data script written beside it by main.ts, so every
// number on screen is the number board.json carries. No fetch, no framework, no remote address.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var root = document.getElementById('board');
  var K = ['v', 'q', 'c', 'ch', 'r', 'w', 's', 'd', 'p'];
  var base = { v: 'board', q: '', c: 'all', ch: 'all', r: 'all', w: '0', s: 'implied', d: 'desc', p: '' };
  var S = Object.assign({}, base);
  var composing = false;

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function age(d) { return d === null || d === undefined ? 'unknown' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }
  function x(n) { return Number(n).toFixed(2); }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (z) { if (z) node.appendChild(z); });
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function tag(text, cls) { return el('span', { class: 'tag ' + (cls || '') }, text); }
  function cellSort(key, label) {
    return el('th', null, el('button', { 'data-act': 'sort', 'data-key': key }, label + (S.s === key ? (S.d === 'desc' ? ' ↓' : ' ↑') : '')));
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var out = Object.assign({}, base);
    h.split('&').forEach(function (bit) {
      if (!bit || bit.indexOf('=') < 0) return;
      var i = bit.indexOf('=');
      var k = bit.slice(0, i);
      if (K.indexOf(k) < 0) return;
      try { out[k] = decodeURIComponent(bit.slice(i + 1)); } catch (e) { /* ignore */ }
    });
    if (['board', 'live', 'method', 'detail'].indexOf(out.v) < 0) out.v = 'board';
    return out;
  }
  function writeHash() {
    var parts = K.filter(function (k) { return S[k] !== base[k]; }).map(function (k) {
      return k + '=' + encodeURIComponent(S[k]);
    });
    var next = parts.length ? '#' + parts.join('&') : '';
    var here = window.location.hash || (window.location.pathname + window.location.search);
    if (here !== next) {
      try { window.history.replaceState(null, '', next || (window.location.pathname + window.location.search)); }
      catch (e) { window.location.hash = next; }
    }
  }
  function go(patch) {
    S = Object.assign({}, S, patch);
    writeHash();
    render();
  }

  function head() {
    var brand = el('div', { class: 'brand' }, el('div', { class: 'mark' }),
      el('div', null, el('div', { class: 'brand-name', text: 'TOKEN RADAR / ' + DATA.model_version }),
        el('h1', { text: 'Which protocol is worth farming before it launches?' })));

    var meta = el('div', { class: 'top-meta' },
      el('span', null, 'SNAPSHOT ', el('b', { text: DATA.as_of })),
      el('span', null, 'FLOOR ', el('b', { text: usd(DATA.floor_usd) })),
      el('span', null, 'PEER MULTIPLE ', el('b', { text: x(DATA.peer_global) + 'x' })));

    var lede = el('div', { class: 'lede' },
      el('div', null,
        el('p', { text: 'A sealed DefiLlama snapshot is the only input. The board covers every watchlist protocol, then reaches below the floor for earlier candidates. Each implied value is this radar’s own claim, priced from traded peers, seven-day TVL flow and time tracked without a token — never a prediction that a token will be issued.' }),
        el('p', { class: 'mini', text: 'Data: ' + DATA.source + ' · Refreshed by rerunning main.ts against a newer snapshot; this page is offline.' })),
      el('div', { class: 'kpis' }, [
        [DATA.board_size, 'ranked pre-token'], [DATA.watchlist_size, 'watchlist covered'],
        [DATA.early_size, 'early below floor'], [DATA.live_size, 'traded comparables'],
      ].map(function (c) { return el('div', { class: 'kpi' }, el('b', { text: String(c[0]) }), el('span', { text: c[1] })); })));

    var tabs = el('div', { class: 'tabs', role: 'tablist' }, [['board', 'Board'], ['live', 'Traded comps'], ['method', 'Method']].map(function (t) {
      return el('button', { role: 'tab', 'aria-selected': S.v === t[0] ? 'true' : 'false', 'data-act': 'view', 'data-v': t[0] }, t[1]);
    }));
    return [el('div', { class: 'top' }, brand, meta), lede, tabs];
  }

  function options(values, selected, label) {
    return el('div', { class: 'field' }, el('label', { text: label }),
      el('select', { 'data-act': 'filter', 'data-k': values.k }, [el('option', { value: 'all', text: values.label0 })].concat(values.items.map(function (v) {
        return el('option', { value: v, text: v, selected: selected === v ? 'selected' : null });
      }))));
  }
  function filtered() {
    var q = S.q.toLowerCase();
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Unclassified'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    var rows = DATA.rows.filter(function (r) {
      if (S.c !== 'all' && (r.category || 'Unclassified') !== S.c) return false;
      if (S.ch !== 'all' && r.chains.indexOf(S.ch) < 0) return false;
      if (S.r !== 'all' && r.risk_tier !== S.r) return false;
      if (S.w === '1' && !r.on_watchlist) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = S.s;
    rows.sort(function (a, b) {
      var av = key === 'rank' ? a.rank : key === 'tvl' ? a.tvl_usd : key === 'growth' ? (a.change_7d === null ? -Infinity : a.change_7d) : key === 'age' ? (a.age_days === null ? -1 : a.age_days) : key === 'risk' ? a.risk_flags.length : a.implied_value_usd;
      var bv = key === 'rank' ? b.rank : key === 'tvl' ? b.tvl_usd : key === 'growth' ? (b.change_7d === null ? -Infinity : b.change_7d) : key === 'age' ? (b.age_days === null ? -1 : b.age_days) : key === 'risk' ? b.risk_flags.length : b.implied_value_usd;
      return (av - bv) * (S.d === 'desc' ? -1 : 1) || a.rank - b.rank;
    });
    return { rows: rows, cats: cats, chains: chains };
  }
  function controls(result) {
    var search = el('div', { class: 'field' }, el('label', { text: 'Search' }),
      el('input', { type: 'search', 'data-act': 'input', 'data-composition': '1', 'data-k': 'q', value: S.q, placeholder: 'Name, slug, chain or category' }));
    var cat = options({ k: 'c', label0: 'All categories', items: result.cats }, S.c, 'Category');
    var chain = options({ k: 'ch', label0: 'All chains', items: result.chains }, S.ch, 'Chain');
    var risk = options({ k: 'r', label0: 'All risk tiers', items: ['low', 'medium', 'high'] }, S.r, 'Risk');
    var sort = el('div', { class: 'field' }, el('label', { text: 'Sort by' }),
      el('select', { 'data-act': 'filter', 'data-k': 's' }, [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7d change'], ['age', 'Time tracked'], ['risk', 'Risk flags'], ['rank', 'Board rank']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: S.s === o[0] ? 'selected' : null });
      })));
    var watch = el('div', { class: 'field check' },
      el('input', { type: 'checkbox', id: 'watch-only', 'data-act': 'check', 'data-k': 'w', checked: S.w === '1' ? 'checked' : null }),
      el('label', { for: 'watch-only', text: 'Watchlist only' }));
    return el('div', { class: 'controls' }, search, cat, chain, risk, sort,
      el('button', { class: 'btn', 'data-act': 'dir' }, S.d === 'desc' ? 'Descending ↓' : 'Ascending ↑'), watch,
      el('button', { class: 'btn', 'data-act': 'reset' }, 'Reset'),
      el('div', { class: 'count', text: result.rows.length + ' of ' + DATA.rows.length + ' rows' }));
  }
  function table(rows) {
    if (rows.length === 0) return el('div', { class: 'panel' }, el('div', { class: 'empty', text: 'No protocol matches this filter.' }));
    var body = el('tbody');
    rows.forEach(function (r) {
      body.appendChild(el('tr', { 'data-act': 'open', 'data-slug': r.slug },
        el('td', { class: 'rank mono', text: '#' + r.rank }),
        el('td', null, el('div', { class: 'pname', text: r.name }),
          el('div', { class: 'sub', text: r.slug + ' · ' + (r.category || 'Unclassified') })),
        el('td', null, el('div', { class: 'spread' }, r.chains.slice(0, 2).map(function (c) { return tag(c); }))),
        el('td', { class: 'num', text: usd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: pct(r.change_7d) }),
        el('td', { class: 'num', text: age(r.age_days) }),
        el('td', { class: 'num value', text: usd(r.implied_value_usd) }),
        el('td', { class: 'num mini', text: x(r.peer_ratio) + 'x · ' + x(r.growth_mult) + ' · ' + x(r.tenure_mult) }),
        el('td', null, el('div', { class: 'spread' }, tag(r.risk_tier, r.risk_tier), r.on_watchlist ? tag('watch', 'watch') : tag('early', 'early')))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null, el('thead', null, el('tr', null,
        el('th', { text: '#' }), el('th', { text: 'Protocol' }), el('th', { text: 'Chains' }),
        cellSort('tvl', 'TVL'), cellSort('growth', '7d'), cellSort('age', 'Age'),
        cellSort('implied', 'Implied value'), el('th', { text: 'Peers · G · T' }), el('th', { text: 'Risk' }))), body)));
  }
  function detail(row) {
    if (!row) return el('div', { class: 'panel' }, el('div', { class: 'empty', text: 'Unknown protocol.' }));
    var box = function (title, body) { return el('div', { class: 'box' }, el('h3', { text: title }), body); };
    return el('div', { class: 'detail' },
      el('button', { class: 'back', 'data-act': 'back', text: '← Back to board' }),
      el('div', { class: 'detail-head' },
        el('div', null, el('div', { class: 'brand-name', text: 'RANK #' + row.rank + ' · ' + DATA.model_version }),
          el('h1', { text: row.name }),
          el('p', { class: 'lede2', text: row.slug + ' · ' + (row.category || 'Unclassified') + ' · ' + row.chains.join(', ') })),
        el('div', { class: 'hero-value' }, el('b', { text: usd(row.implied_value_usd) }), el('span', { text: 'implied launch value' }))),
      el('div', { class: 'grid4' }, [
        ['TVL', usd(row.tvl_usd)], ['7d TVL change', pct(row.change_7d)],
        ['Tracked for', age(row.age_days)], ['Peer cap/TVL', x(row.peer_ratio) + 'x'],
      ].map(function (p) { return el('div', { class: 'kpi' }, el('b', { text: p[1] }), el('span', { text: p[0] })); })),
      el('div', { class: 'grid2' },
        box('How the value is built', el('div', { class: 'formula' },
          el('div', null, 'TVL ', el('em', { text: usd(row.tvl_usd) }), ' × peer ', el('em', { text: x(row.peer_ratio) + 'x' })),
          el('div', null, '× growth ', el('em', { text: x(row.growth_mult) }), ' (7d ' + pct(row.change_7d) + ')'),
          el('div', null, '× tenure ', el('em', { text: x(row.tenure_mult) }), ' (' + age(row.age_days) + ' without a token)'),
          el('div', null, '× risk ', el('em', { text: x(row.risk_mult) }), ' (' + row.risk_tier + ' risk)'),
          el('div', null, '× data confidence ', el('em', { text: x(row.data_mult) }), row.data_mult < 1 ? ' (missing 7d figure or start date)' : ''),
          el('div', null, '= ', el('em', { text: usd(row.implied_value_usd) })))),
        box('Risk read', el('div', null,
          el('p', { class: 'mini', text: row.risk_flags.length ? 'Flags: ' + row.risk_flags.join(' · ') : 'No flags from this record.' }),
          el('p', { class: 'mini', text: row.on_watchlist ? 'On the house watchlist: at or above the floor, no token recorded, not a wrapped or staked product of a trading token.' : 'Early board: below the floor or outside the watchlist. The floor is not a ceiling.' }),
          el('p', { class: 'note', text: 'A missing token record is not proof that no token exists. Verify on the protocol’s own pages before acting.' })))),
      el('div', { class: 'box', style: 'margin-top:18px' },
        el('h3', { text: 'Farm plan — six concrete steps' }),
        el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
          var parts = s.split(' Cost: ');
          return el('li', null, el('b', { text: parts[0] }), el('small', { text: parts[1] ? 'Cost: ' + parts[1] : '' }));
        }))));
  }
  function traded() {
    var body = el('tbody');
    DATA.live.forEach(function (r) {
      body.appendChild(el('tr', null,
        el('td', { class: 'pname', text: r.name }), el('td', { text: r.category || 'Unclassified' }),
        el('td', { class: 'num', text: usd(r.tvl_usd) }), el('td', { class: 'num value', text: usd(r.mcap_usd) }),
        el('td', { class: 'num', text: x(r.mcap_tvl) + 'x' }), el('td', { class: 'num', text: pct(r.change_7d) })));
    });
    return el('div', { class: 'panel standalone' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
        el('th', { text: 'TVL' }), el('th', { text: 'Market cap' }), el('th', { text: 'Cap/TVL' }), el('th', { text: '7d' }))), body)));
  }
  function method() {
    var m = DATA.model;
    return el('div', { class: 'method' },
      el('section', null, el('h2', { text: 'What this radar claims' }),
        el('p', { text: 'It answers one question: if a protocol’s record stayed as it is, what would a launch be worth, and what should a reader do about it? It does not predict whether or when a token is issued. Every implied value is the radar’s own estimate, not a make.fun or DefiLlama claim.' })),
      el('section', null, el('h3', { text: 'The value model' }),
        el('p', { class: 'formula', text: 'TVL × category peer cap/TVL × (1 + 0.45 × clamped 7d%) × (0.70 + 0.30 × log tenure) × risk haircut × data confidence' }),
        el('p', { text: 'Peer cap/TVL is the median market-cap-to-TVL ratio of traded protocols in the same category, winsorised at ' + x(m.max_peer_ratio) + 'x and shrunk once toward the global median with weight ' + m.shrink_n + '. The global median uses every traded protocol in the snapshot, not only the ' + DATA.live_size + ' in the Traded comps tab. Growth is clamped to ' + m.growth_floor + '%–' + m.growth_cap + '%. Tenure runs from the day DefiLlama began tracking the protocol to the snapshot date, capped at ' + m.tenure_days + ' days, ' + m.unknown_age_days + ' days when the start date is missing. Risk flags include derivative categories, missing data, TVL outflow, hot flows and many chains; each tier applies a haircut, and missing data applies a ' + m.missing_penalty + ' confidence factor. No protocol name is special-cased.' })),
      el('section', null, el('h3', { text: 'Data and refresh' }),
        el('p', { text: 'Input: ' + DATA.source + '. Sealed snapshot as of ' + DATA.as_of + ', watchlist floor ' + usd(DATA.floor_usd) + '. The page makes no network request: rerun main.ts against a new snapshot to refresh board.json, data.js, the screenshots and this page. Two runs on the same snapshot write identical bytes.' })),
      el('section', null, el('h3', { text: 'How to read the board' }),
        el('p', { text: 'Rank is the model’s claim, not DefiLlama’s. Every watchlist protocol is present; lower-TVL pre-token protocols extend the board below the floor. Traded protocols are shown separately as comparables and are never ranked as pre-token candidates. Sort any column, filter by category, chain, risk or watchlist, and open a row for its formula, flags and farm plan.' })));
  }
  function foot() {
    return el('div', { class: 'foot' },
      el('span', { text: 'Token Radar ' + DATA.model_version + ' · implied values are this dashboard’s own estimates, not investment advice.' }),
      el('span', { text: 'Offline dashboard · ' + DATA.board_size + ' ranked rows · ' + DATA.live_size + ' traded comparables · snapshot ' + DATA.as_of }));
  }
  function render() {
    S = readHash();
    root.setAttribute('aria-busy', 'false');
    root.textContent = '';
    var shell = el('div', { class: 'shell' });
    head().forEach(function (n) { shell.appendChild(n); });
    if (S.v === 'method') shell.appendChild(method());
    else if (S.v === 'live') shell.appendChild(traded());
    else if (S.v === 'detail') shell.appendChild(detail(DATA.rows.filter(function (r) { return r.slug === S.p; })[0]));
    else {
      var result = filtered();
      shell.appendChild(controls(result));
      shell.appendChild(table(result.rows));
    }
    shell.appendChild(foot());
    root.appendChild(shell);
    bind();
  }
  function bind() {
    root.querySelectorAll('[data-composition]').forEach(function (node) {
      node.addEventListener('compositionstart', function () { composing = true; });
      node.addEventListener('compositionend', function () { composing = false; node.dispatchEvent(new Event('input')); });
    });
    root.querySelectorAll('[data-act]').forEach(function (node) {
      var act = node.getAttribute('data-act');
      if (act === 'view') node.addEventListener('click', function () { go({ v: node.getAttribute('data-v') }); });
      else if (act === 'sort') node.addEventListener('click', function () {
        var key = node.getAttribute('data-key');
        go(S.s === key ? { d: S.d === 'desc' ? 'asc' : 'desc' } : { s: key, d: 'desc' });
      });
      else if (act === 'input') node.addEventListener('input', function () {
        if (composing) return;
        var caret = node.selectionStart;
        go({ q: node.value, v: 'board' });
        var fresh = root.querySelector('[data-act="input"]');
        if (fresh) { fresh.focus(); try { fresh.setSelectionRange(caret, caret); } catch (e) { /* unsupported */ } }
      });
      else if (act === 'check') node.addEventListener('change', function () { go({ w: node.checked ? '1' : '0' }); });
      else if (act === 'dir') node.addEventListener('click', function () { go({ d: S.d === 'desc' ? 'asc' : 'desc' }); });
      else if (act === 'reset') node.addEventListener('click', function () { S = Object.assign({}, base); writeHash(); render(); });
      else if (act === 'open') node.addEventListener('click', function () { go({ v: 'detail', p: node.getAttribute('data-slug') }); });
      else if (act === 'back') node.addEventListener('click', function () { go({ v: 'board', p: '' }); });
    });
    var selects = root.querySelectorAll('[data-act="filter"]');
    selects.forEach(function (select) {
      select.addEventListener('change', function () {
        var patch = {}; patch[select.getAttribute('data-k')] = select.value; go(patch);
      });
    });
  }
  window.addEventListener('hashchange', render);
  render();
})();
