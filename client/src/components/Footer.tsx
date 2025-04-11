import { FaEnvelope, FaPhone } from "react-icons/fa";
import { HelpCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex justify-center md:order-2">
            <a href="#" className="text-gray-400 hover:text-primary">
              <span className="sr-only">Help</span>
              <HelpCircle className="h-5 w-5" />
            </a>
            <a href="#" className="ml-6 text-gray-400 hover:text-primary">
              <span className="sr-only">Email</span>
              <FaEnvelope className="h-5 w-5" />
            </a>
            <a href="#" className="ml-6 text-gray-400 hover:text-primary">
              <span className="sr-only">Phone</span>
              <FaPhone className="h-5 w-5" />
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
