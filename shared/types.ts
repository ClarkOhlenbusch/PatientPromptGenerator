// Core patient data types
export interface PatientData {
  patientId: string;
  name: string;
  age: number;
  condition: string;
  isAlert?: boolean;
  variables?: { [key: string]: any };
  issues?: string[];
  healthStatus?: 'healthy' | 'alert';
  rawData?: any[];
  alertReasons?: string[];
}

// Aggregated patient data for processing
export interface AggregatedPatientData {
  patientId: string;
  name: string;
  age: number;
  variables: { [key: string]: any }[];
  conditions: string[];
  issues: string[];
  alertReasons: string[];
  rawData: any[];
}

// Vital signs measurements
export interface VitalMeasurement {
  date: Date;
  value: number;
  isAlert: boolean;
}

export interface PatientVitals {
  heartRate: VitalMeasurement[];
  oxygenSaturation: VitalMeasurement[];
  glucose: VitalMeasurement[];
}

// Alert status types
export type AlertStatus = "pending" | "sent" | "failed";

export interface PatientAlert {
  id: string;
  patientId: string;
  patientName: string;
  age: number;
  condition: string;
  alertValue: string;
  timestamp: string;
  status: AlertStatus;
  message: string;
  sentAt?: string;
  alertCount?: number;
  createdAt: string;
  variables?: { name: string; value: string; timestamp?: string }[];
  reasoning?: string;
  severity?: 'red' | 'yellow' | 'green';
  isAlert?: boolean;
  alertReasons?: string[];
} 