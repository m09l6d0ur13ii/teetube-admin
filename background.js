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
