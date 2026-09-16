const Database = require('better-sqlite3');
const db = new Database('messenger.db');

try {
    db.prepare(`ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'`).run();
    console.log('✅ Колонка type успешно добавлена!');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('ℹ️ Колонка type уже существует');
    } else {
        console.error('❌ Ошибка:', e.message);
    }
}

db.close();