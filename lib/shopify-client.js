/**
 * Shopify API Helper
 *
 * Handles authenticated API calls to Shopify Admin REST API
 */

const fetch = require('node-fetch');

class ShopifyClient {
    /**
     * @param {string} shop - e.g. "my-store.myshopify.com"
     * @param {string} accessToken - Shopify access token
     */
    constructor(shop, accessToken) {
        this.shop = shop;
        this.accessToken = accessToken;
        this.apiVersion = '2024-01';
        this.baseUrl = `https://${shop}/admin/api/${this.apiVersion}`;
    }

    /**
     * GET request to Shopify Admin API
     */
    async get(endpoint) {
        const res = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'GET',
            headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
            },
        });
        return res.json();
    }

    /**
     * POST request
     */
    async post(endpoint, data) {
        const res = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return res.json();
    }

    /**
     * PUT request
     */
    async put(endpoint, data) {
        const res = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'PUT',
            headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return res.json();
    }

    // ── Order Helpers ─────────────────────────────

    /**
     * Get a single order by ID
     */
    async getOrder(orderId) {
        const data = await this.get(`/orders/${orderId}.json`);
        return data.order;
    }

    /**
     * Get recent orders
     */
    async getOrders(params = {}) {
        const qs = new URLSearchParams({
            limit: '50',
            status: 'any',
            ...params,
        }).toString();
        const data = await this.get(`/orders.json?${qs}`);
        return data.orders || [];
    }

    /**
     * Add tags to an order (appends to existing tags)
     */
    async addOrderTags(orderId, newTags = []) {
        const order = await this.getOrder(orderId);
        if (!order) return null;

        const existing = order.tags ? order.tags.split(',').map(t => t.trim()) : [];
        const merged = [...new Set([...existing, ...newTags])];

        return this.put(`/orders/${orderId}.json`, {
            order: { id: orderId, tags: merged.join(', ') },
        });
    }

    /**
     * Add a note attribute to an order
     */
    async addOrderNote(orderId, noteContent) {
        const order = await this.getOrder(orderId);
        if (!order) return null;

        const existingNote = order.note || '';
        const newNote = existingNote
            ? `${existingNote}\n\n${noteContent}`
            : noteContent;

        return this.put(`/orders/${orderId}.json`, {
            order: { id: orderId, note: newNote },
        });
    }

    /**
     * Set order metafield
     */
    async setOrderMetafield(orderId, key, value, type = 'single_line_text_field') {
        return this.post(`/orders/${orderId}/metafields.json`, {
            metafield: {
                namespace: 'fraudshieldbd',
                key,
                value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                type: typeof value === 'object' ? 'json' : type,
            },
        });
    }

    /**
     * Get order metafields (FraudShieldBD namespace)
     */
    async getOrderMetafields(orderId) {
        const data = await this.get(
            `/orders/${orderId}/metafields.json?namespace=fraudshieldbd`
        );
        const metafields = data.metafields || [];
        const result = {};
        for (const mf of metafields) {
            try {
                result[mf.key] = mf.type === 'json' ? JSON.parse(mf.value) : mf.value;
            } catch {
                result[mf.key] = mf.value;
            }
        }
        return result;
    }

    // ── Webhook Helpers ───────────────────────────

    /**
     * Register a webhook
     */
    async registerWebhook(topic, callbackUrl) {
        return this.post('/webhooks.json', {
            webhook: {
                topic,
                address: callbackUrl,
                format: 'json',
            },
        });
    }

    /**
     * List registered webhooks
     */
    async listWebhooks() {
        const data = await this.get('/webhooks.json');
        return data.webhooks || [];
    }
}

module.exports = ShopifyClient;
