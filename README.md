# 어디路 — InThon 2026 0x0F

> 보지 않고 느끼며 찾는 실내 길. Indoor navigation that turns the evacuation map already posted on every floor into a route, then guides you there with vibration and voice, so you don't have to keep looking at the screen.

**Theme:** 감각 (senses). AI reads what is visual (evacuation maps, signs, room numbers) and translates it into touch and sound. It is built for first-time visitors, international students and visually impaired people. The pilot building is 우정정보관 at Korea University.

## Team
| Name | Role |
|------|------|
| 키미  | Backend, deploy, merging |
| 김상후 | AI feature development |
| 전소현 | Frontend |
| 김명성 | Testing, backend support |

## Tech Stack
- **Frontend:** Next.js (TypeScript), Tailwind CSS
- **Backend:** Laravel (PHP), MySQL
- **AI:** OpenRouter vision (`google/gemini-3.8-flash`) called from the backend only (`App\Services\VisionClient`, prompts in `backend/resources/prompts/`)
- **Platform:** Mobile web (PWA). Android first, iPhone supported
- **Hosting:** Self-hosted homelab (Dokploy). https://inthon.hakeemiridza.com

## Project Structure
```
/frontend      → Next.js app (screens in src/components/gilgyeol, state in src/lib/gilgyeol)
/backend       → Laravel API (endpoints: backend/routes/api.php)
/ai            → AI prompt evals
/demo-video    → HyperFrames source for the demo video
compose.yaml   → local MySQL (Docker)
```

## Getting Started

### Prerequisites
Node 20.9+, PHP 8.3+, Composer, Docker Desktop

### Backend
```bash
cd backend
cp .env.example .env      # set DB_PASSWORD to any password; keep DB_HOST=127.0.0.1 (not "mysql"); set OPENROUTER_API_KEY for AI features
docker compose --env-file .env -f ../compose.yaml up -d --wait   # starts MySQL on :3306, waits until ready
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

Open http://localhost:3000. You should see the 어디路 landing page. Backend check: http://localhost:8000/api/ping returns `{"message":"pong from laravel"}`.

### Troubleshooting
- **Port 3306 already in use** (local MySQL installed): set `DB_PORT=3307` in `backend/.env` and rerun the `docker compose` line.
- **`Connection refused` on migrate:** MySQL isn't up. Run the `docker compose ... up -d --wait` line again.
- **CORS error in browser:** Laravel allows all origins on `/api/*` by default. If someone changed it, check `backend/config/cors.php` (`php artisan config:publish cors` to create it).
- **After `git pull`:** run `composer install && php artisan migrate` in `backend`, `npm install` in `frontend`.

## Git Rules
- Never push directly to `main`
- Branch: `feat/<name>`, `fix/<name>`
- Pull before you push: `git pull --rebase origin main`
- Small commits, clear messages
- Never commit `.env` files
- Open a PR for every change; 키미 reviews and merges
- After rebasing a branch you already pushed: `git push --force-with-lease` (never plain `--force`)
- Never edit an existing migration; create a new one

## 한국어 안내

### 로컬 실행
준비물: Node 20.9+, PHP 8.3+, Composer, Docker Desktop

**백엔드**
```bash
cd backend
cp .env.example .env      # DB_PASSWORD에 원하는 비밀번호 입력, DB_HOST는 127.0.0.1 그대로 ("mysql" 아님), AI 기능은 OPENROUTER_API_KEY 필요
docker compose --env-file .env -f ../compose.yaml up -d --wait   # MySQL 실행 (준비될 때까지 대기)
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve         # http://localhost:8000
```

**프론트엔드**
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev               # http://localhost:3000
```

http://localhost:3000 에서 어디路 첫 화면이 보이면 성공입니다. 백엔드 확인: http://localhost:8000/api/ping 이 `{"message":"pong from laravel"}` 를 반환

### 문제 해결
- **3306 포트 사용 중** (로컬에 MySQL 설치된 경우): `backend/.env`에서 `DB_PORT=3307`로 바꾸고 `docker compose` 명령을 다시 실행
- **migrate 시 `Connection refused`:** MySQL이 아직 안 켜짐. `docker compose ... up -d --wait` 다시 실행
- **브라우저 CORS 에러:** 기본 설정은 `/api/*`에 모든 origin 허용. 누가 바꿨다면 `backend/config/cors.php` 확인
- **`git pull` 후:** `backend`에서 `composer install && php artisan migrate`, `frontend`에서 `npm install`

### Git 규칙
- `main`에 직접 push 금지
- 브랜치 이름: `feat/<이름>`, `fix/<이름>`
- push 전에 pull: `git pull --rebase origin main`
- 커밋은 작게, 메시지는 명확하게
- `.env` 파일은 절대 커밋하지 않기
- 모든 변경은 PR로 올리기. 리뷰와 merge는 키미가 담당
- 이미 push한 브랜치를 rebase한 후에는 `git push --force-with-lease` 사용 (`--force` 금지)
- 기존 migration 파일은 수정하지 말고 새 migration 만들기
- `main`에 merge되면 Dokploy로 자동 배포

## Deployment
Merging to `main` auto-deploys via Dokploy. Only 키미 merges.
- Frontend: https://inthon.hakeemiridza.com
- API: https://inthon-api.hakeemiridza.com (`/up` health, `/api/ping`)

## Features
- [x] **Evacuation map to route map:** take a photo of a floor's evacuation map. Vision AI extracts the room and corridor graph, shows it in 2D/3D and marks the map's 현위치 (you are here) as your start point
- [x] **Saved maps per building:** maps that have already been read are reused, so the next visitor can skip the photo
- [x] **Search and route:** search a room (e.g. 405호) and get a landmark-based route that respects which floors each elevator stops at
- [x] **Vibration direction guidance:** vibration speeds up as you face the right way. iPhone gets a stereo beep instead
- [x] **Voice guidance:** Korean TTS reads each step
- [x] **Camera checkpoints:** raise the phone and the camera reads floor signs and room plates to confirm where you are
- [x] **Off-route and wrong-floor alerts** with re-routing
- [x] **Graph editor** to fix the AI draft
- [x] **3-minute guided trial** (하은 persona, 우정정보관 → 405호) behind a demo login with the name prefilled. No sign-up needed

> Everyday wayfinding only. In an emergency, follow official alarms and on-site guidance.

## Demo
- Live: https://inthon.hakeemiridza.com
- Video: https://youtu.be/_tmBiVy2yYI
