# Vercel Deployment Guide for Patient Prompt Generator

This guide will walk you through deploying this application to Vercel while ensuring that your OpenAI API key remains secure.

## Prerequisites

1. A [Vercel account](https://vercel.com/signup) (free tier works fine)
2. Your OpenAI API key
3. A GitHub account (for storing your code repository)

## Step 1: Prepare Your Repository

First, push your code to GitHub:

```bash
# Initialize a Git repository if you haven't already
git init

# Add your files
git add .

# Commit changes
git commit -m "Initial commit"

# Create a new repository on GitHub and push
git remote add origin https://github.com/yourusername/your-repo-name.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Vercel

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" > "Project"
3. Import your GitHub repository
4. Configure the project with the following settings:

   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. Click "Deploy"

## Step 3: Configure Environment Variables (Critical)

After the initial deployment (which may fail without API keys), you need to add your environment variables:

1. In your Vercel dashboard, navigate to your project
2. Click on the "Settings" tab
3. In the left sidebar, click "Environment Variables"
4. Add the following environment variable:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your actual OpenAI API key
   - **Environment**: Select which environments should have access (recommended: Production and Preview)
5. Click "Save" to store your environment variable

## Step 4: Redeploy with Environment Variables

1. In your Vercel dashboard, go to the "Deployments" tab
2. Find your most recent deployment
3. Click the three dots (⋮) and select "Redeploy" to deploy with the new environment variables

## Step 5: Verify Security

After deployment, verify that your API key is secure:

1. Visit your deployed site
2. Open browser developer tools (F12 or right-click > Inspect)
3. Go to the Network tab and filter by "XHR" or "Fetch"
4. Perform an action that triggers an API call
5. Verify that no API key is visible in the request headers or body

## Troubleshooting

If you encounter issues with the OpenAI API calls:

1. Check Vercel logs in your dashboard under "Deployments" > click on deployment > "Functions"
2. Verify the environment variable is correctly set in Vercel settings
3. Make sure all API calls are made server-side (via API routes) and not directly from the client

## Maintaining Security

- Never expose your API key in client-side code
- Regularly rotate your API keys for enhanced security
- Use environment variables for all sensitive information
- Consider using Vercel's integration with GitHub to automatically deploy updates

## Local Development

For local development, create a `.env` file in your project root with:

```
OPENAI_API_KEY=your_openai_api_key
```

Make sure this file is in your `.gitignore` to prevent accidentally committing it to your repository.