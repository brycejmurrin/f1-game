"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LOG_JS = fs.readFileSync(path.join(__dirname, "../../js/log.js"), "utf8");

function seedLog(ctx) {
  vm.runInContext(LOG_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/log.js" });
  return ctx;
}

module.exports = { seedLog, LOG_JS };
