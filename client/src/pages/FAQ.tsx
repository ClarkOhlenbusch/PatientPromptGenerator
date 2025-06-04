
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "wouter";

export default function FAQ() {
  return (
    <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Find answers to common questions about Calico Care's AI healthcare companion system
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-left">
              What is Calico Care's AI healthcare companion system?
            </AccordionTrigger>
            <AccordionContent>
              Calico Care is an AI-powered healthcare platform that provides automated patient care through voice conversations, 
              intelligent triage assessments, and comprehensive health monitoring. Our system uses advanced AI voice agents 
              to conduct personalized check-ins with patients between appointments.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-2">
            <AccordionTrigger className="text-left">
              How do AI Companion Calls work?
            </AccordionTrigger>
            <AccordionContent>
              Our AI voice agents make automated calls to patients using their personalized health information. The calls 
              are tailored to each patient's condition, medical history, and previous conversations. The AI can ask about 
              symptoms, medication adherence, and general wellbeing, providing natural conversation experiences.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3">
            <AccordionTrigger className="text-left">
              What is AI-Powered Triage?
            </AccordionTrigger>
            <AccordionContent>
              Our triage system analyzes patient data from Excel uploads to automatically assess patient priority levels. 
              It generates personalized prompts and identifies patients who may need immediate attention based on their 
              health indicators and alert conditions. This helps healthcare providers focus on the most critical cases first.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4">
            <AccordionTrigger className="text-left">
              How does the Prompt Editing feature work?
            </AccordionTrigger>
            <AccordionContent>
              The Prompt Editing sandbox allows healthcare providers to customize AI conversation templates and system prompts. 
              You can edit voice agent templates, adjust conversation flows, and personalize how the AI interacts with patients 
              based on your specific care protocols and requirements.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-5">
            <AccordionTrigger className="text-left">
              What are Trend Reports?
            </AccordionTrigger>
            <AccordionContent>
              Trend Reports provide comprehensive analytics on patient health patterns, call completion rates, and care outcomes. 
              These reports help healthcare teams track patient progress over time, identify health trends, and measure the 
              effectiveness of AI-assisted care interventions.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-6">
            <AccordionTrigger className="text-left">
              Is my patient data secure?
            </AccordionTrigger>
            <AccordionContent>
              Yes, we take data security seriously. All patient data is encrypted in transit and at rest. Our system follows 
              healthcare data protection standards, and we process data securely without permanent storage of sensitive 
              information unless required for care continuity.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-7">
            <AccordionTrigger className="text-left">
              What file formats does the system support?
            </AccordionTrigger>
            <AccordionContent>
              Currently, we support Excel files (.xlsx) for patient data uploads in our triage system. The files should 
              contain patient information including demographics, health conditions, and contact details. For a sample 
              template, please contact our support team.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-8">
            <AccordionTrigger className="text-left">
              Can I track call history and patient interactions?
            </AccordionTrigger>
            <AccordionContent>
              Yes, our Call History feature provides detailed records of all AI companion calls, including transcripts, 
              conversation summaries, and health insights generated by our AI analysis. You can review past interactions 
              and track patient engagement over time.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-9">
            <AccordionTrigger className="text-left">
              How do I get started with the platform?
            </AccordionTrigger>
            <AccordionContent>
              After logging in, you can start by uploading patient data through the AI Triage feature, customize your 
              conversation templates in Prompt Editing, and then initiate AI Companion Calls. The platform guides you 
              through each step with intuitive interfaces and helpful documentation.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-8 text-center">
          <p className="text-gray-600">
            Still have questions? Contact our support team at{" "}
            <a
              href="mailto:info@calico.care"
              className="text-primary hover:underline"
            >
              info@calico.care
            </a>
            {" "}or call us at{" "}
            <a
              href="tel:+18573744144"
              className="text-primary hover:underline"
            >
              (857) 374-4144
            </a>
          </p>
          <div className="mt-4">
            <Link href="/">
              <span className="text-primary hover:underline cursor-pointer">Return to Home</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
