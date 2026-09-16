const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('messenger.db');

// Включаем внешние ключи
db.pragma('foreign_keys = OFF');

console.log('🔄 Пересоздаём таблицу users с поддержкой username...');

// 1. Сохраняем существующие данные (если есть)
let existingUsers = [];
try {
    existingUsers = db.prepare(`SELECT phone, name, avatar, last_seen FROM users`).all();
    console.log(` Найдено ${existingUsers.length} пользователей для сохранения`);
} catch (e) {
    console.log('ℹ️ Таблица users пуста или не существует');
}

// 2. Переименовываем старую таблицу
try {
    db.prepare(`ALTER TABLE users RENAME TO users_old`).run();
    console.log('✅ Старая таблица переименована в users_old');
} catch (e) {
    console.log('️ Таблицы users не существует, создаём новую');
}

// 3. Создаём новую таблицу с username
db.prepare(`CREATE TABLE users (
    phone TEXT PRIMARY KEY, 
    name TEXT, 
    username TEXT UNIQUE,
    avatar TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();
console.log('✅ Новая таблица users создана с колонкой username');

// 4. Возвращаем данные обратно (без username, так как его не было)
if (existingUsers.length > 0) {
    const insert = db.prepare(`INSERT INTO users (phone, name, avatar, last_seen) VALUES (?, ?, ?, ?)`);
    const insertMany = db.transaction((users) => {
        for (const user of users) {
            insert.run(user.phone, user.name, user.avatar, user.last_seen);
        }
    });
    insertMany(existingUsers);
    console.log('✅ Данные восстановлены');
}

// 5. Удаляем старую таблицу
try {
    db.prepare(`DROP TABLE users_old`).run();
    console.log('✅ Старая таблица удалена');
} catch (e) {
    console.log('ℹ️ Старая таблица уже удалена');
}

db.pragma('foreign_keys = ON');
db.close();

console.log('\n🎉 Готово! Теперь можно запускать server.js');