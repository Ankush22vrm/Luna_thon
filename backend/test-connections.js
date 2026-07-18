require('dotenv').config();
const mongoose = require('mongoose');
const Groq = require('openai'); // openai SDK works with Groq's OpenAI-compatible API

async function testConnections() {
  console.log('\n🧪 Testing all connections...\n');

  // ─── 1. MongoDB Atlas ────────────────────────────────────────────────────────
  console.log('1️⃣  Testing MongoDB Atlas...');
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 6000 });
    console.log('   ✅ MongoDB Atlas connected successfully!');
    console.log(`   📦 DB: ${mongoose.connection.name}`);
    console.log(`   🌐 Host: ${mongoose.connection.host}`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('   ❌ MongoDB failed:', err.message);
  }

  // ─── 2. Groq API ─────────────────────────────────────────────────────────────
  console.log('\n2️⃣  Testing Groq API (streaming test)...');
  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    const stream = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama3-8b-8192',
      stream: true,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Say: Groq streaming works!' }],
    });

    process.stdout.write('   ✅ Groq streaming: ');
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      process.stdout.write(token);
    }
    console.log('\n   ✅ Token-by-token streaming confirmed!\n');
  } catch (err) {
    console.error('   ❌ Groq failed:', err.message);
  }

  console.log('✅ Connection tests complete!\n');
  process.exit(0);
}

testConnections();
