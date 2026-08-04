const fs = require("fs")
let c = fs.readFileSync("src/App.jsx", "utf8")
// Remove duplicate imports (lines 4-5)
c = c.replace('import { useState, useCallback, useEffect } from "react"\nimport { supabase } from "./lib/supabase"\n\n\n', '')
// Fix ProviderLogo type annotation
c = c.replace(/function ProviderLogo\(\{ provider, size = "sm" \}: \{ provider:; size\?: \}\)/, 'function ProviderLogo({ provider, size = "sm" })')
// Fix any remaining : { ... } type annotations on function params
c = c.replace(/: \{[^}]*\}/g, "")
// Fix any remaining : type annotations like ": string" etc in function params
c = c.replace(/\((\w+): \w+\)/g, "($1)")
fs.writeFileSync("src/App.jsx", c)
console.log("Fixed. Lines:", c.split("\n").length)
