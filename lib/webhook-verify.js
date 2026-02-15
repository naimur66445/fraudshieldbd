/**
 * FraudShieldBD — Webhook Verification
 *
 * Verifies incoming Shopify webhook HMAC signatures
 */

const crypto = require('crypto');
const config = require('../config');

/**
 * Express middleware to verify Shopify webhook HMAC
 * Must be used BEFORE express.json() for webhook routes
 */
function verifyWebhook(req, res, next) {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    if (!hmacHeader) {
        console.warn('[FSBD] Webhook missing HMAC header');
        return res.status(401).json({ error: 'Missing HMAC' });
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
        console.warn('[FSBD] Webhook missing raw body');
        return res.status(400).json({ error: 'Missing body' });
    }

    const hash = crypto
        .createHmac('sha256', config.shopify.apiSecret)
        .update(rawBody, 'utf8')
        .digest('base64');

    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader))) {
        console.warn('[FSBD] Webhook HMAC verification failed');
        return res.status(401).json({ error: 'Invalid HMAC' });
    }

    next();
}

module.exports = { verifyWebhook };
