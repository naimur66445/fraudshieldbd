/**
 * FraudShieldBD — Admin API Routes
 *
 * Handles admin panel AJAX requests: manual check, test connection, order data
 */

const express = require('express');
const FraudShieldAPI = require('../lib/fraudshield-api');
const ShopifyClient = require('../lib/shopify-client');
const OrderChecker = require('../lib/order-checker');
const { getAccessToken } = require('./auth');

const router = express.Router();

/**
 * POST /api/test-connection
 * Test FraudShieldBD API connection
 */
router.post('/test-connection', async (req, res) => {
    const { apiKey } = req.body;
    const api = new FraudShieldAPI(apiKey);
    const result = await api.testConnection();
    res.json(result);
});

/**
 * POST /api/check-phone
 * Manual phone check (from admin panel)
 */
router.post('/check-phone', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'ফোন নম্বর দিন।' });
    }

    const api = new FraudShieldAPI();
    const result = await api.checkPhone(phone);
    res.json(result);
});

/**
 * POST /api/check-order
 * Manual order check (from admin panel)
 */
router.post('/check-order', async (req, res) => {
    const { orderId, shop } = req.body;
    if (!orderId || !shop) {
        return res.status(400).json({ success: false, message: 'Order ID and shop required.' });
    }

    const accessToken = getAccessToken(shop);
    if (!accessToken) {
        return res.status(401).json({ success: false, message: 'Shop not authenticated.' });
    }

    const shopify = new ShopifyClient(shop, accessToken);
    const checker = new OrderChecker(shopify);
    const result = await checker.manualCheck(orderId);
    res.json(result);
});

/**
 * GET /api/order-status/:orderId
 * Get FraudShieldBD check status for an order
 */
router.get('/order-status/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { shop } = req.query;

    if (!shop) {
        return res.status(400).json({ success: false, message: 'Shop parameter required.' });
    }

    const accessToken = getAccessToken(shop);
    if (!accessToken) {
        return res.status(401).json({ success: false, message: 'Shop not authenticated.' });
    }

    const shopify = new ShopifyClient(shop, accessToken);

    try {
        const meta = await shopify.getOrderMetafields(orderId);
        if (!meta.checked) {
            return res.json({ checked: false });
        }

        res.json({
            checked: true,
            riskLevel: meta.risk_level,
            riskLabel: meta.risk_label,
            totalParcel: meta.total_parcel,
            successParcel: meta.success_parcel,
            cancelParcel: meta.cancel_parcel,
            successRatio: meta.success_ratio,
            reportCount: meta.report_count,
            couriers: meta.couriers,
            checkedAt: meta.checked_at,
            error: meta.error,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
