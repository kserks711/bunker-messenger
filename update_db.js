const Database = require('better-sqlite3');
const db = new Database('messenger.db');

try {
    // Добавляем поле username (уникальное)
    db.prepare(`ALTER TABLE users ADD COLUMN username TEXT UNIQUE`).run();
    console.log('✅ Поле username добавлено');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('ℹ️ Поле username уже существует');
    } else {
        console.error('❌ Ошибка:', e.message);
    }
}

console.log('🎉 База данных обновлена!');