export const patientPrompts = pgTable('patient_prompts', {
  id: serial('id').primaryKey(),
  batchId: text('batch_id').notNull(),
  patientId: text('patient_id').notNull(),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  condition: text('condition').notNull(),
  prompt: text('prompt').notNull(),
  reasoning: text('reasoning'),
  isAlert: text('is_alert'),
  healthStatus: text('health_status'),
  template: text('template'),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at')
}); 