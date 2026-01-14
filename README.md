# HPP Hub

Developer portal for House Party Protocol (HPP). Provides AI-powered chat, API key management, and MPC wallet integration.

## Features

- **Playground** - Interactive AI chat with multiple LLM models (Claude, GPT, Llama, Qwen)
- **API Keys** - Create and manage API keys for HPP Router services
- **MPC Wallet** - Non-custodial wallet using Shamir Secret Sharing (2-of-3)
- **Credit System** - Usage-based billing with staking rewards
- **Admin Dashboard** - System settings, faucet monitoring

## Tech Stack

- **Framework**: Meteor 3.x
- **Frontend**: React 18, React Router 6
- **Database**: MongoDB
- **Blockchain**: Web3.js, HPP L2 (Arbitrum Orbit)
- **Auth**: Google OAuth

## Getting Started

### Prerequisites

- Node.js 20+
- Meteor 3.x (`npm install -g meteor`)
- MongoDB (or use Meteor's built-in)

### Installation

```bash
git clone git@github.com:shepelt/hub.git
cd hub
npm install
```

### Configuration

1. Copy settings template:
```bash
cp settings-local.json.example settings-local.json
```

2. Create `.env` file:
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
ROOT_URL=http://localhost:4000
API_KEY_ENCRYPTION_SECRET=<generated_hex_key>
FAUCET_PRIVATE_KEY=<optional_for_gas_sponsorship>
```

3. Configure `settings-local.json`:
```json
{
  "public": {
    "models": [...],
    "defaultModel": "anthropic/claude-sonnet-4-5-20250929",
    "explorerUrl": "https://explorer.hpp.io"
  },
  "private": {
    "adminEmails": ["admin@example.com"],
    "llm": {
      "enabled": true,
      "url": "https://your-llm-gateway/v1",
      "apiKey": "..."
    },
    "router": {
      "adminUrl": "https://your-router-admin",
      "adminUser": "...",
      "adminPassword": "..."
    }
  }
}
```

### Running

```bash
# Development
npm start

# With settings file
npm run dev
```

Open http://localhost:4000

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY_ENCRYPTION_SECRET` | Yes | 32-byte hex key for AES-256-GCM encryption |
| `ROOT_URL` | Yes | Base URL for the application |
| `FAUCET_PRIVATE_KEY` | No | Private key for gas sponsorship wallet |

## Project Structure

```
hub/
├── client/                 # Client entry point
│   ├── main.jsx           # React app initialization
│   └── main.css           # Global styles
├── server/
│   └── main.js            # Server initialization
├── imports/
│   ├── api/               # Backend logic
│   │   ├── collections.js # MongoDB collections
│   │   ├── models.js      # LLM model config
│   │   └── server/        # Server-only code
│   │       ├── apiKeys.js # API key management
│   │       ├── chat.js    # Playground chat
│   │       ├── wallet.js  # MPC wallet
│   │       └── ...
│   └── ui/                # React frontend
│       ├── pages/         # Route pages
│       ├── components/    # Shared components
│       └── layouts/       # Layout components
├── settings-local.json    # Runtime config
└── .env                   # Secrets
```

## API Methods

### API Keys
- `apiKeys.create(name)` - Create new API key
- `apiKeys.list()` - List user's keys
- `apiKeys.getKey(keyId)` - Retrieve full key (decrypted)
- `apiKeys.delete(keyId)` - Delete key

### Wallet
- `wallet.create()` - Generate MPC wallet
- `wallet.getAddress()` - Get wallet address
- `wallet.getBalance()` - Get balance

### Playground
- `playground.create(model)` - Create chat
- `playground.send(id, message, model)` - Send message

## Security

- **API Keys**: Encrypted at rest with AES-256-GCM
- **Wallet**: Shamir Secret Sharing (2-of-3 threshold)
  - Server share: MongoDB
  - Device share: Browser localStorage
  - Recovery share: Secure backup
- **Auth**: Google OAuth 2.0

## License

Proprietary - House Party Protocol
