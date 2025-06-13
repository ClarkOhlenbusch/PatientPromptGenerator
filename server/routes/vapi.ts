import { Express } from "express";
import { registerVapiTemplateRoutes } from "./vapiTemplateRoutes";
import { registerVapiWebhookRoutes } from "./vapiWebhookRoutes";
import { registerVapiCallRoutes } from "./vapiCallRoutes";
import { registerVapiAgentRoutes } from "./vapiAgentRoutes";
import { registerVapiTestRoutes } from "./vapiTestRoutes";

export function registerVapiRoutes(app: Express): void {
  registerVapiTemplateRoutes(app);
  registerVapiWebhookRoutes(app);
  registerVapiCallRoutes(app);
  registerVapiAgentRoutes(app);
  registerVapiTestRoutes(app);
}
