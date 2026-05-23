# HR Automation Platform

## Getting Started

### 1. Navigate to the project directory

```bash
cd HR
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up the database

```bash
npx prisma generate
npx prisma db push
```

### 4. Run the development server

```bash
npm run dev
```

### 5. Open in browser

Visit:

```text
http://localhost:3000
```

## Features

- **HR Dashboard:** Create and manage hiring drives.
- **Candidate Portal:** Search jobs, view details, and apply.
- **Backend:** SQLite database with Prisma ORM.
