import { readFileSync, writeFileSync } from 'fs'

const path = 'C:/Users/Aorus/Documents/Cline/Workflows/virtual-cards/src/App.jsx'
let c = readFileSync(path, 'utf8')

// 1. Remove "use client"
c = c.replace('"use client"\n\n', '')

// 2. Remove Types section (from "// ─── Types" up to "// ─── Seed Data")
c = c.replace(/\/\/ ─── Types[^]*?\/\/ ─── Seed Data/, '// ─── Seed Data')

// 3. Remove all TypeScript type annotations mechanically (safe: only known type names)
const types = [
  'View', 'Plan', 'Provider', 'CardPlan', 'Card', 'User', 'AppUser',
  'React.FormEvent', 'JSX.Element', 'typeof activeTab', 'Record<string, unknown>',
  '"success" | "error" | "info"', '"idle" | "loading" | "done" | "error"',
  '"overview" | "cards" | "users" | "settings"', '"sm" | "md"',
  '"free" | "pro" | "max"', '"all" | "free" | "pro" | "max"', '"active" | "banned"',
  '"landing" | "auth" | "cards" | "account" | "settings" | "pricing" | "admin"',
]
// Remove ": TypeName" (with optional spaces)
for (const t of types) {
  c = c.split(`: ${t}`).join(':')
}
// Remove " as TypeName"
for (const t of types) {
  c = c.split(` as ${t}`).join('')
}
// Remove ": TypeName" inside generic useState<...>
c = c.replace(/useState<[^>]*>/g, 'useState')
// Remove ": TypeName[]" arrays
for (const t of types) {
  c = c.split(`: ${t}[]`).join(':')
}
// Remove ": { ... }" object type annotations on function params (multi-line safe via regex below)
// Remove param annotations like (card: Card) / (c: Card) => etc.
c = c.replace(/\(([a-zA-Z_][a-zA-Z0-9_]*): (Card|User|AppUser|Plan|Provider|CardPlan|View|string|number|boolean|React\.FormEvent|Record<string, unknown>)\)/g, '($1)')
// Remove .map((x: Type) =>  / .forEach((x: Type) =>
c = c.replace(/\.(map|forEach)\(\(([a-zA-Z_][a-zA-Z0-9_]*): (Card|User|AppUser|Plan|Provider|CardPlan|View|string|number|boolean)\)/g, '.$1(($2)')
// Remove .find((x: Type) =>
c = c.replace(/\.(find|filter|some|every|slice|sort)\(\(([a-zA-Z_][a-zA-Z0-9_]*): (Card|User|AppUser|Plan|Provider|CardPlan|View|string|number|boolean)\)/g, '.$1(($2)')

// 4. Remove function type annotations like `function X({ ... }: { ... })` and `: { ... }` returns
c = c.replace(/function ([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*?)\)\s*:\s*\{[^]*?\}\s*\{/g, 'function $1($2) {')
// Remove `: { ... }` destructuring param type in arrow components `({ ... }: { ... }) =>`
c = c.replace(/(\([^)]*\))\s*:\s*\{[^]*?\}\s*=>/g, '$1 =>')
// Remove `): Type {` in function declarations (return types)
c = c.replace(/\)\s*:\s*[A-Za-z][A-Za-z0-9_.<>, |\[\]]*\s*\{/g, ') {')

// 5. Remove remaining `: Type` in variable declarations that reference known types only
// e.g. `let someVar: Card = ...` / `const x: Plan = ...`
for (const t of types) {
  c = c.split(`: ${t} =`).join(' =')
  c = c.split(`: ${t};`).join(';')
}

// 6. Remove `: Type[] =` 
for (const t of types) {
  c = c.split(`: ${t}[] =`).join(' =')
}

// 7. Remove `catch (err: any)` / `(err: unknown)`
c = c.replace(/catch \(err: (any|unknown|Error)\)/g, 'catch (err)')

// 8. Remove `: string`, `: number`, `: boolean` on vars
c = c.replace(/: (string|number|boolean) =/g, ' =')

// 9. Remove `as Record<string, unknown>` etc (already done)
// 10. Fix double colons like `::` or `: :` left behind
c = c.replace(/:\s*:/g, ':').replace(/\(\): \)/g, '())')

writeFileSync(path, c, 'utf8')
console.log('Done. Remaining TS hints:', (c.match(/: (View|Plan|Provider|CardPlan|Card|User|AppUser|string\[\]|number\[\]|boolean\[\])/g) || []).length)