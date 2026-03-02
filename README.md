# Enterprise Inventory Management — Backend

[![CI](https://github.com/naasirosman-mhra/enterprise-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/naasirosman-mhra/enterprise-backend/actions/workflows/ci.yml)

## Database (Local PostgreSQL 16)

Start the database:
```bash
brew services start postgresql@16
```

Stop the database:
```bash
brew services stop postgresql@16
```

Connect to the database:
```bash
/opt/homebrew/opt/postgresql@16/bin/psql inventory_db
```

Check service status:
```bash
brew services info postgresql@16
```

## Prisma Studio (Database UI)

View and edit database tables in the browser:
```bash
npx prisma studio
```

Opens at http://localhost:5555
