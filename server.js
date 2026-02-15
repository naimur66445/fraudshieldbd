/**
 * FraudShieldBD — Shopify App Server
 *
 * Express server handling:
 * - OAuth install/callback
 * - Webhook endpoints (orders/create, orders/updated)
 * - Admin UI
 * - API endpoints (test connection, manual check, order status)
 */

const express = require('express');
const path = require('path');
const config = require('./config');

const { router: authRouter } = require('./routes/auth');
const webhookRouter = require('./routes/webhooks');
const apiRouter = require('./routes/api');

const app = express();

// ── Raw body capture for webhook HMAC verification ────────
// Must be before express.json()
app.use('/webhooks', (req, res, next) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
        req.rawBody = data;
        try {
            req.body = JSON.parse(data);
        } catch {
            req.body = {};
        }
        next();
    });
});

// ── JSON parser for all other routes ──────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files ──────────────────────────────────────────
app.use('/static', express.static(path.join(__dirname, 'views')));

// ── Routes ────────────────────────────────────────────────

// OAuth
app.use('/', authRouter);

// Webhooks
app.use('/webhooks', webhookRouter);

// API
app.use('/api', apiRouter);

// Admin UI
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Health check
app.get('/', (req, res) => {
    res.json({
        app: 'FraudShieldBD Shopify App',
        version: '1.0.0',
        status: 'running',
        docs: 'https://fraudshield.bd/integrations/shopify',
    });
});

// ── Start Server ──────────────────────────────────────────
app.listen(config.port, () => {
    console.log('');
    console.log('  🛡️  FraudShieldBD Shopify App');
    console.log('  ────────────────────────────');
    console.log(`  🌐 Server:  http://localhost:${config.port}`);
    console.log(`  📋 Admin:   http://localhost:${config.port}/admin`);
    console.log(`  🔗 OAuth:   ${config.shopify.host}/auth?shop=YOUR_STORE.myshopify.com`);
    console.log(`  📡 Webhook: ${config.shopify.host}/webhooks/orders-create`);
    console.log(`  🔧 Env:     ${config.nodeEnv}`);
    console.log('');

    if (!config.fraudshield.apiKey) {
        console.warn('  ⚠️  FraudShieldBD API Key not set! Set FRAUDSHIELD_API_KEY in .env');
    }
    if (!config.shopify.apiKey) {
        console.warn('  ⚠️  Shopify API Key not set! Set SHOPIFY_API_KEY in .env');
    }
});

module.exports = app;
