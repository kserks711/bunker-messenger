const Database = require('better-sqlite3');
const db = new Database('messenger.db');

try {
    // Пытаемся добавить колонку
    db.prepare(`ALTER TABLE users ADD COLUMN username TEXT UNIQUE`).run();
    console.log('✅ Колонка username успешно добавлена!');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('️ Колонка username уже существует. Всё в порядке.');
    } else {
        console.error('❌ Критическая ошибка:', e.message);
        process.exit(1);
    }
}

// Проверяем, что колонка реально есть
const info = db.prepare("PRAGMA table_info(users)").all();
const hasUsername = info.some(col => col.name === 'username');

if (hasUsername) {
    console.log('🎉 Проверка пройдена: колонка username присутствует в таблице users');
} else {
    console.error('⚠️ ВНИМАНИЕ: Колонка не найдена даже после попытки добавления!');
    console.error('Возможно, база данных повреждена или заблокирована.');
}

db.close();