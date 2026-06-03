![Header](1nullbit26.jpg) 

# 🤖 AI Support Bot with GPT Integration

An intelligent Telegram support bot powered by OpenAI GPT. Answers customer questions based on company knowledge base, collects leads, and escalates complex questions to human managers.

> Built with Node.js + Telegraf + OpenAI GPT-4o-mini + SQLite

---

## ✨ Features

### For Customers
- 💬 **AI Answers** — GPT answers questions based on company FAQ
- 💼 **Service Info** — view services, prices, descriptions
- ❓ **FAQ** — quick access to common questions
- 📞 **Contact Info** — working hours, phone, email, address
- 📝 **Leave Request** — collect contact info and questions (leads)

### For Business (Admin)
- 📊 **Statistics** — messages, leads, conversations (today, week, total)
- 👥 **Lead Management** — view all leads with status (new/contacted/rejected)
- 🔔 **Instant Notifications** — get notified of new leads and complex questions
- 💬 **Direct Reply** — reply to customer questions directly from admin panel

### AI Behavior
- Answers based on **knowledge.json** — no hallucinations about company info
- **Escalates** unknown/complex questions to human managers automatically
- Supports **Russian and English** (responds in user's language)
- Professional, concise answers (3-4 sentences max)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- OpenAI API key ([platform.openai.com](https://platform.openai.com))
- Telegram Bot Token from @BotFather

### 1. Clone & Install
```bash
git clone https://github.com/nullbit26/tg-ai-support-bot.git
cd tg-ai-support-bot
npm install
```

### 2. Configure
1. Copy `config.json.example` to `config.json`:
   - Just rename the file
2. Open `config.json` in Notepad and fill in your values:
```json
{
  "BOT_TOKEN": "your_bot_token_here",
  "ADMIN_IDS": "your_telegram_id_here",
  "OPENAI_API_KEY": "your_openai_key_here",
  "COMPANY_NAME": "Your Company"
}
```

**How to get these values:**
- **BOT_TOKEN**: Message @BotFather in Telegram, create new bot, copy token
- **ADMIN_IDS**: Message @userinfobot, copy your ID number
- **OPENAI_API_KEY**: Go to [platform.openai.com](https://platform.openai.com) → API Keys → Create new key
  - GPT-4o-mini costs only ~$0.15 per 1,000,000 tokens (about 1000 customer messages)

### 3. Customize Knowledge Base
Edit `knowledge.json` with your company info:
- Services and prices
- FAQ questions and answers
- Contact information
- Working hours

### 4. Run
```bash
node bot.js
```

---

## 📋 How It Works

### Customer Flow
1. User asks a question in chat
2. Bot sends question to GPT with company knowledge base as context
3. If GPT can answer → customer gets immediate response
4. If GPT doesn't know → question forwarded to admin + user notified

### Lead Collection Flow
1. User clicks "📝 Leave Request"
2. Bot asks: name → phone → question
3. Saves to database
4. Notifies all admins with lead info
5. Admin can mark as "contacted" or "rejected"

### Admin Reply Flow
1. Admin receives complex question or lead
2. Admin **replies** to the notification message
3. Bot forwards reply directly to customer

---

## 📱 Bot Commands

| Command | Who | Description |
|---------|-----|-------------|
| `/start` | All | Welcome message and menu |
| `/stats` | Admin | View statistics |
| `/leads` | Admin | View all leads |

---

## 🗂 Project Structure
```
tg-ai-support-bot/
├── bot.js           # Main bot logic, GPT integration
├── database.js      # SQLite wrapper
├── knowledge.json   # Company FAQ and info
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## ⚙️ Tech Stack
- **Node.js** — runtime
- **Telegraf v4** — Telegram Bot framework
- **OpenAI API** — GPT-4o-mini for responses
- **sql.js** — local SQLite database (pure JavaScript, no compilation needed)

---

## 💡 Customization

### Change Knowledge Base
Simply edit `knowledge.json` and restart bot. No code changes needed.

### Add More Buttons
Edit keyboard layout in `bot.js`:
```javascript
Markup.keyboard([
  ['💼 Services', '❓ FAQ'],
  ['📞 Contact', '📝 Leave Request'],
  ['🎁 New Button']  // Add here
]).resize()
```

### Use Different GPT Model
Change `model` in `getGPTResponse()`:
- `gpt-4o-mini` — cheapest, good for support
- `gpt-4o` — more capable, more expensive
- `gpt-3.5-turbo` — legacy, not recommended

---

## 💰 OpenAI Costs

GPT-4o-mini pricing (as of 2024):
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens

**Example:** 1000 customer questions ≈ $0.50-1.00

---

## 🔒 Security
- API keys in `config.json` (not committed to Git)
- SQLite for local data
- Admin commands protected by ID check
- No sensitive data in code

---

## 📄 License
MIT
