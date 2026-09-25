(function () {
  'use strict';

  const LIST_TITLE = 'PeerSupportEvents';
  const PAGE_SIZE = 5000;

  const SELECT_FIELDS = [
    'Id',
    'Title',
    'PeerPointEventId',
    'EventDate',
    'EventDateValue',
    'RecordedAt',
    'PrpsBureau',
    'PrpsGender',
    'HelpType',
    'WorkRelatedIncident',
    'ProviderDisplayName',
    'ProviderUsername',
    'TotalMinutes',
    'CreatedByDisplay'
  ].join(',');

  /** @type {Array<Record<string, unknown>>} */
  let cachedItems = [];

  function spContext() {
    const ctx = window._spPageContextInfo || (window.parent && window.parent._spPageContextInfo);
    if (!ctx || !ctx.webAbsoluteUrl) {
      throw new Error(
        'SharePoint page context not found. Embed this app from Site Assets on the SH-PS site (same site as the list).'
      );
    }
    return ctx;
  }

  function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error('Missing element: ' + id);
    return el;
  }

  function setStatus(msg) {
    $('status').textContent = msg || '';
  }

  function setError(msg) {
    const el = $('error');
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function formatDate(isoOrDate) {
    if (!isoOrDate) return '—';
    const d = new Date(String(isoOrDate));
    if (Number.isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso));
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function itemEventDate(item) {
    if (item.EventDateValue) return String(item.EventDateValue).slice(0, 10);
    if (item.EventDate) return String(item.EventDate).slice(0, 10);
    return '';
  }

  async function fetchJson(url) {
    const resp = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('SharePoint request failed (' + resp.status + '): ' + text.slice(0, 300));
    }
    return resp.json();
  }

  async function loadAllListItems() {
    const ctx = spContext();
    const base = ctx.webAbsoluteUrl + "/_api/web/lists/GetByTitle('" + LIST_TITLE.replace(/'/g, "''") + "')/items";

    /** @type {Array<Record<string, unknown>>} */
    const all = [];
    let skip = 0;
    let more = true;

    setStatus('Loading from SharePoint…');

    while (more) {
      const url =
        base +
        '?$select=' +
        SELECT_FIELDS +
        '&$orderby=EventDateValue desc,RecordedAt desc&$top=' +
        PAGE_SIZE +
        (skip ? '&$skip=' + skip : '');

      const json = await fetchJson(url);
      const batch = json.value || [];
      all.push(...batch);
      if (batch.length < PAGE_SIZE) more = false;
      else skip += PAGE_SIZE;
      if (skip > 20000) {
        more = false;
        setStatus('Loaded first ' + all.length + ' rows (cap reached). Narrow dates or ask IT to raise limit.');
      }
    }

    return all;
  }

  function populateHelpTypes(items) {
    const select = $('filterHelpType');
    const current = select.value;
    const types = new Set();
    for (const it of items) {
      const h = String(it.HelpType || '').trim();
      if (h) types.add(h);
    }
    const sorted = [...types].sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="">All types</option>';
    for (const t of sorted) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      select.appendChild(opt);
    }
    if (current && sorted.includes(current)) select.value = current;
  }

  function applyFilters(items) {
    const peer = $('filterPeer').value.trim().toLowerCase();
    const from = $('filterDateFrom').value;
    const to = $('filterDateTo').value;
    const help = $('filterHelpType').value;

    return items.filter(it => {
      const name = String(it.ProviderDisplayName || it.Title || '').toLowerCase();
      if (peer && !name.includes(peer)) return false;

      const ed = itemEventDate(it);
      if (from && ed && ed < from) return false;
      if (to && ed && ed > to) return false;

      if (help && String(it.HelpType || '') !== help) return false;
      return true;
    });
  }

  function renderRows(items) {
    const body = $('resultsBody');
    body.innerHTML = '';
    for (const it of items) {
      const tr = document.createElement('tr');
      const cells = [
        ['Event date', formatDate(itemEventDate(it) || it.EventDate)],
        ['Peer supporter', it.ProviderDisplayName || '—'],
        ['Resources / Referrals', it.HelpType || '—'],
        ['Work related', it.WorkRelatedIncident === 'yes' ? 'Yes' : it.WorkRelatedIncident === 'no' ? 'No' : '—'],
        ['PRPS bureau', it.PrpsBureau || '—'],
        ['Minutes', it.TotalMinutes != null ? String(it.TotalMinutes) : '—'],
        ['Recorded', formatDateTime(it.RecordedAt)],
        ['Logged by', it.CreatedByDisplay || '—']
      ];
      for (const [label, val] of cells) {
        const td = document.createElement('td');
        td.dataset.label = label;
        td.textContent = val;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    $('resultCount').textContent =
      items.length === 0
        ? 'No matching events.'
        : 'Showing ' + items.length + ' event' + (items.length === 1 ? '' : 's') + '.';
  }

  function runSearch() {
    setError('');
    const filtered = applyFilters(cachedItems);
    renderRows(filtered);
    setStatus('Search complete.');
  }

  async function reloadList() {
    setError('');
    $('btnReload').disabled = true;
    $('btnSearch').disabled = true;
    try {
      cachedItems = await loadAllListItems();
      populateHelpTypes(cachedItems);
      runSearch();
      setStatus('Loaded ' + cachedItems.length + ' events from PeerSupportEvents.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('');
    } finally {
      $('btnReload').disabled = false;
      $('btnSearch').disabled = false;
    }
  }

  function clearFilters() {
    $('filterPeer').value = '';
    $('filterDateFrom').value = '';
    $('filterDateTo').value = '';
    $('filterHelpType').value = '';
    runSearch();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('btnSearch').addEventListener('click', runSearch);
    $('btnClear').addEventListener('click', clearFilters);
    $('btnReload').addEventListener('click', function () {
      void reloadList();
    });
    ['filterPeer', 'filterDateFrom', 'filterDateTo', 'filterHelpType'].forEach(function (id) {
      $(id).addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') runSearch();
      });
    });
    void reloadList();
  });
})();
