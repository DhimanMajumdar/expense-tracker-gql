import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import path from "path";
import { buildContext } from "graphql-passport";

import express from "express";
import http from "http";
import cors from "cors";
import fs from "fs"; // ✅ Import fs to check if frontend build exists

import passport from "passport";
import session from "express-session";
import ConnectMongo from "connect-mongodb-session";

import mergedResolvers from "./resolvers/index.js";
import mergedTypeDefs from "./typeDefs/index.js";

import dotenv from "dotenv";
import connectDB from "./db/connectDB.js";
import { configurePassport } from "./passport/passport.config.js";

import { fileURLToPath } from "url"; // ✅ Fix for `__dirname` issue

dotenv.config();
configurePassport();

const app = express();
const httpServer = http.createServer(app);

const MongoDBStore = ConnectMongo(session);
const store = new MongoDBStore({
	uri: process.env.MONGO_URI,
	collection: "sessions",
});

store.on("error", (err) => console.log(err));

app.use(
	session({
		secret: process.env.SESSION_SECRET,
		resave: false, // Prevent unnecessary resaving of sessions
		saveUninitialized: false,
		cookie: {
			maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
			httpOnly: true,
		},
		store: store,
	})
);

app.use(passport.initialize());
app.use(passport.session());

const server = new ApolloServer({
	typeDefs: mergedTypeDefs,
	resolvers: mergedResolvers,
	plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

await server.start();

app.use(
	"/graphql",
	cors({
		origin: "http://localhost:3000",
		credentials: true,
	}),
	express.json(),
	expressMiddleware(server, {
		context: async ({ req, res }) => buildContext({ req, res }),
	})
);

// ✅ Fix for `__dirname` in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Fix: Ensure frontend build exists before serving
const frontendPath = path.join(__dirname, "../frontend/dist");

if (fs.existsSync(frontendPath)) {
	console.log("✅ Serving frontend from:", frontendPath);
	app.use(express.static(frontendPath));

	app.get("*", (req, res) => {
		res.sendFile(path.join(frontendPath, "index.html"));
	});
} else {
	console.warn("⚠️ Warning: frontend/dist not found. Make sure to build the frontend.");
}

await connectDB();

await new Promise((resolve) => httpServer.listen({ port: 4000 }, resolve));

console.log(`🚀 Server ready at http://localhost:4000/graphql`);
