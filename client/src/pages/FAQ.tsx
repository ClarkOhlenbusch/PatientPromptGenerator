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
            Find answers to common questions about the Patient Prompt Generator
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-left">
              What is the Patient Prompt Generator?
            </AccordionTrigger>
            <AccordionContent>
              The Patient Prompt Generator is a tool designed to process patient data from Excel files and create 
              customized AI prompts for each patient based on their medical conditions and health indicators.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-2">
            <AccordionTrigger className="text-left">
              How do I use the Patient Prompt Generator?
            </AccordionTrigger>
            <AccordionContent>
              Simply upload your Excel file containing patient data on the home page. The system will process the
              data and generate appropriate prompts for each patient. You can then view, copy, or regenerate these
              prompts as needed.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3">
            <AccordionTrigger className="text-left">
              What file format is supported?
            </AccordionTrigger>
            <AccordionContent>
              Currently, we support Excel files (.xlsx) that follow our specific format. For a sample template,
              please contact our support team.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4">
            <AccordionTrigger className="text-left">
              How is my data processed?
            </AccordionTrigger>
            <AccordionContent>
              Your data goes through our secure automata-style workflow that identifies key health indicators and
              alert conditions. We then use OpenAI to generate appropriate prompts tailored to each patient's needs.
              All data is processed securely and not stored permanently.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-5">
            <AccordionTrigger className="text-left">
              Can I regenerate prompts for specific patients?
            </AccordionTrigger>
            <AccordionContent>
              Yes! On the results page, you can click the "Regenerate" button next to any patient to create a new
              prompt. You can also regenerate all prompts at once if needed.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-8 text-center">
          <p className="text-gray-600">
            Still have questions? Contact our support team at{" "}
            <a
              href="mailto:support@calicocare.example.com"
              className="text-primary hover:underline"
            >
              support@calicocare.example.com
            </a>
          </p>
          <div className="mt-4">
            <Link href="/">
              <a className="text-primary hover:underline">Return to Home</a>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}