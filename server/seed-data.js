'use strict';

const ECOMMERCE_SEED = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  country TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('Starter', 'Pro', 'Enterprise')),
  joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 4.5
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('delivered', 'shipped', 'processing', 'cancelled')),
  order_date TEXT NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);

INSERT INTO customers (full_name, email, country, tier, joined_at) VALUES
  ('Aarav Sharma', 'aarav@devforge.io', 'India', 'Enterprise', '2025-01-12'),
  ('Elena Rostova', 'elena@nordiccloud.se', 'Sweden', 'Enterprise', '2025-02-03'),
  ('Marcus Vance', 'marcus@pixelgrid.us', 'USA', 'Pro', '2025-02-19'),
  ('Hana Takahashi', 'hana@tokyostack.jp', 'Japan', 'Enterprise', '2025-03-08'),
  ('Lucas Meyer', 'lucas@alpinelab.de', 'Germany', 'Pro', '2025-03-21'),
  ('Sofia Alvarez', 'sofia@solaris.es', 'Spain', 'Starter', '2025-04-04'),
  ('Liam O''Connor', 'liam@emeraldops.ie', 'Ireland', 'Pro', '2025-04-18'),
  ('Priya Nair', 'priya@keraladata.in', 'India', 'Enterprise', '2025-05-02'),
  ('Noah Kim', 'noah@seoulai.kr', 'South Korea', 'Pro', '2025-05-27'),
  ('Chloe Laurent', 'chloe@lumiere.fr', 'France', 'Starter', '2025-06-15'),
  ('Mateo Silva', 'mateo@riodev.br', 'Brazil', 'Pro', '2025-07-09'),
  ('Amara Okafor', 'amara@lagoscloud.ng', 'Nigeria', 'Enterprise', '2025-08-14'),
  ('Oliver Grant', 'oliver@thames.uk', 'UK', 'Pro', '2025-09-01'),
  ('Zara Patel', 'zara@induslabs.in', 'India', 'Starter', '2025-10-11'),
  ('Daniel Lindqvist', 'daniel@fjord.no', 'Norway', 'Enterprise', '2025-11-22'),
  ('Maya Chen', 'maya@pacificml.us', 'USA', 'Pro', '2026-01-06');

INSERT INTO products (sku, name, category, unit_price, unit_cost, stock, rating) VALUES
  ('HW-KB01', 'EKONI Split Mech Keyboard', 'Hardware', 249.00, 118.00, 42, 4.9),
  ('HW-MN02', 'UltraSharp 5K Studio Display', 'Hardware', 1199.00, 740.00, 14, 4.8),
  ('HW-DK03', 'Thunderbolt 5 NVMe Dock', 'Hardware', 289.00, 145.00, 31, 4.7),
  ('HW-MS04', 'Precision Ergonomic Trackball', 'Hardware', 129.00, 54.00, 65, 4.6),
  ('AU-HP05', 'Planar Magnetic Studio Headphones', 'Audio', 399.00, 190.00, 27, 4.9),
  ('AU-MC06', 'Broadcast XLR Dynamic Mic', 'Audio', 279.00, 122.00, 38, 4.8),
  ('AU-SP07', 'Nearfield Reference Monitors (Pair)', 'Audio', 549.00, 285.00, 19, 4.7),
  ('SW-ID08', 'HyperShell Pro Lifetime License', 'Software', 149.00, 12.00, 999, 4.9),
  ('SW-DB09', 'SQL Studio Enterprise Pack', 'Software', 299.00, 18.00, 999, 4.8),
  ('SW-AI10', 'Local LLM Benchmark Suite', 'Software', 99.00, 9.00, 999, 4.5),
  ('AC-MT11', 'Aubergine Wool Desk Mat', 'Accessories', 49.00, 14.00, 120, 4.7),
  ('AC-ST12', 'CNC Aluminum Laptop Riser', 'Accessories', 89.00, 31.00, 76, 4.6),
  ('AC-CB13', 'Coiled Aviator USB-C Cable', 'Accessories', 59.00, 16.00, 94, 4.8),
  ('AC-LT14', 'OLED Monitor Light Bar', 'Accessories', 119.00, 46.00, 53, 4.7);

INSERT INTO orders (customer_id, status, order_date, discount_pct) VALUES
  (1, 'delivered', '2026-01-05', 10),
  (2, 'delivered', '2026-01-12', 5),
  (3, 'delivered', '2026-01-19', 0),
  (4, 'delivered', '2026-01-28', 15),
  (5, 'delivered', '2026-02-04', 0),
  (6, 'cancelled', '2026-02-09', 0),
  (7, 'delivered', '2026-02-15', 5),
  (8, 'delivered', '2026-02-24', 10),
  (9, 'delivered', '2026-03-03', 0),
  (10, 'delivered', '2026-03-11', 0),
  (11, 'delivered', '2026-03-22', 5),
  (12, 'delivered', '2026-04-02', 15),
  (1, 'delivered', '2026-04-14', 10),
  (13, 'delivered', '2026-04-26', 0),
  (14, 'delivered', '2026-05-05', 0),
  (15, 'delivered', '2026-05-19', 10),
  (4, 'delivered', '2026-06-01', 10),
  (16, 'delivered', '2026-06-14', 5),
  (2, 'delivered', '2026-07-04', 10),
  (8, 'delivered', '2026-07-21', 15),
  (3, 'delivered', '2026-08-08', 0),
  (12, 'delivered', '2026-08-23', 10),
  (9, 'shipped', '2026-09-10', 5),
  (15, 'shipped', '2026-09-25', 10),
  (1, 'delivered', '2026-10-04', 10),
  (7, 'shipped', '2026-10-18', 0),
  (16, 'processing', '2026-11-02', 5),
  (4, 'processing', '2026-11-11', 10),
  (5, 'processing', '2026-11-16', 0),
  (8, 'delivered', '2026-11-19', 10);

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1, 2, 2, 1199.00), (1, 1, 2, 249.00), (1, 9, 1, 299.00),
  (2, 5, 2, 399.00), (2, 8, 3, 149.00),
  (3, 1, 1, 249.00), (3, 11, 2, 49.00),
  (4, 2, 3, 1199.00), (4, 3, 3, 289.00), (4, 9, 2, 299.00),
  (5, 6, 1, 279.00), (5, 13, 2, 59.00),
  (6, 4, 1, 129.00),
  (7, 8, 2, 149.00), (7, 12, 1, 89.00),
  (8, 2, 1, 1199.00), (8, 5, 1, 399.00), (8, 9, 2, 299.00),
  (9, 7, 1, 549.00), (9, 14, 1, 119.00),
  (10, 11, 3, 49.00), (10, 10, 1, 99.00),
  (11, 1, 2, 249.00), (11, 4, 2, 129.00),
  (12, 2, 2, 1199.00), (12, 7, 2, 549.00), (12, 9, 3, 299.00),
  (13, 3, 2, 289.00), (13, 8, 4, 149.00),
  (14, 5, 1, 399.00), (14, 13, 1, 59.00),
  (15, 10, 2, 99.00), (15, 11, 1, 49.00),
  (16, 2, 1, 1199.00), (16, 6, 2, 279.00),
  (17, 1, 3, 249.00), (17, 14, 2, 119.00),
  (18, 9, 1, 299.00), (18, 12, 2, 89.00),
  (19, 7, 2, 549.00), (19, 8, 2, 149.00),
  (20, 2, 2, 1199.00), (20, 5, 2, 399.00),
  (21, 3, 1, 289.00), (21, 13, 3, 59.00),
  (22, 9, 4, 299.00), (22, 1, 2, 249.00),
  (23, 6, 1, 279.00), (23, 14, 1, 119.00),
  (24, 2, 1, 1199.00), (24, 3, 1, 289.00),
  (25, 5, 3, 399.00), (25, 8, 2, 149.00),
  (26, 4, 2, 129.00), (26, 12, 2, 89.00),
  (27, 1, 1, 249.00), (27, 9, 1, 299.00),
  (28, 7, 1, 549.00), (28, 11, 2, 49.00),
  (29, 10, 3, 99.00), (29, 13, 2, 59.00),
  (30, 2, 1, 1199.00), (30, 8, 5, 149.00);

INSERT INTO reviews (product_id, customer_id, stars, comment, created_at) VALUES
  (1, 1, 5, 'Best split mechanical keyboard for Hyprland workflows.', '2026-01-20'),
  (2, 4, 5, 'Razor sharp 5K text clarity for terminal coding.', '2026-02-11'),
  (5, 2, 5, 'Studio planar detail is unreal for deep work sessions.', '2026-02-28'),
  (8, 7, 5, 'Zero latency shell tooling, worth every cent.', '2026-03-14'),
  (9, 8, 5, 'Query plans and charts make analytics effortless.', '2026-04-05'),
  (3, 13, 4, 'Blazing NVMe speed, runs slightly warm under load.', '2026-05-12'),
  (7, 12, 5, 'Clean flat monitor response with zero hiss.', '2026-06-19'),
  (11, 10, 4, 'Love the aubergine wool texture on my desk.', '2026-07-02'),
  (6, 15, 5, 'Crisp broadcast vocal tone right out of the box.', '2026-08-29'),
  (14, 9, 5, 'Zero glare on OLED monitor, sleek wireless dial.', '2026-10-08');

CREATE VIEW IF NOT EXISTS v_revenue_by_category AS
SELECT
  p.category,
  COUNT(DISTINCT oi.order_id) AS orders_count,
  SUM(oi.quantity) AS units_sold,
  ROUND(SUM(oi.quantity * oi.unit_price * (1 - o.discount_pct / 100.0)), 2) AS net_revenue,
  ROUND(SUM(oi.quantity * (oi.unit_price * (1 - o.discount_pct / 100.0) - p.unit_cost)), 2) AS gross_profit
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status != 'cancelled'
GROUP BY p.category
ORDER BY net_revenue DESC;
`;

const HR_ANALYTICS_SEED = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  location TEXT NOT NULL,
  budget REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  salary REAL NOT NULL,
  hire_date TEXT NOT NULL,
  performance_score REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  lead_id INTEGER REFERENCES employees(id),
  status TEXT NOT NULL,
  budget_used REAL NOT NULL
);

INSERT INTO departments (name, location, budget) VALUES
  ('Core Systems', 'Bengaluru', 1450000),
  ('AI Platform', 'San Francisco', 2200000),
  ('Design & UX', 'Stockholm', 820000),
  ('Cloud Infra', 'Dublin', 1600000);

INSERT INTO employees (full_name, role, department_id, salary, hire_date, performance_score) VALUES
  ('Rohan Kulkarni', 'Principal Kernel Eng', 1, 185000, '2022-03-15', 4.9),
  ('Ananya Verma', 'Senior Rust Engineer', 1, 152000, '2023-07-01', 4.7),
  ('David Park', 'Staff ML Architect', 2, 228000, '2021-11-10', 4.9),
  ('Sophia Lind', 'Design Systems Lead', 3, 148000, '2023-01-20', 4.8),
  ('Ethan Brooks', 'SRE Staff Engineer', 4, 179000, '2022-08-05', 4.6),
  ('Meera Iyer', 'Research Scientist', 2, 196000, '2024-02-12', 4.8),
  ('Jonas Berg', 'Product Designer', 3, 126000, '2024-05-01', 4.5),
  ('Claire Murphy', 'Platform Engineer', 4, 144000, '2023-10-16', 4.7),
  ('Vikram Rao', 'Systems Engineer', 1, 134000, '2025-01-08', 4.4),
  ('Nadia Hassan', 'Applied AI Engineer', 2, 172000, '2024-09-23', 4.6);

INSERT INTO projects (title, department_id, lead_id, status, budget_used) VALUES
  ('EKONI Cloud SQL Engine', 1, 1, 'active', 410000),
  ('Zero-Copy SQL Query Engine', 1, 2, 'completed', 295000),
  ('Neon Multimodal Inference', 2, 3, 'active', 890000),
  ('Aether Theme Language v2', 3, 4, 'completed', 180000),
  ('Global Edge Mesh', 4, 5, 'active', 640000);
`;

const COOKBOOK = [
  {
    id: 'rev-category',
    category: 'Analytics',
    title: 'Net Revenue & Profit by Category (Chart-Ready)',
    desc: 'Aggregates delivered/active revenue and gross profit across product categories',
    db: 'ecommerce.db',
    sql: `SELECT
  p.category,
  COUNT(DISTINCT oi.order_id) AS orders,
  SUM(oi.quantity) AS units_sold,
  ROUND(SUM(oi.quantity * oi.unit_price * (1 - o.discount_pct / 100.0)), 2) AS net_revenue,
  ROUND(SUM(oi.quantity * (oi.unit_price * (1 - o.discount_pct / 100.0) - p.unit_cost)), 2) AS gross_profit
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status != 'cancelled'
GROUP BY p.category
ORDER BY net_revenue DESC;`,
  },
  {
    id: 'monthly-trend',
    category: 'Analytics',
    title: 'Monthly Revenue Trend + Running Total (Window Fn)',
    desc: 'Uses a CTE + SUM() OVER() window function to compute cumulative 2026 revenue',
    db: 'ecommerce.db',
    sql: `WITH monthly AS (
  SELECT
    substr(o.order_date, 1, 7) AS month,
    COUNT(DISTINCT o.id) AS orders,
    ROUND(SUM(oi.quantity * oi.unit_price * (1 - o.discount_pct / 100.0)), 2) AS revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status != 'cancelled'
  GROUP BY substr(o.order_date, 1, 7)
)
SELECT
  month,
  orders,
  revenue,
  ROUND(SUM(revenue) OVER (ORDER BY month), 2) AS cumulative_revenue
FROM monthly
ORDER BY month;`,
  },
  {
    id: 'top-customers',
    category: 'Window Functions',
    title: 'Top Customers Ranked Within Tier (RANK OVER)',
    desc: 'Ranks customers by lifetime spend inside Enterprise, Pro, and Starter tiers',
    db: 'ecommerce.db',
    sql: `WITH customer_spend AS (
  SELECT
    c.full_name,
    c.country,
    c.tier,
    COUNT(DISTINCT o.id) AS total_orders,
    ROUND(SUM(oi.quantity * oi.unit_price * (1 - o.discount_pct / 100.0)), 2) AS lifetime_spend
  FROM customers c
  JOIN orders o ON o.customer_id = c.id
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status != 'cancelled'
  GROUP BY c.id
)
SELECT
  RANK() OVER (PARTITION BY tier ORDER BY lifetime_spend DESC) AS tier_rank,
  full_name,
  country,
  tier,
  total_orders,
  lifetime_spend
FROM customer_spend
ORDER BY tier, tier_rank;`,
  },
  {
    id: 'country-breakdown',
    category: 'Joins',
    title: 'Sales Breakdown by Country',
    desc: 'Compares customer count, order volume, and average order value per country',
    db: 'ecommerce.db',
    sql: `SELECT
  c.country,
  COUNT(DISTINCT c.id) AS customers,
  COUNT(DISTINCT o.id) AS orders,
  ROUND(SUM(oi.quantity * oi.unit_price * (1 - o.discount_pct / 100.0)), 2) AS total_sales
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status != 'cancelled'
GROUP BY c.country
ORDER BY total_sales DESC;`,
  },
  {
    id: 'top-products',
    category: 'Joins',
    title: 'Best-Selling Products with Margin %',
    desc: 'Computes units sold, revenue, and profit margin for every product',
    db: 'ecommerce.db',
    sql: `SELECT
  p.sku,
  p.name,
  p.category,
  p.rating,
  SUM(oi.quantity) AS units,
  ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue,
  ROUND(((p.unit_price - p.unit_cost) / p.unit_price) * 100, 1) AS margin_pct
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
GROUP BY p.id
ORDER BY revenue DESC;`,
  },
  {
    id: 'multi-statement',
    category: 'Multi-Query',
    title: 'Run Multiple Queries at Once (2 Result Tabs)',
    desc: 'Demonstrates executing two SQL statements in a single run',
    db: 'ecommerce.db',
    sql: `-- Query 1: Revenue view
SELECT * FROM v_revenue_by_category;

-- Query 2: Latest 5-star reviews
SELECT r.created_at, c.full_name, p.name AS product, r.stars, r.comment
FROM reviews r
JOIN customers c ON c.id = r.customer_id
JOIN products p ON p.id = r.product_id
WHERE r.stars = 5
ORDER BY r.created_at DESC;`,
  },
  {
    id: 'hr-dept-stats',
    category: 'HR Analytics',
    title: 'Department Headcount & Salary Analysis',
    desc: 'Switch to tech_hr.db to explore salaries and project budgets',
    db: 'tech_hr.db',
    sql: `SELECT
  d.name AS department,
  d.location,
  COUNT(e.id) AS headcount,
  ROUND(AVG(e.salary), 0) AS avg_salary,
  MAX(e.salary) AS top_salary,
  ROUND(AVG(e.performance_score), 2) AS avg_perf
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.id
ORDER BY avg_salary DESC;`,
  },
];

module.exports = {
  ECOMMERCE_SEED,
  HR_ANALYTICS_SEED,
  COOKBOOK,
};
