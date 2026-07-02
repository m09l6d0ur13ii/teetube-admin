const CATEGORIES = {
  game: ["ddnet", "teeworlds", "ddper"],
  video: ["moment", "montage", "прохождение", "speedrun", "t0speedrun", "tutorial", "trailer", "skips", "fun", "meme", "other"],
  mode: ["ddrace", "ctf", "dm", "race", "fng", "gores", "block", "other mods"],
  gameplayer: ["real", "tas"]
};

let currentVideoId = null;
let currentData = { tags: { game: [], video: [], mode: [], gameplayer: [] }, players: [], maps: [], clans: [] };

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

      const wrapper = link.closest('ytd-thumbnail') || link;
      const hasBadge = wrapper.querySelector('.teetube-saved-badge');
      
      if (savedVideoIds.has(vid)) {
        if (!hasBadge) {
          const badge = document.createElement('div');
          badge.className = 'teetube-saved-badge';
          badge.innerText = '✓ TeeTube';
          badge.style.zIndex = '1000';
          wrapper.style.position = 'relative'; 
          
          // Append as first child or inside the link so it sits on top of the image
          const thumbnailLink = wrapper.querySelector('a#thumbnail') || wrapper;
          thumbnailLink.style.position = 'relative';
          thumbnailLink.appendChild(badge);
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

let markTimeout = null;
function debouncedMarkThumbnails() {
  if (markTimeout) clearTimeout(markTimeout);
  markTimeout = setTimeout(markThumbnails, 500);
}

fetchSavedVideos(() => {
  markThumbnails();
  const observer = new MutationObserver(debouncedMarkThumbnails);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
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

function addPlayer(nick) {
  nick = nick.trim();
  if (nick && !currentData.players.includes(nick)) {
    currentData.players.push(nick);
    saveData();
    renderPanel();
  }
}

function removePlayer(nick) {
  const idx = currentData.players.indexOf(nick);
  if (idx > -1) {
    currentData.players.splice(idx, 1);
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

  // Render Players
  const nickRow = document.createElement('div');
  nickRow.className = 'ddnettube-row';

  const nickLabel = document.createElement('div');
  nickLabel.className = 'ddnettube-label';
  nickLabel.innerText = 'Players:';
  nickRow.appendChild(nickLabel);

  currentData.players.forEach(nick => {
    const nickEl = document.createElement('div');
    nickEl.className = 'ddnettube-nickname';
    nickEl.innerHTML = `<span>${nick}</span><span class="ddnettube-nickname-remove">×</span>`;
    nickEl.querySelector('.ddnettube-nickname-remove').onclick = () => removePlayer(nick);
    nickRow.appendChild(nickEl);
  });

  const nickInput = document.createElement('input');
  nickInput.className = 'ddnettube-text-input';
  nickInput.placeholder = 'Add player and press Enter...';
  nickInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      addPlayer(e.target.value);
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
  currentData = { tags: { game: [], video: [], mode: [], gameplayer: [] }, players: [], maps: [], clans: [] };

  // Load existing data
  chrome.storage.local.get(['videos'], (res) => {
    const videos = res.videos || {};
    if (videos[vid]) {
      currentData.tags = videos[vid].tags || { game: [], video: [], mode: [], gameplayer: [] };
      currentData.players = videos[vid].players || videos[vid].nicknames || []; // fallback for old data
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

// --- End of content.js ---
