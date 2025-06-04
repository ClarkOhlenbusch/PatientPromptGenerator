import { FaEnvelope, FaPhone, FaLinkedin } from "react-icons/fa";
import { HelpCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="mt-8 md:mt-0 md:order-1">
            <p className="text-center md:text-left text-sm text-gray-500">
              &copy; 2025 by Calico Care Inc., a Delaware corporation
            </p>
            <p className="text-center md:text-left text-sm text-gray-500 mt-1">
              For demo purposes only. Not for clinical use.
            </p>
          </div>
          <div className="mt-4 md:mt-0 md:order-2">
            <p className="text-center text-sm text-gray-500">
              AI can make mistakes. Check important info.
            </p>
          </div>
          <div className="flex justify-center md:justify-end space-x-6 mt-4 md:mt-0 md:order-3">
            <a href="/faq" className="text-gray-400 hover:text-primary flex items-center">
              <HelpCircle className="h-5 w-5" />
              <span className="ml-1 text-sm">Help</span>
            </a>
            <a href="mailto:info@calico.care" className="text-gray-400 hover:text-primary flex items-center">
              <FaEnvelope className="h-5 w-5" />
              <span className="ml-1 text-sm">info@calico.care</span>
            </a>
            <a href="tel:+18573744144" className="text-gray-400 hover:text-primary flex items-center">
              <FaPhone className="h-5 w-5" />
              <span className="ml-1 text-sm">(857) 374-4144</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
