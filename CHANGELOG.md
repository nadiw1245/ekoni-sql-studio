# Changelog

All notable changes to **EKONI SQL Studio** are documented here.

## [2.5.0] - 2026-11-21
### Added
- **MySQL 9.7 LTS AI Vector Compatibility**: Native `VECTOR(N)` DDL transpilation plus `STRING_TO_VECTOR()`, `VECTOR_TO_STRING()`, `VECTOR_DIM()`, and `DISTANCE(v1, v2, 'COSINE' | 'EUCLIDEAN' | 'DOT')`.
- **Live MySQL / MariaDB / Cloud SSL Connection Manager**: Real `mysql2/promise` connection pooling with multi-profile manager, latency & version tester, SSL/TLS support for Cloud MySQL, and 1-click local XAMPP MySQL starter.
- **Permanent Windows Auto-Start & Single-Instance Guard**: Portable `install-autostart.bat`, `uninstall-autostart.bat`, `stop-server.bat`, `start-silent.vbs`, and `/api/health` duplicate-instance guard so localhost automatically returns online after PC shutdown and reboot.
- **1-Click Cloud Deployment**: Production `Dockerfile` (Node 24 + healthcheck) and `render.yaml` Blueprint.
- **1-Click Local MySQL Installer**: `install-mysql-latest.bat` using official Windows `winget` packages (`Oracle.MySQL` & `Oracle.MySQLShell`).

## [2.0.0] - 2026-11-21
### Added
- **12-Studio Duotone Icon Rail**: Home/Overview, SQL Console, Browse, Structure, Visual Query Builder, Data Quality Profiler, Insert + Mock Data Seeder, Search (QBE), Views & Triggers, Draggable ER Designer, Live REST API & ORM Codegen, and Operations + Time-Travel Snapshots.
- **Full phpMyAdmin Parity**: `SHOW DATABASES`, `SHOW TABLES`, `USE`, `DESCRIBE`, `SHOW CREATE TABLE`, `SHOW INDEX`, `TRUNCATE`, `AUTO_INCREMENT`, `ENGINE=InnoDB`, `ENUM`, inline cell edit, visual CRUD, SQL dump import/export, and Bookmarks.
- **12 EKONI Themes** + **6 Ambient Wallpapers** + **Aether Glass Studio (`Alt+A`)**.
