const fs = require("fs")
let c = fs.readFileSync("src/App.jsx", "utf8")
// Remove duplicate imports (lines 4-5) - match second occurrence
const lines = c.split("\n")
// Remove lines 4 and 5 (0-indexed: 3 and 4) if they are duplicate imports
if (lines[3] && lines[3].includes("import { useState") && lines[4] && lines[4].includes("import { supabase")) {
  lines.splice(3, 2)
  c = lines.join("\n")
}
// Fix (e:) => (e)
c = c.replace(/\(e:\)/g, "(e)")
// Fix any remaining (param:) patterns
c = c.replace(/\((\w+):\)/g, "($1)")
fs.writeFileSync("src/App.jsx", c)
console.log("Fixed. Lines:", c.split("\n").length)
