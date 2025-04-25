/**
 * Enhanced PDF Generator for Monthly Patient Reports
 * 
 * This module creates comprehensive patient reports with detailed health metrics,
 * visualizations, and insights based on patient data.
 */

import { PatientData, PatientVitals, VitalMeasurement } from '@shared/types';

// Remove local interfaces since we're importing them

// Define types for vital signs measurements
export interface VitalStats {
  average: number;
  minimum: number;
  maximum: number;
  stdDev: number;
  alertCount: number;
}

// Add these interfaces at the top with the other interfaces
interface ChartPoint {
  x: number;
  y: number;
  value: number;
  isAlert: boolean;
  date: Date;
}

interface YAxisLabel {
  value: number;
  y: number;
}

interface XAxisLabel {
  x: number;
  date: Date;
  label: string;
}

interface ChartData {
  points: ChartPoint[];
  yLabels: YAxisLabel[];
  xLabels: XAxisLabel[];
  minValue: number;
  maxValue: number;
}

/**
 * Generate sample vitals data for a patient report
 * This function simulates what you'd get from a real database of patient readings
 */
export function generateSampleVitals(patientData: any, days = 30): PatientVitals {
  const vitals = {
    heartRate: [] as VitalMeasurement[],
    oxygenSaturation: [] as VitalMeasurement[],
    glucose: [] as VitalMeasurement[]
  };
  
  // Base values and thresholds vary by patient condition
  const isHealthy = patientData.healthStatus === 'healthy';
  
  // Use patient ID as seed for deterministic random values
  // This ensures the same patient always gets the same "random" data
  const patientSeed = patientData.patientId ? 
    patientData.patientId.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) : 
    (patientData.name ? patientData.name.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) : 12345);
  
  // Simple deterministic random function using the seed
  const seededRandom = (index: number) => {
    const x = Math.sin(patientSeed + index) * 10000;
    return x - Math.floor(x);
  };
  
  // Base values - slightly adjust based on patient ID for consistency
  const seedOffset = (seededRandom(0) - 0.5) * 10;
  const hrBase = (isHealthy ? 72 : 85) + Math.round(seedOffset);
  const o2Base = (isHealthy ? 96 : 91) + Math.round(seedOffset / 5);
  const glucoseBase = (isHealthy ? 110 : 140) + Math.round(seedOffset * 2);
  
  // Thresholds
  const hrHighThreshold = 100; 
  const hrLowThreshold = 60;
  const o2LowThreshold = 90;
  const glucoseHighThreshold = 160;
  
  // Generate daily readings for the specified period
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  
  for (let i = 0; i < days; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    
    // Heart rate: more variation for unhealthy patients but deterministic
    const hrVariation = isHealthy ? 10 : 25;
    const heartRate = Math.round(hrBase + (seededRandom(i*3) * 2 - 1) * hrVariation);
    const isHeartRateAlert = heartRate > hrHighThreshold || heartRate < hrLowThreshold;
    
    // Oxygen: less variation but lower for unhealthy patients
    const o2Variation = isHealthy ? 2 : 3;
    const oxygen = Math.round((o2Base + (seededRandom(i*3+1) * 2 - 1) * o2Variation) * 10) / 10;
    const isOxygenAlert = oxygen < o2LowThreshold;
    
    // Glucose: more variation for unhealthy patients
    const glucoseVariation = isHealthy ? 20 : 40;
    const glucose = Math.round(glucoseBase + (seededRandom(i*3+2) * 2 - 1) * glucoseVariation);
    const isGlucoseAlert = glucose > glucoseHighThreshold;
    
    vitals.heartRate.push({
      date: currentDate,
      value: heartRate,
      isAlert: isHeartRateAlert
    });
    
    vitals.oxygenSaturation.push({
      date: currentDate,
      value: oxygen,
      isAlert: isOxygenAlert
    });
    
    vitals.glucose.push({
      date: currentDate,
      value: glucose,
      isAlert: isGlucoseAlert
    });
  }
  
  return vitals;
}

/**
 * Calculate statistics for a set of vital sign readings
 */
export function calculateStats(readings: VitalMeasurement[]): VitalStats {
  const values = readings.map(r => r.value);
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  // Standard deviation calculation
  const mean = avg;
  const squareDiffs = values.map(value => {
    const diff = value - mean;
    return diff * diff;
  });
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
  const stdDev = Math.sqrt(avgSquareDiff);
  
  const alertCount = readings.filter(r => r.isAlert).length;
  
  return {
    average: avg,
    minimum: min,
    maximum: max,
    stdDev: stdDev,
    alertCount: alertCount
  };
}

/**
 * Generate plot points for a line chart
 */
export function generateChartPoints(
  readings: VitalMeasurement[], 
  width: number, 
  height: number, 
  padding: number = 40
) {
  // Calculate value ranges
  const values = readings.map(r => r.value);
  const minValue = Math.floor(Math.min(...values) - 5); // Add some padding
  const maxValue = Math.ceil(Math.max(...values) + 5);
  const valueRange = maxValue - minValue;
  
  // Available space for plotting
  const plotWidth = width - (padding * 2);
  const plotHeight = height - (padding * 2);
  
  // Scale factors
  const xScale = plotWidth / (readings.length - 1);
  const yScale = plotHeight / valueRange;
  
  // Generate Y-axis labels (5 evenly spaced values)
  const yLabels = [];
  for (let i = 0; i <= 4; i++) {
    const value = Math.round(minValue + (valueRange * (i / 4)));
    const y = height - (padding + ((value - minValue) * yScale));
    yLabels.push({ value, y });
  }
  
  // Generate X-axis labels (dates)
  const xLabels = [];
  const dateStep = Math.max(1, Math.floor(readings.length / 5));
  for (let i = 0; i < readings.length; i += dateStep) {
    const x = padding + (i * xScale);
    xLabels.push({
      x,
      date: readings[i].date,
      label: readings[i].date.toLocaleDateString()
    });
  }
  
  // Generate coordinates with labels
  return {
    points: readings.map((reading, index) => {
      const x = padding + (index * xScale);
      const y = height - (padding + ((reading.value - minValue) * yScale));
      
      return {
        x,
        y,
        value: reading.value,
        isAlert: reading.isAlert,
        date: reading.date
      };
    }),
    yLabels,
    xLabels,
    minValue,
    maxValue
  };
}

/**
 * Create canvas commands to draw a line chart
 */
export function createLineChart(
  chartData: ChartData,
  width: number,
  height: number,
  unit: string,
  highThreshold: number | null = null,
  lowThreshold: number | null = null
) {
  const canvasCommands = [];
  
  // Background
  canvasCommands.push({ type: 'rect', x: 0, y: 0, w: width, h: height, color: '#f8f9fa' });
  
  // Draw axes
  canvasCommands.push({ type: 'line', x1: 40, y1: height - 40, x2: width - 40, y2: height - 40, lineWidth: 1, color: '#666' }); // x-axis
  canvasCommands.push({ type: 'line', x1: 40, y1: 40, x2: 40, y2: height - 40, lineWidth: 1, color: '#666' }); // y-axis
  
  // Add X-axis label (centered below the axis)
  canvasCommands.push({
    type: 'text',
    x: width / 2,
    y: height - 10,
    text: 'Measurement Date (DD/MM)',
    align: 'center',
    fontSize: 10,
    color: '#666',
    bold: true
  });

  // Add Y-axis label (rotated text)
  const yAxisText = `${unit} - Measurement Value`;
  canvasCommands.push({
    type: 'text',
    x: 12,
    y: height / 2,
    text: yAxisText,
    align: 'center',
    fontSize: 10,
    color: '#666',
    bold: true,
    rotate: -90 // Rotate text 90 degrees counter-clockwise
  });
  
  // Add a chart title with the measurement unit
  let chartTitle = '';
  if (unit === 'bpm') {
    chartTitle = 'Heart Rate (Beats Per Minute)';
  } else if (unit === '%') {
    chartTitle = 'Oxygen Saturation (Percentage)';
  } else if (unit === 'mg/dL') {
    chartTitle = 'Blood Glucose (mg/dL)';
  }
  
  canvasCommands.push({
    type: 'text',
    x: width / 2,
    y: 20,
    text: chartTitle,
    align: 'center',
    fontSize: 12,
    color: '#333',
    bold: true
  });
  
  // Draw Y-axis labels and grid lines
  chartData.yLabels.forEach((label: YAxisLabel) => {
    // Grid line
    canvasCommands.push({
      type: 'line',
      x1: 40,
      y1: label.y,
      x2: width - 40,
      y2: label.y,
      lineWidth: 0.5,
      color: '#ddd'
    });
    
    // Value label
    canvasCommands.push({
      type: 'text',
      x: 35,
      y: label.y + 4,
      text: label.value.toString(),
      align: 'right',
      fontSize: 8,
      color: '#666'
    });
  });
  
  // Draw X-axis labels and grid lines
  chartData.xLabels.forEach((label: XAxisLabel) => {
    // Grid line
    canvasCommands.push({
      type: 'line',
      x1: label.x,
      y1: height - 40,
      x2: label.x,
      y2: 40,
      lineWidth: 0.5,
      color: '#ddd'
    });
    
    // Date label
    canvasCommands.push({
      type: 'text',
      x: label.x,
      y: height - 25,
      text: new Date(label.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      align: 'center',
      fontSize: 8,
      color: '#666'
    });
  });
  
  // Draw data points and lines
  for (let i = 1; i < chartData.points.length; i++) {
    canvasCommands.push({
      type: 'line',
      x1: chartData.points[i-1].x,
      y1: chartData.points[i-1].y,
      x2: chartData.points[i].x,
      y2: chartData.points[i].y,
      lineWidth: 2,
      color: '#3498db'
    });
  }
  
  // Draw points and alerts
  chartData.points.forEach((point: ChartPoint) => {
    canvasCommands.push({
      type: 'ellipse',
      x: point.x,
      y: point.y,
      r1: 3,
      r2: 3,
      color: '#3498db'
    });
    
    if (point.isAlert) {
      const r = 5;
      canvasCommands.push({
        type: 'line',
        x1: point.x - r,
        y1: point.y - r,
        x2: point.x + r,
        y2: point.y + r,
        lineWidth: 2,
        color: '#e74c3c'
      });
      canvasCommands.push({
        type: 'line',
        x1: point.x - r,
        y1: point.y + r,
        x2: point.x + r,
        y2: point.y - r,
        lineWidth: 2,
        color: '#e74c3c'
      });
    }
  });
  
  return canvasCommands;
}

/**
 * Generate the document definition for a comprehensive patient report
 */
export function generatePatientReportDefinition(patientData: any, patientVitals: PatientVitals) {
  // Calculate stats for each vital
  const heartRateStats = calculateStats(patientVitals.heartRate);
  const oxygenStats = calculateStats(patientVitals.oxygenSaturation);
  const glucoseStats = calculateStats(patientVitals.glucose);
  
  // Format dates for the report
  const reportStartDate = patientVitals.heartRate[0].date;
  const reportEndDate = patientVitals.heartRate[patientVitals.heartRate.length - 1].date;
  const dateRange = `${reportStartDate.toLocaleDateString()} - ${reportEndDate.toLocaleDateString()}`;
  
  // Generate chart data for each vital
  const heartRatePoints = generateChartPoints(patientVitals.heartRate, 500, 200);
  const oxygenPoints = generateChartPoints(patientVitals.oxygenSaturation, 500, 200);
  const glucosePoints = generateChartPoints(patientVitals.glucose, 500, 200);
  
  // Generate charts
  const heartRateChart = createLineChart(heartRatePoints, 500, 200, 'bpm', 100, 60);
  const oxygenChart = createLineChart(oxygenPoints, 500, 200, '%', null, 90);
  const glucoseChart = createLineChart(glucosePoints, 500, 200, 'mg/dL', 160, null);
  
  return {
    // Set default font to Helvetica to ensure no undefined fonts are used
    defaultStyle: {
      font: 'Helvetica', // Use built-in font
      fontSize: 11,
      lineHeight: 1.2
    },
    pageSize: 'LETTER',
    pageMargins: [40, 60, 40, 60],
    footer: function(currentPage: number, pageCount: number) {
      return {
        columns: [
          { text: 'Confidential Health Information – For Patient Care Only', alignment: 'center', fontSize: 8, color: '#666', margin: [0, 0, 0, 0], width: '*' },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 8, margin: [0, 0, 40, 0], width: 100 }
        ]
      };
    },
    info: {
      title: `Monthly Patient Report - ${patientData.name}`,
      author: 'CalicoCare Health System',
      subject: 'Monthly Health Summary',
      keywords: 'health, patient, monthly report',
    },
    content: [
      // Header section
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Monthly Patient Overview Report', style: 'header' },
              { text: `${patientData.name}, ${patientData.condition} (${dateRange})`, style: 'headerSubtitle' }
            ]
          },
          {
            width: 120,
            stack: [
              { text: 'CalicoCare', style: 'logo', color: '#3498db' } // Placeholder for logo
            ],
            alignment: 'right'
          }
        ]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, color: '#ccc' }] },
      { text: '', margin: [0, 10, 0, 0] }, // Space after header
      
      // Summary section
      { text: 'Summary:', style: 'sectionHeader' },
      { 
        text: `${patientData.name} demonstrated ${heartRateStats.alertCount > 10 ? 'variable' : 'consistent'} heart rate readings with ${heartRateStats.alertCount} instances exceeding normal thresholds. Oxygen saturation averaged ${oxygenStats.average.toFixed(1)}% with ${oxygenStats.alertCount} readings below 90%. Glucose levels remained ${glucoseStats.alertCount > 5 ? 'somewhat elevated' : 'within normal range'} with an average of ${glucoseStats.average.toFixed(1)} mg/dL. ${patientData.isAlert === 'true' ? 'Some health markers require attention.' : 'Overall health markers are stable.'} Continued monitoring is recommended with special attention to ${patientData.condition}.`,
        margin: [0, 0, 0, 15]
      },
      
      // Heart Rate Section
      { text: 'Heart Rate (Beats/Min):', style: 'vitalHeader' },
      {
        canvas: heartRateChart
      },
      {
        table: {
          widths: ['*', '*', '*', '*', '*'],
          body: [[
            { text: `Average:\n${heartRateStats.average.toFixed(1)} bpm`, alignment: 'center' },
            { text: `Minimum:\n${heartRateStats.minimum.toFixed(1)} bpm`, alignment: 'center' },
            { text: `Maximum:\n${heartRateStats.maximum.toFixed(1)} bpm`, alignment: 'center' },
            { text: `Std Dev:\n${heartRateStats.stdDev.toFixed(1)} bpm`, alignment: 'center' },
            { text: `Alerts:\n${heartRateStats.alertCount} readings`, alignment: 'center' }
          ]]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 5, 0, 20]
      },
      
      // Oxygen Saturation Section
      { text: 'Oxygen Saturation (%):', style: 'vitalHeader' },
      {
        canvas: oxygenChart
      },
      {
        table: {
          widths: ['*', '*', '*', '*', '*'],
          body: [[
            { text: `Average:\n${oxygenStats.average.toFixed(1)}%`, alignment: 'center' },
            { text: `Minimum:\n${oxygenStats.minimum.toFixed(1)}%`, alignment: 'center' },
            { text: `Maximum:\n${oxygenStats.maximum.toFixed(1)}%`, alignment: 'center' },
            { text: `Std Dev:\n${oxygenStats.stdDev.toFixed(1)}%`, alignment: 'center' },
            { text: `Below 90%:\n${oxygenStats.alertCount} readings`, alignment: 'center' }
          ]]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 5, 0, 20]
      },
      
      // Glucose Section
      { text: 'Glucose (mg/dL):', style: 'vitalHeader' },
      {
        canvas: glucoseChart
      },
      {
        table: {
          widths: ['*', '*', '*', '*', '*'],
          body: [[
            { text: `Average:\n${glucoseStats.average.toFixed(1)} mg/dL`, alignment: 'center' },
            { text: `Minimum:\n${glucoseStats.minimum.toFixed(1)} mg/dL`, alignment: 'center' },
            { text: `Maximum:\n${glucoseStats.maximum.toFixed(1)} mg/dL`, alignment: 'center' },
            { text: `Std Dev:\n${glucoseStats.stdDev.toFixed(1)} mg/dL`, alignment: 'center' },
            { text: `Above 160 mg/dL:\n${glucoseStats.alertCount} readings`, alignment: 'center' }
          ]]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 5, 0, 20]
      },
      
      // Additional Insights
      { text: 'Additional Insights:', style: 'sectionHeader', pageBreak: 'before' },
      {
        ul: [
          'Patient has maintained consistent monitoring compliance throughout the reporting period.',
          `${patientData.isAlert === 'true' ? 'Some vital signs show concerning patterns that require medical attention.' : 'No critical symptoms were reported during the monitoring period.'}`,
          `Patient condition (${patientData.condition}) is being managed ${patientData.isAlert === 'true' ? 'with some challenges' : 'effectively'}`,
          'No reported symptoms of shortness of breath, cough, phlegm, chest pain/pressure, or condition-related changes.'
        ],
        margin: [0, 0, 0, 20]
      },
      
      // Treatment Recommendations
      { text: 'Recommendations:', style: 'sectionHeader' },
      {
        ol: [
          'Continue daily monitoring of all vital signs',
          `${patientData.isAlert === 'true' ? 'Schedule follow-up appointment within 2 weeks' : 'Maintain current treatment plan with routine follow-up in 3 months'}`,
          `Review ${patientData.condition} management protocols at next visit`,
          'Encourage consistent exercise and proper nutrition'
        ],
        margin: [0, 0, 0, 20]
      }
    ],
    styles: {
      header: {
        fontSize: 22,
        bold: true,
        color: '#2c3e50',
        margin: [0, 0, 0, 5]
      },
      headerSubtitle: {
        fontSize: 14,
        italics: true,
        color: '#7f8c8d',
        margin: [0, 0, 0, 0]
      },
      logo: {
        fontSize: 18,
        bold: true
      },
      sectionHeader: {
        fontSize: 14,
        bold: true,
        color: '#2c3e50',
        margin: [0, 10, 0, 10]
      },
      vitalHeader: {
        fontSize: 13,
        bold: true,
        margin: [0, 10, 0, 5]
      }
    }
  };
}