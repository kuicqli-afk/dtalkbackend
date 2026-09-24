const { GoogleGenAI } = require('@google/genai');
const intents = require('../data/instents.json');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Get rule-based response based on user message
 * Also handles database queries for orders, products, and barcodes, with Gemini AI fallback
 */
exports.getRuleBasedResponse = async (message, sessionId) => {
  const lowerMsg = message.toLowerCase().trim();

  // ===== 1. CHECK FOR ORDER ID =====
  const orderIdMatch = message.match(/#?ORD[A-Z0-9]{6,}/i);
  if (orderIdMatch) {
    const orderId = orderIdMatch[0].toUpperCase().replace('#', '');
    const order = await Order.findOne({ orderId: orderId });
    
    if (order) {
      let statusEmoji = '📦';
      let statusText = order.status.replace(/_/g, ' ').toUpperCase();
      
      if (order.status === 'delivered') statusEmoji = '✅';
      else if (order.status === 'out_for_delivery') statusEmoji = '🚚';
      else if (order.status === 'shipped') statusEmoji = '📫';
      else if (order.status === 'cancelled') statusEmoji = '❌';
      else if (order.status === 'returned') statusEmoji = '🔄';
      
      let reply = `${statusEmoji} Order #${order.orderId}\n`;
      reply += `📊 Status: ${statusText}\n`;
      reply += `💰 Amount: ₹${order.totalAmount}\n`;
      reply += `📅 Placed: ${new Date(order.createdAt).toLocaleDateString()}\n`;
      
      if (order.deliveryBoy) {
        reply += `🚚 Delivery Boy: ${order.deliveryBoy.name || 'Assigned'}`;
        if (order.deliveryBoy.phone) {
          reply += ` (${order.deliveryBoy.phone})`;
        }
        reply += `\n`;
      }
      
      if (order.estimatedDelivery) {
        reply += `⏰ ETA: ${new Date(order.estimatedDelivery).toLocaleDateString()}`;
      }
      
      if (order.status === 'out_for_delivery' && order.deliveryBoy?.phone) {
        reply += `\n📱 Contact delivery boy: ${order.deliveryBoy.phone}`;
      }
      
      return {
        reply: reply,
        intent: 'order_status',
        data: { order }
      };
    } else {
      return {
        reply: `❌ Order ${orderId} not found. Please check the Order ID and try again.`,
        intent: 'order_status'
      };
    }
  }

  // ===== 2. CHECK FOR BARCODE =====
  const barcodeMatch = message.match(/#?BAR[A-Z0-9]{6,}/i);
  if (barcodeMatch) {
    const barcode = barcodeMatch[0].toUpperCase().replace('#', '');
    
    let product = await Product.findOne({ barcode: barcode });
    if (product) {
      return {
        reply: `📦 Product found!\n📝 Name: ${product.name}\n💰 Price: ₹${product.price}\n📂 Category: ${product.category}\n📊 Stock: ${product.stock} units\n${product.description ? `📄 ${product.description}` : ''}`,
        intent: 'barcode_scan',
        data: { product }
      };
    }
    
    let order = await Order.findOne({ barcode: barcode });
    if (order) {
      return {
        reply: `📦 Order #${order.orderId} found via barcode!\n📊 Status: ${order.status}\n💰 Amount: ₹${order.totalAmount}`,
        intent: 'barcode_scan',
        data: { order }
      };
    }
    
    return {
      reply: `❌ No product or order found with barcode: ${barcode}`,
      intent: 'barcode_scan'
    };
  }

  // ===== 3. CHECK FOR PRODUCT SEARCH =====
  const productKeywords = ['search', 'find', 'looking for', 'show me', 'product', 'buy', 'purchase'];
  if (productKeywords.some(keyword => lowerMsg.includes(keyword))) {
    let searchTerm = message;
    productKeywords.forEach(keyword => {
      searchTerm = searchTerm.replace(new RegExp(keyword, 'gi'), '');
    });
    searchTerm = searchTerm.trim();
    
    if (searchTerm.length > 2) {
      const products = await Product.find({
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { category: { $regex: searchTerm, $options: 'i' } },
          { brand: { $regex: searchTerm, $options: 'i' } }
        ],
        isActive: true
      }).limit(5);
      
      if (products.length > 0) {
        let reply = `🛍️ Found ${products.length} product(s) matching "${searchTerm}":\n\n`;
        products.forEach((p, index) => {
          reply += `${index + 1}. ${p.name} - ₹${p.price} (${p.category})\n`;
        });
        reply += `\n📌 Type product number or ask for more details.`;
        
        return {
          reply: reply,
          intent: 'product_search',
          data: { products }
        };
      } else {
        return {
          reply: `❌ No products found for "${searchTerm}". Try a different keyword or check our categories!`,
          intent: 'product_search'
        };
      }
    } else {
      return {
        reply: "🔎 Please specify what you're looking for. (e.g., 'laptop', 'shoes')",
        intent: 'product_search'
      };
    }
  }

  // ===== 3.5. CHECK FOR GREETINGS =====
  const greetings = ['hi', 'hlo', 'hello', 'hey', 'namaste', 'good morning', 'good afternoon', 'good evening'];
  if (greetings.includes(lowerMsg)) {
    return {
      reply: "Hello! 👋 Welcome to Kuicqli. Main aapki kya madad kar sakta hoon?",
      intent: 'greeting'
    };
  }

  // ===== 4. CHECK INTENTS FROM JSON =====
  for (let intent of intents) {
    for (let pattern of intent.patterns) {
      if (lowerMsg.includes(pattern)) {
        const randomIndex = Math.floor(Math.random() * intent.responses.length);
        let reply = intent.responses[randomIndex];
        
        if (intent.intent === 'time') {
          reply = `🕐 The current time is: ${new Date().toLocaleTimeString()}`;
        } else if (intent.intent === 'date') {
          reply = `📅 Today's date is: ${new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}`;
        }
        
        return {
          reply: reply,
          intent: intent.intent
        };
      }
    }
  }

  // ===== 5. DEFAULT RESPONSE (Gemini AI Fallback) =====
  try {
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `
            You are a helpful customer support AI assistant for an enterprise logistics and e-commerce platform named Kuicqli. 
            The user sent a message that didn't match any standard command. Reply politely and helpfully in Hinglish (mix of Hindi and English).
            
            User Message: ${message}
          ` }]
        }
      ]
    });

    if (aiResponse && aiResponse.text) {
      return {
        reply: aiResponse.text,
        intent: 'ai_fallback'
      };
    }
  } catch (error) {
    console.error("❌ Gemini Fallback Error in RuleEngine:", error);
  }

  // Fallback if AI fails
  return {
    reply: "🤔 I'm not sure about that. Please contact our support team or try asking about:\n• Order status (#ORD123456)\n• Product search\n• Barcode scan (#BAR123456)\n• Returns\n• Offers",
    intent: 'default'
  };
};