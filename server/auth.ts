import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { nanoid } from "nanoid";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Generate a random session secret if not provided
  const sessionSecret = process.env.SESSION_SECRET || nanoid(32);
  
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Login attempt for username: ${username}`);
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log(`Login failed: User ${username} not found`);
          return done(null, false);
        } else if (!(await comparePasswords(password, user.password))) {
          console.log(`Login failed: Invalid password for ${username}`);
          return done(null, false);
        } else {
          console.log(`Login successful for ${username}`);
          return done(null, user);
        }
      } catch (err) {
        console.error(`Login error for ${username}:`, err);
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      console.error(`Error deserializing user ID ${id}:`, err);
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ success: false, message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        // Don't return the password hash to the client
        const { password, ...userWithoutPassword } = user;
        res.status(201).json({ success: true, user: userWithoutPassword });
      });
    } catch (err) {
      console.error("Registration error:", err);
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log("Login request received:", { username: req.body.username });
    
    passport.authenticate("local", (err: Error, user: SelectUser) => {
      if (err) {
        console.error("Passport authentication error:", err);
        return next(err);
      }
      if (!user) {
        console.log("Authentication failed: Invalid credentials");
        return res.status(401).json({ success: false, message: "Invalid username or password" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error("Session login error:", err);
          return next(err);
        }
        console.log(`User ${user.username} successfully logged in`);
        // Don't return the password hash to the client
        const { password, ...userWithoutPassword } = user;
        
        // Log environment info to debug auth issues
        console.log("Auth successful with environment:", {
          NODE_ENV: process.env.NODE_ENV,
          NEXTAUTH_URL: process.env.NEXTAUTH_URL,
          sessionCookie: {
            secure: sessionSettings.cookie?.secure,
            sameSite: sessionSettings.cookie?.sameSite,
            domain: sessionSettings.cookie?.domain,
            path: sessionSettings.cookie?.path,
          }
        });
        
        res.status(200).json({ success: true, user: userWithoutPassword });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ success: true, message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    // Don't return the password hash to the client
    const { password, ...userWithoutPassword } = req.user;
    res.status(200).json({ success: true, user: userWithoutPassword });
  });
  
  // Middleware to check if user is authenticated
  app.use(["/api/upload", "/api/patient-prompts", "/api/triage", "/api/monthly-reports"], (req, res, next) => {
    if (!req.isAuthenticated()) {
      console.log(`Unauthorized access attempt to ${req.originalUrl}`);
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    next();
  });
}