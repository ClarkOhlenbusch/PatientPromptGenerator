# Updated Vercel Deployment Guide

This updated guide provides step-by-step instructions for deploying your Patient Prompt Generator application to Vercel with proper API key configuration.

## Step 1: Push Code Changes

Make sure to push all the latest changes to your repository, including:
- The new `api/index.ts` serverless function
- The new `api/_static.ts` for serving frontend assets
- Updated `vercel.json` configuration file

```bash
git add .
git commit -m "Prepare for Vercel deployment with serverless functions"
git push
```

## Step 2: Set Up Vercel Project

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" > "Project"
3. Import your GitHub repository
4. Configure the project with these settings:
   
   - **Framework Preset**: Other
   - **Root Directory**: `.` (period, indicating the root of your repository)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. Click "Deploy"

## Step 3: Configure Environment Variables (Critical)

1. In your Vercel dashboard, navigate to your project
2. Click on the "Settings" tab
3. In the left sidebar, click "Environment Variables"
4. Add the following environment variable:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key (starting with "sk-")
   - **Environment**: Select all environments (Production, Preview, and Development)
5. Click "Save"

## Step 4: Redeploy with Environment Variables

1. In your Vercel dashboard, go to "Deployments"
2. Click "Redeploy" on your most recent deployment

## Step 5: Verify the Deployment

1. Visit your deployed application at the Vercel URL
2. Test the application by uploading an Excel file
3. Check that prompts are generated using the OpenAI API
4. If something isn't working:
   - Check Vercel Function Logs in the dashboard
   - Verify the environment variable is correctly set
   - Check for any errors in the browser console

## Troubleshooting Common Issues

### 404 Errors on API Routes
- Check that the `api/index.ts` file is properly set up
- Ensure routes begin with `/api/` in the code

### 500 Errors with OpenAI API
- Verify your API key is valid and not expired
- Check that the key is correctly set in environment variables
- Look for detailed error messages in Vercel Function Logs

### Authentication Errors
- You may need to regenerate your OpenAI API key
- New OpenAI API keys should start with "sk-"

## Security Best Practices

- Never expose your API key in client-side code
- Use environment variables for all sensitive information
- Regularly rotate your API keys
- Monitor API usage in your OpenAI dashboard

## Local Development

For local development, create a `.env` file in your project root with:

```
OPENAI_API_KEY=your_openai_api_key
```

Remember to add `.env` to your `.gitignore` to prevent accidentally committing your API key.