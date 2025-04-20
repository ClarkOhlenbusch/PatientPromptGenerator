# Patient Prompt Generator

A comprehensive healthcare monitoring system that transforms patient medical data into actionable insights through AI-powered analysis and automated alerts.

## Overview

The Patient Prompt Generator is a specialized healthcare monitoring tool designed for healthcare professionals. It processes patient data from Excel spreadsheets to generate personalized health insights, identify patients requiring attention, and automate communication with caregivers.

### Key Features

- **Excel Data Processing**: Upload and process Excel files containing patient data
- **AI-Powered Insights**: Generate customized health insights using OpenAI's GPT models
- **Real-time Triage**: Identify and prioritize patients requiring immediate attention
- **Automated Alerts**: Send SMS notifications to caregivers for critical conditions
- **Comprehensive Reporting**: Generate detailed monthly PDF reports with patient analytics
- **Secure Authentication**: Robust user authentication and session management
- **Data Persistence**: Complete storage of patient records and health metrics

## Technology Stack

- **Frontend**: 
  - React with TypeScript
  - TailwindCSS for styling
  - Shadcn UI components
  - React Query for data fetching
  - Wouter for routing

- **Backend**: 
  - Node.js with Express
  - Passport.js for authentication
  - ExcelJS for Excel processing
  - pdfmake for PDF generation
  - Drizzle ORM for database operations

- **Database**: 
  - PostgreSQL (via Drizzle ORM)
  - Session storage with connect-pg-simple

- **External Services**:
  - OpenAI API for AI analysis
  - Twilio for SMS notifications

## Prerequisites

- Windows 10/11
- Node.js 16+ and npm
- PostgreSQL 12+
- OpenAI API key
- Twilio account (for SMS functionality)

## Windows Installation Guide

### 1. Install Required Software

1. **Install Node.js**:
   - Download Node.js from [nodejs.org](https://nodejs.org/)
   - Run the installer and follow the prompts
   - Verify installation:
     ```powershell
     node --version
     npm --version
     ```

2. **Install PostgreSQL**:
   - Download PostgreSQL from [postgresql.org](https://www.postgresql.org/download/windows/)
   - Run the installer
   - Note down the password you set for the postgres user
   - Keep the default port (5432)

3. **Install Git**:
   - Download Git from [git-scm.com](https://git-scm.com/download/win)
   - Run the installer
   - Verify installation:
     ```powershell
     git --version
     ```

### 2. Clone and Setup the Project

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/yourusername/patient-prompt-generator.git
   cd patient-prompt-generator
   ```

2. **Install dependencies**:
   ```powershell
   npm install
   ```

3. **Create environment variables**:
   Create a `.env` file in the root directory with:
   ```
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/patient_prompt
   OPENAI_API_KEY=your_openai_api_key
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_token
   TWILIO_PHONE_NUMBER=your_twilio_phone
   SESSION_SECRET=your_session_secret
   ```

4. **Initialize the database**:
   ```powershell
   npm run db:push
   ```

### 3. Start the Application

1. **Start the development server**:
   ```powershell
   npm run dev
   ```

2. **Access the application**:
   - Open your browser and navigate to `http://localhost:3000`
   - The application should be running and ready for use

## Usage Guide

### 1. Authentication

- Register a new account or use the default test credentials:
  - Username: testuser
  - Password: password123
- All sensitive operations require authentication

### 2. Uploading Patient Data

1. Navigate to the upload page
2. Select an Excel file with patient data
3. The file should contain:
   - Patient ID
   - Name
   - Date of Birth
   - Health measurements
   - Alert indicators

### 3. Triage System

- View patients requiring attention
- Grouped by severity (Red → Yellow → Green)
- Send SMS alerts to caregivers
- View detailed patient metrics

### 4. Monthly Reports

1. Navigate to the Reports page
2. Select a month and year
3. Generate and download PDF reports containing:
   - Patient compliance rates
   - Health trend analysis
   - Alert statistics
   - Individual patient summaries

## Data Structure

### Excel File Format
The application expects Excel files with these columns:
- Patient ID (unique identifier)
- Name (patient name)
- Date of Birth (patient age)
- Timestamp (when data was collected)
- Variable (health metric name)
- Value (measurement value)
- Is Alert (boolean flag)

### Database Schema
The application uses several tables:
- users (authentication)
- patient_batches (upload history)
- patient_prompts (generated insights)
- patient_alerts (triage data)
- monthly_reports (report history)

## Testing

Run the smoke test to verify core functionality:
```powershell
npm run smoke-test
```

This will test:
- Authentication flow
- Report generation
- PDF download functionality

## Troubleshooting

### Common Issues

1. **Database Connection Issues**:
   - Verify PostgreSQL is running
   - Check DATABASE_URL in .env
   - Ensure correct credentials

2. **Authentication Problems**:
   - Clear browser cookies
   - Verify SESSION_SECRET in .env
   - Check server logs for errors

3. **Excel Processing Errors**:
   - Verify file format matches requirements
   - Check for empty or malformed cells
   - Ensure proper column headers

### Logs and Debugging

- Server logs are available in the console
- Authentication errors are logged with details
- Excel processing errors include row numbers
- API errors include request details

## Security Considerations

- All API endpoints are protected
- Passwords are hashed using scrypt
- Sessions use secure cookies
- Database queries use parameterized statements
- File uploads are validated and sanitized

## Acknowledgments

- OpenAI for providing the API for generating insights
- Calico Care for the project requirements and domain expertise
- The open-source community for the tools and libraries used

---

*Note: This application handles sensitive patient data. Ensure proper security measures are in place before deploying to production.*
