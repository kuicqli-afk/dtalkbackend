// scripts/seed.js
require('dotenv').config();
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');

const seedDatabase = async () => {
  await connectDB();
  
  // Clear existing data
  await Product.deleteMany({});
  await Order.deleteMany({});
  
  // Sample Products
  const products = [
    {
      name: 'iPhone 15 Pro Max',
      description: 'Latest Apple smartphone with A17 chip',
      price: 159900,
      category: 'Electronics',
      brand: 'Apple',
      stock: 50,
      barcode: 'BARAPPLE001',
      images: ['iphone15.jpg']
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      description: 'Premium Android phone with AI features',
      price: 129999,
      category: 'Electronics',
      brand: 'Samsung',
      stock: 40,
      barcode: 'BARSAMSUNG001',
      images: ['s24ultra.jpg']
    },
    {
      name: 'Nike Air Max 270',
      description: 'Comfortable running shoes',
      price: 14999,
      category: 'Footwear',
      brand: 'Nike',
      stock: 100,
      barcode: 'BARNIKE001',
      images: ['nike270.jpg']
    },
    {
      name: 'Sony WH-1000XM5',
      description: 'Noise cancelling headphones',
      price: 29990,
      category: 'Electronics',
      brand: 'Sony',
      stock: 30,
      barcode: 'BARSONY001',
      images: ['sonyxm5.jpg']
    }
  ];
  
  await Product.insertMany(products);
  console.log('✅ Products seeded!');
  
  // Sample Orders
  const orders = [
    {
      orderId: 'ORD789012',
      customerName: 'Rahul Sharma',
      customerPhone: '9876543210',
      customerEmail: 'rahul@email.com',
      products: [
        { name: 'iPhone 15 Pro Max', quantity: 1, price: 159900 }
      ],
      totalAmount: 159900,
      status: 'out_for_delivery',
      paymentMethod: 'card',
      paymentStatus: 'paid',
      shippingAddress: {
        fullName: 'Rahul Sharma',
        phone: '9876543210',
        address: '123, MG Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001'
      },
      deliveryBoy: {
        name: 'Vikram Singh',
        phone: '9988776655'
      },
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      barcode: 'BARORD789012'
    },
    {
      orderId: 'ORD456789',
      customerName: 'Priya Patel',
      customerPhone: '9876543211',
      customerEmail: 'priya@email.com',
      products: [
        { name: 'Nike Air Max 270', quantity: 2, price: 14999 }
      ],
      totalAmount: 29998,
      status: 'delivered',
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      shippingAddress: {
        fullName: 'Priya Patel',
        phone: '9876543211',
        address: '456, Lake View',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001'
      },
      actualDelivery: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      barcode: 'BARORD456789'
    }
  ];
  
  await Order.insertMany(orders);
  console.log('✅ Orders seeded!');
  
  console.log('🎉 Database seeding complete!');
  process.exit(0);
};

seedDatabase();