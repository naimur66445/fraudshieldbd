/**
 * FraudShieldBD Shopify App — Configuration
 *
 * Loads environment variables and exports app configuration
 */

require('dotenv').config();

module.exports = {
    // Shopify
    shopify: {
        apiKey: process.env.SHOPIFY_API_KEY || '',
        apiSecret: process.env.SHOPIFY_API_SECRET || '',
        scopes: (process.env.SHOPIFY_SCOPES || 'read_orders,write_orders').split(','),
        host: process.env.HOST || 'http://localhost:3000',
    },

    // Server
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // FraudShieldBD API
    fraudshield: {
        apiUrl: process.env.FRAUDSHIELD_API_URL || 'https://fraudshield.bd/api/customer/check',
        apiKey: process.env.FRAUDSHIELD_API_KEY || '',
    },

    // Risk Thresholds
    risk: {
        thresholdHigh: parseInt(process.env.RISK_THRESHOLD_HIGH, 10) || 50,
        thresholdMedium: parseInt(process.env.RISK_THRESHOLD_MEDIUM, 10) || 70,
    },

    // Behavior
    behavior: {
        autoCheckEnabled: process.env.AUTO_CHECK_ENABLED !== 'false',
        checkCodOnly: process.env.CHECK_COD_ONLY !== 'false',
        autoTagOrders: process.env.AUTO_TAG_ORDERS !== 'false',
        addOrderNotes: process.env.ADD_ORDER_NOTES !== 'false',
    },
};
