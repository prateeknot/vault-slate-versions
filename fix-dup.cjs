const fs = require("fs")
let c = fs.readFileSync("src/App.jsx", "utf8")
// Remove duplicate import line
c = c.replace('import { useState, useCallback } from "react"\n\n', '')
// Fix PLAN_LIMITS: = 
c = c.replace(/let PLAN_LIMITS:  =/g, 'let PLAN_LIMITS =')
c = c.replace(/let PLAN_LIMITS:/g, 'let PLAN_LIMITS')
// Check for any remaining :[] or : = patterns
const lines = c.split("\n")
let issues = []
lines.forEach((l, i) => {
  if (l.match(/:\s*\[/) && !l.includes("http") && !l.includes("className")) issues.push((i+1) + ": " + l.trim().substring(0, 80))
  if (l.match(/:\s*=/) && !l.includes("http") && !l.includes("style") && !l.includes("onClick") && !l.includes("onChange") && !l.includes("className")) issues.push((i+1) + ": " + l.trim().substring(0, 80))
})
fs.writeFileSync("src/App.jsx", c)
console.log("Fixed. Lines:", c.split("\n").length)
console.log("Potential issues:", issues.length)
issues.slice(0, 10).forEach(s => console.log("  " + s))
