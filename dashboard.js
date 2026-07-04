/* 
 * TEE TUBE ADMIN - DASHBOARD LOGIC (dashboard.js)
 * 
 * Welcome to the Admin Dashboard code! Here is how everything works:
 * 
 * 1. THE GOAL:
 *    This dashboard allows admins to view all videos, check the global database, 
 *    and most importantly, sync their local edits to GitHub!
 */

let allVideos = {};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
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
        title: v.title || 'Unknown Title',
        author: v.author || 'Unknown Author',
        views: v.views || '0',
        likes: v.likes || '0',
        date: v.date || '',
        thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        tags: v.tags || { game: [], video: [], mode: [], gameplayer: [] },
        maps: v.maps || [],
        players: v.players || v.nicknames || [],
        clans: v.clans || [],
        addedBy: 'local',
        addedAt: v.timestamp ? new Date(v.timestamp).toISOString() : new Date().toISOString()
      };
    });

    const dbJson = {
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'local-export',
      videos: dbVideos,
      moderators: ['m09l6d0ur13ii']
    };

    const blob = new Blob([JSON.stringify(dbJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
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


function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}




function loadData() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['videos'], (res) => {
      allVideos = res.videos || {};
      renderVideos();
    });
  } else {
    document.getElementById('video-grid').innerHTML = '<div class="empty-state">Storage API not found. Load this as a Chrome Extension.</div>';
  }
}



function matchesFilters(videoObj, id) {
  // ALWAYS only show local edits
  if (!videoObj.timestamp) return false;

  return true;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Unknown Date') return '';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
  } catch (e) {
    return dateStr;
  }
}

function renderVideos() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;
  grid.innerHTML = '';

  let count = 0;

  let filtered = Object.entries(allVideos).filter(([id, v]) => matchesFilters(v, id));

  // Sorting: newest local edits first
  filtered.sort((a, b) => {
    return (b[1].timestamp || 0) - (a[1].timestamp || 0);
  });



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
          });
        }
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
  activeFilters = { game: [], video: [], mode: [], gameplayer: [], lang: [], map: [], player: [], clan: [] };
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

      // 2. Merge ONLY local edits (pending sync) into remoteDb
      let newCount = 0;
      Object.entries(allVideos).forEach(([id, v]) => {
        if (!v.timestamp) return; // Skip videos that aren't locally edited
        
        if (!remoteDb.videos[id]) {
          newCount++;
        }
        remoteDb.videos[id] = {
          title: v.title || 'Unknown Title',
          author: v.author || 'Unknown Author',
          views: v.views || '0',
          likes: v.likes || '0',
          date: v.date || '',
          thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          tags: v.tags || { game: [], video: [], mode: [], gameplayer: [] },
          maps: v.maps || [],
          players: v.players || v.nicknames || [],
          clans: v.clans || [],
          addedBy: 'local-sync',
          addedAt: new Date(v.timestamp).toISOString()
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
        // The timestamp query string parameter forces jsDelivr to bypass the cache
        await fetch(`https://cdn.jsdelivr.net/gh/m09l6d0ur13ii/teetube-db@main/database.json?_=${Date.now()}`);
      } catch (purgeErr) {
        console.warn('CDN Purge failed, but DB updated', purgeErr);
      }

      // Clear "pending" status from local videos after successful sync
      if (chrome && chrome.storage) {
        Object.values(allVideos).forEach(v => {
          if (v.timestamp) delete v.timestamp;
        });
        chrome.storage.local.set({ videos: allVideos }, () => {
          renderVideos();
        });
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
