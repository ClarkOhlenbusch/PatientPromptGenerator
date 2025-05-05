Essential Environment Variables for CalicoCare Deployment
Here's a simple explanation of all the environment variables needed in your .env file when deploying CalicoCare outside of Replit:

Database Connection
# Required: PostgreSQL connection string
DATABASE_URL=postgresql://username:password@hostname:5432/database_name
# Optional: Individual connection parameters (if not using DATABASE_URL)
DB_HOST=your-database-host
DB_PORT=5432
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=your-database-name
Authentication
# Required: Secret key for securing user sessions
SESSION_SECRET=long-random-string-for-session-encryption
# Optional: Session configuration
SESSION_MAX_AGE=86400000  # 24 hours in milliseconds
OpenAI Integration
# Required: API key for OpenAI services
OPENAI_API_KEY=sk-your-openai-api-key
Twilio SMS Notifications
# Required for SMS alerts
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
Server Configuration
# Optional: Server port (defaults to 5000 if not specified)
PORT=5000
# Optional: Node environment
NODE_ENV=production
# Optional: Logging level
LOG_LEVEL=info
CORS Configuration
# Optional: Allowed origins for CORS
CORS_ORIGIN=https://your-frontend-domain.com
# Optional: CORS settings
CORS_CREDENTIALS=true
HIPAA Compliance (If Needed)
# Optional: Encryption key for PHI fields (32-byte hex string)
ENCRYPTION_KEY=32-character-hex-string-for-field-encryption
Example .env File
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/calicocare
# Authentication
SESSION_SECRET=random-secure-session-key-at-least-32-chars
# OpenAI
OPENAI_API_KEY=sk-your-openai-key
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
# Server
PORT=5000
NODE_ENV=production
When deploying to production, make sure that:

All sensitive values use strong, random passwords/keys
The database user has appropriate permissions
The .env file is not committed to version control
Your production environment has proper backup procedures for these secrets
For cloud deployments (AWS, Azure, GCP), consider using their respective secrets management services instead of an .env file.
