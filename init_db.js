const Database = require('better-sqlite3');
const db = new Database('messenger.db');

// Включаем внешние ключи
db.pragma('foreign_keys = ON');

// Таблица пользователей (уже есть, но создаем если нет)
db.prepare(`CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY, 
    name TEXT, 
    avatar TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Таблица чатов (личные и групповые)
db.prepare(`CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'private' или 'group'
    name TEXT, -- для групп
    avatar TEXT, -- для групп
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
)`).run();

// Участники чата
db.prepare(`CREATE TABLE IF NOT EXISTS chat_participants (
    chat_id INTEGER,
    user_phone TEXT,
    role TEXT DEFAULT 'member', -- 'admin' для создателя группы
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_phone),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (user_phone) REFERENCES users(phone)
)`).run();

// Сообщения (обновленная версия)
db.prepare(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    sender_phone TEXT NOT NULL,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_phone) REFERENCES users(phone)
)`).run();

// Индексы для скорости
db.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id)`);
db.prepare(`CREATE INDEX IF NOT EXISTS idx_participants_user ON chat_participants(user_phone)`);

console.log('✅ База данных обновлена!');

// Создаем тестового пользователя (опционально)
// db.prepare(`INSERT OR REPLACE INTO users (phone, name) VALUES ('+79999999999', 'Test User')`).run();