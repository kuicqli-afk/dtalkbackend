const express = require('express');
const router = express.Router();
const axios = require('axios');
const Customer = require('../models/customer'); // Apne file path / casing ka dhyan rakhein (customer vs Customer)

// Helper function to send WhatsApp Cloud API template message
async function sendWhatsAppTemplateMessage(phone, customerName, productName, price) {
    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
    const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

    console.log("🔐 Checking .env values -> Token:", ACCESS_TOKEN ? "Present ✅" : "Missing ❌", "PhoneID:", PHONE_NUMBER_ID ? "Present ✅" : "Missing ❌");

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
        console.warn(`⚠️ Meta credentials missing. Mocking broadcast send to ${phone} for product: ${productName}`);
        return { success: true, mocked: true };
    }

    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

    const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
            name: 'new_product_alert',
            language: { code: 'en' },
            components: [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: customerName },   // {{1}}
                        { type: 'text', text: productName },    // {{2}}
                        { type: 'text', text: price.toString() } // {{3}}
                    ]
                }
            ]
        }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        return { success: true, messageId: response.data.messages[0].id };
    } catch (error) {
        console.error(`Failed to send WhatsApp to ${phone}:`, error.response?.data || error.message);
        return { success: false, error: error.response?.data || error.message };
    }
}

// POST /api/broadcast/product
router.post('/product', async (req, res) => {
    try {
        const storeId = (req.body.storeId && req.body.storeId.trim() !== '')
            ? req.body.storeId
            : 'kuicqli_store_1';

        const { productName, productPrice } = req.body;

        if (!productName) {
            return res.status(400).json({
                success: false,
                error: 'Product name zaroori hai.'
            });
        }

        const displayPrice = productPrice ? productPrice.toString() : 'Check in Store';
        const checkAll = await Customer.find({});
        if (checkAll.length === 0) {
            console.log("⚠️ DB khali hai, testing ke liye ek dummy customer create kar rahe hain...");
            await Customer.create({
                name: "Hamza Test",
                phone: "7269096806",
                storeId: "kuicqli_store_1",
                optIn: true
            });
        }


        const allStoreCustomers = await Customer.find({ storeId: storeId });
        console.log(`📊 Total customers in DB for storeId "${storeId}" (Any optIn):`, allStoreCustomers.length);

        const customers = await Customer.find({ storeId: storeId, optIn: true });
        console.log(`✅ Active (optIn: true) customers found:`, customers.length);

        if (!customers || customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Is dukan (storeId) ke liye koi active customers nahi mile.',
                debugInfo: {
                    searchedStoreId: storeId,
                    totalFoundWithoutOptIn: allStoreCustomers.length
                }
            });
        }

        let sentCount = 0;
        let failedCount = 0;

        for (const customer of customers) {
            const result = await sendWhatsAppTemplateMessage(
                customer.phone,
                customer.name,
                productName,
                displayPrice
            );

            if (result.success) {
                sentCount++;
            } else {
                failedCount++;
            }

            await new Promise(resolve => setTimeout(resolve, 300));
        }

        return res.status(200).json({
            success: true,
            message: 'Product broadcast process completed.',
            storeId,
            totalTargeted: customers.length,
            sentCount,
            failedCount
        });

    } catch (err) {
        console.error('Broadcast Error:', err);
        return res.status(500).json({
            success: false,
            error: 'Server error during product broadcast.'
        });
    }
});

module.exports = router;