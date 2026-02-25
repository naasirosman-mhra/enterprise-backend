# Enterprise Inventory Management — Backend

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
