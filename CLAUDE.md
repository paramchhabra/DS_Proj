# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands
```bash
# Build the full project
npm run build

# Start development server (Hot Module Replacement)
npm run dev

# Lint codebase (Eslint for JSX/TSX)
npm run lint

# Run all tests
npm run test

# Watch for file changes and re-run tests
npm run test:watch
```

## Project Structure & Architecture
This codebase is structured into two main components:

### Frontend (React + TypeScript + Vite)
```
Frontend/
├── src/              # React components and TypeScript files
│   ├── App.css       # Stylesheet for the application
│   ├── index.css     # Component-specific styles
│   ├── main.jsx      # Entry point for React application
│   └── assets/       # Media assets (images, SVGs)
│
├── public/           # Static assets (favicon, icons)
│   ├── favicon.svg   # Scalable vector graphics icon
│   └── icons.svg     # SVG icons for UI components
│
├── vite.config.js    # Vite configuration file
├── package.json      # Project dependencies
│
├── node_modules/     # Third-party dependencies (auto-generated)
│
└── README.md         # Frontend-specific documentation
```

### Backend (Python Environment)
```
Backend/
└── requirements.txt  # Python package requirements
```

## Key Features
1. **Chemical Generation Framework** - Core functionality for molecular design
2. **React Frontend** - Web-based interface for interaction
3. **Python Backend** - Analytical computations and data processing

## Development Workflow
- **Install dependencies**: Navigate to `Frontend/` and run `npm install`
- **Start development**: Run `npm run dev` from project root
- **Build for production**: Run `npm run build`
- **Run tests**: Execute `npm run test`

## Additional Resources
1. **Frontend Documentation** - Detailed in `Frontend/README.md`
2. **Node Modules** - All third-party dependencies in `Frontend/node_modules`

This structure allows separation of concerns while maintaining clear boundaries between presentation layer (Frontend) and computational logic (Backend).