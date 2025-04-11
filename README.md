# Patient Prompt Generator

A web application that transforms patient medical data from Excel files into AI-powered insights through intelligent processing and advanced analytics.

![Calico Care Patient Prompt Generator](https://i.imgur.com/MsrUySM.png)

## Overview

The Patient Prompt Generator is a specialized tool designed for healthcare professionals at Calico Care. It processes patient data from Excel spreadsheets to generate tailored, AI-powered prompts for each patient based on their medical conditions and health indicators. 

### Key Features

- **Excel Data Processing**: Upload and process Excel files containing patient data
- **AI-Powered Insights**: Generate customized prompts for patients using OpenAI's GPT models
- **Patient Filtering**: Focus on patients with alert conditions that require attention
- **Data Aggregation**: Combine multiple issues for the same patient into comprehensive prompts
- **Batch Processing**: Handle multiple patients efficiently in a single upload
- **Export Capability**: Export the generated prompts to CSV for easier integration with other systems

## Technology Stack

- **Frontend**: React with TypeScript, TailwindCSS, Shadcn UI components
- **Backend**: Node.js with Express
- **AI Integration**: OpenAI API
- **Data Processing**: Excel file parsing with automata-style workflow
- **Database**: In-memory storage (ready for PostgreSQL integration)
- **Build Tools**: Vite, ESBuild

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- OpenAI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/patient-prompt-generator.git
   cd patient-prompt-generator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Create a `.env` file in the root directory
   - Add your OpenAI API key:
     ```
     OPENAI_API_KEY=your_api_key_here
     ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5000`

## Usage Guide

### Uploading Data

1. Navigate to the home page
2. Click on the "Choose File" button or drop your Excel file in the designated area
3. The file should follow the expected format (see sample data structure below)
4. Click "Upload" to start processing

### Viewing Results

1. After processing, you'll be redirected to the results page
2. Browse through the list of patients and their generated prompts
3. Use the search functionality to find specific patients
4. Click on a patient to view their full prompt details

### Regenerating Prompts

1. On the results page, you can regenerate prompts for specific patients by clicking the "Regenerate" button
2. To regenerate all prompts, use the "Regenerate All" button

### Exporting Data

1. On the results page, click the "Export CSV" button
2. A CSV file containing all patient prompts will be downloaded

## Data Format

The application expects Excel files with the following column structure:
- Patient ID (unique identifier)
- Name (patient name)
- Age (patient age)
- Condition (medical condition)
- Is Alert (boolean flag indicating if prompt needs to be generated)
- Additional metrics and measurements (will be included in the prompt if relevant)

### Sample Data Row
```
PatientID: "P12345"
Name: "John Doe"
Age: 65
Condition: "Hypertension"
Is Alert: TRUE
Blood Pressure: "160/90"
```

## Deployment

This application is configured to be deployed on Replit.

### Replit Deployment

1. Fork this repository to your Replit account
2. Add your OpenAI API key as a secret:
   - Name: `OPENAI_API_KEY`
   - Value: your actual OpenAI API key
3. Click the "Run" button to start the application

## Project Structure

```
├── client/                 # Frontend code
│   ├── public/             # Static assets
│   └── src/                # React application source
│       ├── components/     # UI components
│       ├── hooks/          # Custom React hooks
│       ├── lib/            # Utility functions
│       └── pages/          # Application pages
├── server/                 # Backend code
│   ├── lib/                # Server utilities
│   │   ├── excelProcessor.js  # Excel file processing logic
│   │   └── openai.js       # OpenAI integration
│   ├── index.ts            # Server entry point
│   └── routes.ts           # API routes
├── shared/                 # Shared code between client and server
│   └── schema.ts           # Data models and types
└── package.json            # Project dependencies
```

## Automata-Style Workflow

The Excel processor follows an automata-style workflow:
- S0: Initialize processing
- S1: Read Excel file
- S2: Identify headers and structure
- S3: Process rows
- S4: Filter for alert conditions
- S5: Aggregate by patient ID
- S6: Generate prompts
- S7: Format results
- S8: Return processed data

## Performance Optimizations

- Processing is limited to 20 unique patient-condition combinations per batch
- Caching is implemented for condition-specific prompts to reduce API calls
- Token length is optimized for faster OpenAI API responses
- Data is filtered early in the process to focus only on relevant patients

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for providing the API for generating patient prompts
- Calico Care for the project requirements and domain expertise

---

*Note: This project is for demonstration purposes. In a production environment, additional security measures should be implemented, particularly for handling sensitive patient data.*