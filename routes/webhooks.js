/**
 * FraudShieldBD — Webhook Routes
 *
 * Handles incoming Shopify webhooks (orders/create, orders/updated)
 */

const express = require('express');
const { verifyWebhook } = require('../lib/webhook-verify');
const ShopifyClient = require('../lib/shopify-client');
const OrderChecker = require('../lib/order-checker');
const { getAccessToken } = require('./auth');

const router = express.Router();

/**
 * POST /webhooks/orders-create
 * Fired when a new order is created in Shopify
 */
router.post('/orders-create', verifyWebhook, async (req, res) => {
    // Respond immediately (Shopify expects 200 within 5 seconds)
    res.status(200).json({ received: true });

    const order = req.body;
    const shop = req.get('X-Shopify-Shop-Domain');

    console.log(`[FSBD] 📦 New order webhook: #${order.order_number} from ${shop}`);

    const accessToken = getAccessToken(shop);
    if (!accessToken) {
        console.error(`[FSBD] No access token for shop: ${shop}`);
        return;
    }

    try {
        const shopify = new ShopifyClient(shop, accessToken);
        const checker = new OrderChecker(shopify);
        await checker.processOrder(order);
    } catch (err) {
        console.error(`[FSBD] Error processing order #${order.order_number}:`, err.message);
    }
});

/**
 * POST /webhooks/orders-updated
 * Fired when an order is updated (e.g. status change)
 * Only process if not already checked
 */
router.post('/orders-updated', verifyWebhook, async (req, res) => {
    res.status(200).json({ received: true });

    const order = req.body;
    const shop = req.get('X-Shopify-Shop-Domain');

    const accessToken = getAccessToken(shop);
    if (!accessToken) return;

    try {
        const shopify = new ShopifyClient(shop, accessToken);

        // Check if already checked via metafield
        const meta = await shopify.getOrderMetafields(order.id);
        if (meta.checked === 'yes') {
            return; // Already checked
        }

        const checker = new OrderChecker(shopify);
        await checker.processOrder(order);
    } catch (err) {
        console.error(`[FSBD] Error processing updated order #${order.order_number}:`, err.message);
    }
});

module.exports = router;
