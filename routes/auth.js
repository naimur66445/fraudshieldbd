/**
 * FraudShieldBD — Auth Routes
 *
 * Handles Shopify OAuth install/callback flow
 */

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const config = require('../config');

const router = express.Router();

// In-memory store (use a database in production)
const shopTokens = {};

/**
 * GET /auth — Start OAuth flow
 * Merchant clicks "Install" → redirect to Shopify permission screen
 */
router.get('/auth', (req, res) => {
    const { shop } = req.query;
    if (!shop) {
        return res.status(400).send('Missing shop parameter');
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${config.shopify.host}/auth/callback`;
    const scopes = config.shopify.scopes.join(',');

    // Store nonce (should use session/DB in production)
    shopTokens[`nonce_${shop}`] = nonce;

    const installUrl =
        `https://${shop}/admin/oauth/authorize?` +
        `client_id=${config.shopify.apiKey}` +
        `&scope=${scopes}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${nonce}`;

    res.redirect(installUrl);
});

/**
 * GET /auth/callback — Handle OAuth callback
 * Shopify redirects here after merchant approves
 */
router.get('/auth/callback', async (req, res) => {
    const { shop, code, state, hmac } = req.query;

    // Verify nonce
    const savedNonce = shopTokens[`nonce_${shop}`];
    if (!savedNonce || savedNonce !== state) {
        return res.status(403).send('Invalid state parameter');
    }
    delete shopTokens[`nonce_${shop}`];

    // Verify HMAC
    const queryParams = { ...req.query };
    delete queryParams.hmac;
    const message = new URLSearchParams(queryParams).toString();
    const generatedHmac = crypto
        .createHmac('sha256', config.shopify.apiSecret)
        .update(message)
        .digest('hex');

    if (generatedHmac !== hmac) {
        return res.status(401).send('HMAC validation failed');
    }

    // Exchange code for access token
    try {
        const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: config.shopify.apiKey,
                client_secret: config.shopify.apiSecret,
                code,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            throw new Error('No access token received');
        }

        // Save access token (use database in production!)
        shopTokens[shop] = tokenData.access_token;

        console.log(`[FSBD] ✅ App installed for shop: ${shop}`);

        // Register webhooks
        const ShopifyClient = require('../lib/shopify-client');
        const client = new ShopifyClient(shop, tokenData.access_token);

        await client.registerWebhook('orders/create', `${config.shopify.host}/webhooks/orders-create`);
        await client.registerWebhook('orders/updated', `${config.shopify.host}/webhooks/orders-updated`);

        console.log(`[FSBD] ✅ Webhooks registered for: ${shop}`);

        // Redirect to app admin page
        res.redirect(`/admin?shop=${shop}`);
    } catch (err) {
        console.error('[FSBD] OAuth error:', err.message);
        res.status(500).send('Authentication failed: ' + err.message);
    }
});

/**
 * Get stored access token for a shop
 */
function getAccessToken(shop) {
    return shopTokens[shop] || null;
}

module.exports = { router, getAccessToken };
