// Static file handler for Vercel
import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();

// Serve static files from the client/dist directory
app.use(express.static(path.join(process.cwd(), 'dist')));

// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
  const indexPath = path.join(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

export default app;