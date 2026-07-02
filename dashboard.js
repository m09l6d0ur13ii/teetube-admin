const CATEGORIES = {
  game: ["ddnet", "teeworlds", "ddper"],
  video: ["moment", "montage", "прохождение", "speedrun", "t0speedrun", "tutorial", "trailer", "skips", "fun", "meme", "other"],
  mode: ["ddrace", "ctf", "dm", "race", "fng", "gores", "block", "other mods"],
  gameplayer: ["real", "tas"]
};

let allVideos = {};
let allPlaylists = {};
let activePlaylistId = null;
let modalVideoId = null;
let searchQuery = '';
let currentSort = 'newest';
let dateFromFilter = null;
let dateToFilter = null;

let activeFilters = {
  game: [],
  video: [],
  mode: [],
  gameplayer: [],
  map: [],
  player: [],
  clan: []
};

// Extracted from all videos
let availableMaps = new Set();
let availablePlayers = new Set();
let availableClans = new Set();

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initModal();
  initSearch();
  initAdminPanel();
  loadData();

  const exportBtn = document.getElementById('export-db-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportDatabase);
  }
});

function exportDatabase() {
  chrome.storage.local.get(['videos'], (res) => {
    const localVideos = res.videos || {};

    // Convert to teetube-db format
    const dbVideos = {};
    Object.entries(localVideos).forEach(([id, v]) => {
      dbVideos[id] = {
        title:     v.title     || 'Unknown Title',
        author:    v.author    || 'Unknown Author',
        views:     v.views     || '0',
        likes:     v.likes     || '0',
        date:      v.date      || '',
        thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        tags:      v.tags      || { game: [], video: [], mode: [], gameplayer: [] },
        maps:      v.maps      || [],
        players:   v.players   || v.nicknames || [],
        clans:     v.clans     || [],
        addedBy:   'local',
        addedAt:   v.timestamp ? new Date(v.timestamp).toISOString() : new Date().toISOString()
      };
    });

    const dbJson = {
      version:   1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'local-export',
      videos:    dbVideos,
      moderators: ['m09l6d0ur13ii']
    };

    const blob = new Blob([JSON.stringify(dbJson, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'database.json';
    a.click();
    URL.revokeObjectURL(url);

    const btn = document.getElementById('export-db-btn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ Exported!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  });
}

function initSearch() {
  const mainSearch = document.getElementById('main-search-input');
  if (mainSearch) {
    mainSearch.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderVideos();
    });
  }

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderVideos();
    });
  }

  const dateFrom = document.getElementById('date-from');
  const dateTo = document.getElementById('date-to');
  if (dateFrom && dateTo) {
    const handleDate = () => {
      dateFromFilter = dateFrom.value ? new Date(dateFrom.value).getTime() : null;
      // For 'to' date, set it to the end of the day
      dateToFilter = dateTo.value ? new Date(dateTo.value + 'T23:59:59').getTime() : null;
      renderVideos();
    };
    dateFrom.addEventListener('change', handleDate);
    dateTo.addEventListener('change', handleDate);
  }

  const setupFilterSearch = (id, containerId) => {
    const input = document.getElementById(id);
    const container = document.getElementById(containerId);
    if (!input || !container) return;
    
    // Always show input
    input.style.display = 'block';
    
    input.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      Array.from(container.children).forEach(tag => {
        if (tag.innerText.toLowerCase().includes(q)) {
          tag.style.display = 'inline-block';
        } else {
          tag.style.display = 'none';
        }
      });
    });
  };

  // We call setupFilterSearch inside initFilters after rendering tags
  window._setupFilterSearch = setupFilterSearch;
}

function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      
      const filters = document.getElementById('sidebar-filters');
      if (tab.dataset.tab === 'videos-tab') {
        filters.style.display = 'block';
      } else {
        filters.style.display = 'none';
      }
    });
  });
}

function initModal() {
  const modal = document.getElementById('playlist-modal');
  document.getElementById('close-modal-btn').addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
  
  document.getElementById('create-playlist-btn').addEventListener('click', () => {
    const input = document.getElementById('new-playlist-input');
    const name = input.value.trim();
    if (name) {
      const id = 'pl_' + Date.now();
      allPlaylists[id] = { name: name, videos: [] };
      savePlaylists(() => {
        input.value = '';
        renderModalList();
        renderPlaylistsTab();
      });
    }
  });

  document.getElementById('clear-playlist-btn').addEventListener('click', () => {
    activePlaylistId = null;
    document.getElementById('active-playlist-banner').style.display = 'none';
    renderVideos();
  });
}

function parseNumber(str) {
  if (!str) return 0;
  let s = str.toString().toLowerCase();
  let multi = 1;
  if (s.includes('k') || s.includes('тыс')) multi = 1000;
  if (s.includes('m') || s.includes('млн')) multi = 1000000;
  if (s.includes('b') || s.includes('млрд')) multi = 1000000000;
  
  let numStr = s.replace(/[^\d.,]/g, '');
  
  if (numStr.includes(',') && !numStr.includes('.')) {
    const parts = numStr.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      numStr = numStr.replace(',', '.');
    } else if (parts.length === 2 && parts[1].length === 3 && multi === 1) {
      numStr = numStr.replace(',', '');
    } else {
       numStr = numStr.replace(',', '.');
    }
  } else {
    numStr = numStr.replace(/,/g, '');
  }
  
  return (parseFloat(numStr) || 0) * multi;
}

function loadData() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['videos', 'playlists'], (res) => {
      allVideos = res.videos || {};
      allPlaylists = res.playlists || {};
      extractDynamicCategories();
      
      const params = new URLSearchParams(window.location.search);
      if (params.has('player')) {
        const p = params.get('player');
        if (!activeFilters.player.includes(p)) activeFilters.player.push(p);
      }
      if (params.has('map')) {
        const m = params.get('map');
        if (!activeFilters.map.includes(m)) activeFilters.map.push(m);
      }
      if (params.has('clan')) {
        const c = params.get('clan');
        if (!activeFilters.clan.includes(c)) activeFilters.clan.push(c);
      }
      
      initFilters();
      renderVideos();
      renderPlaylistsTab();
      renderLeaderboardsTab();
    });
  } else {
    document.getElementById('video-grid').innerHTML = '<div class="empty-state">Storage API not found. Load this as a Chrome Extension.</div>';
  }
}

function extractDynamicCategories() {
  availableMaps.clear();
  availablePlayers.clear();
  availableClans.clear();
  Object.values(allVideos).forEach(v => {
    if (v.maps) v.maps.forEach(m => availableMaps.add(m));
    const pList = v.players || v.nicknames;
    if (pList) pList.forEach(p => availablePlayers.add(p));
    if (v.clans) v.clans.forEach(c => availableClans.add(c));
  });
}

function initFilters() {
  for (const [category, tags] of Object.entries(CATEGORIES)) {
    const container = document.getElementById(`filter-${category}`);
    if (container) container.innerHTML = '';
    tags.forEach(tag => createFilterTag(category, tag, container));
  }
  
  const mapContainer = document.getElementById('filter-map');
  if (mapContainer) {
    mapContainer.innerHTML = '';
    Array.from(availableMaps).sort().forEach(m => createFilterTag('map', m, mapContainer));
  }
  
  const playerContainer = document.getElementById('filter-player');
  if (playerContainer) {
    playerContainer.innerHTML = '';
    Array.from(availablePlayers).sort().forEach(p => createFilterTag('player', p, playerContainer));
  }

  const clanContainer = document.getElementById('filter-clan');
  if (clanContainer) {
    clanContainer.innerHTML = '';
    Array.from(availableClans).sort().forEach(c => createFilterTag('clan', c, clanContainer));
  }

  if (window._setupFilterSearch) {
    window._setupFilterSearch('search-filter-map', 'filter-map');
    window._setupFilterSearch('search-filter-player', 'filter-player');
    window._setupFilterSearch('search-filter-clan', 'filter-clan');
  }
}

function createFilterTag(category, tag, container) {
  const el = document.createElement('div');
  el.className = 'filter-tag';
  if (activeFilters[category].includes(tag)) el.classList.add('active');
  el.innerText = tag;
  el.onclick = () => {
    const arr = activeFilters[category];
    const idx = arr.indexOf(tag);
    if (idx > -1) {
      arr.splice(idx, 1);
      el.classList.remove('active');
    } else {
      arr.push(tag);
      el.classList.add('active');
    }
    renderVideos();
  };
  container.appendChild(el);
}

function parseDateAny(dateStr) {
  if (!dateStr || dateStr === 'Unknown Date') return 0;
  const parts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (parts) {
    return new Date(`${parts[3]}-${parts[2]}-${parts[1]}T12:00:00Z`).getTime();
  }
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? 0 : t;
}

function matchesFilters(videoObj, id) {
  if (activePlaylistId && !activePlaylistId.startsWith('auto_')) {
    const pl = allPlaylists[activePlaylistId];
    if (!pl || !pl.videos.includes(id)) return false;
  }

  if (searchQuery) {
    const t = (videoObj.title || '').toLowerCase();
    const a = (videoObj.author || '').toLowerCase();
    if (!t.includes(searchQuery) && !a.includes(searchQuery)) return false;
  }

  if (dateFromFilter || dateToFilter) {
    const vTime = parseDateAny(videoObj.date);
    if (vTime === 0) return false;
    if (dateFromFilter && vTime < dateFromFilter) return false;
    if (dateToFilter && vTime > dateToFilter) return false;
  }

  const vTags = videoObj.tags || { game: [], video: [], mode: [], gameplayer: [] };
  const vMaps = videoObj.maps || [];
  const vPlayers = videoObj.players || videoObj.nicknames || [];
  const vClans = videoObj.clans || [];

  for (const cat in activeFilters) {
    if (['map', 'player', 'clan'].includes(cat)) continue;
    if (activeFilters[cat].length > 0) {
      if (!vTags[cat]) return false;
      const hasTag = activeFilters[cat].some(t => vTags[cat].includes(t));
      if (!hasTag) return false;
    }
  }
  
  if (activeFilters.map.length > 0) {
    if (!activeFilters.map.some(f => vMaps.includes(f))) return false;
  }
  
  if (activeFilters.player.length > 0) {
    if (!activeFilters.player.some(f => vPlayers.includes(f))) return false;
  }

  if (activeFilters.clan.length > 0) {
    if (!activeFilters.clan.some(f => vClans.includes(f))) return false;
  }
  
  return true;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Unknown Date') return '';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
  } catch(e) {
    return dateStr;
  }
}

function renderVideos() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  let count = 0;

  let filtered = Object.entries(allVideos).filter(([id, v]) => matchesFilters(v, id));
  
  // Sorting
  filtered.sort((a, b) => {
    const vA = a[1];
    const vB = b[1];
    
    if (currentSort === 'views') {
      return parseNumber(vB.views) - parseNumber(vA.views);
    } else if (currentSort === 'likes') {
      return parseNumber(vB.likes) - parseNumber(vA.likes);
    } else if (currentSort === 'oldest') {
      return parseDateAny(vA.date) - parseDateAny(vB.date);
    } else {
      // newest (default)
      return parseDateAny(vB.date) - parseDateAny(vA.date);
    }
  });

  if (activePlaylistId && activePlaylistId.startsWith('auto_')) {
    if (activePlaylistId === 'auto_views') {
      filtered = Object.entries(allVideos).sort((a, b) => parseNumber(b[1].views) - parseNumber(a[1].views));
    } else if (activePlaylistId === 'auto_likes') {
      filtered = Object.entries(allVideos).sort((a, b) => parseNumber(b[1].likes) - parseNumber(a[1].likes));
    }
  }

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

  filtered.forEach(([id, v]) => {
    count++;
    
    const card = document.createElement('div');
    card.className = 'video-card';
    
    let tagsHtml = '';
    ['game', 'video', 'mode', 'gameplayer'].forEach(cat => {
      if (v.tags && v.tags[cat]) {
        v.tags[cat].forEach(t => {
          tagsHtml += `<span class="card-tag ${cat}" data-cat="${cat}" data-tag="${esc(t)}" title="Filter by ${esc(t)}">${esc(t)}</span>`;
        });
      }
    });

    if (v.maps) {
      v.maps.forEach(m => {
        tagsHtml += `<span class="card-tag map" data-cat="map" data-tag="${esc(m)}" title="Filter by ${esc(m)}">🗺️ ${esc(m)}</span>`;
      });
    }
    if (v.clans) {
      v.clans.forEach(c => {
        tagsHtml += `<span class="card-tag clan" data-cat="clan" data-tag="${esc(c)}" title="Filter by ${esc(c)}">🛡️ ${esc(c)}</span>`;
      });
    }
    const pList = v.players || v.nicknames;
    if (pList) {
      pList.forEach(p => {
        tagsHtml += `<span class="card-tag player" data-cat="player" data-tag="${esc(p)}" title="Filter by ${esc(p)}">👤 ${esc(p)}</span>`;
      });
    }

    const dateDisplay = formatDate(v.date) ? `&nbsp;•&nbsp; 📅 ${formatDate(v.date)}` : '';
    
    let extLinkHtml = '';
    if (v.maps && v.maps.length > 0) {
      const mainMap = encodeURIComponent(v.maps[0]);
      extLinkHtml = `<a href="https://ddstats.tw/map/${mainMap}" target="_blank" class="ext-link-btn" title="Open map on ddstats.tw">↗</a>`;
    }

    card.innerHTML = `
      <div class="card-link" style="display:flex; flex-direction:column; flex:1;">
        <a href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" class="thumbnail-wrapper" style="text-decoration:none; color:inherit; display:block;">
          <img src="${esc(v.thumbnail)}" alt="Thumbnail" class="thumbnail" loading="lazy">
        </a>
        <div class="card-content">
          <a href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" class="video-title" style="text-decoration:none; color:inherit; display:block; margin-bottom: 4px;">${esc(v.title)}</a>
          <div class="video-author" style="cursor: pointer;" title="Search author" data-author="${esc(v.author)}">${esc(v.author)}</div>
          <div class="video-meta">👁 ${esc(v.views || 'Unknown')} &nbsp;&nbsp; 👍 ${esc(v.likes || 'Unknown')}${dateDisplay}</div>
          <div class="card-tags">${tagsHtml}</div>
        </div>
      </div>
      <button class="add-playlist-btn" title="Add to playlist">+</button>
      ${extLinkHtml}
      <button class="delete-video-btn" title="Remove video">×</button>
    `;
    
    const deleteBtn = card.querySelector('.delete-video-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (confirm("Вы уверены, что хотите удалить это видео из трекера?")) {
          delete allVideos[id];
          chrome.storage.local.set({ videos: allVideos }, () => {
            extractDynamicCategories();
            initFilters();
            renderVideos();
            renderPlaylistsTab();
          });
        }
      });
    }

    const addBtn = card.querySelector('.add-playlist-btn');
    if (addBtn) {
      addBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPlaylistModal(id);
      });
    }

    const authorEl = card.querySelector('.video-author');
    if (authorEl) {
      authorEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const mainSearch = document.getElementById('main-search-input');
        if (mainSearch) {
          mainSearch.value = authorEl.dataset.author;
          mainSearch.dispatchEvent(new Event('input'));
        }
        const videoTab = document.querySelector('.nav-tab[data-tab="videos-tab"]');
        if (videoTab) videoTab.click();
      });
    }

    card.querySelectorAll('.card-tag').forEach(tagEl => {
      tagEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const cat = tagEl.dataset.cat;
        const tag = tagEl.dataset.tag;
        applySingleFilter(cat, tag);
      });
    });

    grid.appendChild(card);
  });

  document.getElementById('total-stats').innerText = `${count} video${count !== 1 ? 's' : ''}`;
  if (count === 0) grid.innerHTML = '<div class="empty-state">No videos found matching your filters.</div>';
}

  function applySingleFilter(category, tag) {
    // Clear all filters
    activeFilters = { game: [], video: [], mode: [], gameplayer: [], map: [], player: [], clan: [] };
  // Clear search
  searchQuery = '';
  const searchInput = document.getElementById('main-search-input');
  if (searchInput) searchInput.value = '';
  // Set the specific filter
  activeFilters[category].push(tag);
  
  // Update visual state of filter tags
  document.querySelectorAll('.filter-tag').forEach(el => el.classList.remove('active'));
  
  // Switch to videos tab
  const videoTab = document.querySelector('.nav-tab[data-tab="videos-tab"]');
  if (videoTab) videoTab.click();
  
  // Re-render
  renderVideos();
}

function openPlaylistModal(videoId) {
  modalVideoId = videoId;
  document.getElementById('playlist-modal').style.display = 'flex';
  renderModalList();
}

function renderModalList() {
  const list = document.getElementById('modal-playlists-list');
  list.innerHTML = '';
  
  if (Object.keys(allPlaylists).length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">No playlists yet. Create one above!</div>`;
    return;
  }
  
  Object.keys(allPlaylists).forEach(plId => {
    const pl = allPlaylists[plId];
    const isChecked = pl.videos.includes(modalVideoId);
    
    const row = document.createElement('div');
    row.className = 'playlist-checkbox-row';
    row.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''}> <span>${pl.name}</span>`;
    
    row.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = row.querySelector('input');
        cb.checked = !cb.checked;
      }
      toggleVideoInPlaylist(plId, modalVideoId, row.querySelector('input').checked);
    });
    
    list.appendChild(row);
  });
}

function toggleVideoInPlaylist(plId, videoId, add) {
  const pl = allPlaylists[plId];
  if (add) {
    if (!pl.videos.includes(videoId)) pl.videos.push(videoId);
  } else {
    pl.videos = pl.videos.filter(id => id !== videoId);
  }
  savePlaylists(() => renderPlaylistsTab());
}

function savePlaylists(cb) {
  if (chrome && chrome.storage) {
    chrome.storage.local.set({ playlists: allPlaylists }, cb);
  } else if (cb) {
    cb();
  }
}

function renderPlaylistsTab() {
  const container = document.querySelector('.playlists-container');
  if (!container) return;
  container.innerHTML = '';

  // 1. Auto Playlists (Smart Playlists)
  const smartSection = document.createElement('div');
  smartSection.className = 'playlist-section';
  smartSection.innerHTML = `<h2>✨ Smart Playlists</h2><div class="stats-grid" id="smart-playlists-grid"></div>`;
  container.appendChild(smartSection);

  const smartGrid = smartSection.querySelector('#smart-playlists-grid');
  const createSmartCard = (id, title, desc, icon) => {
    const card = document.createElement('div');
    card.className = 'custom-playlist-card';
    card.innerHTML = `
      <div class="custom-playlist-header">
        <h3>${icon} ${title}</h3>
      </div>
      <div class="stat-card-value">${desc}</div>
    `;
    card.addEventListener('click', () => {
      activePlaylistId = id;
      document.getElementById('active-playlist-name').innerText = title;
      document.getElementById('active-playlist-banner').style.display = 'flex';
      document.querySelector('.nav-tab[data-tab="videos-tab"]').click();
      renderVideos();
    });
    smartGrid.appendChild(card);
  };
  createSmartCard('auto_top_views', 'Top by Views', 'All videos sorted by views', '👁️');
  createSmartCard('auto_top_likes', 'Top by Likes', 'All videos sorted by likes', '👍');
  
  // 2. Custom Playlists Section
  const customSection = document.createElement('div');
  customSection.className = 'playlist-section';
  customSection.style.marginTop = '24px';
  customSection.innerHTML = `<h2>📁 Your Playlists</h2><div class="stats-grid" id="custom-playlists-grid"></div>`;
  container.appendChild(customSection);
  
  const cpGrid = customSection.querySelector('#custom-playlists-grid');
  const customKeys = Object.keys(allPlaylists).sort((a, b) => {
    const pA = allPlaylists[a].pinned ? 1 : 0;
    const pB = allPlaylists[b].pinned ? 1 : 0;
    if (pA !== pB) return pB - pA;
    return (allPlaylists[b].timestamp || 0) - (allPlaylists[a].timestamp || 0);
  });

  if (customKeys.length === 0) {
    cpGrid.innerHTML = `<div style="color:var(--text-muted); font-size:14px; grid-column:1/-1;">No custom playlists yet. Click the + button on any video to create one!</div>`;
  } else {
    customKeys.forEach(plId => {
      const pl = allPlaylists[plId];
      const card = document.createElement('div');
      card.className = 'custom-playlist-card';
      card.innerHTML = `
        <div class="custom-playlist-header">
          <h3>${pl.pinned ? '📌 ' : ''}${pl.name}</h3>
          <div>
            <button class="pin-playlist-btn" title="Pin Playlist" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:16px;">📌</button>
            <button class="delete-playlist-btn" title="Delete Playlist" style="margin-left: 8px;">✕</button>
          </div>
        </div>
        <div class="stat-card-value">${pl.videos.length} video${pl.videos.length !== 1 ? 's' : ''}</div>
      `;
      
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-playlist-btn')) {
          e.stopPropagation();
          if (confirm('Are you sure you want to delete this playlist?')) {
            delete allPlaylists[plId];
            savePlaylists(() => {
              if (activePlaylistId === plId) {
                activePlaylistId = null;
                document.getElementById('active-playlist-banner').style.display = 'none';
              }
              renderPlaylistsTab();
              renderVideos();
            });
          }
          return;
        }

        if (e.target.classList.contains('pin-playlist-btn')) {
          e.stopPropagation();
          pl.pinned = !pl.pinned;
          savePlaylists(() => renderPlaylistsTab());
          return;
        }
        
        // Open playlist
        activePlaylistId = plId;
        document.getElementById('active-playlist-name').innerText = pl.name;
        document.getElementById('active-playlist-banner').style.display = 'flex';
        
        // Switch to videos tab
        document.querySelector('.nav-tab[data-tab="videos-tab"]').click();
        renderVideos();
      });
      cpGrid.appendChild(card);
    });
  }
}

function renderLeaderboardsTab() {
  const container = document.getElementById('leaderboards-container');
  if (!container) return;
  container.innerHTML = '';
  
  const stats = { playersByVideos: {}, playersByViews: {}, maps: {}, modes: {}, clans: {} };
  
  Object.values(allVideos).forEach(v => {
    const views = parseNumber(v.views);
    
    const pList = v.players || v.nicknames;
    if (pList) {
      pList.forEach(p => {
        stats.playersByVideos[p] = (stats.playersByVideos[p] || 0) + 1;
        stats.playersByViews[p] = (stats.playersByViews[p] || 0) + views;
      });
    }
    if (v.maps) {
      v.maps.forEach(m => stats.maps[m] = (stats.maps[m] || 0) + 1);
    }
    if (v.tags && v.tags.mode) {
      v.tags.mode.forEach(m => stats.modes[m] = (stats.modes[m] || 0) + 1);
    }
    if (v.clans) {
      v.clans.forEach(c => stats.clans[c] = (stats.clans[c] || 0) + 1);
    }
  });

  const formatStatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const createTable = (title, dataDict, valFormatter = (v)=>v, isPlayer = false) => {
    const sorted = Object.entries(dataDict).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return;
    
    const tableDiv = document.createElement('div');
    tableDiv.className = 'leaderboard-table';
    
    let html = `<h3>${title}</h3>`;
    sorted.slice(0, 50).forEach(([name, val], i) => {
      const clickAttr = isPlayer ? `onclick="applySingleFilter('player', '${name.replace(/'/g, "\\'")}'); document.querySelector('.nav-tab[data-tab=\\'videos-tab\\']').click();"` : '';
      html += `
        <div class="lb-row">
          <div class="lb-rank">${i+1}.</div>
          <div class="lb-name" ${clickAttr}>${name}</div>
          <div class="lb-score">${valFormatter(val)}</div>
        </div>
      `;
    });
    
    tableDiv.innerHTML = html;
    container.appendChild(tableDiv);
  };

  createTable('Points (Videos)', stats.playersByVideos, v => `${v} pts`, true);
  createTable('Rank (Views)', stats.playersByViews, v => `${formatStatNumber(v)} views`, true);
  createTable('Top Maps', stats.maps, v => `${v} runs`);
  createTable('Top Clans', stats.clans, v => `${v} pts`);
}

function initAdminPanel() {
  const tokenInput = document.getElementById('github-token-input');
  const saveBtn = document.getElementById('save-token-btn');
  const syncBtn = document.getElementById('sync-github-btn');
  const tokenStatus = document.getElementById('token-status');
  const syncStatus = document.getElementById('sync-status');

  if (!tokenInput || !saveBtn || !syncBtn) return;

  // Load token
  chrome.storage.local.get(['github_token'], (res) => {
    if (res.github_token) {
      tokenInput.value = res.github_token;
      tokenStatus.innerText = 'Token loaded from storage.';
      syncBtn.style.opacity = '1';
      syncBtn.style.pointerEvents = 'auto';
    }
  });

  saveBtn.addEventListener('click', () => {
    const val = tokenInput.value.trim();
    if (val) {
      chrome.storage.local.set({ github_token: val }, () => {
        tokenStatus.innerText = 'Token saved successfully! ✅';
        syncBtn.style.opacity = '1';
        syncBtn.style.pointerEvents = 'auto';
        setTimeout(() => tokenStatus.innerText = '', 3000);
      });
    } else {
      chrome.storage.local.remove(['github_token'], () => {
        tokenStatus.innerText = 'Token removed.';
        syncBtn.style.opacity = '0.5';
        syncBtn.style.pointerEvents = 'none';
        setTimeout(() => tokenStatus.innerText = '', 3000);
      });
    }
  });

  syncBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) return;

    syncStatus.style.display = 'block';
    syncStatus.style.background = 'rgba(241,196,15,0.2)';
    syncStatus.style.color = '#f1c40f';
    syncStatus.innerText = '⏳ Fetching latest database from GitHub...';
    syncBtn.disabled = true;

    try {
      // 1. Get current file and sha
      const repoPath = 'm09l6d0ur13ii/teetube-db';
      const filePath = 'database.json';
      
      const getRes = await fetch(`https://api.github.com/repos/${repoPath}/contents/${filePath}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!getRes.ok) throw new Error(`GitHub API Error: ${getRes.status} ${getRes.statusText}`);
      
      const getJson = await getRes.json();
      const sha = getJson.sha;
      
      // Decode content (base64)
      let remoteDb;
      try {
        const decodedContent = decodeURIComponent(escape(atob(getJson.content)));
        remoteDb = JSON.parse(decodedContent);
      } catch (e) {
        throw new Error('Failed to parse remote database.json');
      }

      // 2. Merge local videos into remoteDb
      let newCount = 0;
      Object.entries(allVideos).forEach(([id, v]) => {
        if (!remoteDb.videos[id]) {
          newCount++;
        }
        remoteDb.videos[id] = {
          title:     v.title     || 'Unknown Title',
          author:    v.author    || 'Unknown Author',
          views:     v.views     || '0',
          likes:     v.likes     || '0',
          date:      v.date      || '',
          thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          tags:      v.tags      || { game: [], video: [], mode: [], gameplayer: [] },
          maps:      v.maps      || [],
          players:   v.nicknames || [],
          clans:     v.clans     || [],
          addedBy:   'local-sync',
          addedAt:   v.timestamp ? new Date(v.timestamp).toISOString() : new Date().toISOString()
        };
      });

      remoteDb.updatedAt = new Date().toISOString();
      remoteDb.updatedBy = 'Admin-Panel-Sync';

      syncStatus.innerText = `⏳ Pushing ${Object.keys(allVideos).length} videos (merged with remote) to GitHub...`;

      // Encode content back to base64 safely handling UTF-8
      const updatedContent = btoa(unescape(encodeURIComponent(JSON.stringify(remoteDb, null, 2))));

      // 3. Put new file content
      const putRes = await fetch(`https://api.github.com/repos/${repoPath}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Sync ${newCount} new videos via TeeTube Admin Panel`,
          content: updatedContent,
          sha: sha
        })
      });

      if (!putRes.ok) throw new Error(`GitHub API Error: ${putRes.status} ${putRes.statusText}`);

      syncStatus.innerText = '♻️ Purging global CDN cache...';
      try {
        await fetch(`https://purge.jsdelivr.net/gh/${repoPath}@main/${filePath}`);
      } catch (purgeErr) {
        console.warn('CDN Purge failed, but DB updated', purgeErr);
      }

      syncStatus.style.background = 'rgba(46,204,113,0.2)';
      syncStatus.style.color = '#2ecc71';
      syncStatus.innerText = '✅ Sync successful! Database updated on GitHub.';

    } catch (e) {
      syncStatus.style.background = 'rgba(231,76,60,0.2)';
      syncStatus.style.color = '#e74c3c';
      syncStatus.innerText = `❌ Error: ${e.message}`;
    } finally {
      syncBtn.disabled = false;
    }
  });
}
