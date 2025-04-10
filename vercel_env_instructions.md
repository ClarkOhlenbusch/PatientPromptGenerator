# Setting Up Environment Variables in Vercel

To securely add your OpenAI API key to your Vercel deployment, follow these steps:

## From the Vercel Dashboard

1. Log in to your [Vercel account](https://vercel.com/)
2. Select your project from the dashboard
3. Click on the "Settings" tab
4. In the left sidebar, click on "Environment Variables"
5. Add your API key:
   - Name: `OPENAI_API_KEY`
   - Value: Your actual OpenAI API key
   - Environment: Select which environments should have access (Production, Preview, Development)
6. Click "Save" to store your environment variable

## Using the Vercel CLI

If you prefer using the command line:

```bash
# Install Vercel CLI if you haven't already
npm i -g vercel

# Make sure you're logged in
vercel login

# Add the environment variable to your project
vercel env add OPENAI_API_KEY

# Follow the prompts to enter your API key and select environments
```

## Testing Environment Variables

To verify your environment variable is properly set:

1. After deployment, go to Functions > Logs in your Vercel project dashboard
2. Check for any errors related to API key access
3. If using the Vercel CLI locally, you can run `vercel env ls` to list all environment variables

## Important Security Notes

- Never commit API keys directly to your code repository
- Vercel securely encrypts your environment variables
- If you need to rotate your API key, update it in the Vercel dashboard
- For local development, consider using a `.env` file (make sure it's in your `.gitignore`)