import { FaEnvelope, FaPhone } from "react-icons/fa";
import { HelpCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex justify-center md:order-2">
            <a href="/faq" className="text-gray-400 hover:text-primary flex items-center">
              <HelpCircle className="h-5 w-5" />
              <span className="ml-1 text-sm">Help</span>
            </a>
            <a href="mailto:support@calicocare.example.com" className="ml-6 text-gray-400 hover:text-primary flex items-center">
              <FaEnvelope className="h-5 w-5" />
              <span className="ml-1 text-sm">Email</span>
            </a>
            <a href="tel:+15551234567" className="ml-6 text-gray-400 hover:text-primary flex items-center">
              <FaPhone className="h-5 w-5" />
              <span className="ml-1 text-sm">555-123-4567</span>
            </a>
          </div>
          <div className="mt-8 md:mt-0 md:order-1">
            <p className="text-center text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Calico Care Patient Prompt Generator. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
