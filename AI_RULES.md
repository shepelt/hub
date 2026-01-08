# AI Development Rules for HPP Hub

## Project Overview
HPP Hub is a developer hub for House Party Protocol (HPP), an AI blockchain project. Built with Meteor.js.

## Technology Stack
- **Framework**: Meteor.js 3.x
- **Frontend**: React 18.2
- **Language**: JavaScript (ES6+)
- **Database**: MongoDB
- **Build System**: Meteor modern build stack

## Project Structure
Follow the canonical Meteor.js application structure:

```
/client             # Client entry point
/server             # Server entry point
/imports
  /api              # Collections, Methods, Publications
  /ui               # React components
/public             # Static assets
/private            # Server-only assets
```

## Code Conventions

### File Organization
- Place all application code inside `/imports` directory
- Use ES6 `import`/`export` modules
- Client code: `/imports/ui`
- Server code: `/imports/api`
- Shared code: Can be in either, but avoid client-specific code in `/api`

### Naming Conventions
- **Collections**: PascalCase with "Collection" suffix (e.g., `ProjectsCollection`)
- **Components**: PascalCase (e.g., `Dashboard.jsx`)
- **Files**: Match the exported component/module name
- **Methods**: camelCase (e.g., `projects.insert`)

### Meteor Patterns
- Use `async`/`await` for all database operations
- Collections: `new Mongo.Collection('name')`
- Methods: `Meteor.methods({ 'name': async function() {} })`
- Publications: `Meteor.publish('name', function() {})`
- Subscriptions: `useTracker()` for React components

## Development Philosophy

### Start Simple, Grow Naturally
- **Flat structure first**: Keep files at the root level until organization becomes necessary
  - `imports/api/methods.js`
  - `imports/api/generator/methods/createProject.js` (too early)

### YAGNI Principle
- Only build what you need right now
- Don't create "future-proof" abstractions
- Examples of YAGNI violations to avoid:
  - Creating a `BaseService` class before you have 2 services
  - Adding configuration files for features that don't exist yet
  - Building a plugin system before you have plugins

### When to Refactor
- When you copy-paste code 3+ times -> extract to function
- When a file exceeds 300 lines -> consider splitting
- When a pattern becomes clear -> then abstract it
- Never before

## Development Workflow
- Keep components small and focused
- Co-locate related files (component, styles, tests)
- Write clear, self-documenting code
- Follow Meteor Guide best practices
- **NEVER modify files without explicit user permission**
  - Always show the proposed changes first
  - Wait for user approval before applying
  - Exception: Only when user explicitly requests the change (e.g., "fix that", "do it")
- **Development Server**: Run via `npm start`
  - Includes Hot Module Replacement (HMR) for instant UI updates
  - Auto-restarts server on backend code changes
  - No need to manually restart during development

## Testing
- **Test Framework**: Mocha via `meteortesting:mocha` package
- **Test Files**: `*.tests.js` files (e.g., `methods.tests.js`)
- **Run All Tests**: `npm test` or `meteor test --once --driver-package meteortesting:mocha`

## Notes
This file will evolve as the project grows and patterns emerge.

## References
Use meteor-docs.txt as reference on Meteor development
