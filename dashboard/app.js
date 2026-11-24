// The radar's page: renders window.RADAR (written beside this file by main.ts) as a sortable,
// filterable board, a detail view per protocol and the live-token set. No fetch, no network.
(function () {
  'use strict';

  var D = window.RADAR || { rows: [], live: [], model: {}, as_of: '', source: '' };
  var money = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  };
  var pct = function (v) { return v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + (Math.round(v * 10) / 10) + '%'; };
  var cls = function (v) { return v === null || v === undefined ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };

  // ---- the farm plan, derived from the row's own record ------------------------------
  function capital(tvl) { return tvl >= 1e9 ? 250 : tvl >= 2.5e8 ? 150 : tvl >= 5e7 ? 100 : 50; }
  function holdDays(age) { return age === null ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30; }
  function action(r, cap, chain) {
    var c = (r.category || '').toLowerCase(), n = r.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return 'Deposit $' + cap + ' of USDC into ' + n + "'s lending market on " + chain + ', then borrow a small amount against it to make the account active.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('exchange') >= 0)
      return "Add $" + cap + ' of USDC and the chain’s native asset to ' + n + "'s busiest pool on " + chain + ', and stake the pool tokens it gives you.';
    if (c.indexOf('bridge') >= 0)
      return 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + n + ', then supply the bridged funds in the app you land in.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0)
      return 'Stake $' + cap + ' of the chain’s staking asset through ' + n + ' on ' + chain + ' and keep the receipt token in the wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0)
      return 'Deposit $' + cap + ' of USDC as margin on ' + n + ' and open one small position so the account shows trading activity.';
    if (c.indexOf('prediction') >= 0)
      return 'Fund the wallet with $' + cap + ' of USDC on ' + chain + ' and take one position in ' + n + "'s busiest market.";
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0)
      return 'Deposit $' + cap + ' of USDC into a ' + n + ' vault on ' + chain + ' and leave the shares in the wallet.';
    if (c.indexOf('stable') >= 0)
      return 'Mint or deposit $' + cap + ' of the stable asset through ' + n + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('rwa') >= 0)
      return 'Buy $' + cap + ' of the protocol’s yield asset on ' + chain + ' through ' + n + ' and hold it for one full cycle.';
    if (c.indexOf('insurance') >= 0)
      return 'Buy $' + cap + ' of cover from ' + n + ' on ' + chain + ' and keep the policy until its term ends.';
    return 'Deposit $' + cap + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open through two weekly snapshots.';
  }
  function farmSteps(r) {
    var chain = r.chains && r.chains.length ? r.chains[0] : 'its own chain';
    var cap = capital(r.tvl_usd), gas = cap >= 150 ? 8 : 4, hold = holdDays(r.age_days);
    var second = r.chains && r.chains[1];
    return [
      { t: 'Set up a wallet that holds only what you plan to farm, fund it with $' + cap + ' of USDC on ' + chain + ', and keep its seed phrase written down offline.', c: 'under $3 of gas for the first transaction', d: 'about 10 minutes' },
      { t: action(r, cap, chain), c: '$' + cap + ' of capital plus about $' + gas + ' of gas', d: '15 to 20 minutes' },
      { t: 'Repeat one qualifying action every week for ' + hold + ' days — a deposit, a borrow, a swap or a vote — so the protocol sees the wallet active in more than one snapshot.', c: 'about $2 of gas a week', d: '10 minutes a week' },
      second
        ? { t: 'Use the same wallet on ' + second + ' as well, since ' + r.name + ' counts both chains and cross-chain activity is what most farms weigh.', c: 'about $' + gas + ' of gas on the second chain', d: 'once, then 5 minutes a week' }
        : { t: 'Keep using the same wallet rather than rotating, because ' + r.name + ' counts the wallet’s history and a fresh one starts from zero.', c: 'nothing beyond the weekly gas', d: 'ongoing' },
      { t: 'Hold the whole position for at least ' + hold + ' days, then check ' + r.name + '’s own points or rewards page before withdrawing and claim only through the link it publishes.', c: 'the $' + cap + ' stays in the position while it compounds', d: hold + ' days' },
      { t: 'Record the wallet address, the opening date, every transaction hash and the claimed amounts in a farm log, so the position can be repeated or unwound without guessing.', c: 'nothing but the log', d: '10 minutes at the end' }
    ];
  }

  // ---- state -------------------------------------------------------------------------
  var state = { q: '', cat: '', chain: '', sort: 'rank', floor: 0, view: 'board', open: null };
  var el = function (id) { return document.getElementById(id); };

  function fillSelects() {
    var cats = {}, chains = {};
    D.rows.forEach(function (r) {
      if (r.category) cats[r.category] = 1;
      (r.chains || []).forEach(function (c) { chains[c] = 1; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; el('cat').appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; el('chain').appendChild(o);
    });
  }

  function strip() {
    var rows = D.rows;
    var totalTvl = rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
    var values = rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var med = values.length ? values[Math.floor(values.length / 2)] : 0;
    var growing = rows.filter(function (r) { return r.change_7d !== null && r.change_7d > 0; }).length;
    el('strip').innerHTML = [
      ['Protocols ranked', String(rows.length)],
      ['On the house watchlist', String(D.watchlist_size)],
      ['Found below the floor', String(D.early_size)],
      ['Median implied value', money(med)],
      ['Combined TVL', money(totalTvl)],
      ['Growing this week', growing + ' of ' + rows.length]
    ].map(function (x) { return '<div class="stat"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('');
  }

  function filtered() {
    var q = state.q.toLowerCase();
    return D.rows.filter(function (r) {
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.floor) return false;
      if (!q) return true;
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) {
      var k = state.sort;
      if (k === 'name') return a.name.localeCompare(b.name);
      if (k === 'rank') return a.rank - b.rank;
      var av = a[k], bv = b[k];
      if (av === null || av === undefined) av = -Infinity;
      if (bv === null || bv === undefined) bv = -Infinity;
      return bv - av;
    });
  }

  function chainsHtml(r) {
    return '<div class="chains">' + (r.chains || []).slice(0, 4).map(function (c) { return '<span class="chain">' + esc(c) + '</span>'; }).join('') +
      ((r.chains || []).length > 4 ? '<span class="chain">+' + (r.chains.length - 4) + '</span>' : '') + '</div>';
  }

  function renderBoard() {
    var host = el('board');
    if (state.view === 'live') return renderLive(host);
    if (state.view === 'model') return renderModel(host);
    var rows = filtered();
    if (!rows.length) { host.innerHTML = '<div class="empty">No protocol matches these filters.</div>'; return; }
    var body = rows.slice(0, 400).map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.open === r.slug ? ' class="is-open"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + (r.category ? '<span class="pill">' + esc(r.category) + '</span>' : '<span class="flat">—</span>') + '</td>' +
        '<td>' + chainsHtml(r) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days === null ? '—' : Math.round(r.age_days) + 'd') + '</td>' +
        '<td class="num value">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num mult">' + r.growth_multiplier.toFixed(2) + '×</td>' +
        '</tr>';
    }).join('');
    host.innerHTML = '<div class="board"><table><thead><tr>' +
      '<th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th>' +
      '<th class="num">7-day</th><th class="num">Age</th><th class="num">Implied value</th><th class="num">Growth</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="sub" style="padding:10px 4px 0">' + rows.length + ' protocols' + (rows.length > 400 ? ' (first 400 shown)' : '') + ' · click a row for its farm plan</p>';
    Array.prototype.forEach.call(host.querySelectorAll('tbody tr'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function renderLive(host) {
    var rows = (D.live || []).map(function (r) {
      return '<tr><td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + (r.category ? '<span class="pill">' + esc(r.category) + '</span>' : '<span class="flat">—</span>') + '</td>' +
        '<td>' + chainsHtml(r) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num value">' + money(r.mcap_usd === null ? 0 : r.mcap_usd) + '</td>' +
        '<td class="num ' + cls(r.change_7d) + '">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
    host.innerHTML = '<div class="board"><table><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">7-day</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="sub" style="padding:10px 4px 0">Tokens that already trade, shown for contrast: the board above ranks the protocols that have not issued one.</p>';
  }

  function renderModel(host) {
    var m = D.model || {};
    host.innerHTML = '<div class="board" style="padding:20px 22px;max-width:820px">' +
      '<h2 style="margin:0 0 6px">The value model · ' + esc(D.model_version || '') + '</h2>' +
      '<p class="modelnote">Every row runs through the same function. No protocol name is special-cased, and nothing outside the snapshot is read.</p>' +
      '<div class="formula">implied = tvl × ' + m.base_multiple + ' × growthMult × reachMult × maturityMult</div>' +
      '<dl class="kv">' +
      '<dt>Base multiple</dt><dd>' + m.base_multiple + '</dd>' +
      '<dt>Growth weight</dt><dd>' + m.growth_weight + '</dd>' +
      '<dt>Growth clamp</dt><dd>' + m.growth_floor + '% … ' + m.growth_cap + '%</dd>' +
      '<dt>Reach (chains)</dt><dd>' + m.reach_floor + ' … 1 over ' + m.reach_chains + '</dd>' +
      '<dt>Maturity floor / range</dt><dd>' + m.maturity_floor + ' + ' + m.maturity_range + '</dd>' +
      '<dt>Maturity window</dt><dd>' + m.maturity_days + ' days</dd>' +
      '</dl>' +
      '<p class="modelnote">Growth reads the protocol’s seven-day TVL change, clamped. Reach reads how many chains it runs on — a book spread over several chains is harder to farm from one wallet. Maturity reads how long it has run with no token: a protocol that has carried TVL for years without issuing is the stronger candidate.</p>' +
      '<p class="modelnote">Snapshot as of ' + esc(D.as_of) + '. ' + esc(D.source || '') + '</p>' +
      '</div>';
  }

  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { r = D.rows[i]; break; }
    if (!r) return;
    state.open = slug;
    var max = D.rows.length ? D.rows[0].implied_value_usd : 1;
    var steps = farmSteps(r).map(function (s) {
      return '<li><b>' + esc(s.t) + '</b><p>Cost: ' + esc(s.c) + ' · Time: ' + esc(s.d) + '</p></li>';
    }).join('');
    el('detail').innerHTML = '<button class="close" type="button">Close</button>' +
      '<h2>' + esc(r.name) + '</h2><span class="slug">' + esc(r.slug) + ' · rank ' + r.rank + '</span>' +
      '<div class="bar"><i style="width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%"></i></div>' +
      '<dl class="kv">' +
      '<dt>Implied value</dt><dd>' + money(r.implied_value_usd) + '</dd>' +
      '<dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + pct(r.change_7d) + '</dd>' +
      '<dt>Age</dt><dd>' + (r.age_days === null ? 'unknown' : Math.round(r.age_days) + ' days') + '</dd>' +
      '<dt>Category</dt><dd>' + esc(r.category || '—') + '</dd>' +
      '<dt>Chains</dt><dd>' + esc((r.chains || []).join(', ') || '—') + '</dd>' +
      '<dt>Growth multiplier</dt><dd>' + r.growth_multiplier.toFixed(3) + '</dd>' +
      '<dt>Reach multiplier</dt><dd>' + r.reach_multiplier.toFixed(3) + '</dd>' +
      '<dt>Maturity multiplier</dt><dd>' + r.maturity_multiplier.toFixed(3) + '</dd>' +
      '</dl>' +
      '<h3 style="margin:6px 0 8px;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-mute)">How to farm it</h3>' +
      '<ol class="steps">' + steps + '</ol>';
    el('detail').classList.add('is-open');
    el('detail').setAttribute('aria-hidden', 'false');
    el('scrim').hidden = false;
    renderBoard();
  }
  function closeDetail() {
    state.open = null;
    el('detail').classList.remove('is-open');
    el('detail').setAttribute('aria-hidden', 'true');
    el('scrim').hidden = true;
    renderBoard();
  }

  function boot() {
    el('asof').textContent = 'snapshot ' + D.as_of + ' · model ' + D.model_version;
    fillSelects();
    strip();
    renderBoard();
    el('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
    el('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
    el('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    el('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
    el('floor').addEventListener('change', function (e) { state.floor = Number(e.target.value); renderBoard(); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () {
        state.view = t.getAttribute('data-view');
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('is-on', x === t); });
        renderBoard();
      });
    });
    el('scrim').addEventListener('click', closeDetail);
    el('detail').addEventListener('click', function (e) { if (e.target.classList.contains('close')) closeDetail(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });
    // A link may name a protocol (#p=<slug>) or a category (#cat=<name>) to show.
    var hash = window.location.hash.replace(/^#/, '');
    var want = null;
    if (hash.indexOf('p=') === 0) want = hash.slice(2);
    if (hash.indexOf('cat=') === 0) {
      var c = decodeURIComponent(hash.slice(4));
      el('cat').value = c; state.cat = c; renderBoard();
    }
    if (want !== null) openDetail(want);
  }

  boot();
})();
