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

const ADMIN_USERNAME = "CalicoCare";
const ADMIN_PASSWORD = "CalicoCare";

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
    saveUninitialized: false, // Don't create session until something stored
    store: storage.sessionStore,
    proxy: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 2 * 60 * 60 * 1000, // Reduced to 2 hours instead of 24
      sameSite: 'strict', // Changed from 'lax' to 'strict' for better security
      path: '/',
      httpOnly: true // Prevents client-side JS from reading the cookie
    },
    name: 'calico_session', // Custom session name (not the default connect.sid)
    rolling: false // Don't extend session lifetime on each request
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Login attempt for username: ${username}`);
        
        // Only allow admin login
        if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
          console.log(`Login failed: Invalid credentials`);
          return done(null, false);
        }

        // Create or get admin user
        let user = await storage.getUserByUsername(ADMIN_USERNAME);
        if (!user) {
          user = await storage.createUser({
            username: ADMIN_USERNAME,
            password: await hashPassword(ADMIN_PASSWORD)
          });
        }

        console.log(`Login successful for admin user`);
        return done(null, user);
      } catch (err) {
        console.error(`Login error:`, err);
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      
      // If user no longer exists in the database (e.g., deleted)
      if (!user) {
        console.log(`User ID ${id} no longer exists in the database`);
        return done(null, false);
      }
      
      done(null, user);
    } catch (err) {
      console.error(`Error deserializing user ID ${id}:`, err);
      // Instead of propagating the error, return false to indicate authentication failure
      done(null, false);
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
        console.log(`Admin user successfully logged in`);
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
      
      // Destroy the session to ensure it's completely removed
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
          return next(err);
        }
        
        // Clear the cookie on the client side
        res.clearCookie('calico_session', {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: 'strict'
        });
        
        res.status(200).json({ success: true, message: "Logged out successfully" });
      });
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
  
  // Middleware to check if user is authenticated for all API routes except login/logout/health
  app.use(/^\/api\/(?!login|logout|health).*$/, (req, res, next) => {
    if (!req.isAuthenticated()) {
      console.log(`Unauthorized access attempt to ${req.originalUrl}`);
      return res.status(401).json({ 
        success: false, 
        data: null,
        error: "Authentication required" 
      });
    }
    next();
  });
}