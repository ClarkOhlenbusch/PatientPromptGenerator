import ExcelJS from 'exceljs';

interface PatientData {
  patientId: string;
  name: string;
  age: number;
  condition: string;
  [key: string]: any;
}

export async function processExcelFile(buffer: Buffer): Promise<PatientData[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Excel file has no worksheets');
    }

    // Extract headers
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
      /condition/i.test(h) || /diagnosis/i.test(h) || /ailment/i.test(h));

    // If required columns are not found, try to make an educated guess
    if (patientIdCol === -1) patientIdCol = 0; // Assume first column is ID
    if (nameCol === -1) nameCol = patientIdCol + 1; // Assume column after ID is name
    if (ageCol === -1) ageCol = nameCol + 1; // Assume column after name is age
    if (conditionCol === -1) conditionCol = ageCol + 1; // Assume column after age is condition

    const patients: PatientData[] = [];

    // Process rows (skip header)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const patientData: PatientData = {
        patientId: '',
        name: '',
        age: 0,
        condition: '',
      };

      // Add all columns as raw data
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        let value = cell.value;
        
        // Handle different cell types
        if (typeof value === 'object' && value !== null) {
          if ('text' in value) {
            value = value.text;
          } else if ('result' in value) {
            value = value.result;
          } else if ('hyperlink' in value) {
            value = value.text || value.hyperlink;
          }
        }
        
        patientData[header] = value;
      });

      // Map specific columns to required fields
      patientData.patientId = String(row.getCell(patientIdCol + 1).value || `P${rowNumber - 1}`);
      patientData.name = String(row.getCell(nameCol + 1).value || 'Unknown');
      
      const ageValue = row.getCell(ageCol + 1).value;
      patientData.age = typeof ageValue === 'number' ? ageValue : 
                        typeof ageValue === 'string' ? parseInt(ageValue, 10) || 0 : 0;
      
      patientData.condition = String(row.getCell(conditionCol + 1).value || 'Unknown');

      // Only add the patient if we have at least some data
      if (patientData.name !== 'Unknown' || patientData.condition !== 'Unknown') {
        patients.push(patientData);
      }
    });

    return patients;
  } catch (error) {
    console.error('Error processing Excel file:', error);
    throw new Error(`Failed to process Excel file: ${error.message}`);
  }
}
