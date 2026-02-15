/**
 * FraudShieldBD — Order Checker
 *
 * Processes Shopify orders: checks phone via FraudShieldBD API,
 * tags orders with risk level, saves metafields, adds notes.
 */

const FraudShieldAPI = require('./fraudshield-api');
const config = require('../config');

class OrderChecker {
    /**
     * @param {import('./shopify-client')} shopifyClient
     */
    constructor(shopifyClient) {
        this.shopify = shopifyClient;
        this.api = new FraudShieldAPI();
    }

    /**
     * Process a new order from webhook
     * @param {object} order - Shopify order object
     */
    async processOrder(order) {
        // Skip if auto-check is disabled
        if (!config.behavior.autoCheckEnabled) {
            console.log(`[FSBD] Auto-check disabled, skipping order #${order.order_number}`);
            return null;
        }

        // Check COD-only setting
        if (config.behavior.checkCodOnly) {
            if (!this.isCodOrder(order)) {
                console.log(`[FSBD] Order #${order.order_number} is not COD, skipping`);
                return null;
            }
        }

        // Extract phone number
        const phone = this.extractPhone(order);
        if (!phone) {
            console.log(`[FSBD] No phone number found for order #${order.order_number}`);
            return null;
        }

        console.log(`[FSBD] Checking phone ${phone} for order #${order.order_number}`);

        // Call FraudShieldBD API
        const result = await this.api.checkPhone(phone);

        if (!result.success) {
            console.error(`[FSBD] API error for order #${order.order_number}:`, result.message);
            await this.saveError(order.id, result.message);
            return result;
        }

        // Save result
        await this.saveResult(order, result);

        console.log(
            `[FSBD] Order #${order.order_number}: ${result.riskIcon} ${result.riskLabel} ` +
            `(Ratio: ${result.summary.successRatio}%)`
        );

        return result;
    }

    /**
     * Manual check for a specific order
     * @param {number} orderId
     */
    async manualCheck(orderId) {
        const order = await this.shopify.getOrder(orderId);
        if (!order) {
            return { success: false, error: 'Order not found' };
        }

        const phone = this.extractPhone(order);
        if (!phone) {
            return { success: false, error: 'No phone number found' };
        }

        // Clear cache for fresh result
        this.api.clearCache(phone);

        const result = await this.api.checkPhone(phone);

        if (!result.success) {
            await this.saveError(order.id, result.message);
            return result;
        }

        await this.saveResult(order, result);
        return result;
    }

    /**
     * Check if order is Cash on Delivery
     */
    isCodOrder(order) {
        const gateway = (order.gateway || '').toLowerCase();
        const paymentMethod = (order.payment_gateway_names || []).join(' ').toLowerCase();

        const codKeywords = ['cod', 'cash on delivery', 'cash_on_delivery', 'manual', 'কুরিয়ার'];
        return codKeywords.some(kw => gateway.includes(kw) || paymentMethod.includes(kw));
    }

    /**
     * Extract phone from order (billing → shipping → customer)
     */
    extractPhone(order) {
        return (
            order.billing_address?.phone ||
            order.shipping_address?.phone ||
            order.customer?.phone ||
            order.phone ||
            null
        );
    }

    /**
     * Save successful result to order (tags + metafields + note)
     */
    async saveResult(order, result) {
        const orderId = order.id;

        // 1. Tag the order
        if (config.behavior.autoTagOrders) {
            const riskTag = `fsbd:${result.riskLevel}`;
            const tags = [`FraudShieldBD`, riskTag];

            if (result.reportCount > 0) {
                tags.push('fsbd:reported');
            }

            try {
                await this.shopify.addOrderTags(orderId, tags);
            } catch (err) {
                console.error(`[FSBD] Failed to tag order #${order.order_number}:`, err.message);
            }
        }

        // 2. Save metafields
        try {
            await Promise.all([
                this.shopify.setOrderMetafield(orderId, 'checked', 'yes'),
                this.shopify.setOrderMetafield(orderId, 'risk_level', result.riskLevel),
                this.shopify.setOrderMetafield(orderId, 'risk_label', result.riskLabel),
                this.shopify.setOrderMetafield(orderId, 'total_parcel', String(result.summary.totalParcel), 'number_integer'),
                this.shopify.setOrderMetafield(orderId, 'success_parcel', String(result.summary.successParcel), 'number_integer'),
                this.shopify.setOrderMetafield(orderId, 'cancel_parcel', String(result.summary.cancelledParcel), 'number_integer'),
                this.shopify.setOrderMetafield(orderId, 'success_ratio', String(result.summary.successRatio), 'number_decimal'),
                this.shopify.setOrderMetafield(orderId, 'report_count', String(result.reportCount), 'number_integer'),
                this.shopify.setOrderMetafield(orderId, 'couriers', result.couriers),
                this.shopify.setOrderMetafield(orderId, 'checked_at', result.checkedAt),
            ]);
        } catch (err) {
            console.error(`[FSBD] Failed to save metafields for order #${order.order_number}:`, err.message);
        }

        // 3. Add order note
        if (config.behavior.addOrderNotes) {
            const s = result.summary;
            let note = `🛡️ FraudShieldBD: ${result.riskIcon} ${result.riskLabel} (রেশিও: ${s.successRatio}%)\n`;
            note += `📦 Total: ${s.totalParcel} | ✅ Success: ${s.successParcel} | ❌ Cancel: ${s.cancelledParcel}`;

            if (result.reportCount > 0) {
                note += `\n🚨 ফ্রড রিপোর্ট: ${result.reportCount} টি`;
            }

            // Courier breakdown
            const courierKeys = Object.keys(result.couriers);
            if (courierKeys.length > 0) {
                note += '\n\n📋 কুরিয়ার ব্রেকডাউন:';
                for (const key of courierKeys) {
                    const c = result.couriers[key];
                    note += `\n  • ${c.name}: ${c.totalParcel} (✅${c.successParcel} ❌${c.cancelledParcel}) ${c.successRatio}%`;
                }
            }

            try {
                await this.shopify.addOrderNote(orderId, note);
            } catch (err) {
                console.error(`[FSBD] Failed to add note for order #${order.order_number}:`, err.message);
            }
        }
    }

    /**
     * Save error to order metafield
     */
    async saveError(orderId, errorMessage) {
        try {
            await Promise.all([
                this.shopify.setOrderMetafield(orderId, 'checked', 'error'),
                this.shopify.setOrderMetafield(orderId, 'error', errorMessage),
                this.shopify.setOrderMetafield(orderId, 'checked_at', new Date().toISOString()),
            ]);
        } catch (err) {
            console.error(`[FSBD] Failed to save error metafield:`, err.message);
        }
    }
}

module.exports = OrderChecker;
