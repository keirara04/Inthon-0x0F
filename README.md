# [Project Name] — InThon 2026 Team 15

> One-line pitch: what problem it solves, for whom.

## Team
| Name | Role |
|------|------|
| Keira (키미) | Lead / Full-stack |
| [Name] | [Frontend / Design] |
| [Name] | [Backend / Pitch] |

## Tech Stack
- **Frontend:** Next.js (TypeScript), Tailwind CSS
- **Backend:** Laravel (PHP), MySQL
- **Hosting:** Self-hosted homelab — [URL]

## Project Structure
```
/frontend   → Next.js app
/backend    → Laravel API
```

## Getting Started

### Prerequisites
Node 20+, PHP 8.3+, Composer, MySQL 8

### Database
```bash
brew install mysql@8.4 && brew services start mysql@8.4
mysql -uroot      # if not on PATH: /opt/homebrew/opt/mysql@8.4/bin/mysql
```
```sql
CREATE DATABASE inthon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'inthon'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL ON inthon.* TO 'inthon'@'localhost';
```

### Backend
```bash
cd backend
cp .env.example .env      # set DB_PASSWORD to the password above
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve         # http://localhost:8000
```

### Frontend
```bash
cd frontend
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                  # http://localhost:3000
```

Open http://localhost:3000 — it should show "Backend says: pong from laravel".

## Git Rules
- Never push directly to `main`
- Branch: `feat/<name>`, `fix/<name>`
- Pull before you push: `git pull --rebase origin main`
- Small commits, clear messages
- Never commit `.env` files

## Features
- [ ] Feature 1
- [ ] Feature 2
- [ ] Feature 3

## Demo
- Live: [URL]
- Video: [link]
