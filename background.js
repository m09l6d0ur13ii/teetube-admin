const DB_URL = 'https://cdn.jsdelivr.net/gh/m09l6d0ur13ii/teetube-db@main/database.json';

async function updateAdminDatabase() {
  try {
    const res = await fetch(DB_URL + '?_=' + Date.now());
    if (res.ok) {
      const db = await res.json();
      if (db && db.videos) {
        chrome.storage.local.get(['videos'], (localRes) => {
          const localVideos = localRes.videos || {};
          // Merge remote videos with local videos (local takes precedence if edited)
          const merged = { ...db.videos, ...localVideos };
          chrome.storage.local.set({ videos: merged });
        });
      }
    }
  } catch (e) {
    console.error('TeeTube Admin: Failed to update database', e);
  }
}

chrome.runtime.onStartup.addListener(updateAdminDatabase);
chrome.runtime.onInstalled.addListener(updateAdminDatabase);
setInterval(updateAdminDatabase, 60 * 60 * 1000);

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'dashboard.html' });
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'openDashboard') {
    let url = 'dashboard.html';
    if (req.type && req.targetName) {
      url += `?${req.type}=${encodeURIComponent(req.targetName)}`;
    }
    chrome.tabs.create({ url });
  }
});
