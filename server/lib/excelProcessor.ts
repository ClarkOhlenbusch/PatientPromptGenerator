import ExcelJS from 'exceljs';

// Enhanced PatientData interface to include alert status and variable values
interface PatientData {
  patientId: string;
  name: string;
  age: number;
  condition: string;
  isAlert?: boolean;
  variables?: { [key: string]: any };
  issues?: string[]; // Array to store all issues for a patient
  [key: string]: any;
}

// Interface for aggregated patient data
interface AggregatedPatientData {
  patientId: string;
  name: string;
  age: number;
  variables: { [key: string]: any }[];
  conditions: string[];
  issues: string[];
  alertReasons: string[];
  rawData: any[];
}

/**
 * Process Excel file using automata-style workflow
 * S0 -> S1 -> S2 -> S3 -> S4/S5 -> S6 -> S7 -> S8
 */
export async function processExcelFile(buffer: Buffer): Promise<PatientData[]> {
  try {
    // S0->S1: Start Excel file processing
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Excel file has no worksheets');
    }

    // Extract headers (part of S1)
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value?.toString() || `Column${colNumber}`;
    });

    // Find required column indices
    let patientIdCol = headers.findIndex(h => 
      /patient\s*id/i.test(h) || /id/i.test(h));
    let nameCol = headers.findIndex(h => 
      /name/i.test(h) || /patient\s*name/i.test(h));
    let ageCol = headers.findIndex(h => 
      /age/i.test(h));
    let conditionCol = headers.findIndex(h => 
      /condition/i.test(h) || /diagnosis/i.test(h) || /ailment/i.test(h) || /variable/i.test(h));
    let isAlertCol = headers.findIndex(h => 
      /is\s*alert/i.test(h) || /alert/i.test(h) || /flag/i.test(h));

    // If required columns are not found, try to make an educated guess
    if (patientIdCol === -1) patientIdCol = 0; // Assume first column is ID
    if (nameCol === -1) nameCol = patientIdCol + 1; // Assume column after ID is name
    if (ageCol === -1) ageCol = nameCol + 1; // Assume column after name is age
    if (conditionCol === -1) conditionCol = ageCol + 1; // Assume column after age is condition/variable

    // S2: Prepare to iterate over rows
    const patientDataMap = new Map<string, AggregatedPatientData>();
    const allPatientsData: PatientData[] = [];

    // Process rows (skip header)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      // Create a data object for this row
      const rowData: PatientData = {
        patientId: '',
        name: '',
        age: 0,
        condition: '',
        variables: {},
        issues: []
      };

      // Add all columns as raw data
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        let value = cell.value;
        
        // Handle different cell types
        if (typeof value === 'object' && value !== null) {
          // Handle ExcelJS cell value types
          if ('text' in value && value.text !== undefined) {
            value = value.text;
          } else if ('result' in value && value.result !== undefined) {
            value = value.result;
          } else if ('hyperlink' in value) {
            // Safe property access with type checking
            const hyperlinkObj = value as { hyperlink: string, text?: string };
            value = hyperlinkObj.text || hyperlinkObj.hyperlink;
          } else if (value instanceof Date) {
            // Handle date objects
            value = value.toISOString();
          }
        }
        
        rowData[header] = value;
        
        // Also store in variables for later reference
        if (rowData.variables) {
          rowData.variables[header] = value;
        }
      });

      // Map specific columns to required fields
      rowData.patientId = String(row.getCell(patientIdCol + 1).value || `P${rowNumber - 1}`);
      rowData.name = String(row.getCell(nameCol + 1).value || 'Unknown');
      
      const ageValue = row.getCell(ageCol + 1).value;
      rowData.age = typeof ageValue === 'number' ? ageValue : 
                     typeof ageValue === 'string' ? parseInt(ageValue, 10) || 0 : 0;
      
      rowData.condition = String(row.getCell(conditionCol + 1).value || 'Unknown');

      // S3: Evaluate 'Is Alert' field 
      let isAlert = false;
      if (isAlertCol !== -1) {
        const alertValue = row.getCell(isAlertCol + 1).value;
        isAlert = alertValue === true || 
                 alertValue === 1 || 
                 alertValue === 'true' || 
                 alertValue === 'yes' || 
                 alertValue === 'Y';
      } else {
        // If no explicit IsAlert column, try to infer from other data
        // For demo purposes, treat all rows as alerts
        isAlert = true;
      }
      rowData.isAlert = isAlert;

      // Store the row data for reference regardless of alert status
      allPatientsData.push(rowData);

      // S4/S5: Process or skip based on alert status
      if (isAlert) {
        // Generate issue description
        let issue = `Issue with ${rowData.condition}`;
        if (rowData.variables) {
          // Add any relevant variable details to the issue
          const variableDetails = Object.entries(rowData.variables)
            .filter(([key, _]) => key !== 'patientId' && key !== 'name' && key !== 'age')
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          
          if (variableDetails) {
            issue += ` (${variableDetails})`;
          }
        }
        
        // Initialize or update the aggregated patient data
        if (!patientDataMap.has(rowData.patientId)) {
          patientDataMap.set(rowData.patientId, {
            patientId: rowData.patientId,
            name: rowData.name,
            age: rowData.age,
            variables: [rowData.variables || {}],
            conditions: [rowData.condition],
            issues: [issue],
            alertReasons: [`Alert triggered for ${rowData.condition}`],
            rawData: [rowData]
          });
        } else {
          const patientData = patientDataMap.get(rowData.patientId)!;
          
          // Update patient data with this row's information
          patientData.variables.push(rowData.variables || {});
          if (!patientData.conditions.includes(rowData.condition)) {
            patientData.conditions.push(rowData.condition);
          }
          patientData.issues.push(issue);
          patientData.alertReasons.push(`Alert triggered for ${rowData.condition}`);
          patientData.rawData.push(rowData);
        }
      } else {
        // S5: Skip non-alert rows - no action needed
      }
    });

    // S6: Aggregate data by unique PatientID
    const aggregatedPatients: PatientData[] = [];
    
    // Convert Map entries to array for safer iteration
    Array.from(patientDataMap.entries()).forEach(([_, patientData]) => {
      // Create a consolidated patient record with all issues
      const aggregatedPatient: PatientData = {
        patientId: patientData.patientId,
        name: patientData.name,
        age: patientData.age,
        // Combine all conditions into a single string
        condition: patientData.conditions.join(', '),
        // Store all issues
        issues: patientData.issues,
        // Store raw variables for reference
        variables: patientData.variables.reduce((acc: Record<string, any>, vars: Record<string, any>) => ({ ...acc, ...vars }), {}),
        // Store all raw data for reference
        rawData: patientData.rawData,
        // Combined alert reasons
        alertReasons: patientData.alertReasons
      };
      
      aggregatedPatients.push(aggregatedPatient);
    });

    // S7-S8: Final output preparation
    
    // For testing purposes, if no patients have alerts, return a limited set
    if (aggregatedPatients.length === 0) {
      // Group by patientId and take the first 20 unique patients
      const uniquePatients = new Map<string, PatientData>();
      for (const patient of allPatientsData) {
        if (!uniquePatients.has(patient.patientId)) {
          uniquePatients.set(patient.patientId, patient);
          if (uniquePatients.size >= 20) break;
        }
      }
      return Array.from(uniquePatients.values());
    }
    
    return aggregatedPatients;
  } catch (error: unknown) {
    console.error('Error processing Excel file:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process Excel file: ${errorMessage}`);
  }
}