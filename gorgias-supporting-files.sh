########################################
## FILE: package.json
########################################
{
  "name": "gorgias-revenue-ops-mcp",
  "version": "1.0.0",
  "description": "Production-safe Gorgias MCP with dry-run writes, Shopify order context, SLA breach radar, and weekly CX summaries.",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "gorgias-revenue-ops-mcp": "dist/index.js"
  },
  "scripts": {
    "build":   "tsc",
    "dev":     "tsx watch src/index.ts",
    "start":   "node dist/index.js",
    "inspect": "npx -y @modelcontextprotocol/inspector tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx":        "^4.0.0",
    "typescript": "^5.4.0"
  },
  "keywords": [
    "mcp", "mcp-server", "gorgias", "ecommerce",
    "shopify", "customer-support", "sla", "helpdesk",
    "dtc", "revenue-ops", "dry-run"
  ],
  "license": "MIT"
}


########################################
## FILE: tsconfig.json
########################################
{
  "compilerOptions": {
    "target":           "ES2022",
    "module":           "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir":           "./dist",
    "rootDir":          "./src",
    "strict":           true,
    "esModuleInterop":  true,
    "skipLibCheck":     true,
    "declaration":      true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}


########################################
## FILE: .env.example
########################################
# Copy this file to .env and fill in your credentials.
# Never commit .env to version control.

GORGIAS_DOMAIN=mystore.gorgias.com
GORGIAS_EMAIL=admin@mystore.com
GORGIAS_API_KEY=your_api_key_here


########################################
## FILE: .gitignore
########################################
# Dependencies
node_modules/

# Build output
dist/

# Environment secrets — NEVER commit
.env

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/

# Logs
*.log
npm-debug.log*


########################################
## FILE: LICENSE  (MIT)
########################################
MIT License

Copyright (c) 2026 Rakib

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
