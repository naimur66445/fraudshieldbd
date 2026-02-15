/**
 * FraudShieldBD API Client
 *
 * Handles all communication with the FraudShieldBD API.
 * Features: phone sanitization, caching, risk calculation, error handling.
 */

const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const config = require('../config');

// Cache: 5 minute TTL (same as WordPress plugin)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

class FraudShieldAPI {
    constructor(apiKey = null) {
        this.apiKey = apiKey || config.fraudshield.apiKey;
        this.apiUrl = config.fraudshield.apiUrl;
        this.timeout = 20000; // 20 seconds
    }

    /**
     * Check a phone number against FraudShieldBD
     * @param {string} phone - Bangladeshi phone number
     * @returns {Promise<object>} Parsed result or error object
     */
    async checkPhone(phone) {
        // Sanitize phone
        phone = this.sanitizePhone(phone);
        if (!phone) {
            return {
                success: false,
                error: 'invalid_phone',
                message: 'ভ্যালিড বাংলাদেশি ফোন নম্বর দিন (01XXXXXXXXX)',
            };
        }

        // Check API key
        if (!this.apiKey) {
            return {
                success: false,
                error: 'no_api_key',
                message: 'FraudShieldBD API Key সেট করা হয়নি।',
            };
        }

        // Check cache
        const cacheKey = `fsbd_${phone}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        // Make API request
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Source': 'shopify-app',
                    'X-Plugin-Ver': '1.0.0',
                },
                body: JSON.stringify({ phone }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const headers = response.headers;
            const body = await response.json();

            // Handle errors
            if (response.status !== 200) {
                return this.handleErrorResponse(response.status, body);
            }

            // Parse successful response
            const result = this.parseResponse(body, headers);

            // Cache for 5 minutes
            cache.set(cacheKey, result);

            return result;
        } catch (err) {
            if (err.name === 'AbortError') {
                return {
                    success: false,
                    error: 'timeout',
                    message: 'FraudShieldBD সার্ভার থেকে রেসপন্স পেতে দেরি হচ্ছে।',
                };
            }
            return {
                success: false,
                error: 'connection_error',
                message: `FraudShieldBD সার্ভারে কানেক্ট হতে পারছে না: ${err.message}`,
            };
        }
    }

    /**
     * Test API connection
     * @returns {Promise<object>}
     */
    async testConnection() {
        // Use a dummy number just to test auth
        if (!this.apiKey) {
            return { success: false, message: 'API Key সেট করা হয়নি।' };
        }

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Source': 'shopify-app',
                },
                body: JSON.stringify({ phone: '01700000000' }),
            });

            if (response.status === 200) {
                return { success: true, message: '✅ কানেকশন সফল!' };
            } else if (response.status === 401) {
                return { success: false, message: '❌ API Key ভুল বা ইনভ্যালিড।' };
            } else if (response.status === 402) {
                return { success: false, message: '⚠️ সাবস্ক্রিপশন নেই বা মেয়াদ শেষ।' };
            } else {
                const body = await response.json();
                return { success: false, message: body.message || `Error: ${response.status}` };
            }
        } catch (err) {
            return { success: false, message: `কানেকশন ব্যর্থ: ${err.message}` };
        }
    }

    /**
     * Parse successful API response
     */
    parseResponse(body, headers) {
        const courierData = body.courierData || {};
        const summary = courierData.summary || {};
        const reports = body.reports || [];

        const total = parseInt(summary.total_parcel || 0, 10);
        const success = parseInt(summary.success_parcel || 0, 10);
        const cancel = parseInt(summary.cancelled_parcel || 0, 10);
        const ratio = parseFloat(summary.success_ratio || 0);

        // Risk level
        const thresholdHigh = config.risk.thresholdHigh;
        const thresholdMedium = config.risk.thresholdMedium;

        let riskLevel, riskLabel, riskIcon, riskColor;

        if (total === 0) {
            riskLevel = 'unknown';
            riskLabel = 'অজানা';
            riskIcon = '❓';
            riskColor = '#6b7280';
        } else if (ratio < thresholdHigh) {
            riskLevel = 'high';
            riskLabel = 'হাই রিস্ক';
            riskIcon = '⛔';
            riskColor = '#dc2626';
        } else if (ratio < thresholdMedium) {
            riskLevel = 'medium';
            riskLabel = 'মিডিয়াম রিস্ক';
            riskIcon = '⚠️';
            riskColor = '#d97706';
        } else {
            riskLevel = 'safe';
            riskLabel = 'সেফ';
            riskIcon = '✅';
            riskColor = '#16a34a';
        }

        // Per-courier data
        const couriers = {};
        for (const [key, data] of Object.entries(courierData)) {
            if (key === 'summary' || typeof data !== 'object') continue;
            couriers[key] = {
                name: data.name || key,
                logo: data.logo || '',
                totalParcel: parseInt(data.total_parcel || 0, 10),
                successParcel: parseInt(data.success_parcel || 0, 10),
                cancelledParcel: parseInt(data.cancelled_parcel || 0, 10),
                successRatio: parseFloat(data.success_ratio || 0),
            };
        }

        // Rate limit info from headers
        const rateInfo = {
            dailyLimit: headers.get('x-daily-limit'),
            dailyRemaining: headers.get('x-daily-remaining'),
            dataSource: headers.get('x-data-source') || 'api',
            plan: headers.get('x-subscription-plan'),
        };

        return {
            success: true,
            summary: {
                totalParcel: total,
                successParcel: success,
                cancelledParcel: cancel,
                successRatio: ratio,
            },
            riskLevel,
            riskLabel,
            riskIcon,
            riskColor,
            couriers,
            reports,
            reportCount: reports.length,
            rateInfo,
            checkedAt: new Date().toISOString(),
            fromCache: false,
        };
    }

    /**
     * Handle non-200 API responses
     */
    handleErrorResponse(code, body) {
        const message = body.message || body.error || 'Unknown error';

        const errorMap = {
            400: { error: 'bad_request', message: `ভ্যালিডেশন এরর: ${message}` },
            401: { error: 'unauthorized', message: 'API Key ভুল বা ইনভ্যালিড। সঠিক API Key দিন।' },
            402: { error: 'no_subscription', message: 'সাবস্ক্রিপশন নেই বা মেয়াদ শেষ। fraudshield.bd থেকে সাবস্ক্রাইব করুন।' },
            403: { error: 'forbidden', message: `অ্যাক্সেস ব্লকড: ${message}` },
            429: { error: 'rate_limited', message: `লিমিট ওভার! ${message}` },
            502: { error: 'external_error', message: 'কুরিয়ার API এরর। কিছুক্ষণ পর ট্রাই করুন।' },
            503: { error: 'service_unavailable', message: 'সার্ভিস সাময়িকভাবে বন্ধ। কিছুক্ষণ পর ট্রাই করুন।' },
        };

        if (errorMap[code]) {
            return { success: false, ...errorMap[code] };
        }

        return { success: false, error: 'api_error', message: `API Error (${code}): ${message}` };
    }

    /**
     * Sanitize and validate Bangladeshi phone number
     * @param {string} phone
     * @returns {string|null}
     */
    sanitizePhone(phone) {
        if (!phone) return null;

        // Remove all non-digits
        phone = phone.replace(/[^0-9]/g, '');

        // Handle +880 prefix
        if (phone.startsWith('880') && phone.length === 13) {
            phone = '0' + phone.substring(3);
        }

        // Validate: 01[3-9] followed by 8 digits
        if (/^01[3-9]\d{8}$/.test(phone)) {
            return phone;
        }

        return null;
    }

    /**
     * Clear cache for a specific phone or all
     */
    clearCache(phone = null) {
        if (phone) {
            const cleaned = this.sanitizePhone(phone);
            if (cleaned) cache.del(`fsbd_${cleaned}`);
        } else {
            cache.flushAll();
        }
    }
}

module.exports = FraudShieldAPI;
