// These are the possible tags we can apply to a YouTube video.
// If you want to add a new tag category, put it here!
const CATEGORIES = {
  game: ["ddnet", "teeworlds", "ddper"],
  video: ["moment", "montage", "playthrough", "speedrun", "t0speedrun", "tutorial", "trailer", "skips", "animation", "gameplay", "tournament", "match", "podcast", "fun", "meme", "other"],
  mode: ["DDRace", "Gores", "fng", "F-DDrace", "Race", "Block", "BOMB", "CTF", "TB", "TeeWare", "InfClass", "Monster", "zCatch", "Foot", "DM", "Soup", "AXRace", "Sheep", "Battle", "Training", "other mods"],
  gameplayer: ["real", "tas", "dummy"],
  lang: ["ru", "en", "zh", "other"]
};

// We keep track of the current video we're looking at.
let currentVideoId = null;
// This holds the data for the video. We start with an empty template so we can add new tags easily!
let currentData = { tags: { game: [], video: [], mode: [], gameplayer: [], lang: [] }, players: [], maps: [], clans: [] };
let cachedMaps = [];

// Helper to prevent XSS
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseNum(str) {
  if (!str) return 0;
  let s = str.toString().toLowerCase();
  let multi = 1;
  if (s.includes('k') || s.includes('тыс')) { multi = 1000; s = s.replace(',', '.'); }
  if (s.includes('m') || s.includes('млн')) { multi = 1000000; s = s.replace(',', '.'); }
  return Math.floor((parseFloat(s.replace(/[^\d.]/g, '')) || 0) * multi);
}

// Grab the video ID from the YouTube URL (the part after ?v=)
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// We listen for changes to the local storage, but for the admin panel, we don't need to auto-refresh 
// right now to avoid overwriting our own typing.
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.videos) {
    if (typeof allVideosCache !== 'undefined') {
      allVideosCache = changes.videos.newValue || {};
      if (typeof updateAuthorCounts === 'function') updateAuthorCounts();
      if (typeof injectThumbnails === 'function') injectThumbnails();
      if (typeof injectChannelBadges === 'function') injectChannelBadges();
    }
  }
});

// This big function scrapes the YouTube page to find metadata about the video.
// We need the title, author, view count, likes, and upload date.
function getMetadata() {
  // Try to find the title element on the page
  const titleEl = document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string') || document.querySelector('h1.title yt-formatted-string');
  const title = titleEl ? titleEl.innerText : 'Unknown Title';

  // Try to find the channel name (author)
  const authorEl = document.querySelector('ytd-watch-metadata #owner yt-formatted-string a') || document.querySelector('#owner-name a');
  const author = authorEl ? authorEl.innerText : 'Unknown Author';

  // Views can be tricky to find because YouTube changes its layout often.
  // We first check the meta tags.
  const viewsMeta = document.querySelector('meta[itemprop="interactionCount"]');
  let views = viewsMeta ? viewsMeta.content : null;

  // If no meta tag, we search the page text for words like "views" or "просмотр" (Russian)
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

  // Do the same for the upload date
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

  // Finding likes is the hardest part. We check the button text and aria-labels for numbers.
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

  // We can always build the thumbnail URL ourselves using the video ID!
  const thumbnail = `https://i.ytimg.com/vi/${currentVideoId}/hqdefault.jpg`;

  // Return everything neatly packed in an object, plus a timestamp so we know when it was tagged.
  return { title, author, views: parseNum(views), likes: parseNum(likes), date, thumbnail, timestamp: Date.now() };
}

function isVideoEmpty(data) {
  const hasTags = Object.values(data.tags || {}).some(arr => arr.length > 0);
  const hasPlayers = (data.players || []).length > 0;
  const hasMaps = (data.maps || []).length > 0;
  const hasClans = (data.clans || []).length > 0;
  return !hasTags && !hasPlayers && !hasMaps && !hasClans;
}

// This saves our edits for the current video into Chrome's local storage.
function saveData() {
  if (!currentVideoId) return;
  
  chrome.storage.local.get(['videos'], (res) => {
    const videos = res.videos || {};
    
    if (isVideoEmpty(currentData)) {
      // If the video has no tags, players, maps, or clans left, remove it!
      delete videos[currentVideoId];
    } else {
      // Grab the latest metadata from the page
      const metadata = getMetadata();
      // Merge the metadata with our tags/players/maps
      const videoObj = { ...metadata, ...currentData };
      videos[currentVideoId] = videoObj;
    }
    
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
  const vid = currentVideoId;
  if (!vid) return;
  const readOnlyPanel = document.getElementById('ddnettube-readonly-panel');
  if (readOnlyPanel) readOnlyPanel.remove();

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
    nickEl.innerHTML = `<span>${esc(nick)}</span><span class="ddnettube-nickname-remove">×</span>`;
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
    mapEl.innerHTML = `<span>${esc(mapName)}</span><span class="ddnettube-nickname-remove">×</span>`;
    mapEl.querySelector('.ddnettube-nickname-remove').onclick = () => removeMap(mapName);
    mapRow.appendChild(mapEl);
  });

  // Map Autocomplete Wrapper
  const mapInputWrapper = document.createElement('div');
  mapInputWrapper.style.position = 'relative';
  mapInputWrapper.style.display = 'inline-block';

  const mapInput = document.createElement('input');
  mapInput.className = 'ddnettube-text-input';
  mapInput.placeholder = 'Add map and press Enter...';
  
  const dropdown = document.createElement('div');
  dropdown.className = 'ddnettube-autocomplete-dropdown';
  dropdown.style.display = 'none';

  mapInput.oninput = (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (!val) {
      dropdown.style.display = 'none';
      return;
    }
    
    // Filter maps (up to 10 matches)
    const matches = cachedMaps.filter(m => m.toLowerCase().includes(val)).slice(0, 10);
    
    if (matches.length > 0) {
      dropdown.innerHTML = '';
      matches.forEach(match => {
        const item = document.createElement('div');
        item.className = 'ddnettube-autocomplete-item';
        item.innerText = match;
        item.onmousedown = () => {
          addMap(match);
          mapInput.value = '';
          dropdown.style.display = 'none';
        };
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    } else {
      dropdown.style.display = 'none';
    }
  };

  mapInput.onblur = () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  };

  mapInput.onfocus = () => {
    if (mapInput.value.trim()) mapInput.dispatchEvent(new Event('input'));
  };

  mapInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      addMap(e.target.value);
      mapInput.value = '';
      dropdown.style.display = 'none';
    }
  };
  
  mapInputWrapper.appendChild(mapInput);
  mapInputWrapper.appendChild(dropdown);
  mapRow.appendChild(mapInputWrapper);

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
    clanEl.innerHTML = `<span>${esc(clanName)}</span><span class="ddnettube-nickname-remove">×</span>`;
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
  currentData = { tags: { game: [], video: [], mode: [], gameplayer: [], lang: [] }, players: [], maps: [], clans: [] };

  // Load existing data
  chrome.storage.local.get(['videos', 'cached_maps', 'cached_maps_time'], (res) => {
    const videos = res.videos || {};
    
    // Setup maps cache
    cachedMaps = res.cached_maps || [];
    const now = Date.now();
    if (!res.cached_maps_time || (now - res.cached_maps_time > 24 * 60 * 60 * 1000) || cachedMaps.length === 0) {
      fetch('https://ddstats.tw/maps/json')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            cachedMaps = data.map(m => m.map); // Extract map names
            chrome.storage.local.set({ cached_maps: cachedMaps, cached_maps_time: now });
          }
        }).catch(err => console.error("Failed to fetch DDStats maps", err));
    }

    if (videos[vid]) {
      currentData.tags = videos[vid].tags || { game: [], video: [], mode: [], gameplayer: [], lang: [] };
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
if (!document.getElementById('ddnettube-admin-active')) {
  const marker = document.createElement('div');
  marker.id = 'ddnettube-admin-active';
  marker.style.display = 'none';
  document.body.appendChild(marker);
}

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

// --- Thumbnail Badges ---
let allVideosCache = {};
let authorCounts = {};

function updateAuthorCounts() {
  authorCounts = {};
  Object.values(allVideosCache).forEach(v => {
    if (v.author) {
      const author = v.author.trim().toLowerCase();
      authorCounts[author] = (authorCounts[author] || 0) + 1;
    }
  });
}

chrome.storage.local.get(['videos'], (res) => {
  allVideosCache = res.videos || {};
  updateAuthorCounts();
  if (window.location.hostname.includes('youtube.com')) {
    injectThumbnails();
    injectChannelBadges();
  }
});

function injectThumbnails() {
  const links = document.querySelectorAll('a[href*="/watch?v="]');
  links.forEach(link => {
    try {
      const url = new URL(link.href);
      const vid = url.searchParams.get('v');
      if (!vid) return;

      const hasImage = link.querySelector('img, yt-image, yt-thumbnail-view-model');
      const isThumbnail = link.id === 'thumbnail' || (typeof link.className === 'string' && (link.className.includes('thumbnail') || link.className.includes('ytLockupViewModelContentImage')));
      
      if (!hasImage && !isThumbnail) {
        const wrongBadge = link.querySelector('.teetube-saved-badge');
        if (wrongBadge) wrongBadge.remove();
        return;
      }

      const existingBadge = link.querySelector('.teetube-saved-badge');
      
      if (allVideosCache[vid]) {
         if (!existingBadge) {
             const badge = document.createElement('div');
             badge.className = 'teetube-saved-badge';
             badge.innerHTML = '✔ teetube';
             const thumb = link.querySelector('yt-thumbnail-view-model') || link.querySelector('ytd-thumbnail') || link;
             thumb.appendChild(badge);
         }
      } else {
         if (existingBadge) existingBadge.remove();
      }
    } catch (e) {}
  });
}

function injectChannelBadges() {
  const channelEls = document.querySelectorAll(`
    ytd-channel-name yt-formatted-string#text,
    #channel-name yt-formatted-string#text,
    yt-page-header-view-model h1.dynamicTextViewModelH1 span,
    ytd-video-meta-block .ytContentMetadataViewModelMetadataText,
    ytd-channel-name .ytContentMetadataViewModelMetadataText,
    #channel-name .ytContentMetadataViewModelMetadataText
  `);
  
  channelEls.forEach(el => {
    try {
      let badge = el.querySelector('.teetube-channel-badge');
      let rawText = el.innerText || el.textContent || '';
      if (badge) {
        rawText = rawText.replace(badge.innerText || badge.textContent, '');
      }
      const author = rawText.trim();
      
      if (!author) return;
      const lowerAuthor = author.toLowerCase();
      
      const count = authorCounts[lowerAuthor];
      if (!count) {
        if (badge) badge.remove();
        return;
      }

      // badge is already defined above
      
      let badgeText = `✔ teetube (${count} saved)`;

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'teetube-channel-badge';
        el.appendChild(badge);
      }
      badge.innerHTML = badgeText;
    } catch (e) {}
  });
}

if (window.location.hostname.includes('youtube.com')) {
  setInterval(() => {
    injectThumbnails();
    injectChannelBadges();
  }, 1500);
}

// --- End of content.js ---
