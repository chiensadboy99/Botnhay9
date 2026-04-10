/// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware bảo mật
app.use(helmet({
    contentSecurityPolicy: false, // Tắt nếu cần dùng inline script
}));

// CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', '*'],
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Rate limiting - chống spam
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // giới hạn 100 request mỗi IP
    message: { success: false, error: 'Quá nhiều request, vui lòng thử lại sau 15 phút!' }
});
app.use('/api/', limiter);

// File lưu trữ keys
const KEYS_FILE = path.join(__dirname, 'data', 'keys.json');
const LOGS_FILE = path.join(__dirname, 'data', 'logs.json');

// Tạo thư mục data nếu chưa có
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

// Khởi tạo file keys nếu chưa có
if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({
        keys: [
            { 
                id: 'key1', 
                code: 'NTT-1Ngay-Key1', 
                created_at: new Date().toISOString(), 
                created_by: 'system',
                expires_at: null,
                is_active: true,
                usage_count: 0
            },
            { 
                id: 'key2', 
                code: 'NTT-3Day-Key2', 
                created_at: new Date().toISOString(), 
                created_by: 'system',
                expires_at: null,
                is_active: true,
                usage_count: 0
            },
            { 
                id: 'key3', 
                code: 'NTT-1Week-Key3', 
                created_at: new Date().toISOString(), 
                created_by: 'system',
                expires_at: null,
                is_active: true,
                usage_count: 0
            }
        ]
    }, null, 2));
}

// Khởi tạo file logs
if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, JSON.stringify({ logs: [] }, null, 2));
}

// ========== Helper Functions ==========
function readKeys() {
    const data = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(data);
}

function writeKeys(keysData) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keysData, null, 2));
}

function addLog(action, details) {
    const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    data.logs.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        action: action,
        details: details,
        ip: 'server'
    });
    // Chỉ giữ 1000 log gần nhất
    if (data.logs.length > 1000) data.logs = data.logs.slice(0, 1000);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
    return Date.now().toString() + '-' + Math.random().toString(36).substr(2, 6);
}

// ========== API Endpoints ==========

// Lấy danh sách tất cả keys
app.get('/api/keys', (req, res) => {
    try {
        const data = readKeys();
        // Ẩn thông tin nhạy cảm nếu cần
        const safeKeys = data.keys.map(k => ({
            id: k.id,
            code: k.code,
            created_at: k.created_at,
            created_by: k.created_by,
            expires_at: k.expires_at,
            is_active: k.is_active,
            usage_count: k.usage_count
        }));
        res.json({ success: true, keys: safeKeys, total: safeKeys.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Tạo key mới
app.post('/api/keys/create', (req, res) => {
    try {
        const { keyCode, createdBy, expiresInDays } = req.body;
        
        if (!keyCode || keyCode.trim() === '') {
            return res.status(400).json({ success: false, error: 'Vui lòng nhập key code!' });
        }
        
        if (keyCode.length < 6) {
            return res.status(400).json({ success: false, error: 'Key phải có ít nhất 6 ký tự!' });
        }
        
        const data = readKeys();
        
        // Kiểm tra key đã tồn tại
        if (data.keys.find(k => k.code === keyCode)) {
            return res.status(400).json({ success: false, error: 'Key này đã tồn tại!' });
        }
        
        // Tính ngày hết hạn nếu có
        let expires_at = null;
        if (expiresInDays && expiresInDays > 0) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + expiresInDays);
            expires_at = expiryDate.toISOString();
        }
        
        // Tạo key mới
        const newKey = {
            id: generateId(),
            code: keyCode,
            created_at: new Date().toISOString(),
            created_by: createdBy || 'admin',
            expires_at: expires_at,
            is_active: true,
            usage_count: 0
        };
        
        data.keys.push(newKey);
        writeKeys(data);
        addLog('CREATE_KEY', `Key "${keyCode}" được tạo bởi ${createdBy || 'admin'}`);
        
        res.json({ 
            success: true, 
            key: newKey, 
            message: `✅ Tạo key thành công! ${expires_at ? `Hết hạn sau ${expiresInDays} ngày` : 'Không giới hạn'}` 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xóa key theo ID
app.delete('/api/keys/delete/:id', (req, res) => {
    try {
        const { id } = req.params;
        const data = readKeys();
        
        const keyIndex = data.keys.findIndex(k => k.id === id);
        if (keyIndex === -1) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy key!' });
        }
        
        const deletedKey = data.keys[keyIndex];
        data.keys.splice(keyIndex, 1);
        writeKeys(data);
        addLog('DELETE_KEY', `Xóa key "${deletedKey.code}" (ID: ${id})`);
        
        res.json({ success: true, deletedKey, message: `🗑️ Đã xóa key: ${deletedKey.code}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xóa key theo code
app.delete('/api/keys/delete-by-code/:code', (req, res) => {
    try {
        const { code } = req.params;
        const data = readKeys();
        
        const keyIndex = data.keys.findIndex(k => k.code === code);
        if (keyIndex === -1) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy key!' });
        }
        
        const deletedKey = data.keys[keyIndex];
        data.keys.splice(keyIndex, 1);
        writeKeys(data);
        addLog('DELETE_KEY_BY_CODE', `Xóa key "${deletedKey.code}"`);
        
        res.json({ success: true, deletedKey, message: `🗑️ Đã xóa key: ${deletedKey.code}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xóa nhiều keys cùng lúc
app.post('/api/keys/delete-multiple', (req, res) => {
    try {
        const { keyIds } = req.body;
        if (!keyIds || !Array.isArray(keyIds) || keyIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Vui lòng cung cấp danh sách key IDs!' });
        }
        
        const data = readKeys();
        const deletedKeys = [];
        const remainingKeys = data.keys.filter(k => {
            if (keyIds.includes(k.id)) {
                deletedKeys.push(k);
                return false;
            }
            return true;
        });
        
        data.keys = remainingKeys;
        writeKeys(data);
        addLog('DELETE_MULTIPLE_KEYS', `Xóa ${deletedKeys.length} keys: ${deletedKeys.map(k => k.code).join(', ')}`);
        
        res.json({ success: true, deletedCount: deletedKeys.length, deletedKeys, message: `Đã xóa ${deletedKeys.length} keys!` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xác thực key
app.post('/api/keys/verify', (req, res) => {
    try {
        const { keyCode } = req.body;
        const data = readKeys();
        
        const foundKey = data.keys.find(k => k.code === keyCode);
        
        if (!foundKey) {
            addLog('VERIFY_FAIL', `Key không hợp lệ: ${keyCode}`);
            return res.json({ success: true, valid: false, message: 'Key không hợp lệ!' });
        }
        
        // Kiểm tra key có active không
        if (!foundKey.is_active) {
            return res.json({ success: true, valid: false, message: 'Key đã bị vô hiệu hóa!' });
        }
        
        // Kiểm tra hết hạn
        if (foundKey.expires_at) {
            const expiryDate = new Date(foundKey.expires_at);
            if (expiryDate < new Date()) {
                return res.json({ success: true, valid: false, message: 'Key đã hết hạn!' });
            }
        }
        
        // Tăng số lần sử dụng
        foundKey.usage_count++;
        writeKeys(data);
        addLog('VERIFY_SUCCESS', `Key hợp lệ: ${keyCode} (Lượt dùng: ${foundKey.usage_count})`);
        
        res.json({ 
            success: true, 
            valid: true, 
            message: '✅ Key hợp lệ!',
            key_info: {
                created_at: foundKey.created_at,
                expires_at: foundKey.expires_at,
                usage_count: foundKey.usage_count
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cập nhật key (active/deactive, gia hạn, đổi code)
app.put('/api/keys/update/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { is_active, expiresInDays, newCode } = req.body;
        
        const data = readKeys();
        const keyIndex = data.keys.findIndex(k => k.id === id);
        
        if (keyIndex === -1) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy key!' });
        }
        
        const key = data.keys[keyIndex];
        
        if (is_active !== undefined) key.is_active = is_active;
        if (newCode && newCode !== key.code) {
            // Kiểm tra code mới không trùng
            if (data.keys.find(k => k.code === newCode)) {
                return res.status(400).json({ success: false, error: 'Code mới đã tồn tại!' });
            }
            key.code = newCode;
        }
        if (expiresInDays !== undefined) {
            if (expiresInDays === 0) {
                key.expires_at = null;
            } else if (expiresInDays > 0) {
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + expiresInDays);
                key.expires_at = expiryDate.toISOString();
            }
        }
        
        writeKeys(data);
        addLog('UPDATE_KEY', `Cập nhật key ID: ${id} - ${key.code}`);
        
        res.json({ success: true, key, message: '✅ Cập nhật key thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy logs
app.get('/api/logs', (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        const logs = data.logs.slice(0, parseInt(limit));
        res.json({ success: true, logs, total: data.logs.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thống kê
app.get('/api/stats', (req, res) => {
    try {
        const data = readKeys();
        const totalKeys = data.keys.length;
        const activeKeys = data.keys.filter(k => k.is_active).length;
        const totalUsage = data.keys.reduce((sum, k) => sum + (k.usage_count || 0), 0);
        const expiredKeys = data.keys.filter(k => k.expires_at && new Date(k.expires_at) < new Date()).length;
        
        res.json({
            success: true,
            stats: {
                total_keys: totalKeys,
                active_keys: activeKeys,
                expired_keys: expiredKeys,
                total_usage: totalUsage,
                last_updated: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
    });
});

// Chạy server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║     🎲 VIP TÀI XỈU PREDICTION SERVER 🎲              ║
╠══════════════════════════════════════════════════════╣
║  🚀 Server: http://localhost:${PORT}                  ║
║  📝 API Endpoints:                                    ║
║     GET  /api/keys         - Lấy danh sách keys      ║
║     POST /api/keys/create  - Tạo key mới             ║
║     DELETE /api/keys/delete/:id - Xóa key theo ID    ║
║     POST /api/keys/verify  - Xác thực key            ║
║     PUT  /api/keys/update/:id - Cập nhật key         ║
║     GET  /api/logs         - Xem logs                ║
║     GET  /api/stats        - Thống kê                ║
╚══════════════════════════════════════════════════════╝
    `);
});