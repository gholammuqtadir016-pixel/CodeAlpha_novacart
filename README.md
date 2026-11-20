# NovaCart — Full-stack E-commerce Store

A modern, responsive e-commerce assignment built with **HTML, CSS, JavaScript, Node.js, Express.js, and built-in SQLite**.

## Features

- Responsive home page with featured products and category navigation
- Product listing, category filters, search and sorting
- Individual product detail pages, live stock counts and quantity selection
- Shopping cart with persistent browser storage and live totals
- User signup, login and logout with bcrypt password hashing and HttpOnly JWT cookies
- Checkout with validated shipping address and **cash on delivery**
- Database-backed order placement with transactional stock updates
- Authenticated order history
- Server-side input validation, basic rate limiting and security headers
- 12 seeded products with images, categories, prices and stock

## Requirements

- Node.js **22.13 or newer** (including your Node.js 24.21.0). No Visual Studio C++ Build Tools or Python are required.
- npm

## Fix a previously failed npm installation on Windows

If you previously tried the original ZIP and got errors about `better-sqlite3`, `node-gyp`, Visual Studio C++, or missing `express`, **use this fixed ZIP** instead. It removes `better-sqlite3` entirely and uses Node's built-in `node:sqlite` module.

Open a new PowerShell terminal inside the **fixed** `novacart` folder, then run:

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"
# Paste generated value into JWT_SECRET in .env
npm run dev
```

If updating an existing copy instead, stop the server with `Ctrl+C`, delete the old `node_modules` folder and `package-lock.json`, replace the project files with the fixed versions, then reinstall. Keep a backup of your existing `.env` and `data/store.db` if they contain personal settings or orders.

## Run locally

1. Open the `novacart` folder in VS Code.
2. Open a terminal and run:

   ```bash
   npm install
   ```
3. Make your environment file:

   **Windows PowerShell:**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux:**
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` and replace `JWT_SECRET` with a random string of 32+ characters.
5. Start the app:

   ```bash
   npm run dev
   ```
6. Visit **http://localhost:3000**.

The SQLite database file is created automatically at `data/store.db` the first time you start the server. Sample products are inserted once. You can register your own account and place cash-on-delivery demo orders.

## Test the main user journey

1. Browse products, sort by price, and search for "watch".
2. Open a product to see its description and select a quantity.
3. Add it to the cart, then update quantities on the cart page.
4. Register or log in.
5. Check out using a 6-digit Indian PIN code and select cash on delivery.
6. Place an order and open **My orders** to see it persisted in SQLite.

## Project structure

```text
novacart/
├── .env.example          # Example environment configuration
├── .gitignore
├── package.json
├── server.js             # Express API, auth, SQLite schema and orders
├── public/
│   ├── index.html        # Main layout and navigation
│   ├── styles.css        # Responsive design
│   └── app.js            # Storefront, cart, auth, checkout and routing
└── data/                 # Auto-created SQLite file (git-ignored)
```

## API endpoints

| Method | URL | Purpose |
| --- | --- | --- |
| GET | `/api/products` | Get products, optional `category`, `search`, `sort` |
| GET | `/api/products/:id` | Product details |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current signed-in user |
| POST | `/api/orders` | Place an order (login required) |
| GET | `/api/orders` | My order history (login required) |

## Important notes

- This is a **functional academic/demo store**, not a production payment platform. It supports **cash on delivery only** and doesn't collect or process bank-card details.
- The product images are hosted on Unsplash and need an internet connection. The core app and database work locally.
- The cart is saved in browser localStorage. Accounts and orders are saved in SQLite.
- For production deployment, add HTTPS, a managed database, persistent storage, email confirmation, password reset, stricter operational monitoring, and payment provider integration after appropriate review.
- Deployment: SQLite files are not durably retained on many serverless hosting plans, including a typical Vercel deployment. For hosting, use a persistent Node server with a persistent disk, or migrate storage to a managed database.
