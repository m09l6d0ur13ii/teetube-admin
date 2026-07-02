[🇷🇺 Русский](README.ru.md) | [🇬🇧 English](README.md)

# TeeTube Admin

This is the admin panel and tagging extension for **TeeTube** moderators. 

As a moderator, you use this extension to tag new YouTube videos and push them to the global database.

## 🔗 Related Projects

TeeTube is divided into 4 repositories:
- 🛠️ [TeeTube Admin (Moderator Extension)](https://github.com/m09l6d0ur13ii/teetube-admin) - The admin extension you are looking at now.
- 🌐 [TeeTube (Frontend)](https://github.com/m09l6d0ur13ii/teetube) - The main website.
- 👁️ [TeeTube Extension (User Extension)](https://github.com/m09l6d0ur13ii/teetube-extension) - The extension for regular users.
- 💾 [TeeTube Database (Data)](https://github.com/m09l6d0ur13ii/teetube-db) - The JSON database.

## 🛠️ How to download and run this repository

To download just this extension and edit it:

```bash
git clone https://github.com/m09l6d0ur13ii/teetube-admin.git
cd teetube-admin
```
To test it in Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `teetube-admin` folder.

## 📦 How to download the ENTIRE TeeTube Project

If you want to work on all parts of TeeTube at once:

```bash
mkdir teetube-workspace
cd teetube-workspace
git clone https://github.com/m09l6d0ur13ii/teetube.git
git clone https://github.com/m09l6d0ur13ii/teetube-extension.git
git clone https://github.com/m09l6d0ur13ii/teetube-admin.git
git clone https://github.com/m09l6d0ur13ii/teetube-db.git
```

### Features
- Adds an interactive panel on YouTube to edit tags, maps, players, and clans.
- Saves your edits to local storage automatically.
- Sync your local edits directly to the GitHub `teetube-db` repository using a Personal Access Token.
