(function () {
  'use strict';

  const LIST_TITLE = 'PeerSupportEvents';
  const PAGE_SIZE = 5000;

  const SELECT_FIELDS = [
    'Id',
    'Title',
    'PeerPoint_x0020_Event_x0020_Id0',
    'Event_x0020_Date0',
    'Event_x0020_Date_x0020__x0028_so0',
    'Recorded_x0020_At0',
    'PRPS_x0020_Bureau0',
    'PRPS_x0020_Gender0',
    'Resources_x0020__x002f__x0020_Re0',
    'Work_x0020_Related_x0020_Inciden0',
    'Peer_x0020_Supporter0',
    'Provider_x0020_Username0',
    'Total_x0020_Minutes0',
    'Logged_x0020_By0'
  ].join(',');

  /** @type {Array<Record<string, unknown>>} */
  let cachedItems = [];

  function spContext() {
    const ctx =
      window._spPageContextInfo ||
      (window.parent && window.parent._spPageContextInfo) ||
      (window.top && window.top._spPageContextInfo);
    if (ctx && ctx.webAbsoluteUrl) return ctx;

    const path = window.location.pathname || '';
    const siteMatch = path.match(/^(.*\/sites\/[^/]+)/i);
    if (siteMatch) {
      return {
        webAbsoluteUrl: window.location.origin + siteMatch[1],
        webServerRelativeUrl: siteMatch[1]
      };
    }

    throw new Error(
      'SharePoint page context not found. Open this on the SH-PS site page and enable classic _spPageContextInfo on the Script Editor web part.'
    );
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

  /** Map list internal names (incl. duplicate “0” suffix fields) to stable keys. */
  function normalizeItem(raw) {
    const it = { ...raw };
    it.PeerPointEventId =
      raw.PeerPoint_x0020_Event_x0020_Id0 ??
      raw.PeerPointEventId ??
      raw.PeerPoint_x0020_Event_x0020_Id;
    it.EventDate = raw.Event_x0020_Date0 ?? raw.EventDate ?? raw.Event_x0020_Date;
    it.EventDateValue =
      raw.Event_x0020_Date_x0020__x0028_so0 ??
      raw.EventDateValue ??
      raw['Event_x0020_Date_x0020__x0028_so'];
    it.RecordedAt = raw.Recorded_x0020_At0 ?? raw.RecordedAt ?? raw.Recorded_x0020_At;
    it.PrpsBureau = raw.PRPS_x0020_Bureau0 ?? raw.PrpsBureau ?? raw.PRPS_x0020_Bureau;
    it.PrpsGender = raw.PRPS_x0020_Gender0 ?? raw.PrpsGender ?? raw.PRPS_x0020_Gender;
    it.HelpType =
      raw.Resources_x0020__x002f__x0020_Re0 ??
      raw.HelpType ??
      raw['Resources_x0020__x002f__x0020_Re'];
    it.WorkRelatedIncident =
      raw.Work_x0020_Related_x0020_Inciden0 ??
      raw.WorkRelatedIncident ??
      raw.Work_x0020_Related_x0020_Inciden;
    it.ProviderDisplayName =
      raw.Peer_x0020_Supporter0 ?? raw.ProviderDisplayName ?? raw.Peer_x0020_Supporter;
    it.ProviderUsername =
      raw.Provider_x0020_Username0 ?? raw.ProviderUsername ?? raw.Provider_x0020_Username;
    it.TotalMinutes = raw.Total_x0020_Minutes0 ?? raw.TotalMinutes ?? raw.Total_x0020_Minutes;
    it.CreatedByDisplay = raw.Logged_x0020_By0 ?? raw.CreatedByDisplay ?? raw.Logged_x0020_By;
    return it;
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
      if (resp.status === 404 && text.includes('PeerSupportEvents')) {
        throw new Error(
          "SharePoint list PeerSupportEvents was not found on this site. Run scripts/Create-PeerPointSharePointLists.ps1 against SH-PS, then sync data with the PEERPoint Power Automate flow."
        );
      }
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
        '&$orderby=Event_x0020_Date_x0020__x0028_so0 desc,Recorded_x0020_At0 desc&$top=' +
        PAGE_SIZE +
        (skip ? '&$skip=' + skip : '');

      const json = await fetchJson(url);
      const batch = (json.value || []).map(normalizeItem);
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

  function boot() {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
