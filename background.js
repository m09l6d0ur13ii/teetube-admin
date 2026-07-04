// We define the URL of our global database hosted on GitHub via jsDelivr CDN.
const DB_URL = 'https://cdn.jsdelivr.net/gh/m09l6d0ur13ii/teetube-db@main/database.json';

// This function fetches the latest database and merges it with our local admin changes.
async function updateAdminDatabase() {
  try {
    // Fetch the database, trying to bypass the browser cache with a timestamp
    const res = await fetch(DB_URL + '?_=' + Date.now());
    
    // If the fetch was successful
    if (res.ok) {
      // Parse the JSON data
      const db = await res.json();
      
      // If we got valid video data
      if (db && db.videos) {
        // Get our current local videos from storage
        chrome.storage.local.get(['videos'], (localRes) => {
          const localVideos = localRes.videos || {};
          
          // Merge the remote videos with our local ones. 
          // Only overwrite remote data if the local video has unsynced changes (timestamp)
          const merged = { ...db.videos };
          for (const [id, v] of Object.entries(localVideos)) {
            if (v.timestamp || !merged[id]) {
              merged[id] = v;
            }
          }
          
          // Save the merged result back to local storage
          chrome.storage.local.set({ videos: merged });
        });
      }
    }
  } catch (e) {
    // Log any errors that happen during the fetch
    console.error('TeeTube Admin: Failed to update database', e);
  }
}

// Update the database when the browser starts or when the extension is installed
chrome.runtime.onStartup.addListener(updateAdminDatabase);
chrome.runtime.onInstalled.addListener(updateAdminDatabase);

// Also update it every 1 hour (60 * 60 * 1000 ms)
setInterval(updateAdminDatabase, 60 * 60 * 1000);

// When the admin clicks the extension icon, open the dashboard panel
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'dashboard.html' });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // If the content script wants to open the dashboard (e.g. from a tracker banner)
  if (req.action === 'openDashboard') {
    let url = 'dashboard.html';
    
    // If they passed a specific filter type and name, append it to the URL
    if (req.type && req.targetName) {
      url += `?${req.type}=${encodeURIComponent(req.targetName)}`;
    }
    
    // Open the dashboard tab with the built URL
    chrome.tabs.create({ url });
  }
});
