const Database = require('better-sqlite3');
const db = new Database('messenger.db');
try {
    db.prepare(`ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'`).run();
    console.log('✅ Колонка type добавлена');
} catch(e) {
    console.log('ℹ️ Колонка type уже существует');
}
db.close();