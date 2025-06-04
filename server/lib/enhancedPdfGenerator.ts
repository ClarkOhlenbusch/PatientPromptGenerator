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
  
  // Base values
  const hrBase = isHealthy ? 72 : 85;
  const o2Base = isHealthy ? 96 : 91;
  const glucoseBase = isHealthy ? 110 : 140;
  
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
    
    // Heart rate: more variation for unhealthy patients
    const hrVariation = isHealthy ? 10 : 25;
    const heartRate = Math.round(hrBase + (Math.random() * 2 - 1) * hrVariation);
    const isHeartRateAlert = heartRate > hrHighThreshold || heartRate < hrLowThreshold;
    
    // Oxygen: less variation but lower for unhealthy patients
    const o2Variation = isHealthy ? 2 : 3;
    const oxygen = Math.round((o2Base + (Math.random() * 2 - 1) * o2Variation) * 10) / 10;
    const isOxygenAlert = oxygen < o2LowThreshold;
    
    // Glucose: more variation for unhealthy patients
    const glucoseVariation = isHealthy ? 20 : 40;
    const glucose = Math.round(glucoseBase + (Math.random() * 2 - 1) * glucoseVariation);
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
  const values = readings.map(r => r.value);
  const min = Math.min(...values) - (Math.min(...values) * 0.05); // 5% padding
  const max = Math.max(...values) + (Math.max(...values) * 0.05); // 5% padding
  const range = max - min;
  
  // Available space for plotting
  const plotWidth = width - (padding * 2);
  const plotHeight = height - (padding * 2);
  
  // Scale factors
  const xScale = plotWidth / (readings.length - 1);
  const yScale = plotHeight / range;
  
  // Generate coordinates
  return readings.map((reading, index) => {
    const x = padding + (index * xScale);
    const y = height - (padding + ((reading.value - min) * yScale)); // Flip Y axis
    
    return {
      x,
      y,
      value: reading.value,
      isAlert: reading.isAlert,
      date: reading.date
    };
  });
}

/**
 * Create canvas commands to draw a line chart
 */
export function createLineChart(
  points: any[], 
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

  // Get data ranges for all calculations
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Calculate and draw trend line using linear regression
  const n = points.length;
  const sumX = points.reduce((acc: number, p: any, i: number) => acc + i, 0);
  const sumY = points.reduce((acc: number, p: any) => acc + p.value, 0);
  const sumXY = points.reduce((acc: number, p: any, i: number) => acc + (i * p.value), 0);
  const sumXX = points.reduce((acc: number, p: any, i: number) => acc + (i * i), 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate trend line points
  const startY = intercept;
  const endY = slope * (n - 1) + intercept;
  
  const trendStartY = height - 40 - ((startY - min) / range * (height - 80));
  const trendEndY = height - 40 - ((endY - min) / range * (height - 80));
  
  // Draw dotted trend line
  const dashLength = 5;
  const totalLength = Math.sqrt(Math.pow(width - 80, 2) + Math.pow(trendEndY - trendStartY, 2));
  const numDashes = Math.floor(totalLength / (dashLength * 2));
  
  for (let i = 0; i < numDashes; i++) {
    const startPercent = (i * 2 * dashLength) / totalLength;
    const endPercent = ((i * 2 + 1) * dashLength) / totalLength;
    
    const dashStartX = 40 + startPercent * (width - 80);
    const dashEndX = 40 + endPercent * (width - 80);
    const dashStartY = trendStartY + startPercent * (trendEndY - trendStartY);
    const dashEndY = trendStartY + endPercent * (trendEndY - trendStartY);
    
    canvasCommands.push({
      type: 'line',
      x1: dashStartX,
      y1: dashStartY,
      x2: dashEndX,
      y2: dashEndY,
      lineWidth: 1,
      color: '#666'
    });
  }

  // Draw line connecting points
  for (let i = 1; i < points.length; i++) {
    canvasCommands.push({
      type: 'line',
      x1: points[i-1].x,
      y1: points[i-1].y,
      x2: points[i].x,
      y2: points[i].y,
      lineWidth: 2,
      color: '#3498db' // Blue line
    });
  }
  
  // Draw points and alerts
  points.forEach(point => {
    // Draw small circle for every point
    canvasCommands.push({
      type: 'ellipse',
      x: point.x,
      y: point.y,
      r1: 3,
      r2: 3,
      color: '#3498db'
    });
    
    // Draw X for alerts
    if (point.isAlert) {
      const r = 5; // X size
      canvasCommands.push({
        type: 'line',
        x1: point.x - r,
        y1: point.y - r,
        x2: point.x + r,
        y2: point.y + r,
        lineWidth: 2,
        color: '#e74c3c' // Red X
      });
      canvasCommands.push({
        type: 'line',
        x1: point.x - r,
        y1: point.y + r,
        x2: point.x + r,
        y2: point.y - r,
        lineWidth: 2,
        color: '#e74c3c' // Red X
      });
    }
  });
  
  // Draw y-axis labels
  const step = Math.ceil(range / 4); // 5 labels total
  
  for (let i = 0; i <= 4; i++) {
    const value = Math.round((min + (step * i)) * 10) / 10; // Round to 1 decimal
    const y = height - 40 - (((value - min) / range) * (height - 80));
    
    canvasCommands.push({
      type: 'line',
      x1: 37,
      y1: y,
      x2: 43,
      y2: y,
      lineWidth: 1,
      color: '#666'
    });
    
    canvasCommands.push({
      type: 'text',
      x: 35,
      y: y + 4,
      text: `${value}`,
      align: 'right',
      fontSize: 8
    });
  }
  
  // Add unit label to y-axis with description
  const getUnitDescription = (unit: string) => {
    switch(unit) {
      case 'bpm': return 'Heart Rate (BPM)';
      case '%': return 'Oxygen Saturation (%)';
      case 'mg/dL': return 'Blood Glucose (mg/dL)';
      default: return unit;
    }
  };

  canvasCommands.push({
    type: 'text',
    x: 15,
    y: height / 2,
    text: getUnitDescription(unit),
    align: 'center',
    fontSize: 10
  });
  
  // Draw x-axis labels (dates) with "Measurement Date" label
  const dateIndices = [0, Math.floor(points.length / 2), points.length - 1];
  dateIndices.forEach(i => {
    const point = points[i];
    const dateStr = point.date.toLocaleDateString();
    canvasCommands.push({
      type: 'text',
      x: point.x,
      y: height - 25,
      text: dateStr,
      align: 'center',
      fontSize: 8
    });
  });

  // Add "Measurement Date" label to x-axis
  canvasCommands.push({
    type: 'text',
    x: width / 2,
    y: height - 10,
    text: 'Measurement Date',
    align: 'center',
    fontSize: 10
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
    pageMargins: [40, 60, 40, 60] as [number, number, number, number],
    footer: function(currentPage: number, pageCount: number) {
      return {
        columns: [
          { text: 'Confidential Health Information – For Patient Care Only', alignment: 'center', fontSize: 8, color: '#666', margin: [0, 0, 0, 0], width: '*' },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 8, margin: [0, 0, 40, 0], width: 100 }
        ]
      };
    },
    info: {
      title: `Trend Patient Report - ${patientData.name}`,
      author: 'CalicoCare Health System',
      subject: 'Health Trend Summary',
      keywords: 'health, patient, trend report',
    },
    content: [
      // Header section
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Trend Patient Overview Report', style: 'header' },
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