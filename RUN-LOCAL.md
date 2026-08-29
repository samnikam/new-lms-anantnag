# Running the portal locally

Everything runs from the project root:
`c:\Users\abhin\OneDrive\Desktop\lms portal new`

## Every time (normal start)

```bash
docker compose up -d postgres     # 1. database (needs Docker Desktop running)
npm run dev                       # 2. API + portal together
```

Then open **http://localhost:5173** and sign in with
`admin@lms.gov.in` / `Password@123`.

Stop with `Ctrl+C`. To stop the database too: `docker compose stop postgres`.

## First run after a fresh clone

```bash
npm install
docker compose up -d postgres
npm run db:migrate --workspace backend
npm run db:seed --workspace backend
npm run dev
```

## What runs where

| Service | URL |
| --- | --- |
| Portal | http://localhost:5173 |
| API | http://localhost:4000/api |
| API docs | http://localhost:4000/api/docs |
| PostgreSQL | localhost:55433 (container) |

## Running the two apps separately

```bash
npm run dev:api    # backend only, port 4000
npm run dev:web    # frontend only, port 5173
```

## Resetting the demo data

```bash
cd backend && npx prisma migrate reset --force
```

Drops the schema, re-applies migrations and re-seeds: 21 sites, 42 panels,
2 studios, a published course, a proctored quiz and a broadcast.

## Troubleshooting

**"Authentication failed against database server"** — Docker Desktop is not
running, so nothing is listening on 55433. Start it and re-run
`docker compose up -d postgres`.

Note that port 55433 is deliberate: this machine already has native
PostgreSQL instances on 5432 and 5433 that would answer instead of the
container.

**Port 4000 or 5173 already in use** — an earlier run is still alive:

```bash
netstat -ano | grep LISTENING | grep ':4000'   # note the PID
powershell "Stop-Process -Id <PID> -Force"
```

**Blank page or API errors after pulling changes** — dependencies moved:

```bash
npm install
```
