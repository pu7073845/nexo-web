import { parsePlaylist, PlaylistParseError } from './parser.js';
import { formatKickoff, formatUpdated, filterUpcomingMatches, isPlaylistStale, localDayKeys } from './time.js';
import {
  clearCache,
  clearSource,
  loadCache,
  loadSource,
  saveCache,
  saveSource,
} from './storage.js';
import {
  normalizeSourceUrl,
  sourceErrorMessage,
} from './source.js';

const FETCH_TIMEOUT_MS = 20000;
const TOAST_DURATION_MS = 2600;

const COPY_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="8.5" y="8.5" width="10.5" height="11.5" rx="2" stroke="currentColor" stroke-width="1.7"/>
    <path d="M15.5 8V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2H8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;

const OPEN_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

const state = {
  playlist: null,
  fetchedAt: 0,
  loading: false,
  error: null,
  sourceUrl: null,
  tab: 'matches',
  search: '',
};

const elements = {
  statusLine: document.getElementById('status-line'),
  sourceBtn: document.getElementById('source-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  errorBanner: document.getElementById('error-banner'),
  errorMessage: document.getElementById('error-message'),
  errorRetry: document.getElementById('error-retry'),
  errorClose: document.getElementById('error-close'),
  staleBanner: document.getElementById('stale-banner'),
  staleMessage: document.getElementById('stale-message'),
  tabs: document.getElementById('tabs'),
  tabMatches: document.getElementById('tab-matches'),
  tabChannels: document.getElementById('tab-channels'),
  panelMatches: document.getElementById('panel-matches'),
  panelChannels: document.getElementById('panel-channels'),
  matchesCount: document.getElementById('matches-count'),
  channelsCount: document.getElementById('channels-count'),
  matchesList: document.getElementById('matches-list'),
  matchesEmpty: document.getElementById('matches-empty'),
  channelsList: document.getElementById('channels-list'),
  channelsEmpty: document.getElementById('channels-empty'),
  channelSearch: document.getElementById('channel-search'),
  loadingState: document.getElementById('loading-state'),
  failureState: document.getElementById('failure-state'),
  failureRetry: document.getElementById('failure-retry'),
  sourceSetup: document.getElementById('source-setup'),
  sourceSetupForm: document.getElementById('source-setup-form'),
  sourceSetupInput: document.getElementById('source-setup-input'),
  sourceSetupError: document.getElementById('source-setup-error'),
  sourceDialog: document.getElementById('source-dialog'),
  sourceForm: document.getElementById('source-form'),
  sourceInput: document.getElementById('source-input'),
  sourceError: document.getElementById('source-error'),
  sourceCancel: document.getElementById('source-cancel'),
  toast: document.getElementById('toast'),
};

let toastTimer = null;
let loadToken = 0;

function createIcon(svg) {
  const wrapper = document.createElement('span');
  wrapper.className = 'action-ico';
  wrapper.innerHTML = svg;
  return wrapper;
}

function normalizeSearch(value) {
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function setFormError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function clearFormError(element) {
  element.textContent = '';
  element.hidden = true;
}

function updateChrome() {
  const hasSource = Boolean(state.sourceUrl);
  const playlist = state.playlist;
  const hasMatches = Boolean(playlist && playlist.matches.length > 0);
  const upcomingMatches = playlist ? filterUpcomingMatches(playlist.matches) : [];
  const upcomingLinks = upcomingMatches.reduce(
    (total, match) => total + match.sources.length,
    0,
  );
  const showMatches = hasSource && hasMatches && state.tab === 'matches';
  const stale = Boolean(playlist && isPlaylistStale(playlist));
  const hiddenPastCount = playlist
    ? Math.max(0, playlist.matches.length - upcomingMatches.length)
    : 0;

  elements.sourceSetup.hidden = hasSource;
  elements.tabs.hidden = !hasSource;
  elements.refreshBtn.disabled = !hasSource || state.loading;
  elements.refreshBtn.classList.toggle('is-loading', state.loading);
  elements.refreshBtn.setAttribute('aria-busy', String(state.loading));

  elements.matchesCount.textContent = playlist ? String(upcomingMatches.length) : '0';
  elements.channelsCount.textContent = playlist ? String(playlist.stats.channelCount) : '0';

  if (!hasSource) {
    elements.statusLine.textContent = 'Configura tu fuente M3U';
  } else if (state.loading) {
    elements.statusLine.textContent = playlist
      ? 'Actualizando la lista…'
      : 'Descargando la lista…';
  } else if (playlist) {
    const parts = [];
    if (hasMatches) {
      parts.push(pluralize(upcomingMatches.length, 'evento', 'eventos'));
      parts.push(pluralize(upcomingLinks, 'enlace', 'enlaces'));
    }
    parts.push(pluralize(playlist.stats.channelCount, 'canal', 'canales'));
    if (playlist.hasUpdatedAt) {
      parts.push(`Lista ${formatUpdated(playlist.updatedAt)}`);
    }
    elements.statusLine.textContent = parts.join(' · ');
  } else {
    elements.statusLine.textContent = state.error
      ? 'No se pudo cargar la lista'
      : 'Sin datos';
  }

  elements.statusLine.title = elements.statusLine.textContent;

  elements.errorBanner.hidden = !hasSource || !state.error || !playlist;
  if (state.error) {
    elements.errorMessage.textContent = state.error;
  }

  elements.loadingState.hidden = !(hasSource && state.loading && !playlist);
  elements.failureState.hidden = !(hasSource && !playlist && !state.loading && !!state.error);

  elements.tabMatches.hidden = !hasMatches;
  elements.panelMatches.hidden = !hasSource || !showMatches;
  elements.panelChannels.hidden = !hasSource || showMatches;

  elements.tabMatches.setAttribute('aria-selected', String(showMatches));
  elements.tabChannels.setAttribute('aria-selected', String(!showMatches));
  elements.tabMatches.tabIndex = showMatches ? 0 : -1;
  elements.tabChannels.tabIndex = showMatches ? -1 : 0;

  elements.staleBanner.hidden = !hasSource || !stale;
  if (stale) {
    const updated = formatUpdated(playlist.updatedAt);
    elements.staleMessage.textContent = hiddenPastCount > 0
      ? `Lista desactualizada · Última actualización ${updated} · Se ocultaron ${pluralize(hiddenPastCount, 'evento', 'eventos')} anteriores a hoy.`
      : `Lista desactualizada · Última actualización ${updated}.`;
  }

  if (!hasSource) {
    elements.matchesEmpty.hidden = true;
    elements.channelsEmpty.hidden = true;
  }
}

function buildSourceRow(label, url) {
  const row = document.createElement('div');
  row.className = 'source-row';

  const open = document.createElement('a');
  open.className = 'source-btn open-source';
  open.href = url;
  open.title = `Abrir ${label} en Ace Stream`;
  open.setAttribute('aria-label', `Abrir ${label} en Ace Stream`);
  open.rel = 'noopener noreferrer';

  const name = document.createElement('span');
  name.className = 'source-name';
  name.textContent = label;

  open.append(name, createIcon(OPEN_ICON_SVG));

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy-btn';
  copy.dataset.url = url;
  copy.dataset.label = label;
  copy.title = `Copiar enlace de ${label}`;
  copy.setAttribute('aria-label', `Copiar enlace de ${label}`);
  copy.innerHTML = COPY_ICON_SVG;

  row.append(open, copy);
  return row;
}

function renderMatches() {
  elements.matchesList.replaceChildren();

  const playlist = state.playlist;
  if (!playlist) {
    elements.matchesEmpty.hidden = true;
    return;
  }

  const { today, tomorrow } = localDayKeys();
  const upcomingMatches = filterUpcomingMatches(playlist.matches);
  const fragment = document.createDocumentFragment();

  for (const match of upcomingMatches) {
    const kickoff = formatKickoff(match.displayTs, today, tomorrow);

    const card = document.createElement('article');
    card.className = 'match-card';

    const head = document.createElement('div');
    head.className = 'match-head';

    const kickoffBox = document.createElement('div');
    kickoffBox.className = 'kickoff';
    kickoffBox.title = `${kickoff.weekday} ${kickoff.dateLabel} · ${kickoff.time}`;

    const day = document.createElement('span');
    day.className = 'kickoff-day';
    day.textContent = kickoff.dayLabel;

    const time = document.createElement('span');
    time.className = 'kickoff-time';
    time.textContent = kickoff.time;

    kickoffBox.append(day, time);

    const title = document.createElement('h2');
    title.className = 'match-title';
    title.textContent = match.teams;

    const sourceCount = document.createElement('span');
    sourceCount.className = 'source-count';
    sourceCount.textContent = pluralize(match.sources.length, 'canal', 'canales');

    head.append(kickoffBox, title, sourceCount);

    const sources = document.createElement('div');
    sources.className = 'sources';

    for (const source of match.sources) {
      sources.append(buildSourceRow(source.channelLabel, source.url));
    }

    card.append(head, sources);
    fragment.append(card);
  }

  elements.matchesList.append(fragment);

  const emptyTitle = elements.matchesEmpty.querySelector('.state-title');
  const emptyText = elements.matchesEmpty.querySelector('.state-text');

  if (playlist.matches.length > 0) {
    emptyTitle.textContent = 'No hay eventos próximos';
    emptyText.textContent = 'La lista no contiene eventos para hoy o fechas posteriores.';
  } else {
    emptyTitle.textContent = 'No hay eventos en la lista';
    emptyText.textContent = 'Prueba a recargar la lista con el botón de arriba.';
  }

  elements.matchesEmpty.hidden = upcomingMatches.length !== 0;
}

function renderChannels() {
  elements.channelsList.replaceChildren();

  const playlist = state.playlist;
  if (!playlist) {
    elements.channelsEmpty.hidden = true;
    return;
  }

  const query = normalizeSearch(state.search);
  const fragment = document.createDocumentFragment();
  let visibleChannels = 0;

  for (const group of playlist.channelGroups) {
    const channels = query
      ? group.channels.filter((channel) =>
          normalizeSearch(`${channel.name} ${group.title}`).includes(query),
        )
      : group.channels;

    if (channels.length === 0) continue;

    visibleChannels += channels.length;

    const section = document.createElement('section');
    section.className = 'channel-group';

    const heading = document.createElement('h2');
    heading.className = 'channel-group-title';
    heading.textContent = group.title;

    const count = document.createElement('span');
    count.className = 'channel-group-count';
    count.textContent = String(channels.length);
    heading.append(count);

    const grid = document.createElement('div');
    grid.className = 'channel-grid';

    for (const channel of channels) {
      grid.append(buildSourceRow(channel.name, channel.url));
    }

    section.append(heading, grid);
    fragment.append(section);
  }

  elements.channelsList.append(fragment);

  const emptyTitle = elements.channelsEmpty.querySelector('.state-title');
  const emptyText = elements.channelsEmpty.querySelector('.state-text');

  if (query) {
    emptyTitle.textContent = 'Sin resultados';
    emptyText.textContent = 'No hay canales que coincidan con tu búsqueda.';
  } else {
    emptyTitle.textContent = 'No hay canales';
    emptyText.textContent = 'La lista no contiene canales sueltos.';
  }

  elements.channelsEmpty.hidden = visibleChannels !== 0;
}

function render() {
  renderMatches();
  renderChannels();
  updateChrome();
}

function switchTab(tab) {
  const hasMatches = Boolean(state.playlist && state.playlist.matches.length > 0);
  state.tab = tab === 'matches' && hasMatches ? 'matches' : 'channels';
  updateChrome();
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);

  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', isError);
  elements.toast.classList.add('is-visible');

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('is-visible');
  }, TOAST_DURATION_MS);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Se intenta el método clásico más abajo.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) throw new Error('No se pudo copiar');
}

async function handleCopyClick(event) {
  const button = event.target.closest('button.copy-btn');
  if (!button) return;

  const url = button.dataset.url;
  const label = button.dataset.label || '';

  if (!url) return;

  try {
    await copyText(url);
    button.classList.add('copied');
    window.setTimeout(() => button.classList.remove('copied'), 900);
    showToast(`Enlace copiado${label ? ` · ${label}` : ''}`);
  } catch {
    showToast('No se pudo copiar el enlace', true);
  }
}

async function fetchPlaylistText(sourceUrl) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = new URL(sourceUrl);
    url.searchParams.set('_', String(Date.now()));

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
      headers: { Accept: 'text/plain, */*' },
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

function describeError(error) {
  if (error instanceof PlaylistParseError) {
    return `La lista no tiene el formato esperado. ${error.message}`;
  }

  if (error.name === 'AbortError') {
    return state.playlist
      ? 'La descarga tardó demasiado. Se muestra la última lista guardada.'
      : 'La descarga tardó demasiado. Comprueba tu conexión.';
  }

  if (error instanceof TypeError) {
    return state.playlist
      ? 'No se pudo actualizar la fuente. Se muestra la última copia guardada.'
      : 'No se pudo acceder a la fuente. Comprueba la URL, el CORS o la conexión.';
  }

  return state.playlist
    ? 'No se pudo actualizar la lista. Se muestra la última copia guardada.'
    : 'No se pudo cargar la lista. Comprueba tu conexión e inténtalo de nuevo.';
}

async function loadPlaylist() {
  if (!state.sourceUrl) {
    render();
    return;
  }

  if (state.loading) return;

  const token = ++loadToken;
  const sourceUrl = state.sourceUrl;

  state.loading = true;
  state.error = null;
  updateChrome();

  try {
    const text = await fetchPlaylistText(sourceUrl);
    if (token !== loadToken) return;

    const playlist = parsePlaylist(text);

    if (playlist.matches.length === 0 && playlist.channels.length === 0) {
      throw new PlaylistParseError('No se encontraron eventos ni canales.');
    }

    const hadMatches = Boolean(state.playlist && state.playlist.matches.length > 0);
    state.playlist = playlist;
    state.fetchedAt = Date.now();
    state.error = null;

    if (playlist.matches.length === 0) {
      state.tab = 'channels';
    } else if (!hadMatches) {
      state.tab = 'matches';
    }

    saveCache(text, state.fetchedAt);
  } catch (error) {
    if (token !== loadToken) return;
    state.error = describeError(error);
  } finally {
    if (token === loadToken) {
      state.loading = false;
      render();
    }
  }
}

function openSourceDialog() {
  if (!state.sourceUrl) {
    elements.sourceSetup.hidden = false;
    elements.sourceSetupInput.focus();
    return;
  }

  elements.sourceInput.value = state.sourceUrl;
  clearFormError(elements.sourceError);

  if (typeof elements.sourceDialog.showModal === 'function') {
    elements.sourceDialog.showModal();
  } else {
    elements.sourceDialog.setAttribute('open', '');
  }

  elements.sourceInput.focus();
  elements.sourceInput.select();
}

function closeSourceDialog() {
  if (typeof elements.sourceDialog.close === 'function') {
    elements.sourceDialog.close();
  } else {
    elements.sourceDialog.removeAttribute('open');
  }
}

function applySourceUrl(url) {
  const changed = url !== state.sourceUrl;

  state.sourceUrl = url;
  saveSource(url);

  if (changed) {
    loadToken += 1;
    state.playlist = null;
    state.fetchedAt = 0;
    state.error = null;
    state.loading = false;
    state.search = '';
    state.tab = 'matches';
    elements.channelSearch.value = '';
    clearCache();
  }

  closeSourceDialog();
  elements.sourceSetup.hidden = true;
  elements.tabs.hidden = false;
  render();
  loadPlaylist();
}

function handleSourceSubmit(raw, errorElement, onSuccess) {
  const { url, error } = normalizeSourceUrl(raw, window.location.protocol);

  if (error) {
    setFormError(errorElement, sourceErrorMessage(error));
    return;
  }

  clearFormError(errorElement);
  onSuccess(url);
}

function clearError() {
  state.error = null;
  updateChrome();
}

function init() {
  const storedSource = loadSource();

  if (storedSource) {
    const { url, error } = normalizeSourceUrl(storedSource, window.location.protocol);
    if (error) {
      clearSource();
      clearCache();
      state.sourceUrl = null;
    } else {
      state.sourceUrl = url;
      saveSource(url);
    }
  }

  if (state.sourceUrl) {
    const cache = loadCache();
    if (cache) {
      try {
        state.playlist = parsePlaylist(cache.text);
        state.fetchedAt = cache.fetchedAt;
      } catch {
        state.playlist = null;
      }
    }
  } else {
    clearCache();
  }

  state.tab = state.playlist && state.playlist.matches.length === 0
    ? 'channels'
    : 'matches';
  switchTab(state.tab);
  render();

  elements.refreshBtn.addEventListener('click', () => {
    if (!state.sourceUrl) {
      elements.sourceSetupInput.focus();
      return;
    }
    loadPlaylist();
  });
  elements.errorRetry.addEventListener('click', () => loadPlaylist());
  elements.failureRetry.addEventListener('click', () => loadPlaylist());
  elements.errorClose.addEventListener('click', clearError);
  elements.sourceBtn.addEventListener('click', openSourceDialog);

  elements.sourceSetupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSourceSubmit(
      elements.sourceSetupInput.value,
      elements.sourceSetupError,
      (url) => applySourceUrl(url),
    );
  });

  elements.sourceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSourceSubmit(
      elements.sourceInput.value,
      elements.sourceError,
      (url) => applySourceUrl(url),
    );
  });

  elements.sourceCancel.addEventListener('click', closeSourceDialog);
  elements.sourceDialog.addEventListener('click', (event) => {
    if (event.target === elements.sourceDialog) {
      closeSourceDialog();
    }
  });

  elements.tabMatches.addEventListener('click', () => switchTab('matches'));
  elements.tabChannels.addEventListener('click', () => switchTab('channels'));

  elements.tabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const nextTab = state.tab === 'matches' ? 'channels' : 'matches';
    switchTab(nextTab);
    (nextTab === 'matches' ? elements.tabMatches : elements.tabChannels).focus();
  });

  elements.channelSearch.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderChannels();
  });

  elements.matchesList.addEventListener('click', handleCopyClick);
  elements.channelsList.addEventListener('click', handleCopyClick);

  if (state.sourceUrl) {
    loadPlaylist();
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Sin service worker la app sigue funcionando con la caché local.
      });
    });
  }
}

init();
