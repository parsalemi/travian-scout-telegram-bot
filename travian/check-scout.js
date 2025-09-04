import puppeteer from "puppeteer-extra";
import stealth from 'puppeteer-extra-plugin-stealth'
import fs from 'fs';
import TelegramBot from "node-telegram-bot-api";
import dotenv from 'dotenv';
import express from 'express';

const app = express();
app.get('/', (req, res) => {
  res.send('Bot is running');
})

dotenv.config({path: `.env.${process.env.NODE_ENV}`});
puppeteer.use(stealth());
const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new TelegramBot(BOT_TOKEN, { 
  polling: true,
  request: {
    proxy: process.env.NODE_ENV === 'dev' ? process.env.PROXY : ''
  }

});

let jobs = {};
let userCredentials = {};

bot.onText(/\/login (.+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const username = match[1];
  const password = match[2];

  userCredentials[chatId] = { username, password };
  if (jobs[chatId]) clearInterval(jobs[chatId]);

  bot.sendMessage(chatId, `✅ Credentials saved. I'll check every 5 minutes.`);
  
  // jobs[chatId] = setInterval(() => runScraper(chatId), 30000);
  jobs[chatId] = setInterval(() => runScraper(chatId), 1000 * 60 * 5);
});

bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  if (jobs[chatId]) {
    clearInterval(jobs[chatId]);
    delete jobs[chatId];
    bot.sendMessage(chatId, "🛑 I’ve stopped checking for updates.");
  } else {
    bot.sendMessage(chatId, "I wasn’t running any checks for you.");
  }
});
async function runScraper(chatId) {
  const creds = userCredentials[chatId];
  if (!creds) return;

  const browser = await puppeteer.launch({ 
    executablePath: process.env.NODE_ENV === 'dev' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
    headless: true, 
    defaultViewport: {width: 1300, height: 1000},
    arg: ['--window-size=1300,1000']
  });
  
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto("https://tx3.speedtra.com", { waitUntil: "networkidle0" });

    await page.waitForSelector('input[name=name]', {visible: true});
    await page.type("input[name=name]", creds.username);
    await page.type("input[type=password]", creds.password);

    await Promise.all([
      page.click('button[type=submit]'),
      page.waitForNavigation({waitUntil: 'networkidle0'})
    ]);
    await page.waitForSelector('#sidebarBoxVillagelist', {timeout: 30000});
    
    await page.goto('https://tx3.speedtra.com/alliance/reports?filter=19,18&own=0&page=1', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    await page.waitForSelector('#offs > tbody > tr', {
      visible: true,
      timeout: 15000
    });
    
    const data = await page.evaluate(() => {
      let results = [];
      const rows = Array.from(document.querySelectorAll('#offs > tbody > tr'));
      rows.map(row => {
        const link = row.children[0].children[1].children[0]?.href || '';
        const msg = row.children[0]?.textContent?.trim() || '';
        const alliance = row.children[1]?.textContent?.trim() || '';
        let time = row.children[2]?.textContent?.trim().split(' ') || '';
        time = time.length > 2 ? `2 days ago at ${time[3]}` : time[0] === 'دیروز' ? `yesterday at ${time[1]}` : time[1];

        let attacker = '';
        let defender = '';
        
        const words = msg.split(' ');
        attacker = words[0];
        defender = words[2];

        results.push({
          id: `${attacker}-${defender}-${time}`,
          link,
          message: msg,
          attacker,
          defender,
          alliance,
          time
        })
      })
      return results;
    });

    const oldData = fs.existsSync("travian/old.txt")
      ? JSON.parse(fs.readFileSync("travian/old.txt", "utf8"))
      : [];

    fs.writeFileSync("travian/old.txt", JSON.stringify(data, null, 2));

    const newData = data;
    fs.writeFileSync("travian/new.txt", JSON.stringify(newData, null, 2));

    const oldIds = new Set(oldData.map(item => item.id));
    const newMessages = newData.filter(item => !oldIds.has(item.id));

    if(newMessages.length > 0) {
      for (let msg of newMessages) {
        await bot.sendMessage(
          chatId,
          `📢 New Alert!\nAttacker: ${msg.attacker}\nDefender: ${msg.defender}\nAlliance: ${msg.alliance}\nTime: ${msg.time}\nMessage: ${msg.message}\n🔗 ${msg.link}`
        );
      } 
    } 
    else {
      await browser.close();
      bot.sendMessage(chatId, 'There is no new scouts');
    }
    
  } catch (err) {
    console.error("Scraper error:", err);
    await browser.close();
    bot.sendMessage(chatId, "❌ Failed to fetch data.");
  } finally {
    await browser.close();
  }
}
app.listen(8000, () => {
  console.log('Server is running ...')
})