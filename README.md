# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Local backend

The FastAPI backend stores application data in a local SQLite file and does not require Supabase or a database server. Windows setup, OCR prerequisites, backup/restore, and backend test commands are in [backend/README.md](backend/README.md).

For local development, the root `.env.local` sets `VITE_API_BASE_URL=http://localhost:8000`. Start FastAPI on port 8000 and restart `npm run dev` after changing frontend environment variables. The Soil Health Card scanner requires the FastAPI backend and does not use the development mock adapter.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
