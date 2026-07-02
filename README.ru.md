[🇷🇺 Русский](README.ru.md) | [🇬🇧 English](README.md)

# TeeTube Admin

Это панель администратора и расширение для модераторов **TeeTube**. 

Модераторы используют это расширение, чтобы добавлять теги к новым видео на YouTube и отправлять их в глобальную базу данных.

## 🔗 Связанные проекты

TeeTube разделен на 4 репозитория:
- 🛠️ [TeeTube Admin (Админка)](https://github.com/m09l6d0ur13ii/teetube-admin) - Это расширение.
- 🌐 [TeeTube (Сайт)](https://github.com/m09l6d0ur13ii/teetube) - Главный сайт.
- 👁️ [TeeTube Extension (Для пользователей)](https://github.com/m09l6d0ur13ii/teetube-extension) - Обычное расширение.
- 💾 [TeeTube Database (База)](https://github.com/m09l6d0ur13ii/teetube-db) - JSON база всех видео.

## 🛠️ Как скачать и запустить этот репозиторий

Чтобы скачать только это расширение:

```bash
git clone https://github.com/m09l6d0ur13ii/teetube-admin.git
cd teetube-admin
```
Чтобы установить в Chrome:
1. Откройте `chrome://extensions/`
2. Включите "Режим разработчика"
3. Нажмите "Загрузить распакованное расширение" и выберите папку `teetube-admin`.

## 📦 Как скачать ВЕСЬ проект TeeTube

Если вы хотите работать со всеми частями TeeTube сразу:

```bash
mkdir teetube-workspace
cd teetube-workspace
git clone https://github.com/m09l6d0ur13ii/teetube.git
git clone https://github.com/m09l6d0ur13ii/teetube-extension.git
git clone https://github.com/m09l6d0ur13ii/teetube-admin.git
git clone https://github.com/m09l6d0ur13ii/teetube-db.git
```

### Особенности
- Добавляет интерактивную панель на YouTube для изменения тегов, карт, игроков и кланов.
- Автоматически сохраняет ваши изменения локально.
- Позволяет синхронизировать локальные изменения с репозиторием GitHub `teetube-db` через токен доступа (PAT).
