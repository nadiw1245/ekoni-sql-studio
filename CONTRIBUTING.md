# Contributing to EKONI SQL Studio

Thank you for helping build the next-generation SQL Workbench! Every bug report, theme idea, SQL dialect helper, and pull request makes EKONI SQL Studio better for developers worldwide.

## Development Setup

1. Ensure you have **Node.js 24+** (or Node 22.5+ with `node:sqlite`) installed.
2. Fork and clone the repository:
   ```bash
   git clone https://github.com/nadiw1245/ekoni-sql-studio.git
   cd ekoni-sql-studio
   npm install
   ```
3. Run the local server:
   ```bash
   npm start
   # Open http://localhost:3344
   ```
4. Before opening a Pull Request, run syntax validation and the full automated test suite:
   ```bash
   npm run check
   npm test
   ```

## Coding Guidelines

- **Zero heavy bundler bloat**: Keep frontend modules clean vanilla ES6+ under `public/` with crisp duotone SVGs in `public/icons.js`.
- **Test every SQL / API feature**: Add test cases to `test/sql.test.js` whenever adding SQL compatibility functions, DDL transpiler rules, or REST/backend endpoints.
- **Never commit local data or credentials**: `data/*.db` and `data/connections.json` are excluded in `.gitignore`.
- **Keep Windows + Linux + macOS compatible**: Avoid hardcoded user directories or platform-locked assumptions.

## Submitting Pull Requests

1. Create a descriptive feature branch (`git checkout -b feat/your-feature`).
2. Commit with clear messages (`feat:`, `fix:`, `docs:`, `test:`).
3. Open a Pull Request filling out the PR checklist.
