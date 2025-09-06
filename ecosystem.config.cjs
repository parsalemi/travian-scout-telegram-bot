const dotenv = require('dotenv');
dotenv.config({path: '.env.dev'});

module.exports = {
  apps: [
    {
      name: "scoutbot",
      script: "travian/check-scout.js",

      watch: true,
      ignore_watch: ["travian/new.txt", "travian/old.txt", "node_modules", "travian/screenshots", "logs"],
      max_memory_restart: "500M",
      autorestart: true,
      out_file: "logs/scoutbot-out.log",
      error_file: "logs/scoutbot-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      env: {
        NODE_ENV: process.env.NODE_ENV,
        PROXY: process.env.PROXY,
        BOT_TOKEN: process.env.BOT_TOKEN
      }
    }
  ]
};
