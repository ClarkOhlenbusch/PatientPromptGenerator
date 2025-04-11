// Deployment verification script for Vercel
// This script helps verify your deployment on Vercel

import { promises as fs } from 'fs';

console.log('Verifying deployment configuration...');

// Check if environment variables are correctly set up
if (!process.env.OPENAI_API_KEY) {
  console.error('⚠️ WARNING: OPENAI_API_KEY environment variable is not set!');
  console.log('Please ensure this variable is set in Vercel environment settings.');
  console.log('Go to: Project Settings > Environment Variables');
} else {
  console.log('✓ OpenAI API key is properly configured');
}

// Check for necessary files
const requiredFiles = [
  'api/index.ts',
  'api/_static.ts',
  'vercel.json'
];

let missingFiles = false;
for (const file of requiredFiles) {
  try {
    await fs.access(file);
  } catch (error) {
    console.error(`⚠️ Missing file: ${file}`);
    missingFiles = true;
  }
}

if (!missingFiles) {
  console.log('✓ All required deployment files are present');
}

// Display final instructions
console.log('\nTo deploy to Vercel:');
console.log('1. Push these changes to your GitHub repository');
console.log('2. Create a new project on Vercel and import this repository');
console.log('3. Add your OPENAI_API_KEY to the environment variables');
console.log('4. Deploy the project');
console.log('\nFor more detailed instructions, refer to UPDATED_VERCEL_DEPLOYMENT.md');