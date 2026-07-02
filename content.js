const CATEGORIES = {
  game: ["ddnet", "teeworlds", "ddper"],
  video: ["moment", "montage", "прохождение", "speedrun", "t0speedrun", "tutorial", "trailer", "skips", "fun", "meme", "other"],
  mode: ["ddrace", "ctf", "dm", "race", "fng", "gores", "block", "other mods"],
  gameplayer: ["real", "tas"]
};

let currentVideoId = null;
let currentData = { tags: { game: [], video: [], mode: [], gameplayer: [] }, nicknames: [], maps: [], clans: [] };

function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// --- Thumbnail Badge Logic ---
let savedVideoIds = new Set();

function fetchSavedVideos(callback) {
  chrome.storage.local.get(['videos'], (res) => {
    const vids = res.videos || {};
    savedVideoIds = new Set(Object.keys(vids));
    if (callback) callback();
  });
}

function markThumbnails() {
  const links = document.querySelectorAll('a#thumbnail, a[href*="/watch?v="]:has(yt-image), a[href*="/watch?v="]:has(.ytCoreImageHost)');
  links.forEach(link => {
    if (!link.href) return;
    
    try {
      const url = new URL(link.href, window.location.href);
      const vid = url.searchParams.get('v');
      if (!vid) return;

      const wrapper = link.closest('ytd-thumbnail, ytd-compact-video-renderer, yt-lockup-view-model, .ytd-rich-grid-media') || link;
      const hasBadge = wrapper.querySelector('.teetube-saved-badge');
      
      if (savedVideoIds.has(vid)) {
        if (!hasBadge) {
          const badge = document.createElement('div');
          badge.className = 'teetube-saved-badge';
          badge.innerText = '✓ TeeTube';
          wrapper.style.position = 'relative'; 
          wrapper.appendChild(badge);
        }
      } else {
        if (hasBadge) {
          hasBadge.remove();
        }
      }
    } catch (e) {
      // ignore invalid URLs
    }
  });
}

fetchSavedVideos(() => {
  markThumbnails();
  setInterval(markThumbnails, 2000);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.videos) {
    savedVideoIds = new Set(Object.keys(changes.videos.newValue || {}));
    markThumbnails();
  }
});

function getMetadata() {
  const titleEl = document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string') || document.querySelector('h1.title yt-formatted-string');
  const title = titleEl ? titleEl.innerText : 'Unknown Title';

  const authorEl = document.querySelector('ytd-watch-metadata #owner yt-formatted-string a') || document.querySelector('#owner-name a');
  const author = authorEl ? authorEl.innerText : 'Unknown Author';

  const viewsMeta = document.querySelector('meta[itemprop="interactionCount"]');
  let views = viewsMeta ? viewsMeta.content : null;

  if (!views) {
    const spans = document.querySelectorAll('ytd-watch-metadata span');
    for (let span of spans) {
      if (span.innerText && span.innerText.match(/\d+.*(views|просмотр|визит)/i)) {
        views = span.innerText.trim();
        break;
      }
    }
  }
  if (!views) views = 'Unknown';

  const dateMeta = document.querySelector('meta[itemprop="datePublished"]') || document.querySelector('meta[itemprop="uploadDate"]');
  let date = dateMeta ? dateMeta.content : null;

  if (!date) {
    const spans = document.querySelectorAll('ytd-watch-metadata span');
    for (let span of spans) {
      if (span.innerText && span.innerText.match(/\d{4}/) && span.innerText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/i)) {
        date = span.innerText.trim();
        break;
      }
    }
  }
  if (!date) date = 'Unknown Date';

  let likes = null;
  const likeBtn = document.querySelector('like-button-view-model button') || document.querySelector('ytd-toggle-button-renderer button');
  if (likeBtn) {
    const aria = likeBtn.getAttribute('aria-label') || '';
    const match = aria.match(/([\d\s,]+)\s*(likes|лайк)/i) ||
      aria.match(/([\d\s,]+)\s*отметок/i) ||
      aria.match(/нравится[^\d]*([\d\s,KkMm]+)/i) ||
      aria.match(/\(([\d\s,KkMm]+)\)/i);
    if (match) likes = match[1].trim();
  }
  if (!likes) {
    const textContentEl = document.querySelector('like-button-view-model .yt-spec-button-shape-next__button-text-content') ||
      document.querySelector('segmented-like-dislike-button-view-model .yt-spec-button-shape-next__button-text-content') ||
      document.querySelector('#top-level-buttons-computed ytd-toggle-button-renderer yt-formatted-string');
    if (textContentEl && textContentEl.innerText.match(/\d/)) {
      likes = textContentEl.innerText.trim();
    }
  }
  if (!likes) {
    const badge = document.querySelector('like-button-view-model .yt-core-button-badge');
    if (badge && badge.innerText.match(/\d/)) likes = badge.innerText;
  }
  if (!likes) likes = 'Unknown Likes';

  const thumbnail = `https://i.ytimg.com/vi/${currentVideoId}/hqdefault.jpg`;

  return { title, author, views, likes, date, thumbnail, timestamp: Date.now() };
}

function saveData() {
  if (!currentVideoId) return;
  const metadata = getMetadata();
  const videoObj = { ...metadata, ...currentData };
  chrome.storage.local.get(['videos'], (res) => {
    const videos = res.videos || {};
    videos[currentVideoId] = videoObj;
    chrome.storage.local.set({ videos });
  });
}

function toggleTag(category, tag) {
  if (!currentData.tags) currentData.tags = {};
  if (!currentData.tags[category]) currentData.tags[category] = [];

  const arr = currentData.tags[category];
  const idx = arr.indexOf(tag);
  if (idx > -1) arr.splice(idx, 1);
  else arr.push(tag);
  saveData();
  renderPanel(); // Re-render to update active classes
}

function addNickname(nick) {
  nick = nick.trim();
  if (nick && !currentData.nicknames.includes(nick)) {
    currentData.nicknames.push(nick);
    saveData();
    renderPanel();
  }
}

function removeNickname(nick) {
  const idx = currentData.nicknames.indexOf(nick);
  if (idx > -1) {
    currentData.nicknames.splice(idx, 1);
    saveData();
    renderPanel();
  }
}

function addMap(mapName) {
  mapName = mapName.trim();
  if (mapName && !currentData.maps.includes(mapName)) {
    currentData.maps.push(mapName);
    saveData();
    renderPanel();
  }
}

function removeMap(mapName) {
  const idx = currentData.maps.indexOf(mapName);
  if (idx > -1) {
    currentData.maps.splice(idx, 1);
    saveData();
    renderPanel();
  }
}

function addClan(clanName) {
  clanName = clanName.trim();
  if (clanName && !currentData.clans.includes(clanName)) {
    currentData.clans.push(clanName);
    saveData();
    renderPanel();
  }
}

function removeClan(clanName) {
  const idx = currentData.clans.indexOf(clanName);
  if (idx > -1) {
    currentData.clans.splice(idx, 1);
    saveData();
    renderPanel();
  }
}

function renderPanel() {
  let panel = document.getElementById('ddnettube-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'ddnettube-panel';

    // Inject below title
    const titleContainer = document.querySelector('ytd-watch-metadata #title') || document.querySelector('h1.title')?.parentElement;
    if (titleContainer) {
      titleContainer.parentElement.insertBefore(panel, titleContainer.nextSibling);
    } else {
      return; // Could not find title container
    }
  }

  panel.innerHTML = '';

  // Render categories
  for (const [category, tags] of Object.entries(CATEGORIES)) {
    const row = document.createElement('div');
    row.className = 'ddnettube-row';

    const label = document.createElement('div');
    label.className = 'ddnettube-label';
    label.innerText = category.charAt(0).toUpperCase() + category.slice(1) + ':';
    row.appendChild(label);

    tags.forEach(tag => {
      const tagEl = document.createElement('div');
      const hasTag = currentData.tags && currentData.tags[category] && currentData.tags[category].includes(tag);
      tagEl.className = 'ddnettube-tag' + (hasTag ? ' active' : '');
      tagEl.innerText = tag;
      tagEl.onclick = () => toggleTag(category, tag);
      row.appendChild(tagEl);
    });

    panel.appendChild(row);
  }

  // Render Nicknames
  const nickRow = document.createElement('div');
  nickRow.className = 'ddnettube-row';

  const nickLabel = document.createElement('div');
  nickLabel.className = 'ddnettube-label';
  nickLabel.innerText = 'Players:';
  nickRow.appendChild(nickLabel);

  currentData.nicknames.forEach(nick => {
    const nickEl = document.createElement('div');
    nickEl.className = 'ddnettube-nickname';
    nickEl.innerHTML = `<span>${nick}</span><span class="ddnettube-nickname-remove">×</span>`;
    nickEl.querySelector('.ddnettube-nickname-remove').onclick = () => removeNickname(nick);
    nickRow.appendChild(nickEl);
  });

  const nickInput = document.createElement('input');
  nickInput.className = 'ddnettube-text-input';
  nickInput.placeholder = 'Add nickname and press Enter...';
  nickInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      addNickname(e.target.value);
    }
  };
  nickRow.appendChild(nickInput);

  panel.appendChild(nickRow);

  // Render Maps
  const mapRow = document.createElement('div');
  mapRow.className = 'ddnettube-row';

  const mapLabel = document.createElement('div');
  mapLabel.className = 'ddnettube-label';
  mapLabel.innerText = 'Maps:';
  mapRow.appendChild(mapLabel);

  currentData.maps.forEach(mapName => {
    const mapEl = document.createElement('div');
    mapEl.className = 'ddnettube-map';
    mapEl.innerHTML = `<span>${mapName}</span><span class="ddnettube-nickname-remove">×</span>`;
    mapEl.querySelector('.ddnettube-nickname-remove').onclick = () => removeMap(mapName);
    mapRow.appendChild(mapEl);
  });

  const mapInput = document.createElement('input');
  mapInput.className = 'ddnettube-text-input';
  mapInput.placeholder = 'Add map and press Enter...';
  mapInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      addMap(e.target.value);
    }
  };
  mapRow.appendChild(mapInput);

  panel.appendChild(mapRow);

  // Render Clans
  const clanRow = document.createElement('div');
  clanRow.className = 'ddnettube-row';

  const clanLabel = document.createElement('div');
  clanLabel.className = 'ddnettube-label';
  clanLabel.innerText = 'Clans:';
  clanRow.appendChild(clanLabel);

  currentData.clans.forEach(clanName => {
    const clanEl = document.createElement('div');
    clanEl.className = 'ddnettube-clan ddnettube-map'; // Re-use map styles for general chips
    clanEl.innerHTML = `<span>${clanName}</span><span class="ddnettube-nickname-remove">×</span>`;
    clanEl.querySelector('.ddnettube-nickname-remove').onclick = () => removeClan(clanName);
    clanRow.appendChild(clanEl);
  });

  const clanInput = document.createElement('input');
  clanInput.className = 'ddnettube-text-input';
  clanInput.placeholder = 'Add clan and press Enter...';
  clanInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      addClan(e.target.value);
    }
  };
  clanRow.appendChild(clanInput);

  panel.appendChild(clanRow);
}

function init() {
  const vid = getVideoId();
  if (!vid) {
    const panel = document.getElementById('ddnettube-panel');
    if (panel) panel.remove();
    currentVideoId = null;
    return;
  }

  // In SPA, if we navigate to a new video, the old panel should be updated
  currentVideoId = vid;
  currentData = { tags: { game: [], video: [], mode: [], gameplayer: [] }, nicknames: [], maps: [], clans: [] };

  // Load existing data
  chrome.storage.local.get(['videos'], (res) => {
    const videos = res.videos || {};
    if (videos[vid]) {
      currentData.tags = videos[vid].tags || { game: [], video: [], mode: [], gameplayer: [] };
      currentData.nicknames = videos[vid].nicknames || [];
      currentData.maps = videos[vid].maps || [];
      currentData.clans = videos[vid].clans || [];
    }

    // Wait for title element to be available before rendering
    let retries = 0;
    const checkInterval = setInterval(() => {
      const titleContainer = document.querySelector('ytd-watch-metadata #title') || document.querySelector('h1.title')?.parentElement;
      if (titleContainer) {
        clearInterval(checkInterval);
        renderPanel();
      }
      retries++;
      if (retries > 20) clearInterval(checkInterval); // Stop after 10s
    }, 500);
  });
}

// --- YouTube Integration ---
// Observe URL changes (YouTube SPA)
let lastUrl = location.href;
if (window.location.hostname.includes('youtube.com')) {
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(init, 1000); // Wait a bit for navigation
    }
  }).observe(document, { subtree: true, childList: true });

  // Initial run
  setTimeout(init, 1500);
}

// --- Third-Party Tracker Integrations ---
const hostname = window.location.hostname;
if (hostname.includes('ddnet.org') || hostname.includes('ddstats.tw') || hostname.includes('teerank.io')) {
  // Sites like teerank.io are SPAs, so we also observe URL changes
  let currentTrackerUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== currentTrackerUrl) {
      currentTrackerUrl = location.href;
      setTimeout(() => initTrackerIntegration(hostname), 500);
    }
  }).observe(document, { subtree: true, childList: true });

  setTimeout(() => initTrackerIntegration(hostname), 500);
}

function initTrackerIntegration(hostname) {
  // Remove existing banner if it exists (for SPAs)
  const existing = document.getElementById('teetube-tracker-banner');
  if (existing) existing.remove();

  const path = window.location.pathname;
  let type = null;
  let targetName = null;

  if (hostname.includes('ddnet.org') || hostname.includes('ddstats.tw')) {
    if (path.startsWith('/players/') || path.startsWith('/player/')) {
      type = 'player';
      targetName = decodeURIComponent(path.split('/')[2]);
    } else if (path.startsWith('/maps/') || path.startsWith('/map/')) {
      type = 'map';
      targetName = decodeURIComponent(path.split('/')[2]);
    }
  } else if (hostname.includes('teerank.io')) {
    if (path.startsWith('/player/')) {
      type = 'player';
      targetName = decodeURIComponent(path.split('/')[2]);
    } else if (path.startsWith('/clan/')) {
      type = 'clan';
      targetName = decodeURIComponent(path.split('/')[2]);
    } else if (path.includes('/map/')) {
      type = 'map';
      const parts = path.split('/');
      const mapIdx = parts.indexOf('map');
      if (mapIdx !== -1 && parts.length > mapIdx + 1) {
        targetName = decodeURIComponent(parts[mapIdx + 1]);
      }
    }
  }

  if (!type || !targetName) return;

  chrome.storage.local.get(['videos'], (res) => {
    const allVideos = res.videos || {};
    let matchCount = 0;

    Object.values(allVideos).forEach(v => {
      if (type === 'player' && v.nicknames && v.nicknames.includes(targetName)) matchCount++;
      if (type === 'map' && v.maps && v.maps.includes(targetName)) matchCount++;
      if (type === 'clan' && v.clans && v.clans.includes(targetName)) matchCount++;
    });

    injectTrackerBanner(type, targetName, matchCount);
  });
}

function injectTrackerBanner(type, targetName, matchCount) {
  const banner = document.createElement('div');
  banner.id = 'teetube-tracker-banner';
  banner.style.padding = '12px 20px';
  banner.style.textAlign = 'center';
  banner.style.fontWeight = 'bold';
  banner.style.fontSize = '16px';
  banner.style.fontFamily = 'sans-serif';
  banner.style.margin = '20px auto';
  banner.style.maxWidth = '800px';
  banner.style.borderRadius = '8px';
  banner.style.cursor = 'pointer';
  banner.style.transition = 'opacity 0.2s';
  banner.style.position = 'relative';
  banner.style.zIndex = '9999';

  const typeText = type === 'player' ? 'этим игроком' : (type === 'clan' ? 'этим кланом' : 'этой картой');

  if (matchCount > 0) {
    banner.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
    banner.style.border = '2px solid #2ecc71';
    banner.style.color = '#2ecc71';
    banner.innerHTML = `📺 Найдено ${matchCount} видео на TeeTube! Нажмите, чтобы открыть Дашборд.`;
    banner.onclick = () => {
      chrome.runtime.sendMessage({ action: 'openDashboard', type, targetName });
    };
  } else {
    banner.style.backgroundColor = 'rgba(255, 50, 50, 0.2)';
    banner.style.border = '2px solid #ff3232';
    banner.style.color = '#ff8282';
    banner.innerHTML = `🚫 На TeeTube пока нет видео с ${typeText}.`;
    banner.onclick = () => {
      chrome.runtime.sendMessage({ action: 'openDashboard' });
    };
  }

  let container = document.querySelector('#content > .block') || document.querySelector('main') || document.querySelector('#app') || document.body;
  if (container) {
    container.insertBefore(banner, container.firstChild);
  }
}

