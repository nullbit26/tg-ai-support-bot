require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const OpenAI = require('openai');
const { initDB } = require('./database');
const knowledge = require('./knowledge.json');

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let db;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
const isAdmin = id => ADMIN_IDS.includes(id);
const COMPANY_NAME = process.env.COMPANY_NAME || 'Our Company';

const pendingLeads = new Map();

async function startBot() {
  db = await initDB();
  bot.launch();
  console.log('AI Support Bot started!');
}

startBot();

// ─── GPT Response Function ─────────────────────────────────
async function getGPTResponse(userMessage, userContext = '') {
  const systemPrompt = `You are a helpful support assistant for ${COMPANY_NAME}.

Company Information:
${JSON.stringify(knowledge, null, 2)}

Instructions:
1. Answer questions based ONLY on the company information provided above
2. Be polite, professional, and concise (max 3-4 sentences)
3. If you don't know the answer or the information is not in the knowledge base, respond with "ESCALATE"
4. Speak in the language the user is using (Russian or English)
5. If user asks about pricing, mention that exact price depends on specific requirements
6. Always offer to connect with a human manager for complex questions`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 300
    });
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI error:', error);
    return 'ESCALATE';
  }
}

// ─── /start ─────────────────────────────────────────────────
bot.command('start', ctx => {
  const u = ctx.from;
  
  ctx.reply(
    `👋 Hello, ${u.first_name}!\n\n` +
    `I'm ${COMPANY_NAME} support assistant. I can answer your questions about our services, pricing, and working hours.\n\n` +
    `💬 Just ask me anything or use the buttons below:`,
    Markup.keyboard([
      ['💼 Services', '❓ FAQ'],
      ['📞 Contact', '📝 Leave Request']
    ]).resize()
  );
});

// ─── Services Button ───────────────────────────────────────
bot.hears('💼 Services', ctx => {
  let text = `💼 *${COMPANY_NAME} Services*\n\n`;
  knowledge.services.forEach(s => {
    text += `*${s.name}*\n${s.description}\n💰 ${s.price}\n\n`;
  });
  text += `Want to know more? Ask me or click 📝 Leave Request`;
  
  ctx.reply(text, { parse_mode: 'Markdown' });
});

// ─── FAQ Button ────────────────────────────────────────────
bot.hears('❓ FAQ', ctx => {
  let text = `❓ *Frequently Asked Questions*\n\n`;
  knowledge.faq.forEach((f, i) => {
    text += `${i + 1}. *${f.question}*\n${f.answer}\n\n`;
  });
  text += `Have another question? Just ask me! 💬`;
  
  ctx.reply(text, { parse_mode: 'Markdown' });
});

// ─── Contact Button ───────────────────────────────────────
bot.hears('📞 Contact', ctx => {
  ctx.reply(
    `📞 *Contact ${COMPANY_NAME}*\n\n` +
    `📱 Phone: ${knowledge.contacts.phone}\n` +
    `📧 Email: ${knowledge.contacts.email}\n` +
    `📍 Address: ${knowledge.contacts.address}\n\n` +
    `🕐 Working hours:\n${knowledge.working_hours}`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Leave Request Button ─────────────────────────────────
bot.hears('📝 Leave Request', ctx => {
  pendingLeads.set(ctx.from.id, { step: 'name' });
  ctx.reply('📝 *New Request*\n\nPlease enter your name:', { parse_mode: 'Markdown' });
});

// ─── Lead Collection Handler ──────────────────────────────
bot.on('text', async ctx => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  
  // Handle lead collection flow
  if (pendingLeads.has(userId)) {
    const state = pendingLeads.get(userId);
    
    if (state.step === 'name') {
      state.name = text;
      state.step = 'phone';
      return ctx.reply('📱 Enter your phone number:');
    }
    
    if (state.step === 'phone') {
      state.phone = text;
      state.step = 'question';
      return ctx.reply('💬 Describe your question or what service you need:');
    }
    
    if (state.step === 'question') {
      state.question = text;
      state.step = 'done';
      
      // Save to database
      const leadId = db.saveLead({
        user_id: userId,
        username: ctx.from.username,
        first_name: state.name,
        phone: state.phone,
        question: state.question
      });
      
      db.incrementStat(new Date().toISOString().slice(0, 10), 'leads_count');
      pendingLeads.delete(userId);
      
      // Notify admins
      for (const adminId of ADMIN_IDS) {
        try {
          await ctx.telegram.sendMessage(
            adminId,
            `🔔 *New Lead!* #${leadId}\n\n` +
            `👤 Name: ${state.name}\n` +
            `📱 Phone: ${state.phone}\n` +
            `💬 Question: ${state.question}\n\n` +
            `User ID: ${userId}`,
            { 
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Mark Contacted', `contacted_${leadId}`)],
                [Markup.button.callback('❌ Mark Rejected', `rejected_${leadId}`)]
              ])
            }
          );
        } catch (e) {}
      }
      
      return ctx.reply(
        `✅ *Request Submitted!*\n\n` +
        `Thank you, ${state.name}! Our manager will contact you within 24 hours.\n\n` +
        `📱 Phone: ${state.phone}\n` +
        `💬 ${state.question}`,
        { parse_mode: 'Markdown' }
      );
    }
  }
  
  // Handle regular questions with GPT
  if (text.startsWith('/')) return;
  
  ctx.reply('🤔 Thinking...');
  
  const response = await getGPTResponse(text);
  const today = new Date().toISOString().slice(0, 10);
  
  if (response === 'ESCALATE') {
    // Save conversation and escalate to admin
    db.saveConversation({
      user_id: userId,
      message: text,
      response: 'ESCALATED TO ADMIN',
      forwarded_to_admin: 1
    });
    db.incrementStat(today, 'forwarded_count');
    
    // Notify admins
    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          `⚠️ *Question Requires Human*\n\n` +
          `From: ${ctx.from.first_name} (@${ctx.from.username || 'no_username'})\n` +
          `User ID: ${userId}\n\n` +
          `❓ Question: ${text}\n\n` +
          `Reply to this message to answer directly.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }
    
    return ctx.reply(
      `❓ That's a complex question that requires our specialist.\n\n` +
      `I've forwarded your question to our team. They will contact you shortly!\n\n` +
      `Or you can leave a request: 📝 Leave Request`,
      Markup.keyboard([
        ['💼 Services', '❓ FAQ'],
        ['📞 Contact', '📝 Leave Request']
      ]).resize()
    );
  }
  
  // Normal GPT response
  db.saveConversation({
    user_id: userId,
    message: text,
    response: response,
    forwarded_to_admin: 0
  });
  db.incrementStat(today, 'messages_count');
  
  ctx.reply(response, {
    parse_mode: 'Markdown',
    ...Markup.keyboard([
      ['💼 Services', '❓ FAQ'],
      ['📞 Contact', '📝 Leave Request']
    ]).resize()
  });
});

// ─── Admin: Handle Lead Status ────────────────────────────
bot.action(/^contacted_(\d+)$/, ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const leadId = ctx.match[1];
  db.updateLeadStatus(leadId, 'contacted');
  ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ Status: Contacted');
});

bot.action(/^rejected_(\d+)$/, ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const leadId = ctx.match[1];
  db.updateLeadStatus(leadId, 'rejected');
  ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ Status: Rejected');
});

// ─── Admin: Stats ────────────────────────────────────────
bot.command('stats', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  
  const stats = db.getStats();
  ctx.reply(
    `📊 *Support Bot Statistics*\n\n` +
    `📨 Total Conversations: ${stats.totalConversations}\n` +
    `👥 Total Leads: ${stats.totalLeads}\n\n` +
    `📅 Today:\n` +
    `  Messages: ${stats.todayMessages}\n` +
    `  Leads: ${stats.todayLeads}\n\n` +
    `📈 Last 7 days:\n` +
    `  Messages: ${stats.weekMessages}\n` +
    `  Leads: ${stats.weekLeads}`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Admin: View Leads ───────────────────────────────────
bot.command('leads', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  
  const leads = db.getAllLeads();
  if (leads.length === 0) return ctx.reply('📭 No leads yet.');
  
  let text = `👥 *All Leads*\n\n`;
  leads.slice(0, 10).forEach(l => {
    const status = l.status === 'new' ? '🆕' : l.status === 'contacted' ? '✅' : '❌';
    text += `${status} *#${l.id}* — ${l.first_name}\n`;
    text += `📱 ${l.phone}\n`;
    text += `💬 ${l.question.substring(0, 50)}...\n\n`;
  });
  
  ctx.reply(text, { parse_mode: 'Markdown' });
});

// ─── Admin: Reply to User ────────────────────────────────
bot.on('reply_to_message', async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  if (!ctx.message.reply_to_message.text) return;
  
  const originalText = ctx.message.reply_to_message.text;
  const userIdMatch = originalText.match(/User ID: (\d+)/);
  
  if (!userIdMatch) return;
  
  const userId = parseInt(userIdMatch[1]);
  const replyText = ctx.message.text;
  
  try {
    await ctx.telegram.sendMessage(
      userId,
      `📩 *Message from ${COMPANY_NAME} Manager:*\n\n${replyText}`,
      { parse_mode: 'Markdown' }
    );
    ctx.reply('✅ Reply sent to user.');
  } catch (e) {
    ctx.reply('❌ Could not send message. User may have blocked the bot.');
  }
});

// ─── Shutdown ────────────────────────────────────────────
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
