const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'support.db');
let db;

function nowTs() { return Math.floor(Date.now() / 1000); }

async function initDB() {
  const SQL = await initSqlJs();
  
  // Load existing or create new
  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      phone TEXT,
      question TEXT,
      status TEXT DEFAULT 'new',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT,
      response TEXT,
      forwarded_to_admin INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE IF NOT EXISTS stats (
      date TEXT PRIMARY KEY,
      messages_count INTEGER DEFAULT 0,
      leads_count INTEGER DEFAULT 0,
      forwarded_count INTEGER DEFAULT 0
    );
  `);
  
  saveDB();
  
  // Helper to get single result
  function getOne(sql, params = []) {
    const res = db.exec(sql, params);
    if (!res.length || !res[0].values.length) return null;
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
  }
  
  // Helper to get all results
  function getAll(sql, params = []) {
    const res = db.exec(sql, params);
    if (!res.length) return [];
    return res[0].values.map(row => {
      const obj = {};
      res[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    });
  }
  
  function saveDB() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
  
  return {
    saveLead: (lead) => {
      db.run(`
        INSERT INTO leads (user_id, username, first_name, phone, question, status)
        VALUES (${lead.user_id}, '${lead.username || ''}', '${lead.first_name || ''}', '${lead.phone}', '${lead.question}', 'new')
      `);
      saveDB();
      const res = db.exec('SELECT last_insert_rowid() as id');
      return res[0].values[0][0];
    },
    
    getLead: (id) => getOne(`SELECT * FROM leads WHERE id = ${id}`),
    getAllLeads: () => getAll('SELECT * FROM leads ORDER BY created_at DESC'),
    
    updateLeadStatus: (id, status) => {
      db.run(`UPDATE leads SET status = '${status}' WHERE id = ${id}`);
      saveDB();
    },
    
    saveConversation: (conv) => {
      db.run(`
        INSERT INTO conversations (user_id, message, response, forwarded_to_admin)
        VALUES (${conv.user_id}, '${conv.message.replace(/'/g, "''")}', '${conv.response.replace(/'/g, "''")}', ${conv.forwarded_to_admin || 0})
      `);
      saveDB();
    },
    
    incrementStat: (date, field) => {
      const existing = getOne(`SELECT * FROM stats WHERE date = '${date}'`);
      if (existing) {
        db.run(`UPDATE stats SET ${field} = ${field} + 1 WHERE date = '${date}'`);
      } else {
        db.run(`INSERT INTO stats (date, ${field}) VALUES ('${date}', 1)`);
      }
      saveDB();
    },
    
    getStats: () => {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      
      const totalConversations = getOne('SELECT COUNT(*) as cnt FROM conversations');
      const totalLeads = getOne('SELECT COUNT(*) as cnt FROM leads');
      const todayStats = getOne(`SELECT * FROM stats WHERE date = '${today}'`) || { messages_count: 0, leads_count: 0 };
      const weekStats = getOne(`
        SELECT SUM(messages_count) as msg, SUM(leads_count) as leads 
        FROM stats WHERE date >= '${weekAgo}'
      `) || { msg: 0, leads: 0 };
      
      return {
        totalConversations: totalConversations?.cnt || 0,
        totalLeads: totalLeads?.cnt || 0,
        todayMessages: todayStats.messages_count || 0,
        todayLeads: todayStats.leads_count || 0,
        weekMessages: weekStats?.msg || 0,
        weekLeads: weekStats?.leads || 0
      };
    }
  };
}

module.exports = { initDB };
