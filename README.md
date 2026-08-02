<div align="center">

  <img src="Images/nadarl-logo.png" alt="NADARL Logo" width="180" />

  # NADARL Portal

  ### Newport & District Air Rifle League

  Official website and management portal for the Newport & District Air Rifle League — a competitive bell-target air rifle league where five teams shoot 7-yard matches on Monday evenings throughout the season.

  [![Website](https://img.shields.io/badge/Live%20Site-NADARL-blue?style=flat-square)](#)
  [![Facebook](https://img.shields.io/badge/Facebook-NADARL-1877F2?style=flat-square&logo=facebook&logoColor=white)](https://www.facebook.com/NADARL/)
  [![Instagram](https://img.shields.io/badge/Instagram-nadarl.1907-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://www.instagram.com/nadarl.1907/)
  [![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#license)

</div>

---

## About

The NADARL Portal is a lightweight, dependency-free web app that lets members, team captains, and league administrators view fixtures, league tables, team rosters, match scorecards, rules, history, and gallery — all backed by a [Supabase](https://supabase.com) database.

Matches are shot with `.177` calibre air rifles using open dioptre sights at a painted metal bell target at **7 yards**. A clean bull scores **10 points**, graduating down to **0**.

## Features

| Area | Description |
| --- | --- |
| 🎯 **Fixtures** | Season schedule of home/away matches, byes, and no-match Mondays |
| 📊 **League Table** | Live standings driven by per-shooter season aggregates |
| 👥 **Teams** | Rosters of shooters with captain / secretary / treasurer roles |
| 🏹 **Match Scorecards** | Full 7-shot breakdowns for every shooter in every match |
| 🔐 **Roles & Auth** | Public read, plus `captain`, `generic`, and `admin` write tiers |
| 🛠️ **Admin Tools** | Manage seasons, teams, fixtures, exclusions, and users |
| 📜 **Rules & History** | League regulations and heritage pages |
| 📸 **Gallery** | Photos from matches and events |

## Tech Stack

- **Frontend** — Plain HTML, CSS, and vanilla JavaScript (no build step)
- **Backend / Database** — [Supabase](https://supabase.com) (Postgres + Auth + PostgREST API)
- **Hosting** — Static files (any static host / GitHub Pages)

## Project Structure

```
NADARL-Portal/
├── index.html              # Landing page with quick links
├── styles.css              # Shared global styles
├── HTML/                   # Page views
│   ├── fixtures.html       # Season fixtures
│   ├── table.html          # League table
│   ├── teams.html          # All teams
│   ├── match.html          # Individual match scorecard
│   ├── admin.html          # Admin dashboard
│   └── ...
├── CSS/                    # Per-page stylesheets
├── JS/                     # Application logic (vanilla JS)
│   ├── supabase-config.js  # Shared Supabase client (window.db)
│   ├── data.js             # Data-access helpers
│   ├── fixtures.js         # Fixtures page logic
│   └── ...
├── Images/                 # Logos & imagery
└── supabase/               # Database schema, seed data & migrations
    ├── schema.sql          # Tables, views, RLS policies
    ├── seed.sql            # Sample season, teams & shooters
    └── migrations/         # Incremental schema changes
```

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/GameBoyCymru/NADARL-Portal.git
cd NADARL-Portal
```

### 2. Configure Supabase keys

Copy the example keys file and fill in your project credentials:

```bash
cp JS/supabase-keys.example.js JS/supabase-keys.js
```

```js
// JS/supabase-keys.js
window.NADARL_SUPABASE_URL      = "https://YOUR-PROJECT.supabase.co";
window.NADARL_SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

> `supabase-keys.js` is git-ignored so your real credentials never enter version control.

### 3. Provision the database

Run the SQL in the **Supabase SQL Editor** (Dashboard → SQL → New query), in order:

1. `supabase/schema.sql` — tables, views, indexes, and Row Level Security policies
2. `supabase/migrations/*.sql` — incremental changes (captains, shooter numbers, exclusions, etc.)
3. `supabase/seed.sql` — optional sample data

### 4. Serve locally

No build step required. Just open `index.html`, or run a quick local server:

```bash
python3 -m http.server 8000
```

Then visit **http://localhost:8000**.

## Data Model

```
season ─┬─ match ──┬─ score ── shooter
        │          └─ team
        └─ exclusion
team ──── shooter
user_profile (auth.users → role + team)
```

Row Level Security scopes writes by role:

| Role | Permissions |
| --- | --- |
| **public** | Read everything |
| **generic** | Edit scores for today's home match (shared team account) |
| **captain** | Manage own team's shooters + today's home-match scores |
| **admin** | Full access to all data |

## Backup & Disaster Recovery

Admins can download a full data snapshot (seasons, teams, shooters, fixtures,
scores) at any time from **Admin → Data Backup & Restore** — no tooling
required. For full Postgres-level disaster recovery (schema, functions, RLS
policies, and data in one shot via `pg_dump`/`pg_restore`), see
[`supabase/BACKUP_RESTORE.md`](supabase/BACKUP_RESTORE.md).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

## License

This project is licensed under the **MIT License**.

---

<div align="center">

&copy; Newport & District Air Rifle League

[🌐 Facebook](https://www.facebook.com/NADARL/) · [📸 Instagram](https://www.instagram.com/nadarl.1907/)

</div>
