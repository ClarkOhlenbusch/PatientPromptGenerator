/**
 * PDF Generator Module for Monthly Reports
 * 
 * This module handles the generation of PDF reports for patients,
 * including trend analysis, compliance rates, and forecasting.
 */

import PdfMake from 'pdfmake';
import * as fs from 'fs';
import * as path from 'path';
import { PatientPrompt } from '@shared/schema';

// Define fonts for PDF
const fonts = {
  Roboto: {
    normal: path.join(process.cwd(), 'node_modules', 'pdfmake', 'build', 'fonts', 'Roboto-Regular.ttf'),
    bold: path.join(process.cwd(), 'node_modules', 'pdfmake', 'build', 'fonts', 'Roboto-Medium.ttf'),
    italics: path.join(process.cwd(), 'node_modules', 'pdfmake', 'build', 'fonts', 'Roboto-Italic.ttf'),
    bolditalics: path.join(process.cwd(), 'node_modules', 'pdfmake', 'build', 'fonts', 'Roboto-MediumItalic.ttf')
  }
};

// Interface for patient measurement data
interface PatientMeasurement {
  patientId: string;
  timestamp: string; 
  variable: string;
  value: number;
  isAlert: boolean;
}

// Interface for trends and statistics
interface MeasurementTrend {
  variable: string;
  readings: number[];
  dates: string[];
  min: number;
  max: number;
  average: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  forecast: number | null;
}

/**
 * Calculate trends and statistics for a set of measurements
 * @param measurements List of patient measurements
 * @returns Object containing trend analysis data
 */
function calculateTrends(measurements: PatientMeasurement[]): Record<string, MeasurementTrend> {
  // Group measurements by variable
  const variableMeasurements: Record<string, PatientMeasurement[]> = {};
  
  measurements.forEach(m => {
    if (!variableMeasurements[m.variable]) {
      variableMeasurements[m.variable] = [];
    }
    variableMeasurements[m.variable].push(m);
  });
  
  const trends: Record<string, MeasurementTrend> = {};
  
  // Calculate trends for each variable
  Object.keys(variableMeasurements).forEach(variable => {
    const data = variableMeasurements[variable];
    
    // Sort by timestamp
    data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    const readings = data.map(m => m.value);
    const dates = data.map(m => new Date(m.timestamp).toISOString().split('T')[0]);
    
    // Calculate basic statistics
    const min = Math.min(...readings);
    const max = Math.max(...readings);
    const average = readings.reduce((sum, val) => sum + val, 0) / readings.length;
    
    // Calculate trend (simple linear regression)
    // X values are days since first reading
    const xValues = data.map((_, i) => i);
    const yValues = readings;
    
    // Calculate slope using least squares method
    const n = xValues.length;
    const sumX = xValues.reduce((sum, val) => sum + val, 0);
    const sumY = yValues.reduce((sum, val) => sum + val, 0);
    const sumXY = xValues.reduce((sum, val, i) => sum + (val * yValues[i]), 0);
    const sumXX = xValues.reduce((sum, val) => sum + (val * val), 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
    
    // Determine trend direction
    let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (slope > 0.1) trendDirection = 'increasing';
    else if (slope < -0.1) trendDirection = 'decreasing';
    
    // Simple forecast - project 30 days into the future
    const lastReading = readings[readings.length - 1];
    const forecast = lastReading + (slope * 30);
    
    trends[variable] = {
      variable,
      readings,
      dates,
      min,
      max,
      average,
      trend: trendDirection,
      slope,
      forecast: forecast
    };
  });
  
  return trends;
}

/**
 * Calculate patient compliance rate based on expected readings vs. actual readings
 * @param expectedReadingsPerDay Number of readings expected per day
 * @param actualReadings Array of actual readings
 * @param daysInPeriod Number of days in the reporting period
 * @returns Compliance rate as a percentage
 */
function calculateComplianceRate(
  expectedReadingsPerDay: number,
  actualReadings: PatientMeasurement[],
  daysInPeriod: number
): number {
  // Get unique days with readings
  const uniqueDays = new Set(
    actualReadings.map(r => new Date(r.timestamp).toISOString().split('T')[0])
  );
  
  // Calculate compliance as percentage of days with readings
  return Math.min(100, Math.round((uniqueDays.size / daysInPeriod) * 100));
}

/**
 * Generate a monthly report PDF for a patient
 * @param patientData Patient information
 * @param measurements Recent measurements for the patient
 * @param month Month for the report (MM)
 * @param year Year for the report (YYYY)
 * @returns Buffer containing the generated PDF
 */
export async function generatePatientMonthlyReport(
  patientData: PatientPrompt,
  measurements: PatientMeasurement[],
  month: string,
  year: string
): Promise<Buffer> {
  // Create a new PDF document
  const printer = new PdfMake(fonts);
  
  // Calculate report period
  const reportDate = new Date(`${year}-${month}-01`);
  const monthName = reportDate.toLocaleString('default', { month: 'long' });
  
  // Calculate trends and compliance
  const trends = calculateTrends(measurements);
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
  const compliance = calculateComplianceRate(1, measurements, daysInMonth);
  
  // Create document definition
  const docDefinition: any = {
    content: [
      {
        text: `Monthly Health Report - ${monthName} ${year}`,
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20]
      },
      {
        text: `Patient: ${patientData.name} (ID: ${patientData.patientId})`,
        style: 'subheader'
      },
      {
        text: `Age: ${patientData.age} | Primary Condition: ${patientData.condition}`,
        style: 'subheader',
        margin: [0, 0, 0, 20]
      },
      {
        text: `Report Generated: ${new Date().toLocaleDateString()}`,
        style: 'small',
        margin: [0, 0, 0, 30]
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Health Measure', style: 'tableHeader' },
              { text: 'Readings', style: 'tableHeader' },
              { text: 'Range', style: 'tableHeader' },
              { text: 'Trend', style: 'tableHeader' },
              { text: 'Forecast', style: 'tableHeader' }
            ],
            ...Object.values(trends).map(trend => [
              trend.variable,
              `${trend.readings.length} (avg: ${trend.average.toFixed(1)})`,
              `${trend.min.toFixed(1)} - ${trend.max.toFixed(1)}`,
              {
                text: trend.trend,
                color: trend.trend === 'stable' ? 'green' : 
                       trend.trend === 'increasing' ? 'orange' : 'blue'
              },
              trend.forecast ? trend.forecast.toFixed(1) : 'N/A'
            ])
          ]
        },
        margin: [0, 0, 0, 20]
      },
      {
        text: 'Compliance Summary',
        style: 'subheader',
        margin: [0, 20, 0, 10]
      },
      {
        text: `${compliance}% Compliant with Health Monitoring`,
        color: compliance >= 80 ? 'green' : compliance >= 60 ? 'orange' : 'red',
        bold: true,
        margin: [0, 0, 0, 5]
      },
      {
        text: `Based on ${measurements.length} readings over ${daysInMonth} days`,
        style: 'small',
        margin: [0, 0, 0, 20]
      },
      {
        text: 'Recommendations',
        style: 'subheader',
        margin: [0, 20, 0, 10]
      },
      {
        ul: [
          compliance < 80 ? 'Improve monitoring consistency to reach target of 80% compliance' : 'Maintain excellent monitoring compliance',
          Object.values(trends).some(t => t.trend === 'increasing' && ['Blood Pressure', 'Heart Rate', 'Glucose'].includes(t.variable)) ? 
            `Monitor increasing ${Object.values(trends).filter(t => t.trend === 'increasing' && ['Blood Pressure', 'Heart Rate', 'Glucose'].includes(t.variable))[0].variable} closely` : 
            'Continue current health management plan',
          'Schedule regular follow-up with healthcare provider'
        ]
      },
      {
        text: 'Notes',
        style: 'subheader',
        margin: [0, 20, 0, 10]
      },
      {
        text: patientData.prompt,
        style: 'small',
        margin: [0, 0, 0, 20]
      }
    ],
    styles: {
      header: {
        fontSize: 22,
        bold: true,
        color: '#2c3e50'
      },
      subheader: {
        fontSize: 16,
        bold: true,
        color: '#34495e'
      },
      tableHeader: {
        bold: true,
        fontSize: 12,
        color: '#2c3e50'
      },
      small: {
        fontSize: 10,
        color: '#7f8c8d'
      }
    },
    defaultStyle: {
      fontSize: 12,
      color: '#2c3e50'
    },
    footer: {
      text: 'Confidential Health Information - For Patient Care Only',
      alignment: 'center',
      fontSize: 8,
      margin: [0, 10, 0, 0]
    }
  };
  
  // Create the PDF document
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  
  // Write to buffer
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate a consolidated monthly report for multiple patients
 * @param patients Array of patient data
 * @param measurementsMap Map of patient ID to their measurements
 * @param month Month for the report (MM)
 * @param year Year for the report (YYYY)
 * @returns Buffer containing the generated PDF
 */
export async function generateConsolidatedMonthlyReport(
  patients: PatientPrompt[],
  measurementsMap: Record<string, PatientMeasurement[]>,
  month: string,
  year: string
): Promise<Buffer> {
  // Create a new PDF document
  const printer = new PdfMake(fonts);
  
  // Calculate report period
  const reportDate = new Date(`${year}-${month}-01`);
  const monthName = reportDate.toLocaleString('default', { month: 'long' });
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
  
  // Create document definition
  const docDefinition: any = {
    content: [
      {
        text: `Consolidated Monthly Health Report - ${monthName} ${year}`,
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20]
      },
      {
        text: `Report Generated: ${new Date().toLocaleDateString()}`,
        style: 'small',
        alignment: 'center',
        margin: [0, 0, 0, 30]
      },
      {
        text: `Total Patients: ${patients.length}`,
        style: 'subheader',
        margin: [0, 0, 0, 20]
      },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'ID', style: 'tableHeader' },
              { text: 'Patient', style: 'tableHeader' },
              { text: 'Age', style: 'tableHeader' },
              { text: 'Condition', style: 'tableHeader' },
              { text: 'Readings', style: 'tableHeader' },
              { text: 'Compliance', style: 'tableHeader' }
            ],
            ...patients.map(patient => {
              const measurements = measurementsMap[patient.patientId] || [];
              const readingCount = measurements.length;
              const compliance = calculateComplianceRate(1, measurements, daysInMonth);
              
              return [
                patient.patientId,
                patient.name,
                patient.age.toString(),
                patient.condition,
                readingCount.toString(),
                {
                  text: `${compliance}%`,
                  color: compliance >= 80 ? 'green' : compliance >= 60 ? 'orange' : 'red'
                }
              ];
            })
          ]
        },
        margin: [0, 0, 0, 20]
      },
      {
        text: 'Summary Statistics',
        style: 'subheader',
        margin: [0, 20, 0, 10]
      },
    ],
    styles: {
      header: {
        fontSize: 22,
        bold: true,
        color: '#2c3e50'
      },
      subheader: {
        fontSize: 16,
        bold: true,
        color: '#34495e'
      },
      tableHeader: {
        bold: true,
        fontSize: 12,
        color: '#2c3e50'
      },
      small: {
        fontSize: 10,
        color: '#7f8c8d'
      }
    },
    defaultStyle: {
      fontSize: 12,
      color: '#2c3e50'
    },
    footer: {
      text: 'Confidential Health Information - For Patient Care Only',
      alignment: 'center',
      fontSize: 8,
      margin: [0, 10, 0, 0]
    }
  };
  
  // Create the PDF document
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  
  // Write to buffer
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (error) {
      reject(error);
    }
  });
}