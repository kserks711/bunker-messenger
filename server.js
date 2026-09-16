const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'uploads', 'images');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Только изображения!'));
    }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

const db = new Database('messenger.db');
db.pragma('foreign_keys = ON');

const onlineUsers = new Map();

function getUserChats(phone) {
    return db.prepare(`
      SELECT c.id, c.type, c.name, c.created_at,
             (SELECT GROUP_CONCAT(u.name) FROM chat_participants cp 
              JOIN users u ON cp.user_phone = u.phone 
              WHERE cp.chat_id = c.id AND cp.user_phone != ?) as participants_names,
             (SELECT m.text FROM messages m WHERE m.chat_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_text,
             (SELECT m.type FROM messages m WHERE m.chat_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_type,
             (SELECT u.name FROM messages m JOIN users u ON m.sender_phone = u.phone WHERE m.chat_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_sender
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_phone = ?
      ORDER BY c.id DESC
    `).all(phone, phone);
}

function getChatHistory(chatId) {
    return db.prepare(`
      SELECT m.*, u.name as sender_name, u.avatar as sender_avatar, u.username as sender_username
      FROM messages m JOIN users u ON m.sender_phone = u.phone
      WHERE m.chat_id = ? ORDER BY m.timestamp ASC LIMIT 100
    `).all(chatId);
}

app.post('/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
        const fileUrl = `/uploads/images/${req.file.filename}`;
        db.prepare(`INSERT INTO messages (chat_id, sender_phone, text, type) VALUES (?, ?, ?, 'image')`).run(
            req.body.chat_id, req.body.sender_phone, fileUrl
        );
        const message = {
            chat_id: req.body.chat_id,
            sender_phone: req.body.sender_phone,
            sender_name: req.body.sender_name,
            sender_username: req.body.sender_username,
            sender_avatar: req.body.sender_avatar,
            text: fileUrl,
            type: 'image',
            timestamp: new Date().toISOString()
        };
        io.to(`chat_${req.body.chat_id}`).emit('chat message', message);
        const participants = db.prepare(`SELECT user_phone FROM chat_participants WHERE chat_id = ?`).all(req.body.chat_id);
        participants.forEach(p => {
            const sockId = onlineUsers.get(p.user_phone);
            if (sockId) io.to(sockId).emit('chat list', getUserChats(p.user_phone));
        });
        res.json({ success: true, url: fileUrl });
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register user', (userData, callback) => {
    if (!userData.phone || userData.phone.length < 5) {
      if (callback) callback({ success: false, error: 'Неверный телефон' });
      return;
    }
    if (userData.username) {
      const existing = db.prepare(`SELECT phone FROM users WHERE username = ?`).get(userData.username);
      if (existing && existing.phone !== userData.phone) {
        if (callback) callback({ success: false, error: 'Этот юзернейм уже занят' });
        return;
      }
    }
    db.prepare(`INSERT OR REPLACE INTO users (phone, name, username, avatar, last_seen) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(
      userData.phone, userData.name, userData.username || null, userData.avatar
    );
    socket.userData = userData;
    socket.phone = userData.phone;
    onlineUsers.set(userData.phone, socket.id);
    io.emit('user status', { phone: userData.phone, status: 'online' });
    if (callback) callback({ success: true });
    socket.emit('auth success', userData);
    socket.emit('chat list', getUserChats(userData.phone));
  });

  socket.on('check username', (username, callback) => {
    const existing = db.prepare(`SELECT phone FROM users WHERE username = ?`).get(username);
    const isAvailable = !existing || existing.phone === socket.userData.phone;
    callback(isAvailable);
  });

  socket.on('update profile', (data, callback) => {
    if (!socket.userData) {
      if (callback) callback({ success: false, error: 'Не авторизован' });
      return;
    }
    try {
      if (data.username) {
        const existing = db.prepare(`SELECT phone FROM users WHERE username = ?`).get(data.username);
        if (existing && existing.phone !== socket.userData.phone) {
          if (callback) callback({ success: false, error: 'Юзернейм занят' });
          return;
        }
      }
      db.prepare(`UPDATE users SET name = ?, username = ?, avatar = ? WHERE phone = ?`).run(
        data.name, data.username || null, data.avatar || null, socket.userData.phone
      );
      socket.userData = { ...socket.userData, ...data };
      io.emit('user updated', {
        phone: socket.userData.phone, name: socket.userData.name,
        username: socket.userData.username, avatar: socket.userData.avatar
      });
      const userChats = db.prepare(`SELECT chat_id FROM chat_participants WHERE user_phone = ?`).all(socket.userData.phone);
      userChats.forEach(c => {
        const participants = db.prepare(`SELECT user_phone FROM chat_participants WHERE chat_id = ?`).all(c.chat_id);
        participants.forEach(p => {
          const sockId = onlineUsers.get(p.user_phone);
          if (sockId) io.to(sockId).emit('chat list', getUserChats(p.user_phone));
        });
      });
      if (callback) callback({ success: true });
    } catch (err) {
      console.error('Ошибка обновления профиля:', err);
      if (callback) callback({ success: false, error: 'Ошибка сервера' });
    }
  });

  socket.on('typing', (data) => {
    if (!socket.userData || !data.chat_id) return;
    socket.to(`chat_${data.chat_id}`).emit('user typing', {
      phone: socket.userData.phone, name: socket.userData.name, chat_id: data.chat_id
    });
  });

  socket.on('stop typing', (data) => {
    if (!socket.userData || !data.chat_id) return;
    socket.to(`chat_${data.chat_id}`).emit('user stopped typing', {
      phone: socket.userData.phone, chat_id: data.chat_id
    });
  });

  socket.on('search users', (query) => {
    if (!socket.userData) return;
    const users = db.prepare(`
      SELECT phone, name, username, avatar FROM users 
      WHERE (name LIKE ? OR phone LIKE ? OR username LIKE ?) AND phone != ?
      LIMIT 20
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, socket.userData.phone);
    socket.emit('search results', users);
  });

  socket.on('create or get chat', (data) => {
    if (!socket.userData) return;
    const { targetPhone } = data;
    const existingChat = db.prepare(`
        SELECT c.id FROM chats c
        JOIN chat_participants p1 ON c.id = p1.chat_id AND p1.user_phone = ?
        JOIN chat_participants p2 ON c.id = p2.chat_id AND p2.user_phone = ?
        WHERE c.type = 'private'
    `).get(socket.userData.phone, targetPhone);

    let chatId;
    if (existingChat) {
        chatId = existingChat.id;
    } else {
        const res = db.prepare(`INSERT INTO chats (type, created_by) VALUES ('private', ?)`).run(socket.userData.phone);
        chatId = res.lastInsertRowid;
        db.prepare(`INSERT INTO chat_participants (chat_id, user_phone) VALUES (?, ?)`).run(chatId, socket.userData.phone);
        db.prepare(`INSERT INTO chat_participants (chat_id, user_phone) VALUES (?, ?)`).run(chatId, targetPhone);
    }
    socket.emit('chat list', getUserChats(socket.userData.phone));
    socket.join(`chat_${chatId}`);
    socket.emit('chat history', getChatHistory(chatId));
    const targetSocketId = onlineUsers.get(targetPhone);
    if (targetSocketId) io.to(targetSocketId).emit('chat list', getUserChats(targetPhone));
  });

  socket.on('join chat', (chatId) => {
    if (!socket.userData) return;
    socket.join(`chat_${chatId}`);
    socket.emit('chat history', getChatHistory(chatId));
  });

  socket.on('chat message', (data) => {
    if (!socket.userData) return;
    const { chat_id, text } = data;
    db.prepare(`INSERT INTO messages (chat_id, sender_phone, text, type) VALUES (?, ?, ?, 'text')`).run(chat_id, socket.userData.phone, text);
    const message = {
      chat_id, sender_phone: socket.userData.phone,
      sender_name: socket.userData.name, sender_username: socket.userData.username,
      sender_avatar: socket.userData.avatar,
      text, type: 'text',
      timestamp: new Date().toISOString()
    };
    io.to(`chat_${chat_id}`).emit('chat message', message);
    const participants = db.prepare(`SELECT user_phone FROM chat_participants WHERE chat_id = ?`).all(chat_id);
    participants.forEach(p => {
        const sockId = onlineUsers.get(p.user_phone);
        if (sockId) io.to(sockId).emit('chat list', getUserChats(p.user_phone));
    });
  });

  socket.on('disconnect', () => {
    if (socket.userData) {
      onlineUsers.delete(socket.userData.phone);
      io.emit('user status', { phone: socket.userData.phone, status: 'offline' });
    }
  });
});

server.listen(3000, () => console.log('🚀 Bunker Messenger running on http://localhost:3000'));