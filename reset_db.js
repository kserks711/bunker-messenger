const Database = require('better-sqlite3');
const fs = require('fs');

// Удаляем старый файл базы, если он есть
if (fs.existsSync('messenger.db')) {
    fs.unlinkSync('messenger.db');
    console.log('️ Старая база данных удалена');
}

const db = new Database('messenger.db');
db.pragma('foreign_keys = ON');

console.log('🏗️ Создаём новую базу данных...');

// Таблица пользователей (сразу с username)
db.prepare(`CREATE TABLE users (
    phone TEXT PRIMARY KEY, 
    name TEXT NOT NULL, 
    username TEXT UNIQUE,
    avatar TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Таблица чатов
db.prepare(`CREATE TABLE chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('private', 'group')),
    name TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(phone)
)`).run();

// Участники чата
db.prepare(`CREATE TABLE chat_participants (
    chat_id INTEGER NOT NULL,
    user_phone TEXT NOT NULL,
    role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_phone),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (user_phone) REFERENCES users(phone)
)`).run();

// Сообщения
db.prepare(`CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    sender_phone TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_phone) REFERENCES users(phone)
)`).run();

// Индексы для скорости
db.prepare(`CREATE INDEX idx_messages_chat ON messages(chat_id)`);
db.prepare(`CREATE INDEX idx_participants_user ON chat_participants(user_phone)`);
db.prepare(`CREATE INDEX idx_users_username ON users(username)`);

db.close();
console.log('✅ База данных успешно создана! Можно запускать server.js');