# Project Brief: AI Companion Call System

## Project Overview
This is a healthcare AI system that provides comprehensive patient care through voice-based AI companion calls using Vapi AI Voice agents. The system manages patient data, generates personalized care recommendations, and conducts automated voice calls for wellbeing check-ins and health monitoring.

## Core Requirements

### Primary Functionality
1. **Patient Data Management**: Upload and manage patient information via CSV files
2. **AI-Powered Care Recommendations**: Generate personalized care prompts using OpenAI
3. **Voice Call System**: Conduct automated voice calls using Vapi AI Voice agents
4. **Call History & Analytics**: Track call outcomes, transcripts, and summaries
5. **Healthcare Triage**: Alert-based patient monitoring and intervention

### Key User Workflows
1. **Healthcare Provider Upload**: Upload patient CSV → AI processes data → Generate care recommendations
2. **AI Companion Calls**: Select patients → Configure call parameters → Initiate voice calls via Vapi
3. **Call Management**: Monitor call history → Review transcripts → Track patient outcomes
4. **Alert System**: Identify high-risk patients → Send SMS alerts → Coordinate care

## Technical Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Voice AI**: Vapi AI Voice agents with webhooks
 - **AI Processing**: OpenAI GPT-5-Mini for AI Triage and Trend Reports; GPT-4o-mini for conversation summaries
- **SMS**: Twilio for healthcare alerts
- **Authentication**: Express sessions with passport

## Business Context
The system serves healthcare providers who need to:
- Scale personalized patient care through automation
- Maintain regular contact with patients between appointments  
- Monitor patient wellbeing through voice conversations
- Generate actionable insights from patient interactions
- Reduce manual workload while improving care quality

## Success Criteria
- Successful voice call completion with natural conversation flow
- Accurate AI-generated conversation summaries and follow-up items
- Seamless integration between patient data and voice calling system
- Real-time call monitoring and history management
- Reliable webhook processing for call completion data

## Current Status
The system is in production with active Vapi integration. Core functionality includes patient management, AI triage, voice calling, and comprehensive call history tracking. 